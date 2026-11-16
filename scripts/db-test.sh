#!/usr/bin/env bash
# Runs the privacy tests in supabase/tests against a throwaway database.
#
#   npm run test:db
#
# Needs a Postgres 15+ server you can reach with psql; set the usual PG* variables
# (PGHOST, PGPORT, PGUSER, PGPASSWORD) if it is not the local default. The script makes a
# fresh database, loads a small stand-in for Supabase, applies every migration, then runs each
# test file inside a transaction that is rolled back. Nothing outside that database is touched.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${TEST_DB:-tandem_roads_test}"
export PGOPTIONS="--client-min-messages=notice"
run() { psql -X -q -o /dev/null -v ON_ERROR_STOP=1 "$@"; }

run -d postgres -c "drop database if exists $DB" -c "create database $DB"
# The roles outlive the database, so clear any left by an earlier run.
run -d postgres -c "drop role if exists anon" -c "drop role if exists authenticated" -c "drop role if exists service_role" 2>/dev/null || true

run -d "$DB" -f supabase/tests/setup/00_supabase_stand_in.sql
for f in supabase/migrations/*.sql; do
  echo "migration  $f"
  run -d "$DB" -f "$f"
done
run -d "$DB" -f supabase/tests/setup/90_test_helpers.sql

status=0
for f in supabase/tests/*.sql; do
  echo
  echo "== $f"
  if ! run -d "$DB" -f "$f" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  //' -e '/^NOTICE:  /s///'; then
    status=1
  fi
done

run -d postgres -c "drop database if exists $DB"
echo
if [ "$status" -ne 0 ]; then echo "PRIVACY TESTS FAILED"; else echo "All privacy tests passed"; fi
exit "$status"
