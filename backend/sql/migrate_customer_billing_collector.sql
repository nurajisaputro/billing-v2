USE billing_rwnet;
ALTER TABLE customers ADD COLUMN invoice_day_override TINYINT UNSIGNED NULL DEFAULT NULL AFTER billing_day;
ALTER TABLE customers ADD COLUMN collector_id BIGINT UNSIGNED NULL AFTER invoice_day_override;
ALTER TABLE customers ADD CONSTRAINT fk_customer_collector FOREIGN KEY (collector_id) REFERENCES users(id) ON DELETE SET NULL;
