package in.foodapp.payment.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.foodapp.payment.AbstractIntegrationTest;
import in.foodapp.payment.contract.ContractSchemas;
import in.foodapp.payment.events.consumer.FeedDtos.FeedEvent;
import in.foodapp.payment.persistence.ClosedOrderStore;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;
import org.springframework.transaction.support.TransactionTemplate;

class OrderFeedConsumerTest extends AbstractIntegrationTest {

    @Autowired
    OrderFeedConsumer consumer;

    @Autowired
    ClosedOrderStore closedOrders;

    @Autowired
    TransactionTemplate tx;

    private UUID pay(UUID orderId, long amount) throws Exception {
        String body = "{\"orderId\":\"" + orderId + "\",\"amountPaise\":" + amount + "}";
        String res = mvc.perform(MockMvcRequestBuilders.post("/payments").contentType(MediaType.APPLICATION_JSON)
                        .content(body).header("Idempotency-Key", "k-" + UUID.randomUUID()).with(asCustomer(UUID.randomUUID())))
                .andExpect(MockMvcResultMatchers.status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(res).get("id").asText());
    }

    private FeedEvent statusChanged(UUID orderId, String from, String to) {
        ObjectNode p = ContractSchemas.example("OrderStatusChanged");
        p.put("orderId", orderId.toString());
        p.put("from", from);
        p.put("to", to);
        ContractSchemas.assertValid("OrderStatusChanged", p);
        return new FeedEvent(1, "OrderStatusChanged", orderId, Instant.now(), p);
    }

    private void handle(FeedEvent e) {
        tx.executeWithoutResult(s -> consumer.handle(e));
    }

    private String status(UUID paymentId) {
        return jdbc.queryForObject("SELECT status FROM payments WHERE id = ?", String.class, paymentId);
    }

    private int refundRows(UUID paymentId) {
        return jdbc.queryForObject("SELECT count(*) FROM refunds WHERE payment_id = ?", Integer.class, paymentId);
    }

    @Test
    void contractListsPaymentServiceAsConsumer() {
        assertThat(ContractSchemas.consumedBy("OrderStatusChanged", "payment-service")).isTrue();
    }

    @Test
    void cancelledOrderRefundsTheCapturedPaymentOnce() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID paymentId = pay(orderId, 45_000);
        assertThat(status(paymentId)).isEqualTo("CAPTURED");

        handle(statusChanged(orderId, "PAID", "CANCELLED"));
        assertThat(status(paymentId)).isEqualTo("REFUNDED");
        assertThat(refundRows(paymentId)).isEqualTo(1);
        assertThat(outboxCount("RefundIssued", jdbc.queryForObject(
                "SELECT id FROM refunds WHERE payment_id = ?", UUID.class, paymentId))).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT amount_paise FROM refunds WHERE payment_id = ?", Long.class, paymentId))
                .isEqualTo(45_000L);
        // capture txn + refund txn, both balanced
        assertThat(ledgerTxnCount(paymentId)).isEqualTo(2);

        handle(statusChanged(orderId, "PAID", "CANCELLED"));
        assertThat(refundRows(paymentId)).isEqualTo(1);
    }

    @Test
    void rejectedOrderRefundsOnlyWhatIsLeftAfterAPartialRefund() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID paymentId = pay(orderId, 30_000);
        mvc.perform(MockMvcRequestBuilders.post("/payments/" + paymentId + "/refund")
                        .header("Idempotency-Key", "r-" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountPaise\":10000}").with(asAdmin(UUID.randomUUID())))
                .andExpect(MockMvcResultMatchers.status().is2xxSuccessful());

        handle(statusChanged(orderId, "MERCHANT_ACCEPTED", "REJECTED_BY_MERCHANT"));
        assertThat(status(paymentId)).isEqualTo("REFUNDED");
        assertThat(jdbc.queryForObject("SELECT sum(amount_paise) FROM refunds WHERE payment_id = ?", Long.class, paymentId))
                .isEqualTo(30_000L);
    }

    @Test
    void otherStatusesAndOtherEventTypesAreIgnored() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID paymentId = pay(orderId, 12_000);

        handle(statusChanged(orderId, "PAID", "MERCHANT_ACCEPTED"));
        handle(new FeedEvent(2, "OrderCreated", orderId, Instant.now(), ContractSchemas.example("OrderStatusChanged")));
        assertThat(status(paymentId)).isEqualTo("CAPTURED");
        assertThat(refundRows(paymentId)).isZero();
    }

    @Test
    void unpaidOrderHasNothingToRefund() throws Exception {
        UUID orderId = UUID.randomUUID();
        // amounts ending in 13 are declined by the fake gateway
        String body = "{\"orderId\":\"" + orderId + "\",\"amountPaise\":1013}";
        mvc.perform(MockMvcRequestBuilders.post("/payments").contentType(MediaType.APPLICATION_JSON).content(body)
                .header("Idempotency-Key", "k-" + UUID.randomUUID()).with(asCustomer(UUID.randomUUID())));

        handle(statusChanged(orderId, "PAYMENT_FAILED", "CANCELLED"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refunds r JOIN payments p ON p.id = r.payment_id "
                + "WHERE p.order_id = ?", Integer.class, orderId)).isZero();
        assertThat(closedOrders.isClosed(orderId)).isTrue();
    }

    @Test
    void captureAfterTheOrderClosedIsRefundedImmediately() throws Exception {
        UUID orderId = UUID.randomUUID();
        handle(statusChanged(orderId, "CREATED", "CANCELLED"));

        UUID paymentId = pay(orderId, 20_000);
        assertThat(status(paymentId)).isEqualTo("REFUNDED");
        assertThat(refundRows(paymentId)).isEqualTo(1);
        assertThat(ledgerTxnCount(paymentId)).isEqualTo(2);
    }

    @Test
    void malformedEventsAreRejectedForParking() {
        ObjectNode p = ContractSchemas.example("OrderStatusChanged");
        p.put("to", "CANCELLED");
        p.put("orderId", "not-a-uuid");
        FeedEvent bad = new FeedEvent(3, "OrderStatusChanged", UUID.randomUUID(), Instant.now(), p);
        assertThatThrownBy(() -> handle(bad)).isInstanceOf(MalformedEventException.class);

        ObjectNode noTo = ContractSchemas.example("OrderStatusChanged");
        noTo.remove("to");
        assertThatThrownBy(() -> handle(new FeedEvent(4, "OrderStatusChanged", UUID.randomUUID(), Instant.now(), noTo)))
                .isInstanceOf(MalformedEventException.class);
    }

    @Test
    void deadLetterEndpointsAreAdminOnly() throws Exception {
        mvc.perform(MockMvcRequestBuilders.get("/payments/admin/dead-letters").with(asCustomer(UUID.randomUUID())))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
        mvc.perform(MockMvcRequestBuilders.get("/payments/admin/dead-letters").with(asAdmin(UUID.randomUUID())))
                .andExpect(MockMvcResultMatchers.status().isOk());
    }
}
