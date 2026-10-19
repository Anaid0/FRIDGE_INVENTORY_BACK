-- AlterTable
ALTER TABLE `contributions` ADD COLUMN `charge_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `inventory_movements` ADD COLUMN `unit_price` DECIMAL(12, 2) NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `reference_price` DECIMAL(12, 2) NULL;

-- CreateTable
CREATE TABLE `consumption_charges` (
    `id` CHAR(36) NOT NULL,
    `period_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `units` INTEGER UNSIGNED NOT NULL,
    `unpriced_units` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `computed_at` DATETIME(3) NOT NULL,

    INDEX `consumption_charges_user_id_idx`(`user_id`),
    UNIQUE INDEX `consumption_charges_period_id_user_id_key`(`period_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `contributions_charge_id_idx` ON `contributions`(`charge_id`);

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_charge_id_fkey` FOREIGN KEY (`charge_id`) REFERENCES `consumption_charges`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumption_charges` ADD CONSTRAINT `consumption_charges_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `funding_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumption_charges` ADD CONSTRAINT `consumption_charges_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Retiros manuales ya registrados: precio de la última compra (no anulada) del producto hecha hasta ese
-- momento; si no la hay, la primera compra posterior. Los que sigan sin precio se valoran con el precio
-- de referencia del producto al generar los cobros.
UPDATE `inventory_movements` m
SET m.`unit_price` = COALESCE(
  (SELECT pi.`unit_price` FROM `purchase_items` pi JOIN `purchases` p ON p.`id` = pi.`purchase_id`
    WHERE pi.`product_id` = m.`product_id` AND p.`voided_at` IS NULL AND p.`purchased_at` <= m.`created_at`
    ORDER BY p.`purchased_at` DESC, p.`created_at` DESC LIMIT 1),
  (SELECT pi.`unit_price` FROM `purchase_items` pi JOIN `purchases` p ON p.`id` = pi.`purchase_id`
    WHERE pi.`product_id` = m.`product_id` AND p.`voided_at` IS NULL
    ORDER BY p.`purchased_at` ASC, p.`created_at` ASC LIMIT 1)
)
WHERE m.`type` = 'OUT' AND m.`source` = 'MANUAL' AND m.`unit_price` IS NULL;
