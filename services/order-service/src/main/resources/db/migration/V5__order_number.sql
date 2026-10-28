-- Human-friendly, unguessable order number used for public tracking (e.g. FA-7K3M9-QX2RA).
-- Stored as 10 uppercase Crockford-base32 characters (50 bits of entropy), without the prefix or dashes.
ALTER TABLE orders ADD COLUMN order_number VARCHAR(16);

UPDATE orders
SET order_number = upper(substr(md5(id::text || random()::text), 1, 10))
WHERE order_number IS NULL;

ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;
CREATE UNIQUE INDEX uq_orders_order_number ON orders (order_number);
