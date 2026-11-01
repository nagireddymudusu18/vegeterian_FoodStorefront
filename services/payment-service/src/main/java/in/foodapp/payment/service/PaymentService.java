package in.foodapp.payment.service;

import in.foodapp.payment.api.ApiException;
import in.foodapp.payment.domain.PaymentStatus;
import in.foodapp.payment.domain.RefundStatus;
import in.foodapp.payment.events.OutboxService;
import in.foodapp.payment.infra.gateway.GatewayPayment;
import in.foodapp.payment.infra.gateway.GatewayRefund;
import in.foodapp.payment.infra.gateway.PaymentGateway;
import in.foodapp.payment.infra.gateway.PaymentRequest;
import in.foodapp.payment.infra.gateway.RefundRequest;
import in.foodapp.payment.persistence.ClosedOrderStore;
import in.foodapp.payment.persistence.Payment;
import in.foodapp.payment.persistence.PaymentRepository;
import in.foodapp.payment.persistence.Refund;
import in.foodapp.payment.persistence.RefundRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Payment domain operations. The apply* methods are shared by the REST API and the webhook handler and
 * MUST be called inside a transaction (ledger and outbox writes are propagation MANDATORY), so state,
 * ledger and outbox always commit together.
 */
@Service
public class PaymentService {

    public record PaymentResult(Payment payment, boolean replayed) {
    }

    public record RefundResult(Refund refund, boolean replayed) {
    }

    private final PaymentRepository payments;
    private final RefundRepository refunds;
    private final PaymentGateway gateway;
    private final LedgerService ledger;
    private final OutboxService outbox;
    private final ClosedOrderStore closedOrders;
    private final TransactionTemplate tx;

    public PaymentService(PaymentRepository payments, RefundRepository refunds, PaymentGateway gateway,
                          LedgerService ledger, OutboxService outbox, ClosedOrderStore closedOrders,
                          PlatformTransactionManager txManager) {
        this.payments = payments;
        this.refunds = refunds;
        this.gateway = gateway;
        this.ledger = ledger;
        this.outbox = outbox;
        this.closedOrders = closedOrders;
        this.tx = new TransactionTemplate(txManager);
    }

    // ---------------------------------------------------------------- create

    public PaymentResult create(UUID customerId, String idempotencyKey, UUID orderId, long amountPaise) {
        String hash = Idempotency.paymentHash(orderId, amountPaise);
        try {
            return tx.execute(status -> doCreate(customerId, idempotencyKey, orderId, amountPaise, hash));
        } catch (DataIntegrityViolationException race) {
            // A concurrent request with the same (customer, key) won the unique constraint: replay it.
            return tx.execute(status -> {
                Optional<Payment> existing = payments.findByCustomerIdAndIdempotencyKey(customerId, idempotencyKey);
                if (existing.isEmpty()) {
                    throw race;
                }
                return replayOf(existing.get(), hash);
            });
        }
    }

    private PaymentResult doCreate(UUID customerId, String key, UUID orderId, long amountPaise, String hash) {
        Optional<Payment> existing = payments.findByCustomerIdAndIdempotencyKey(customerId, key);
        if (existing.isPresent()) {
            return replayOf(existing.get(), hash);
        }
        Payment payment = new Payment(UUID.randomUUID(), orderId, customerId, amountPaise, gateway.name(), key, hash);
        payments.saveAndFlush(payment);

        GatewayPayment result = gateway.createPayment(
                new PaymentRequest(payment.getId(), orderId, customerId, amountPaise, key));
        if (result.failed()) {
            applyFailure(payment, result.gatewayRef(), result.failureReason());
        } else if (result.captured()) {
            applyCapture(payment, result.gatewayRef());
        } else {
            payment.markPending(result.gatewayRef());
            payments.save(payment);
        }
        return new PaymentResult(payment, false);
    }

