USE billing_rwnet;

ALTER TABLE customers
  ADD COLUMN imported_at DATETIME NULL DEFAULT NULL AFTER notes;

-- Preserve the original creation timestamp for customers imported before this migration.
UPDATE customers
SET imported_at = created_at
WHERE customer_code LIKE 'IMP-%' AND imported_at IS NULL;

-- Normalize older CSV-imported customer codes to a short, stable code.
UPDATE customers
SET customer_code = CONCAT('PLG-', LPAD(id, 6, '0'))
WHERE customer_code LIKE 'IMP-%';
