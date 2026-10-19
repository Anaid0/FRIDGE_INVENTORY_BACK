-- Base de datos separada para los tests e2e.
-- Prisma (migrate dev) necesita además crear una "shadow database", por eso se dan permisos globales al usuario de la app.
CREATE DATABASE IF NOT EXISTS fridgeya_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON *.* TO 'fridgeya'@'%';
FLUSH PRIVILEGES;