    private PaymentResult replayOf(Payment existing, String hash) {
        if (!Idempotency.isReplay(existing.getRequestHash(), hash)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Idempotency-Key reuse",
                    "Idempotency-Key was already used with a different request body");
        }
        return new PaymentResult(existing, true);
    }

    // ---------------------------------------------------------------- read

    public Payment get(UUID id, UUID requester, boolean admin) {
        Payment p = payments.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found", "Payment not found"));
        if (!admin && !p.getCustomerId().equals(requester)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Forbidden", "Not allowed to view this payment");
        }
        return p;
    }

    // ---------------------------------------------------------------- shared domain operations

    /** CREATED/FAILED -> CAPTURED, ledger posting and PaymentCaptured event. No-op if already captured/refunded. */
    public boolean applyCapture(Payment payment, String gatewayRef) {
        if (payment.getStatus() == PaymentStatus.CAPTURED || payment.getStatus() == PaymentStatus.REFUNDED) {
            return false;
        }
        payment.markCaptured(gatewayRef);
        payments.save(payment);
        ledger.postCapture(payment.getId(), payment.getAmountPaise());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paymentId", payment.getId());
        payload.put("orderId", payment.getOrderId());
        payload.put("amountPaise", payment.getAmountPaise());
        payload.put("gatewayRef", gatewayRef);
        outbox.publish("PaymentCaptured", payment.getId(), payload);
        if (closedOrders.isClosed(payment.getOrderId())) {
            // the order was cancelled or rejected before this capture arrived: give the money back straight away
            refundRemaining(payment);
        }
        return true;
    }

    /**
     * An order was cancelled or rejected: record it, and fully refund every captured payment of the order that is
     * not refunded yet. Safe to repeat (the refund has a fixed idempotency key per payment). Throws if the gateway
     * refuses, so the order feed retries the event and finally parks it for an admin.
     */
    public void onOrderClosed(UUID orderId, String status) {
        closedOrders.markClosed(orderId, status);
        for (Payment p : payments.findByOrderIdForUpdate(orderId)) {
            refundRemaining(p);
        }
    }

    private boolean refundRemaining(Payment payment) {
        if (payment.getStatus() != PaymentStatus.CAPTURED) {
            return false;
        }
        long remaining = payment.getAmountPaise() - refunds.sumProcessedByPaymentId(payment.getId());
        String key = "auto:" + payment.getId();
        if (remaining <= 0 || refunds.findByPaymentIdAndIdempotencyKey(payment.getId(), key).isPresent()) {
            return false;
        }
        UUID refundId = UUID.randomUUID();
        GatewayRefund gr = gateway.refund(new RefundRequest(refundId, payment.getId(), payment.getGatewayRef(),
                remaining, key));
        if (!gr.success()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Gateway refund failed",
                    gr.failureReason() == null ? "refund rejected by gateway" : gr.failureReason());
        }
        applyRefund(payment, refundId, remaining, key, Idempotency.refundHash(payment.getId(), remaining),
                gr.gatewayRef());
        return true;
    }

    /** CREATED -> FAILED and PaymentFailed event. No-op in any other state. */
    public boolean applyFailure(Payment payment, String gatewayRef, String reason) {
        if (payment.getStatus() != PaymentStatus.CREATED) {
            return false;
        }
        String why = (reason == null || reason.isBlank()) ? "unknown" : reason;
        payment.markFailed(gatewayRef, why);
        payments.save(payment);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paymentId", payment.getId());
        payload.put("orderId", payment.getOrderId());
        payload.put("reason", why);
        outbox.publish("PaymentFailed", payment.getId(), payload);
        return true;
    }

    /** Refund recorded from a gateway webhook (refund already happened at the gateway). */
    public boolean applyWebhookRefund(Payment payment, long amountPaise, String gatewayRefundId) {
        if (gatewayRefundId != null && refunds.findFirstByGatewayRef(gatewayRefundId).isPresent()) {
            return false;
        }
        String key = "webhook:" + gatewayRefundId;
        guardRefundable(payment, amountPaise);
        applyRefund(payment, UUID.randomUUID(), amountPaise, key, Idempotency.refundHash(payment.getId(), amountPaise),
                gatewayRefundId);
        return true;
    }

    // ---------------------------------------------------------------- admin refund

    public RefundResult refund(UUID paymentId, long amountPaise, String idempotencyKey) {
        String hash = Idempotency.refundHash(paymentId, amountPaise);
        return tx.execute(status -> {
            Payment payment = payments.findByIdForUpdate(paymentId)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found", "Payment not found"));
            Optional<Refund> existing = refunds.findByPaymentIdAndIdempotencyKey(paymentId, idempotencyKey);
            if (existing.isPresent()) {
                if (!Idempotency.isReplay(existing.get().getRequestHash(), hash)) {
                    throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Idempotency-Key reuse",
                            "Idempotency-Key was already used with a different request body");
                }
                return new RefundResult(existing.get(), true);
            }
            guardRefundable(payment, amountPaise);
            UUID refundId = UUID.randomUUID();
            GatewayRefund gr = gateway.refund(new RefundRequest(refundId, paymentId, payment.getGatewayRef(),
                    amountPaise, idempotencyKey));
            if (!gr.success()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Gateway refund failed",
                        gr.failureReason() == null ? "refund rejected by gateway" : gr.failureReason());
            }
            Refund refund = applyRefund(payment, refundId, amountPaise, idempotencyKey, hash, gr.gatewayRef());
            return new RefundResult(refund, false);
        });
    }

    private void guardRefundable(Payment payment, long amountPaise) {
        if (payment.getStatus() != PaymentStatus.CAPTURED) {
            throw new ApiException(HttpStatus.CONFLICT, "Not refundable",
                    "Only CAPTURED payments can be refunded (status=" + payment.getStatus() + ")");
        }
        long remaining = payment.getAmountPaise() - refunds.sumProcessedByPaymentId(payment.getId());
        if (amountPaise > remaining) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Refund exceeds captured amount",
                    "Requested " + amountPaise + " paise but only " + remaining + " paise remain refundable");
        }
    }

    private Refund applyRefund(Payment payment, UUID refundId, long amountPaise, String key, String hash,
                               String gatewayRef) {
        long alreadyRefunded = refunds.sumProcessedByPaymentId(payment.getId());
        Refund refund = refunds.saveAndFlush(new Refund(refundId, payment.getId(), amountPaise,
                RefundStatus.PROCESSED, gatewayRef, key, hash));
        ledger.postRefund(payment.getId(), amountPaise);
        if (alreadyRefunded + amountPaise == payment.getAmountPaise()) {
            payment.markRefunded();
            payments.save(payment);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("refundId", refund.getId());
        payload.put("paymentId", payment.getId());
        payload.put("orderId", payment.getOrderId());
        payload.put("amountPaise", amountPaise);
        outbox.publish("RefundIssued", refund.getId(), payload);
        return refund;
    }
}
