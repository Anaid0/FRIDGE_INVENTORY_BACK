-- AlterTable
ALTER TABLE `period_rankings` ADD COLUMN `computed_by_device` CHAR(36) NULL,
    MODIFY `computed_by` CHAR(36) NULL;

-- CreateIndex
CREATE INDEX `period_rankings_computed_by_device_idx` ON `period_rankings`(`computed_by_device`);

-- AddForeignKey
ALTER TABLE `period_rankings` ADD CONSTRAINT `period_rankings_computed_by_device_fkey` FOREIGN KEY (`computed_by_device`) REFERENCES `kiosk_devices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
