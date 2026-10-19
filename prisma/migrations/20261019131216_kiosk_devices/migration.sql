-- CreateTable
CREATE TABLE `kiosk_devices` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by` CHAR(36) NULL,

    INDEX `kiosk_devices_created_by_idx`(`created_by`),
    INDEX `kiosk_devices_revoked_by_idx`(`revoked_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `kiosk_devices` ADD CONSTRAINT `kiosk_devices_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kiosk_devices` ADD CONSTRAINT `kiosk_devices_revoked_by_fkey` FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
