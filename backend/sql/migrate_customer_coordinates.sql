-- Jalankan satu kali pada database Billing RT/RW Net yang sudah ada.
ALTER TABLE customers ADD COLUMN latitude DECIMAL(10,7) NULL AFTER address;
ALTER TABLE customers ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude;
