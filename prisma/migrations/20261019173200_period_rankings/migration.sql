-- CreateTable
CREATE TABLE `period_rankings` (
    `period_id` CHAR(36) NOT NULL,
    `computed_at` DATETIME(3) NOT NULL,
    `computed_by` CHAR(36) NOT NULL,

    INDEX `period_rankings_computed_by_idx`(`computed_by`),
    PRIMARY KEY (`period_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `period_ranking_entries` (
    `period_id` CHAR(36) NOT NULL,
    `sort_order` INTEGER UNSIGNED NOT NULL,
    `position` INTEGER UNSIGNED NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `total_withdrawn` INTEGER UNSIGNED NOT NULL,
    `withdrawals` INTEGER UNSIGNED NOT NULL,

    INDEX `period_ranking_entries_user_id_idx`(`user_id`),
    UNIQUE INDEX `period_ranking_entries_period_id_user_id_key`(`period_id`, `user_id`),
    PRIMARY KEY (`period_id`, `sort_order`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `period_rankings` ADD CONSTRAINT `period_rankings_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `funding_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `period_rankings` ADD CONSTRAINT `period_rankings_computed_by_fkey` FOREIGN KEY (`computed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `period_ranking_entries` ADD CONSTRAINT `period_ranking_entries_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `period_rankings`(`period_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `period_ranking_entries` ADD CONSTRAINT `period_ranking_entries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
