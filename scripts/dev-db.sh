#!/usr/bin/env bash
# Project-local PostgreSQL for development and tests. Data and socket live in
# .local/pg (git-ignored); nothing system-wide is touched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="$ROOT/.local/pg"
PORT="${BKMK_PG_PORT:-54329}"
cmd="${1:-start}"

case "$cmd" in
  start)
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      mkdir -p "$PGDATA"
      initdb -D "$PGDATA" -U bkmk --auth=trust -E UTF8 >/dev/null
      echo "initialised $PGDATA"
    fi
    if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
      pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -o "-p $PORT -k $PGDATA -c listen_addresses=localhost" -w start >/dev/null
    fi
    for db in bkmk bkmk_test bkmk_e2e; do
      psql -h localhost -p "$PORT" -U bkmk -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
        || createdb -h localhost -p "$PORT" -U bkmk "$db"
    done
    echo "postgres running on localhost:$PORT (databases: bkmk, bkmk_test, bkmk_e2e)"
    ;;
  stop) pg_ctl -D "$PGDATA" -m fast stop ;;
  status) pg_ctl -D "$PGDATA" status ;;
  *) echo "usage: $0 [start|stop|status]"; exit 1 ;;
esac
