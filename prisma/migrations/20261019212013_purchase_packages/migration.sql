-- AlterTable
ALTER TABLE `purchase_items` ADD COLUMN `package_count` INTEGER UNSIGNED NULL,
    ADD COLUMN `units_per_package` INTEGER UNSIGNED NULL;
