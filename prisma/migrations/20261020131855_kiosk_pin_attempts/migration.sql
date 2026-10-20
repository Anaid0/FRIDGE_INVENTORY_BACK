-- AlterTable
ALTER TABLE `kiosk_devices` ADD COLUMN `failed_pin_attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `pin_locked_until` DATETIME(3) NULL;
