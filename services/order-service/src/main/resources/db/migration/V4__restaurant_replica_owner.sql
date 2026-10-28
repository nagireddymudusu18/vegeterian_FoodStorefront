-- Owner of the restaurant (catalog owner_user_id = identity user id = JWT sub), used to authorize restaurant staff
-- on order transitions. NULL for rows replicated from older events: such restaurants have no authorized staff
-- (ADMIN only) until a newer RestaurantUpserted carrying ownerUserId arrives.
ALTER TABLE restaurant_replica ADD COLUMN owner_user_id UUID;
