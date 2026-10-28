package in.foodapp.payment.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.payment.api.ApiException;
import in.foodapp.payment.persistence.Payment;
import in.foodapp.payment.persistence.PaymentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Processes verified Razorpay webhooks. Dedupe is by the unique gateway_event_id in webhook_events
 * (INSERT ... ON CONFLICT DO NOTHING); a duplicate delivery changes nothing and posts no ledger entries.
 * Insert + state change + ledger + outbox all happen in one transaction, so a failure rolls back the dedupe
 * row too and the gateway's retry is processed normally.
 */
@Service
public class WebhookService {

    public enum Outcome { PROCESSED, DUPLICATE, IGNORED }

    private static final Logger log = LoggerFactory.getLogger(WebhookService.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final PaymentRepository payments;
    private final PaymentService paymentService;
    private final TransactionTemplate tx;

    public WebhookService(JdbcTemplate jdbc, ObjectMapper objectMapper, PaymentRepository payments,
                          PaymentService paymentService, PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.payments = payments;
        this.paymentService = paymentService;
        this.tx = new TransactionTemplate(txManager);
    }

    public Outcome handle(String rawBody, String eventId) {
        JsonNode root;
        try {
            root = objectMapper.readTree(rawBody);
        } catch (JsonProcessingException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Bad webhook", "Body is not valid JSON");
        }
        if (root == null || !root.isObject()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Bad webhook", "Body must be a JSON object");
        }
        String eventType = root.path("event").asText("");

        Outcome outcome = tx.execute(status -> {
            int inserted = jdbc.update(
                    "INSERT INTO webhook_events (gateway_event_id, event_type, payload) VALUES (?, ?, CAST(? AS jsonb)) "
                            + "ON CONFLICT (gateway_event_id) DO NOTHING",
                    eventId, eventType, rawBody);
            if (inserted == 0) {
                return Outcome.DUPLICATE;
            }
            boolean handled = dispatch(eventType, root);
            if (handled) {
                jdbc.update("UPDATE webhook_events SET processed = TRUE WHERE gateway_event_id = ?", eventId);
                return Outcome.PROCESSED;
            }
            return Outcome.IGNORED;
        });
        return outcome == null ? Outcome.IGNORED : outcome;
    }

    private boolean dispatch(String eventType, JsonNode root) {
        JsonNode payload = root.path("payload");
        switch (eventType) {
            case "payment.captured": {
                JsonNode entity = payload.path("payment").path("entity");
                Optional<Payment> p = lockPayment(entity, entity.path("id").asText(null));
                if (p.isEmpty()) {
                    log.warn("payment.captured for unknown payment: {}", entity.path("id").asText());
                    return false;
                }
                Payment payment = p.get();
                long amount = entity.path("amount").asLong(-1);
                if (amount != payment.getAmountPaise()) {
                    log.warn("payment.captured amount mismatch for payment {}: gateway={} expected={}",
                            payment.getId(), amount, payment.getAmountPaise());
                    return false;
                }
                String ref = entity.path("id").asText(null);
                if (ref == null || ref.isBlank()) {
                    ref = payment.getGatewayRef();
                }
                paymentService.applyCapture(payment, ref);
                return true;
            }
            case "payment.failed": {
                JsonNode entity = payload.path("payment").path("entity");
                Optional<Payment> p = lockPayment(entity, entity.path("id").asText(null));
                if (p.isEmpty()) {
                    log.warn("payment.failed for unknown payment: {}", entity.path("id").asText());
                    return false;
                }
                paymentService.applyFailure(p.get(), entity.path("id").asText(null),
                        entity.path("error_description").asText("payment failed"));
                return true;
            }
            case "refund.processed": {
                JsonNode refundEntity = payload.path("refund").path("entity");
                JsonNode paymentEntity = payload.path("payment").path("entity");
                String gatewayPaymentId = refundEntity.path("payment_id").asText(paymentEntity.path("id").asText(null));
                Optional<Payment> p = lockPayment(paymentEntity, gatewayPaymentId);
                if (p.isEmpty()) {
                    log.warn("refund.processed for unknown payment: {}", gatewayPaymentId);
                    return false;
                }
                long amount = refundEntity.path("amount").asLong(-1);
                if (amount <= 0) {
                    log.warn("refund.processed without a valid amount");
                    return false;
                }
                paymentService.applyWebhookRefund(p.get(), amount, refundEntity.path("id").asText(null));
                return true;
            }
            default:
                log.info("Ignoring webhook event type '{}'", eventType);
                return false;
        }
    }

    /** Resolves our payment (row-locked): notes.payment_id first, then gateway_ref = gateway payment id / order id. */
    private Optional<Payment> lockPayment(JsonNode paymentEntity, String gatewayPaymentId) {
        String noteId = paymentEntity.path("notes").path("payment_id").asText(null);
        if (noteId != null && !noteId.isBlank()) {
            try {
                Optional<Payment> byId = payments.findByIdForUpdate(UUID.fromString(noteId));
                if (byId.isPresent()) {
                    return byId;
                }
            } catch (IllegalArgumentException ignored) {
                // malformed note, fall through to gateway_ref lookup
            }
        }
        for (String ref : new String[]{gatewayPaymentId, paymentEntity.path("order_id").asText(null)}) {
            if (ref != null && !ref.isBlank()) {
                List<Payment> found = payments.findByGatewayRefForUpdate(ref);
                if (!found.isEmpty()) {
                    return Optional.of(found.get(0));
                }
            }
        }
        return Optional.empty();
    }
}
