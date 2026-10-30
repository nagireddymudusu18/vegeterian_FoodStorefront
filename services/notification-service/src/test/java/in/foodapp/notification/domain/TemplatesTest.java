package in.foodapp.notification.domain;

import static org.assertj.core.api.Assertions.assertThat;

import in.foodapp.notification.domain.Message.Channel;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TemplatesTest {

    @Test
    void formatsRupeesFromPaise() {
        assertThat(Templates.rupees(72090)).isEqualTo("\u20B9720.90");
        assertThat(Templates.rupees(5)).isEqualTo("\u20B90.05");
        assertThat(Templates.rupees(100)).isEqualTo("\u20B91.00");
    }

    @Test
    void customerChannelPolicy() {
        assertThat(status("PAID").outbound()).containsExactly(Channel.EMAIL);
        assertThat(status("PICKED_UP").outbound()).containsExactly(Channel.SMS);
        assertThat(status("DELIVERED").outbound()).containsExactly(Channel.EMAIL);
        assertThat(status("CANCELLED").outbound()).containsExactlyInAnyOrder(Channel.EMAIL, Channel.SMS);
        assertThat(status("REJECTED_BY_MERCHANT").outbound()).containsExactlyInAnyOrder(Channel.EMAIL, Channel.SMS);
        for (String quiet : new String[] {"MERCHANT_ACCEPTED", "PREPARING", "RIDER_ASSIGNED"}) {
            assertThat(status(quiet).outbound()).as(quiet).isEmpty();
        }
    }

    @Test
    void statusesThatAreCoveredElsewhereSayNothing() {
        // CREATED is announced by OrderCreated, and the payment/refund events speak for the last two
        for (String silent : new String[] {"CREATED", "PAYMENT_FAILED", "REFUNDED", "SOMETHING_NEW"}) {
            assertThat(Templates.customerStatus(silent, "FA-1", "id", "Cafe")).as(silent).isEmpty();
        }
    }

    @Test
    void messagesNameTheOrderAndRestaurant() {
        Message m = status("PAID");
        assertThat(m.body()).contains("FA-ABCDE-12345").contains("Spice Route");
        assertThat(m.kind()).isEqualTo("ORDER_PAID");
    }

    @Test
    void fallsBackToAShortIdWhenThereIsNoOrderNumberOrRestaurant() {
        Message m = Templates.customerStatus("DELIVERED", null, "12345678-aaaa-bbbb-cccc-dddddddddddd", null)
                .orElseThrow();
        assertThat(m.body()).contains("#12345678").doesNotContain("null").doesNotContain(" from ");
    }

    @Test
    void paymentAndRefundGoByEmailToo() {
        assertThat(Templates.paymentFailed("FA-1", "x").outbound()).containsExactly(Channel.EMAIL);
        Message refund = Templates.refundIssued("FA-1", "x", 72090);
        assertThat(refund.outbound()).containsExactly(Channel.EMAIL);
        assertThat(refund.body()).contains("\u20B9720.90");
    }

    @Test
    void restaurantAndPartnerMessages() {
        Message order = Templates.newOrderForRestaurant("FA-1", "x", 12000);
        assertThat(order.title()).contains("FA-1");
        assertThat(order.body()).contains("\u20B9120.00");
        assertThat(order.outbound()).isEqualTo(Set.of(Channel.EMAIL));

        Message job = Templates.newDeliveryJob("FA-1", "x", null);
        assertThat(job.body()).contains("a restaurant").contains("FA-1");
        assertThat(job.outbound()).isEmpty();
        assertThat(Templates.jobAssigned("FA-1", "x", "Cafe").body()).contains("Cafe");
    }

    private static Message status(String to) {
        return Templates.customerStatus(to, "FA-ABCDE-12345", "id", "Spice Route Kitchen").orElseThrow();
    }
}
