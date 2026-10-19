-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `lastname` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_is_active_idx`(`role`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `unit` VARCHAR(20) NOT NULL DEFAULT 'unidad',
    `quantity` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `min_stock` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `category_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_name_key`(`name`),
    INDEX `products_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `performed_by` CHAR(36) NOT NULL,
    `registered_by` CHAR(36) NOT NULL,
    `type` ENUM('IN', 'OUT') NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL,
    `stock_before` INTEGER UNSIGNED NOT NULL,
    `stock_after` INTEGER UNSIGNED NOT NULL,
    `note` VARCHAR(255) NULL,
    `purchase_item_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inventory_movements_purchase_item_id_key`(`purchase_item_id`),
    INDEX `idx_mov_created`(`created_at`),
    INDEX `idx_mov_performer_type`(`performed_by`, `type`),
    INDEX `idx_mov_registrar`(`registered_by`),
    INDEX `idx_mov_product`(`product_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `funding_periods` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `notes` VARCHAR(255) NULL,
    `created_by` CHAR(36) NOT NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `funding_periods_status_idx`(`status`),
    UNIQUE INDEX `uq_period_dates`(`start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contributions` (
    `id` CHAR(36) NOT NULL,
    `period_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paid_at` DATETIME(3) NOT NULL,
    `registered_by` CHAR(36) NOT NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_contrib_period`(`period_id`),
    INDEX `idx_contrib_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` CHAR(36) NOT NULL,
    `period_id` CHAR(36) NOT NULL,
    `buyer_id` CHAR(36) NOT NULL,
    `store` VARCHAR(120) NULL,
    `purchased_at` DATETIME(3) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `receipt_path` VARCHAR(255) NULL,
    `note` VARCHAR(255) NULL,
    `registered_by` CHAR(36) NOT NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_purchase_period`(`period_id`),
    INDEX `idx_purchase_date`(`purchased_at`),
    INDEX `purchases_buyer_id_idx`(`buyer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_items` (
    `id` CHAR(36) NOT NULL,
    `purchase_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,

    INDEX `idx_item_product`(`product_id`),
    UNIQUE INDEX `uq_item_purchase_product`(`purchase_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_performed_by_fkey` FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_registered_by_fkey` FOREIGN KEY (`registered_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_purchase_item_id_fkey` FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `funding_periods` ADD CONSTRAINT `funding_periods_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `funding_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_registered_by_fkey` FOREIGN KEY (`registered_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `funding_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_registered_by_fkey` FOREIGN KEY (`registered_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_voided_by_fkey` FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restricciones CHECK (MySQL >= 8.0.16). Prisma no las declara en el schema,
-- se agregan a mano como última línea de defensa además de las reglas del dominio.
-- Nota: MySQL no permite CHECK sobre columnas con FK que tengan acción referencial
-- (purchase_item_id, voided_by); esas reglas solo las aplica el dominio.
-- ---------------------------------------------------------------------------
ALTER TABLE `inventory_movements`
    ADD CONSTRAINT `chk_mov_quantity_positive` CHECK (`quantity` > 0),
    ADD CONSTRAINT `chk_mov_stock_consistent` CHECK (
        (`type` = 'IN'  AND `stock_after` = `stock_before` + `quantity`) OR
        (`type` = 'OUT' AND `stock_after` = `stock_before` - `quantity`)
    );

ALTER TABLE `funding_periods`
    ADD CONSTRAINT `chk_period_dates` CHECK (`start_date` <= `end_date`);

ALTER TABLE `contributions`
    ADD CONSTRAINT `chk_contrib_amount_positive` CHECK (`amount` > 0);

ALTER TABLE `purchases`
    ADD CONSTRAINT `chk_purchase_total_non_negative` CHECK (`total` >= 0);

ALTER TABLE `purchase_items`
    ADD CONSTRAINT `chk_item_quantity_positive` CHECK (`quantity` > 0),
    ADD CONSTRAINT `chk_item_unit_price_non_negative` CHECK (`unit_price` >= 0),
    ADD CONSTRAINT `chk_item_subtotal` CHECK (`subtotal` = `quantity` * `unit_price`);
