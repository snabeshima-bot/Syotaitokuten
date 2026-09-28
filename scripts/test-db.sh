#!/usr/bin/env bash
# 素の Postgres にスタブ＋マイグレーション＋シードを流し、DB テストを実行する
# 使い方: DATABASE_URL=postgres://... scripts/test-db.sh   （省略時は postgres ユーザーのローカル接続）
set -euo pipefail
cd "$(dirname "$0")/.."
DB=syotaitokuten_test
PSQL=(psql -v ON_ERROR_STOP=1 -q)
ADMIN_URL=${DATABASE_URL:-postgres:///postgres}
"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists $DB" -c "create database $DB"
URL="${ADMIN_URL%/*}/$DB"
"${PSQL[@]}" "$URL" -f db-tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" "$URL" -f "$f"; done
"${PSQL[@]}" "$URL" -f supabase/seed.sql
"${PSQL[@]}" "$URL" -o /dev/null -f db-tests/db_test.sql
