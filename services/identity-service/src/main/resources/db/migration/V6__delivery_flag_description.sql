-- The fleet service exists now; the flag only switches the delivery partner area on or off.
UPDATE feature_flags
   SET description = 'Delivery partner area: partner sign-up and the partner screens (storefront; runs against fleet-service)'
 WHERE flag_key = 'delivery_module';
