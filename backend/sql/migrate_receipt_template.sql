-- Jalankan satu kali pada database versi sebelumnya.
ALTER TABLE app_settings ADD COLUMN receipt_template LONGTEXT NULL AFTER brand_name;
