package in.foodapp.payment;

import in.foodapp.payment.persistence.Payment;
import in.foodapp.payment.persistence.PaymentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LedgerTriggerTest extends AbstractIntegrationTest {

    @Autowired
    PaymentRepository payments;

    @Autowired
    PlatformTransactionManager txManager;

    private UUID seedPaymentWithBalancedEntries() {
        Payment p = payments.saveAndFlush(new Payment(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 5_000,
                "fake", "seed-" + UUID.randomUUID(), "hash"));
        UUID txn = UUID.randomUUID();
        new TransactionTemplate(txManager).executeWithoutResult(s -> {
            jdbc.update("INSERT INTO ledger_entries (txn_id, account, debit_paise, credit_paise, payment_id) VALUES (?,?,?,?,?)",
                    txn, "GATEWAY_CLEARING", 5_000, 0, p.getId());
            jdbc.update("INSERT INTO ledger_entries (txn_id, account, debit_paise, credit_paise, payment_id) VALUES (?,?,?,?,?)",
                    txn, "CUSTOMER_PAYABLE_ESCROW", 0, 5_000, p.getId());
        });
        return p.getId();
    }

    @Test
    void updateAndDeleteAreRejectedByTrigger() {
        UUID paymentId = seedPaymentWithBalancedEntries();
        assertThatThrownBy(() -> jdbc.update("UPDATE ledger_entries SET debit_paise = 1 WHERE payment_id = ?", paymentId))
                .isInstanceOf(DataAccessException.class).hasStackTraceContaining("append-only");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM ledger_entries WHERE payment_id = ?", paymentId))
                .isInstanceOf(DataAccessException.class).hasStackTraceContaining("append-only");
        assertThat(ledgerTxnCount(paymentId)).isEqualTo(1);
    }

    @Test
    void unbalancedTransactionIsRejectedAtCommit() {
        Payment p = payments.saveAndFlush(new Payment(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 5_000,
                "fake", "seed-" + UUID.randomUUID(), "hash"));
        TransactionTemplate tx = new TransactionTemplate(txManager);
        assertThatThrownBy(() -> tx.executeWithoutResult(s ->
                jdbc.update("INSERT INTO ledger_entries (txn_id, account, debit_paise, credit_paise, payment_id) VALUES (?,?,?,?,?)",
                        UUID.randomUUID(), "GATEWAY_CLEARING", 5_000, 0, p.getId())))
                .isInstanceOf(Exception.class).hasStackTraceContaining("unbalanced");
        assertThat(ledgerTxnCount(p.getId())).isZero();
    }
}
