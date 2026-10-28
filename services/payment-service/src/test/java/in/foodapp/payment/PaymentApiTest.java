package in.foodapp.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PaymentApiTest extends AbstractIntegrationTest {

    @Autowired
    ObjectMapper objectMapper;

    private MvcResult createPayment(UUID customer, String key, UUID orderId, long amount, int expectedStatus) throws Exception {
        String body = "{\"orderId\":\"" + orderId + "\",\"amountPaise\":" + amount + "}";
        var req = post("/payments").contentType(MediaType.APPLICATION_JSON).content(body).with(asCustomer(customer));
        if (key != null) {
            req.header("Idempotency-Key", key);
        }
        return mvc.perform(req).andExpect(status().is(expectedStatus)).andReturn();
    }

    private JsonNode json(MvcResult r) throws Exception {
        return objectMapper.readTree(r.getResponse().getContentAsString());
    }

    @Test
    void postPaymentIsIdempotentAndCapturesWithFakeGateway() throws Exception {
        UUID customer = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        String key = "key-" + UUID.randomUUID();

        JsonNode first = json(createPayment(customer, key, orderId, 45_000, 201));
        JsonNode second = json(createPayment(customer, key, orderId, 45_000, 200));

        assertThat(first.get("status").asText()).isEqualTo("CAPTURED");
        assertThat(second.get("id").asText()).isEqualTo(first.get("id").asText());
        assertThat(first.get("customerId").asText()).isEqualTo(customer.toString());

        UUID paymentId = UUID.fromString(first.get("id").asText());
        assertThat(ledgerTxnCount(paymentId)).isEqualTo(1);
        assertThat(outboxCount("PaymentCaptured", paymentId)).isEqualTo(1);
    }

    @Test
    void sameKeyDifferentBodyIs422() throws Exception {
        UUID customer = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        String key = "key-" + UUID.randomUUID();
        createPayment(customer, key, orderId, 10_000, 201);
        createPayment(customer, key, orderId, 20_000, 422);
    }

    @Test
    void missingKeyAndBadAmountsAre400() throws Exception {
        UUID customer = UUID.randomUUID();
        createPayment(customer, null, UUID.randomUUID(), 10_000, 400);
        createPayment(customer, "k-" + UUID.randomUUID(), UUID.randomUUID(), 0, 400);
        createPayment(customer, "k-" + UUID.randomUUID(), UUID.randomUUID(), 5_000_001, 400);
        createPayment(customer, "k-" + UUID.randomUUID(), UUID.randomUUID(), 5_000_000, 201);
    }

    @Test
    void amountEndingIn13FailsAndEmitsPaymentFailed() throws Exception {
        JsonNode p = json(createPayment(UUID.randomUUID(), "k-" + UUID.randomUUID(), UUID.randomUUID(), 1_013, 201));
        assertThat(p.get("status").asText()).isEqualTo("FAILED");
        UUID id = UUID.fromString(p.get("id").asText());
        assertThat(outboxCount("PaymentFailed", id)).isEqualTo(1);
        assertThat(outboxCount("PaymentCaptured", id)).isZero();
        assertThat(ledgerTxnCount(id)).isZero();
    }

    @Test
    void getPaymentIsOwnerOrAdminOnly() throws Exception {
        UUID owner = UUID.randomUUID();
        JsonNode p = json(createPayment(owner, "k-" + UUID.randomUUID(), UUID.randomUUID(), 12_000, 201));
        String path = "/payments/" + p.get("id").asText();

        mvc.perform(get(path).with(asCustomer(owner))).andExpect(status().isOk());
        mvc.perform(get(path).with(asCustomer(UUID.randomUUID()))).andExpect(status().isForbidden());
        mvc.perform(get(path).with(asAdmin(UUID.randomUUID()))).andExpect(status().isOk());
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
    }

    @Test
    void refundRulesAndEvents() throws Exception {
        UUID customer = UUID.randomUUID();
        JsonNode p = json(createPayment(customer, "k-" + UUID.randomUUID(), UUID.randomUUID(), 50_000, 201));
        UUID paymentId = UUID.fromString(p.get("id").asText());
        String path = "/payments/" + paymentId + "/refund";

        // customers cannot refund
        mvc.perform(post(path).header("Idempotency-Key", "r0").contentType(MediaType.APPLICATION_JSON)
                .content("{\"amountPaise\":100}").with(asCustomer(customer))).andExpect(status().isForbidden());

        UUID admin = UUID.randomUUID();
        String refundKey = "refund-" + UUID.randomUUID();
        MvcResult r1 = mvc.perform(post(path).header("Idempotency-Key", refundKey).contentType(MediaType.APPLICATION_JSON)
                .content("{\"amountPaise\":20000}").with(asAdmin(admin))).andExpect(status().isCreated()).andReturn();
        MvcResult replay = mvc.perform(post(path).header("Idempotency-Key", refundKey).contentType(MediaType.APPLICATION_JSON)
                .content("{\"amountPaise\":20000}").with(asAdmin(admin))).andExpect(status().isOk()).andReturn();
        assertThat(json(replay).get("refundId").asText()).isEqualTo(json(r1).get("refundId").asText());

        // 20000 refunded, 30000 left: 30001 is rejected, 30000 is accepted
        mvc.perform(post(path).header("Idempotency-Key", "r-over-" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"amountPaise\":30001}").with(asAdmin(admin))).andExpect(status().isUnprocessableEntity());
        mvc.perform(post(path).header("Idempotency-Key", "r-rest-" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"amountPaise\":30000}").with(asAdmin(admin))).andExpect(status().isCreated());

        // capture txn + two refund txns, every one balanced
        assertThat(ledgerTxnCount(paymentId)).isEqualTo(3);
        Long unbalanced = jdbc.queryForObject(
                "SELECT COUNT(*) FROM (SELECT txn_id FROM ledger_entries WHERE payment_id = ? GROUP BY txn_id "
                        + "HAVING SUM(debit_paise) <> SUM(credit_paise)) t", Long.class, paymentId);
        assertThat(unbalanced).isZero();
        String status = jdbc.queryForObject("SELECT status FROM payments WHERE id = ?", String.class, paymentId);
        assertThat(status).isEqualTo("REFUNDED");
        Integer events = jdbc.queryForObject(
                "SELECT COUNT(*) FROM outbox WHERE type = 'RefundIssued' AND payload->>'paymentId' = ?",
                Integer.class, paymentId.toString());
        assertThat(events).isEqualTo(2);
    }
}
