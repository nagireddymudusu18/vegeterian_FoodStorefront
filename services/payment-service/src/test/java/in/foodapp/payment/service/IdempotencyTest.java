package in.foodapp.payment.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class IdempotencyTest {

    @Test
    void sameRequestHashesEqualAndIsReplay() {
        UUID order = UUID.randomUUID();
        String a = Idempotency.paymentHash(order, 45_000);
        String b = Idempotency.paymentHash(order, 45_000);
        assertThat(a).isEqualTo(b).hasSize(64);
        assertThat(Idempotency.isReplay(a, b)).isTrue();
    }

    @Test
    void differentBodyIsNotReplay() {
        UUID order = UUID.randomUUID();
        assertThat(Idempotency.isReplay(Idempotency.paymentHash(order, 45_000), Idempotency.paymentHash(order, 45_001))).isFalse();
        assertThat(Idempotency.isReplay(Idempotency.paymentHash(order, 45_000),
                Idempotency.paymentHash(UUID.randomUUID(), 45_000))).isFalse();
    }

    @Test
    void paymentAndRefundHashesNeverCollide() {
        UUID id = UUID.randomUUID();
        assertThat(Idempotency.paymentHash(id, 100)).isNotEqualTo(Idempotency.refundHash(id, 100));
        assertThat(Idempotency.isReplay(null, "x")).isFalse();
    }
}
