# FridgeYA — Backend

API de inventario de la nevera de la oficina. Node.js + TypeScript con **arquitectura hexagonal** y principios **SOLID**, MySQL 8 vía Prisma.

## Requisitos

- Node.js >= 22 (LTS)
- Docker Desktop

## Puesta en marcha

```bash
cp .env.example .env      # ajusta JWT_SECRET y ADMIN_* si quieres
npm install
npm run db:up             # MySQL en localhost:3317 y Adminer en http://localhost:8080
npm run db:migrate        # aplica las migraciones (y genera el cliente con npm run prisma:generate)
npm run db:seed           # crea el admin (ADMIN_*) y las categorías base; se puede repetir sin duplicar
npm run dev               # API con recarga en caliente
```

> MySQL se expone en el puerto **3317** del host (configurable con `MYSQL_PORT`) para no chocar con un MySQL local en el 3306.
> El contenedor crea dos bases: `fridgeya` (desarrollo) y `fridgeya_test` (tests e2e).

## Scripts

| Script                                | Descripción                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                         | Arranca la API con `tsx watch`                                                                                                                      |
| `npm run build` / `npm start`         | Compila a `dist/` y ejecuta la versión compilada                                                                                                    |
| `npm run typecheck`                   | Verificación de tipos sin emitir                                                                                                                    |
| `npm run lint` / `lint:fix`           | ESLint (incluye las reglas de capas de la arquitectura)                                                                                             |
| `npm run format` / `format:check`     | Prettier                                                                                                                                            |
| `npm test`                            | Todos los tests (Vitest: unitarios + e2e)                                                                                                           |
| `npm run test:unit` / `test:e2e`      | Solo unitarios / solo e2e de la API                                                                                                                 |
| `npm run test:coverage`               | Cobertura de `domain/` y `application/` (mínimo 80 %)                                                                                               |
| `npm run db:up` / `db:down`           | Levanta / detiene MySQL y Adminer                                                                                                                   |
| `npm run db:migrate`                  | `prisma migrate dev`: crea/aplica migraciones en desarrollo                                                                                         |
| `npm run db:deploy`                   | `prisma migrate deploy`: aplica migraciones pendientes (producción)                                                                                 |
| `npm run db:seed`                     | Seed idempotente: admin inicial (`ADMIN_*`) y categorías base                                                                                       |
| `npm run db:seed:demo`                | Solo desarrollo: empleados, productos, quincena con aportes, compras y retiros de ejemplo (`prisma/seed-demo.ts`; no hace nada si ya hay productos) |
| `npm run db:status` / `db:studio`     | Estado de migraciones / Prisma Studio                                                                                                               |
| `npm run db:test:prepare`             | Aplica las migraciones a la base de tests (`DATABASE_URL_TEST`)                                                                                     |
| `npm run e2e:reset-db` / `e2e:server` | Para los e2e del front (Playwright): reinician la base `*_test` y levantan la API en `:3100` contra ella                                            |
| `npm run prisma:generate`             | Regenera el cliente de Prisma (también corre en `postinstall`)                                                                                      |

## Arquitectura

```
domain/           Entidades, value objects, errores y puertos (interfaces de repositorios). Sin dependencias externas.
application/      Casos de uso. Dependen solo de domain y de puertos propios (application/ports).
infraestructure/  Adaptadores: HTTP (Express), persistencia (Prisma), seguridad (bcrypt/JWT), config, almacenamiento.
main.ts           Punto de entrada: carga config, arma el contenedor de dependencias y arranca el servidor.
tests/            unit/ (dominio y casos de uso con repositorios en memoria) y e2e/ (HTTP contra MySQL).
```

Regla de dependencias: `infraestructure → application → domain`. ESLint la hace cumplir: un import de Express, Prisma, zod, etc. dentro de `domain/` o `application/`, o de `infraestructure/` desde capas internas, falla el lint.

## Base de datos

- Esquema: [prisma/schema.prisma](prisma/schema.prisma). Migraciones en `prisma/migrations/`.
- Prisma 7 con el driver adapter `@prisma/adapter-mariadb` (compatible con MySQL 8). El cliente se genera en
  `infraestructure/persistence/prisma/generated/` (ignorado por git) y se crea con `createPrismaClient()`.
- La migración inicial agrega restricciones `CHECK` que Prisma no declara (cantidades > 0, stock antes/después
  consistente, montos positivos, `subtotal = quantity * unit_price`, `start_date <= end_date`).
- Las tablas de movimientos, aportes y compras son de auditoría: no se borran registros.

## API

Base: `http://localhost:3000/api`. Autenticación con `Authorization: Bearer <token>` (se obtiene en `POST /auth/login`).
Errores con el formato `{ "error": { "code", "message", "details?" } }` y status 400 / 401 / 403 / 404 / 409 / 413 / 500.

