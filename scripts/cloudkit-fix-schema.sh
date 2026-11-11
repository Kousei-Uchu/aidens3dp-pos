#!/bin/sh
# One command for the CloudKit list indexes. Run it on the Mac after anything new has been written to CloudKit, and before Back up everything.
#   npm run cloudkit:schema                 fix the Development environment
#   npm run cloudkit:schema -- --check      only report what would change (nothing is imported)
# Needs once:  xcrun cktool save-token   (a CloudKit management token), and these two values, either exported or in .cloudkit.env:
#   CK_TEAM_ID=ABCDE12345     CK_CONTAINER_ID=iCloud.your.container
# What it does: exports the live Development schema (so the types CloudKit made on first write are in it), adds the two indexes every
# list query needs to each type that lacks them (scripts/ckdb_add_indexes.py; fields are never touched), validates, then imports.
# Safe to repeat: with nothing to change it imports nothing.
set -eu
cd "$(dirname "$0")/.."
[ -f .cloudkit.env ] && . ./.cloudkit.env
: "${CK_TEAM_ID:?set CK_TEAM_ID (your Apple team id) in the environment or in .cloudkit.env}"
: "${CK_CONTAINER_ID:?set CK_CONTAINER_ID (iCloud.your.container) in the environment or in .cloudkit.env}"
ENV="${CK_ENVIRONMENT:-development}"
DIR="$(mktemp -d)"; LIVE="$DIR/live.ckdb"; FIXED="$DIR/fixed.ckdb"
xcrun cktool export-schema --team-id "$CK_TEAM_ID" --container-id "$CK_CONTAINER_ID" --environment "$ENV" --output-file "$LIVE"
python3 scripts/ckdb_add_indexes.py "$LIVE" > "$FIXED" 2> "$DIR/changes.txt"
cat "$DIR/changes.txt"
if grep -q "^nothing to change" "$DIR/changes.txt"; then echo "Schema already has every index. Nothing imported."; exit 0; fi
if [ "${1:-}" = "--check" ]; then echo "Check only: nothing imported. The fixed schema is at $FIXED"; exit 0; fi
cp "$LIVE" "schema-before-$(date +%Y%m%d-%H%M%S).ckdb"   # a copy of what was live, in case it needs putting back
xcrun cktool import-schema --team-id "$CK_TEAM_ID" --container-id "$CK_CONTAINER_ID" --environment "$ENV" --validate --file "$FIXED"
xcrun cktool import-schema --team-id "$CK_TEAM_ID" --container-id "$CK_CONTAINER_ID" --environment "$ENV" --file "$FIXED"
cp "$FIXED" schema-now.ckdb
echo "Done. schema-now.ckdb is now the live schema."
