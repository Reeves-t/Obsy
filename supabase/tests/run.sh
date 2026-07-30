#!/usr/bin/env bash
#
# Runs the shared-media-verse rule tests against a throwaway Postgres cluster.
#
#   ./supabase/tests/run.sh
#
# The migration's guarantees — that mood and note cannot leave a wall, that
# exploration is anonymous, that propagation answers to the origin — are enforced
# by RLS, grants and triggers, none of which a TypeScript test can observe. So
# these run against real Postgres, with `_harness.sql` standing in for the
# Supabase surfaces the migration depends on (auth.uid(), the anon/authenticated
# roles, and slices of entries / user_settings / friends).
#
# Requires a local postgres (initdb, pg_ctl, psql). No Docker, no network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../migrations/20260730000001_create_shared_media_verse.sql"
RUNDIR="${PGTESTDIR:-/var/tmp/obsy-pgtest}"
# Unix socket only, inside RUNDIR: no TCP port to collide with anything else on
# the machine, and nothing left listening if a previous run died badly.
PORT=5432
SOCKDIR="$RUNDIR/sock"

if ! command -v initdb >/dev/null 2>&1; then
    for d in /usr/lib/postgresql/*/bin; do [ -d "$d" ] && export PATH="$d:$PATH"; done
fi
command -v initdb >/dev/null 2>&1 || { echo "postgres tooling not found on PATH"; exit 1; }

# Postgres refuses to run as root; fall back to the postgres system user.
AS_USER=""
[ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1 && AS_USER="postgres"

run() {
    if [ -n "$AS_USER" ]; then su "$AS_USER" -c "PATH=$PATH $*"; else eval "$@"; fi
}

cleanup() { run "pg_ctl -D $RUNDIR/data stop -m immediate" >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$RUNDIR"; mkdir -p "$SOCKDIR"
if [ -n "$AS_USER" ]; then chown -R "$AS_USER" "$RUNDIR"; fi
chmod 700 "$RUNDIR"

run "initdb -D $RUNDIR/data -U postgres --auth=trust" >/dev/null
run "pg_ctl -D $RUNDIR/data -o \"-p $PORT -k $SOCKDIR -c listen_addresses=''\" -l $RUNDIR/log start" >/dev/null
for _ in $(seq 1 20); do
    psql -h "$SOCKDIR" -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1 && break
    sleep 0.5
done

PSQL="psql -h $SOCKDIR -p $PORT -U postgres -d obsy -v ON_ERROR_STOP=1"
psql -h "$SOCKDIR" -p "$PORT" -U postgres -q -c 'CREATE DATABASE obsy;' >/dev/null

$PSQL -q -f "$HERE/_harness.sql" >/dev/null
$PSQL -q -f "$MIGRATION" >/dev/null
$PSQL -f "$HERE/shared_media_verse_test.sql" 2>&1 \
    | grep -E 'PASS|FAIL|ERROR|^──|ALL TESTS' \
    | sed 's/^psql.*NOTICE:  //'
