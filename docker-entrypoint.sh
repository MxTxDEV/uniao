#!/bin/sh
# Normaliza e valida as URLs do banco antes de subir (log sem expor senha).
clean() {
  v="$1"
  v=$(printf '%s' "$v" | sed -e "s/^[[:space:]]*//" -e "s/[[:space:]]*$//" -e "s/^psql[[:space:]]*//" -e "s/^['\"]//" -e "s/['\"]$//")
  printf '%s' "$v"
}
DATABASE_URL=$(clean "$DATABASE_URL")
DIRECT_URL=$(clean "$DIRECT_URL")
case "$DIRECT_URL" in
  postgresql://*|postgres://*) ;;
  *) [ -n "$DIRECT_URL" ] && echo "[aviso] DIRECT_URL inválida (não é URL de banco); usando DATABASE_URL no lugar."
     DIRECT_URL="$DATABASE_URL" ;;
esac
export DATABASE_URL DIRECT_URL

check() {
  name="$1"; val="$2"
  case "$val" in
    postgresql://*|postgres://*) echo "[ok] $name começa com ${val%%://*}://" ;;
    "") echo "[ERRO] $name está VAZIA. Defina em Environment Variables (como variável de runtime)."; BAD=1 ;;
    *) echo "[ERRO] $name não começa com postgresql:// (começa com: $(printf '%s' "$val" | cut -c1-12)...)"; BAD=1 ;;
  esac
}
BAD=0
check DATABASE_URL "$DATABASE_URL"
check DIRECT_URL "$DIRECT_URL"
[ -z "$AUTH_SECRET" ] || [ ${#AUTH_SECRET} -lt 32 ] && { echo "[ERRO] AUTH_SECRET ausente ou com menos de 32 caracteres."; BAD=1; }
if [ "$BAD" = "1" ]; then sleep 30; exit 1; fi

npx prisma migrate deploy || exit 1
if [ "$RUN_SEED" = "true" ]; then npm run db:seed; fi
exec npm start
