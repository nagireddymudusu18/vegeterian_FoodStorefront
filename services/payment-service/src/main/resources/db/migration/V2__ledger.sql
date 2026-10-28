-- ledger_entries: APPEND-ONLY double-entry ledger.
CREATE TABLE ledger_entries (
    id            BIGSERIAL PRIMARY KEY,
    txn_id        UUID        NOT NULL,
    account       TEXT        NOT NULL,
    debit_paise   BIGINT      NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
    credit_paise  BIGINT      NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
    payment_id    UUID        NOT NULL REFERENCES payments (id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- each line is either a debit or a credit, never both / neither
    CONSTRAINT ck_ledger_one_side CHECK ((debit_paise > 0 AND credit_paise = 0) OR (debit_paise = 0 AND credit_paise > 0))
);
CREATE INDEX idx_ledger_txn ON ledger_entries (txn_id);
CREATE INDEX idx_ledger_payment ON ledger_entries (payment_id);

-- Append-only: reject UPDATE / DELETE / TRUNCATE.
CREATE FUNCTION ledger_entries_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entries is append-only (% not allowed)', TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_no_update_delete
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();

CREATE TRIGGER trg_ledger_no_truncate
    BEFORE TRUNCATE ON ledger_entries
    FOR EACH STATEMENT EXECUTE FUNCTION ledger_entries_immutable();

-- Balanced-transaction check, evaluated at COMMIT (deferred): for every txn_id touched in the
-- transaction, sum(debit) must equal sum(credit).
CREATE FUNCTION ledger_txn_balanced() RETURNS trigger AS $$
DECLARE
    d BIGINT;
    c BIGINT;
BEGIN
    SELECT COALESCE(SUM(debit_paise), 0), COALESCE(SUM(credit_paise), 0)
      INTO d, c
      FROM ledger_entries
     WHERE txn_id = NEW.txn_id;
    IF d <> c THEN
        RAISE EXCEPTION 'ledger txn % is unbalanced: debits=% credits=%', NEW.txn_id, d, c
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_ledger_txn_balanced
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ledger_txn_balanced();