| Área           | Rutas                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Salud          | `GET /health` (pública)                                                                                                                                                                                                                                                        |
| Auth           | `POST /auth/login` (pública, máx. 10 intentos / 15 min), `GET /auth/me`                                                                                                                                                                                                        |
| Usuarios       | `GET /users/options`; admin: `GET /users`, `POST /users` (crea **administradores**: email + contraseña), `PATCH /users/:id` (datos, email, contraseña, `isActive`)                                                                                                             |
| Personas       | admin: `GET /people`, `POST /people` (nombre + PIN de 4 dígitos), `PATCH /people/:id` (nombre, `isActive`), `POST /people/:id/pin` (asignar/restablecer PIN y desbloquear)                                                                                                     |
| Tablet (admin) | `POST /kiosk/devices` (autoriza una tablet → `{ device, token }`), `GET /kiosk/devices`, `DELETE /kiosk/devices/:id` (revoca)                                                                                                                                                  |
| Tablet         | Con token de tablet: `GET /kiosk/me`, `GET /kiosk/people`, `POST /kiosk/movements` (`{ personId, pin, type: IN\|OUT, items: [{ productId, quantity }] }`), `POST /kiosk/people/:id/pin` (cambiar el propio PIN); además lectura de productos, ranking, movimientos y dashboard |
| Catálogo       | `GET /categories`, `GET /products`, `GET /products/:id`; admin: `POST /categories`, `POST /products`, `PATCH /products/:id`                                                                                                                                                    |
| Movimientos    | `POST /movements/in`, `POST /movements/out` (`performedBy` solo lo usa el admin), `GET /movements`                                                                                                                                                                             |
| Ranking        | `GET /stats/top-withdrawers?period=all\|month\|week&limit=5`, `GET /dashboard/summary`                                                                                                                                                                                         |
| Quincenas      | `GET /funding-periods`, `GET /funding-periods/current`, `GET /funding-periods/:id`; admin: `POST /funding-periods`, `PATCH /funding-periods/:id/close`, `POST /funding-periods/:id/contributions`                                                                              |
| Compras        | `GET /purchases`, `GET /purchases/:id`, `GET /purchases/:id/receipt`; admin: `POST /purchases` (JSON o `multipart/form-data` con `receipt` e `items` como JSON), `POST /purchases/:id/void`                                                                                    |
| Reportes       | `GET /reports/spending-by-product`, `GET /reports/spending-by-category` (`?periodId=` o `?from=&to=`), `GET /reports/price-history/:productId`                                                                                                                                 |

## Usuarios: administradores y personas

- **Administradores**: inician sesión con email + contraseña y gestionan todo.
- **Personas** (empleados): no tienen cuenta. Se identifican en la tablet eligiendo su nombre y escribiendo su
  **PIN de 4 dígitos** (se guarda con bcrypt; se rechazan PIN triviales como `0000` o `1234`). Tras 5 PIN
  incorrectos la persona queda bloqueada 5 minutos (`423 PIN_LOCKED`); el admin puede restablecer el PIN.
- Una persona sin PIN asignado (por ejemplo, empleados creados antes de este cambio) no aparece en la tablet hasta
  que el admin le asigne uno.

## Tablets

1. El admin inicia sesión en la tablet y la **autoriza** (`POST /kiosk/devices`): recibe un token de tablet
   (JWT con `role: KIOSK`, válido ~5 años) que la tablet guarda.
2. Con ese token la tablet solo puede leer el inventario y registrar movimientos con **nombre + PIN**: no accede a
   compras, quincenas, reportes ni administración (`403 USER_REQUIRED`).
3. Cada registro puede tener varios productos y se guarda en **una transacción**: si uno no tiene stock, no se
   guarda ninguno. Quien lo realiza y quien lo registra es la persona del PIN.
4. Si la tablet se pierde, el admin la **revoca** y su token deja de servir al instante (`401 DEVICE_REVOKED`).
   Hay además un límite de 30 operaciones por minuto por tablet.

## Tests

- `npm run test:unit`: dominio y casos de uso con repositorios en memoria (no necesita BD).
- `npm run test:e2e`: la API real (Express + Prisma) contra MySQL. Requiere `npm run db:up` y `npm run db:test:prepare`.
  Vacía las tablas de `fridgeya_test` en cada archivo y se niega a correr si `DATABASE_URL_TEST` no apunta a una base `*_test`.

## Notas de diseño

- Las transacciones usan `READ COMMITTED` + `SELECT ... FOR UPDATE` sobre el producto: dos retiros simultáneos
  nunca venden de más (hay un test e2e con 10 retiros concurrentes sobre 5 unidades).
- Los comprobantes se guardan en `UPLOADS_DIR` con nombre UUID; si la transacción de la compra falla, el archivo se borra.
