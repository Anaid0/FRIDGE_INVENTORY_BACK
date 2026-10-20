#!/usr/bin/env bash
# Copia los DATOS de la base local (docker) a la de producción (DATABASE_URL de .env.production).
# Las tablas ya deben existir allá (npx prisma migrate deploy) y estar VACÍAS: si producción ya tiene
# datos, no toca nada y se detiene.
# Uso: npm run db:sync-prod
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=fridgeya-mysql
LOCAL_DB=fridgeya
PROD_URL="$(grep '^DATABASE_URL=' .env.production | cut -d'"' -f2)"
# mysql://user:pass@host:port/db?params
rest="${PROD_URL#mysql://}"; creds="${rest%%@*}"; hostpart="${rest#*@}"
P_USER="${creds%%:*}"; P_PASS="${creds#*:}"
hostport="${hostpart%%/*}"; P_HOST="${hostport%%:*}"; P_PORT="${hostport#*:}"
dbq="${hostpart#*/}"; P_DB="${dbq%%\?*}"

prod_mysql() {
  docker exec -i -e MYSQL_PWD="$P_PASS" "$CONTAINER" \
    mysql -h "$P_HOST" -P "$P_PORT" -u "$P_USER" --ssl-mode=REQUIRED "$@"
}
local_mysql() {
  docker exec -i "$CONTAINER" sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -ufridgeya "$@"' -- "$@"
}

tables="$(prod_mysql -N -e "SELECT table_name FROM information_schema.tables
  WHERE table_schema='$P_DB' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations'")"
[ -n "$tables" ] || { echo "Producción no tiene tablas: corre primero npx prisma migrate deploy."; exit 1; }

for t in $tables; do
  n="$(prod_mysql -N -e "SELECT COUNT(*) FROM \`$t\`" "$P_DB")"
  if [ "$n" != 0 ]; then
    echo "Producción ya tiene datos ($t: $n filas). No se copia nada."
    exit 1
  fi
done

mkdir -p backups
dump="backups/local-data-$(date +%Y-%m-%d_%H%M%S).sql"
echo "→ Exportando datos locales a ${dump}…"
docker exec "$CONTAINER" sh -c "MYSQL_PWD=\"\$MYSQL_PASSWORD\" mysqldump -ufridgeya --no-tablespaces \
  --no-create-info --skip-triggers --set-gtid-purged=OFF --complete-insert --hex-blob \
  --ignore-table=$LOCAL_DB._prisma_migrations $LOCAL_DB" > "$dump"

echo "→ Importando en producción…"
prod_mysql --init-command="SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION'" "$P_DB" < "$dump"

echo "→ Comparando filas (local / producción):"
diff=0
for t in $tables; do
  l="$(local_mysql -N -e "SELECT COUNT(*) FROM \`$t\`" "$LOCAL_DB")"
  p="$(prod_mysql -N -e "SELECT COUNT(*) FROM \`$t\`" "$P_DB")"
  mark="✓"; [ "$l" = "$p" ] || { mark="✗"; diff=1; }
  printf '  %s %-28s %6s %6s\n' "$mark" "$t" "$l" "$p"
done
[ "$diff" = 0 ] && echo "Listo: datos copiados." || { echo "Hay diferencias."; exit 1; }
