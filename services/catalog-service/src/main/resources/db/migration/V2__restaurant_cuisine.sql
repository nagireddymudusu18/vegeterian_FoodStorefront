ALTER TABLE restaurants ADD COLUMN cuisine VARCHAR(40);
CREATE INDEX idx_restaurants_cuisine ON restaurants (lower(cuisine));
