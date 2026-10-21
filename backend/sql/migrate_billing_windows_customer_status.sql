USE billing_rwnet;
ALTER TABLE billing_settings
  ADD COLUMN payment_start_day TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER invoice_generation_day,
  ADD COLUMN payment_end_day TINYINT UNSIGNED NOT NULL DEFAULT 13 AFTER payment_start_day,
  ADD COLUMN grace_days INT UNSIGNED NOT NULL DEFAULT 2 AFTER payment_end_day;
UPDATE billing_settings SET isolation_time='00:01:00' WHERE id=1 AND isolation_time='00:05:00';
ALTER TABLE customers
  ADD COLUMN payment_start_day_override TINYINT UNSIGNED NULL DEFAULT NULL AFTER invoice_day_override,
  ADD COLUMN payment_end_day_override TINYINT UNSIGNED NULL DEFAULT NULL AFTER payment_start_day_override,
  ADD COLUMN grace_days_override INT UNSIGNED NULL DEFAULT NULL AFTER payment_end_day_override,
  ADD COLUMN isolation_time_override TIME NULL DEFAULT NULL AFTER grace_days_override,
  ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER due_grace_days,
  ADD COLUMN skip_mass_isolation TINYINT(1) NOT NULL DEFAULT 0 AFTER active;

-- Recalculate due dates for existing outstanding invoices to match the new payment window.
UPDATE invoices i
JOIN customers c ON c.id=i.customer_id
JOIN billing_settings bs ON bs.id=1
SET i.due_date = STR_TO_DATE(
  CONCAT(YEAR(i.period_start), '-', LPAD(MONTH(i.period_start), 2, '0'), '-',
    LPAD(LEAST(COALESCE(c.payment_end_day_override, bs.payment_end_day), DAY(LAST_DAY(i.period_start))), 2, '0')),
  '%Y-%m-%d'
)
WHERE i.status IN ('unpaid','partial');
