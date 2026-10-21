USE billing_rwnet;

CREATE TABLE IF NOT EXISTS bank_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bank_name VARCHAR(100) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  account_number VARCHAR(80) NOT NULL,
  branch VARCHAR(100) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bank_account (bank_name, account_number)
);

-- Jalankan ALTER berikut hanya satu kali pada database yang sudah memiliki tabel payments lama.
ALTER TABLE payments ADD COLUMN account_id BIGINT UNSIGNED NULL AFTER method;
ALTER TABLE payments ADD CONSTRAINT fk_payment_account FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
