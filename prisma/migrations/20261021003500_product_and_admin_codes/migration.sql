-- AlterTable
ALTER TABLE `products` ADD COLUMN `code` VARCHAR(2) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `admin_code_hash` VARCHAR(255) NULL;

-- Backfill: un código para cada producto que ya existía, en el mismo orden que la asignación automática
-- (filas de 4 como la cuadrícula de la máquina): 11-14, 21-24, ..., 91-94; luego 15-19, ..., 95-99;
-- luego 10, 20, ..., 90. Primero los activos y después los inactivos, cada grupo por nombre (desempate por id).
-- Pasados los 90 códigos, el resto queda sin código (NULL).
UPDATE `products` p
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (ORDER BY `is_active` DESC, `name` ASC, `id` ASC) AS n
  FROM `products`
) o ON o.`id` = p.`id`
SET p.`code` = CASE
    WHEN o.n <= 36 THEN CAST((FLOOR((o.n - 1) / 4) + 1) * 10 + MOD(o.n - 1, 4) + 1 AS CHAR(2))
    WHEN o.n <= 81 THEN CAST((FLOOR((o.n - 37) / 5) + 1) * 10 + MOD(o.n - 37, 5) + 5 AS CHAR(2))
    WHEN o.n <= 90 THEN CAST((o.n - 81) * 10 AS CHAR(2))
    ELSE NULL
  END;

-- CreateIndex
CREATE UNIQUE INDEX `products_code_key` ON `products`(`code`);
