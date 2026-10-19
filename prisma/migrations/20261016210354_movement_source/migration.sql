-- AlterTable
ALTER TABLE `inventory_movements` ADD COLUMN `source` ENUM('MANUAL', 'PURCHASE', 'PURCHASE_VOID') NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX `idx_mov_ranking` ON `inventory_movements`(`type`, `source`, `performed_by`);

-- El origen debe ser coherente con el tipo (la regla que involucra purchase_item_id
-- no se puede expresar como CHECK por su FK; la aplica el dominio).
ALTER TABLE `inventory_movements`
    ADD CONSTRAINT `chk_mov_source_type` CHECK (
        `source` = 'MANUAL' OR
        (`source` = 'PURCHASE' AND `type` = 'IN') OR
        (`source` = 'PURCHASE_VOID' AND `type` = 'OUT')
    );
