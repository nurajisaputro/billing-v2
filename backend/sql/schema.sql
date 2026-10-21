CREATE DATABASE IF NOT EXISTS billing_rwnet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE billing_rwnet;

CREATE TABLE IF NOT EXISTS routers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INT UNSIGNED NOT NULL DEFAULT 8728,
  username VARCHAR(100) NOT NULL,
  password_enc TEXT NOT NULL,
  isolation_profile VARCHAR(100) NOT NULL DEFAULT 'KV-ISOLIR',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_status ENUM('unknown','online','offline','error') NOT NULL DEFAULT 'unknown',
  last_checked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS packages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  service_type ENUM('internet','tv_cable','bundle') NOT NULL DEFAULT 'internet',
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  billing_cycle ENUM('monthly') NOT NULL DEFAULT 'monthly',
  ppp_profile VARCHAR(100) NULL,
  router_id BIGINT UNSIGNED NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_package_router FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(40) NULL,
  address TEXT NULL,
  service_type ENUM('internet','tv_cable','bundle') NOT NULL DEFAULT 'internet',
  package_id BIGINT UNSIGNED NULL,
  router_id BIGINT UNSIGNED NULL,
  pppoe_username VARCHAR(100) NULL,
  original_ppp_profile VARCHAR(100) NULL,
  billing_day TINYINT UNSIGNED NOT NULL DEFAULT 1,
  due_grace_days INT UNSIGNED NOT NULL DEFAULT 0,
  isolation_enabled TINYINT(1) NOT NULL DEFAULT 1,
  isolation_status ENUM('not_isolated','isolated','pending','error') NOT NULL DEFAULT 'not_isolated',
  customer_status ENUM('active','suspended','terminated') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_customer_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
  CONSTRAINT fk_customer_router FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE SET NULL,
  INDEX idx_customer_pppoe (pppoe_username),
  INDEX idx_customer_status (customer_status, isolation_status)
);

CREATE TABLE IF NOT EXISTS billing_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  invoice_generation_day TINYINT UNSIGNED NOT NULL DEFAULT 1,
  isolation_day_offset INT UNSIGNED NOT NULL DEFAULT 0,
  isolation_time TIME NOT NULL DEFAULT '00:05:00',
  auto_reactivate TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO billing_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(60) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NOT NULL,
  package_id BIGINT UNSIGNED NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('unpaid','partial','paid','void') NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_invoice_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
  UNIQUE KEY uq_customer_period (customer_id, period_start, period_end),
  INDEX idx_invoice_status_due (status, due_date)
);

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

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_number VARCHAR(60) NOT NULL UNIQUE,
  invoice_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method ENUM('cash','transfer') NOT NULL,
  account_id BIGINT UNSIGNED NULL,
  reference_number VARCHAR(120) NULL,
  notes TEXT NULL,
  paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_payment_account FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  INDEX idx_payment_paid_at (paid_at)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(100) NOT NULL DEFAULT 'system',
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_created_at (created_at)
);
