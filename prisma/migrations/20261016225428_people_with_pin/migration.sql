-- AlterTable
ALTER TABLE `users` ADD COLUMN `failed_pin_attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `pin_hash` VARCHAR(255) NULL,
    ADD COLUMN `pin_locked_until` DATETIME(3) NULL,
    MODIFY `email` VARCHAR(150) NULL,
    MODIFY `password_hash` VARCHAR(255) NULL;

-- Los administradores inician sesión: necesitan email + contraseña.
-- Las personas (EMPLOYEE) se identifican en la tablet con su PIN; pueden existir sin PIN mientras el admin
-- no se lo asigne (no aparecen en la tablet hasta tenerlo). Esa regla la aplica el dominio.
ALTER TABLE `users`
    ADD CONSTRAINT `chk_user_admin_credentials` CHECK (
        `role` <> 'ADMIN' OR (`email` IS NOT NULL AND `password_hash` IS NOT NULL)
    );
