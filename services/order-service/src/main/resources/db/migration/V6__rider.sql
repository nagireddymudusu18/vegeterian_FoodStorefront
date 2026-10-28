-- The delivery partner assigned by fleet-service (replicated from its DeliveryAssigned event).
ALTER TABLE orders ADD COLUMN rider_user_id UUID;
