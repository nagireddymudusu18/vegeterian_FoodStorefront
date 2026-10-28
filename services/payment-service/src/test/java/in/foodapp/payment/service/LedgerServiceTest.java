package in.foodapp.payment.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LedgerServiceTest {

    private static long debits(List<LedgerService.Line> lines) {
        return lines.stream().mapToLong(LedgerService.Line::debitPaise).sum();
    }

    private static long credits(List<LedgerService.Line> lines) {
        return lines.stream().mapToLong(LedgerService.Line::creditPaise).sum();
    }

    @Test
    void captureDebitsGatewayClearingAndCreditsEscrow() {
        List<LedgerService.Line> lines = LedgerService.captureLines(45_000);
        assertThat(lines).containsExactly(
                LedgerService.Line.debit("GATEWAY_CLEARING", 45_000),
                LedgerService.Line.credit("CUSTOMER_PAYABLE_ESCROW", 45_000));
        assertThat(debits(lines)).isEqualTo(credits(lines)).isEqualTo(45_000);
        LedgerService.assertBalanced(lines);
    }

    @Test
    void refundIsTheReverseOfCapture() {
        List<LedgerService.Line> capture = LedgerService.captureLines(12_345);
        List<LedgerService.Line> refund = LedgerService.refundLines(12_345);
        assertThat(refund).containsExactly(
                LedgerService.Line.debit("CUSTOMER_PAYABLE_ESCROW", 12_345),
                LedgerService.Line.credit("GATEWAY_CLEARING", 12_345));
        // net effect of capture + refund on every account is zero
        assertThat(debits(capture) - credits(capture) + debits(refund) - credits(refund)).isZero();
        LedgerService.assertBalanced(refund);
    }

    @Test
    void unbalancedOrMalformedPostingsAreRejected() {
        assertThatThrownBy(() -> LedgerService.assertBalanced(List.of(
                LedgerService.Line.debit("A", 100), LedgerService.Line.credit("B", 99))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("unbalanced");
        assertThatThrownBy(() -> LedgerService.assertBalanced(List.of(LedgerService.Line.debit("A", 100))))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> LedgerService.assertBalanced(List.of(
                new LedgerService.Line("A", 100, 100), LedgerService.Line.credit("B", 0 + 0))))
                .isInstanceOf(IllegalStateException.class);
    }
}
