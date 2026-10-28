package in.foodapp.payment;

import in.foodapp.payment.infra.gateway.WebhookSignatures;
import in.foodapp.payment.persistence.Payment;
import in.foodapp.payment.persistence.PaymentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class WebhookTest extends AbstractIntegrationTest {

    @Autowired
    PaymentRepository payments;

    private Payment seedCreatedPayment(long amountPaise, String gatewayRef) {
        Payment p = new Payment(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), amountPaise, "fake",
                "seed-" + UUID.randomUUID(), "hash");
        p.markPending(gatewayRef);
        return payments.saveAndFlush(p);
    }

    private static String capturedBody(String gatewayRef, long amountPaise) {
        return "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"" + gatewayRef
                + "\",\"amount\":" + amountPaise + ",\"currency\":\"INR\"}}}}";
    }

    @Test
    void sameEventTwiceCausesOneStateChangeAndOneLedgerTxn() throws Exception {
        String ref = "pay_" + UUID.randomUUID().toString().replace("-", "");
        Payment p = seedCreatedPayment(75_000, ref);
        String body = capturedBody(ref, 75_000);
        String sig = WebhookSignatures.hmacSha256Hex(WEBHOOK_SECRET, body);
        String eventId = "evt_" + UUID.randomUUID();

        mvc.perform(post("/webhooks/razorpay").contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("X-Razorpay-Signature", sig).header("X-Razorpay-Event-Id", eventId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PROCESSED"));
        mvc.perform(post("/webhooks/razorpay").contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("X-Razorpay-Signature", sig).header("X-Razorpay-Event-Id", eventId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DUPLICATE"));

        assertThat(ledgerTxnCount(p.getId())).isEqualTo(1);
        assertThat(outboxCount("PaymentCaptured", p.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM payments WHERE id = ?", String.class, p.getId()))
                .isEqualTo("CAPTURED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM webhook_events WHERE gateway_event_id = ?",
                Integer.class, eventId)).isEqualTo(1);
    }

    @Test
    void badSignatureIs401AndChangesNothing() throws Exception {
        String ref = "pay_" + UUID.randomUUID().toString().replace("-", "");
        Payment p = seedCreatedPayment(10_000, ref);
        String body = capturedBody(ref, 10_000);

        mvc.perform(post("/webhooks/razorpay").contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("X-Razorpay-Signature", "deadbeef").header("X-Razorpay-Event-Id", "evt_" + UUID.randomUUID()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/webhooks/razorpay").contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("X-Razorpay-Event-Id", "evt_" + UUID.randomUUID()))
                .andExpect(status().isUnauthorized());

        assertThat(ledgerTxnCount(p.getId())).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM payments WHERE id = ?", String.class, p.getId()))
                .isEqualTo("CREATED");
    }

    @Test
    void paymentFailedAndRefundProcessedAreMapped() throws Exception {
        String ref = "pay_" + UUID.randomUUID().toString().replace("-", "");
        Payment failing = seedCreatedPayment(20_000, ref);
        String failedBody = "{\"event\":\"payment.failed\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"" + ref
                + "\",\"amount\":20000,\"error_description\":\"insufficient funds\"}}}}";
        mvc.perform(post("/webhooks/razorpay").contentType(MediaType.APPLICATION_JSON).content(failedBody)
                        .header("X-Razorpay-Signature", WebhookSignatures.hmacSha256Hex(WEBHOOK_SECRET, failedBody))
                        .header("X-Razorpay-Event-Id", "evt_" + UUID.randomUUID()))
                .andExpect(status().isOk());
        assertThat(outboxCount("PaymentFailed", failing.getId())).isEqualTo(1);

        String ref2 = "pay_" + UUID.randomUUID().toString().replace("-", "");
        Payment paid = seedCreatedPayment(30_000, ref2);
        String capBody = capturedBody(ref2, 30_000);
        mvc.perform(post("/webhooks/razorpay").contentType(MediaType.APPLICATION_JSON).content(capBody)
                        .header("X-Razorpay-Signature", WebhookSignatures.hmacSha256Hex(WEBHOOK_SECRET, capBody))
                        .header("X-Razorpay-Event-Id", "evt_" + UUID.randomUUID()))
                .andExpect(status().isOk());
        String refundBody = "{\"event\":\"refund.processed\",\"payload\":{\"refund\":{\"entity\":{\"id\":\"rfnd_"
                + UUID.randomUUID().toString().replace("-", "") + "\",\"payment_id\":\"" + ref2 + "\",\"amount\":10000}}}}";
        mvc.perform(post("/webhooks/razorpay").contentType(MediaType.APPLICATION_JSON).content(refundBody)
                        .header("X-Razorpay-Signature", WebhookSignatures.hmacSha256Hex(WEBHOOK_SECRET, refundBody))
                        .header("X-Razorpay-Event-Id", "evt_" + UUID.randomUUID()))
                .andExpect(status().isOk());

        assertThat(ledgerTxnCount(paid.getId())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM outbox WHERE type = 'RefundIssued' AND payload->>'paymentId' = ?",
                Integer.class, paid.getId().toString())).isEqualTo(1);
    }
}
