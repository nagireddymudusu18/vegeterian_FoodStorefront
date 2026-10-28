package in.foodapp.payment.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Double-entry, append-only ledger. Every posting is a single txn_id whose debits equal its credits.
 * The balance is checked here (service level) and again by a deferred constraint trigger in the DB.
 */
@Service
public class LedgerService {

    public static final String GATEWAY_CLEARING = "GATEWAY_CLEARING";
    public static final String CUSTOMER_PAYABLE_ESCROW = "CUSTOMER_PAYABLE_ESCROW";

    /** One side of a ledger posting. Exactly one of debit/credit is positive. */
    public record Line(String account, long debitPaise, long creditPaise) {
        public static Line debit(String account, long paise) {
            return new Line(account, paise, 0);
        }

        public static Line credit(String account, long paise) {
            return new Line(account, 0, paise);
        }
    }

    private final JdbcTemplate jdbc;

    public LedgerService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Capture: debit GATEWAY_CLEARING / credit CUSTOMER_PAYABLE_ESCROW. */
    public static List<Line> captureLines(long amountPaise) {
        return List.of(Line.debit(GATEWAY_CLEARING, amountPaise), Line.credit(CUSTOMER_PAYABLE_ESCROW, amountPaise));
    }

    /** Refund: the reverse of capture. */
    public static List<Line> refundLines(long amountPaise) {
        return List.of(Line.debit(CUSTOMER_PAYABLE_ESCROW, amountPaise), Line.credit(GATEWAY_CLEARING, amountPaise));
    }

    /** @throws IllegalStateException if the lines are empty, malformed or debits != credits. */
    public static void assertBalanced(List<Line> lines) {
        if (lines == null || lines.size() < 2) {
            throw new IllegalStateException("ledger posting needs at least two lines");
        }
        long debits = 0;
        long credits = 0;
        for (Line l : lines) {
            boolean oneSided = (l.debitPaise() > 0 && l.creditPaise() == 0) || (l.debitPaise() == 0 && l.creditPaise() > 0);
            if (!oneSided) {
                throw new IllegalStateException("ledger line must be exactly one of debit/credit > 0: " + l);
            }
            debits += l.debitPaise();
            credits += l.creditPaise();
        }
        if (debits != credits) {
            throw new IllegalStateException("unbalanced ledger posting: debits=" + debits + " credits=" + credits);
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public UUID postCapture(UUID paymentId, long amountPaise) {
        return post(paymentId, captureLines(amountPaise));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public UUID postRefund(UUID paymentId, long amountPaise) {
        return post(paymentId, refundLines(amountPaise));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public UUID post(UUID paymentId, List<Line> lines) {
        assertBalanced(lines);
        UUID txnId = UUID.randomUUID();
        for (Line l : lines) {
            jdbc.update("INSERT INTO ledger_entries (txn_id, account, debit_paise, credit_paise, payment_id) VALUES (?, ?, ?, ?, ?)",
                    txnId, l.account(), l.debitPaise(), l.creditPaise(), paymentId);
        }
        return txnId;
    }

    /** debits - credits for a txn; 0 when balanced. */
    @Transactional(readOnly = true)
    public long imbalance(UUID txnId) {
        Long v = jdbc.queryForObject(
                "SELECT COALESCE(SUM(debit_paise), 0) - COALESCE(SUM(credit_paise), 0) FROM ledger_entries WHERE txn_id = ?",
                Long.class, txnId);
        return v == null ? 0 : v;
    }

    @Transactional(readOnly = true)
    public int countTransactionsForPayment(UUID paymentId) {
        Integer v = jdbc.queryForObject("SELECT COUNT(DISTINCT txn_id) FROM ledger_entries WHERE payment_id = ?",
                Integer.class, paymentId);
        return v == null ? 0 : v;
    }
}
