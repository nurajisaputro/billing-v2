USE billing_rwnet;

ALTER TABLE customers
  ADD COLUMN imported_at DATETIME NULL DEFAULT NULL AFTER notes;

UPDATE customers
SET customer_code = CONCAT('PLG-', LPAD(id, 6, '0'))
WHERE customer_code LIKE 'IMP-%';
