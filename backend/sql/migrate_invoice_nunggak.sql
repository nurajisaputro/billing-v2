USE billing_rwnet;
ALTER TABLE invoices ADD COLUMN skip_isolation TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
