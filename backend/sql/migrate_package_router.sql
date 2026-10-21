USE billing_rwnet;

ALTER TABLE packages ADD COLUMN router_id BIGINT UNSIGNED NULL AFTER ppp_profile;
ALTER TABLE packages ADD CONSTRAINT fk_package_router FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE SET NULL;
