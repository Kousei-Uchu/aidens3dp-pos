#!/bin/sh
# A11.3: bundle the Zeller SDK source into ONE zip you can send to Claude (npm run zeller:pack).
# The SDK is gated, so this script strips credentials first, scans what is left for anything that still looks like a key,
# and refuses to write the zip if it finds one. It prints the file list so you can review it before sending.
#
# It looks in: vendor/*.tgz (the tarballs from install-zeller.sh), node_modules/@zeller-public (if installed), and src/zellerBridge.tsx + src/lib/zeller.ts.
set -eu
cd "$(dirname "$0")/.."
OUT="zeller-sdk-pack.zip"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PACK="$WORK/zeller-sdk-pack"
mkdir -p "$PACK/app" "$PACK/vendor-unpacked" "$PACK/node_modules-copy"

echo "1/5 Collecting files..."
cp src/zellerBridge.tsx src/lib/zeller.ts src/types/zeller.d.ts "$PACK/app/" 2>/dev/null || true
for t in vendor/*.tgz; do
  [ -e "$t" ] || continue
  d="$PACK/vendor-unpacked/$(basename "$t" .tgz)"; mkdir -p "$d"; tar -xzf "$t" -C "$d"
done
if [ -d node_modules/@zeller-public ]; then cp -R node_modules/@zeller-public "$PACK/node_modules-copy/"; fi
# never copy dependencies of the SDK, only the SDK itself
find "$PACK" -name node_modules -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$PACK" \( -name '.git' -o -name '.DS_Store' \) -prune -exec rm -rf {} + 2>/dev/null || true

echo "2/5 Stripping credential files..."
find "$PACK" \( -name '.npmrc' -o -name '.yarnrc*' -o -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name '*.p8' -o -name '*.p12' -o -name '*.cer' -o -name '*.mobileprovision' -o -name 'auth.json' \) -type f -print -delete

echo "3/5 Redacting key-like text in what is left..."
# redact registry auth lines, bearer tokens, and key/secret/token assignments in text files (binary files are left alone and then scanned).
# perl, not sed: it is on every Mac and its regex flags behave the same everywhere (BSD sed has no case-insensitive flag).
find "$PACK" -type f | while read -r f; do
  if grep -Iq . "$f" 2>/dev/null; then
    perl -pi -e '
      s{(//\S+/:_authToken=).*}{$1REDACTED}i;
      s{(_auth(?:Token)?\s*=\s*).*}{$1REDACTED}i;
      s{(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}}{$1REDACTED}g;
      s{((?:api[_-]?key|secret|token|password|client[_-]?secret)["\x27]?\s*[:=]\s*["\x27])[^"\x27]{12,}(["\x27])}{$1REDACTED$2}ig;
    ' "$f"
  fi
done

echo "4/5 Scanning for anything that still looks like a key..."
HITS="$WORK/hits.txt"; : > "$HITS"
# long random-looking strings next to key words, well-known token shapes, private key blocks
grep -rIEn -i "(api[_-]?key|secret|token|password|authorization)[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9._~+/=-]{20,}" "$PACK" 2>/dev/null | grep -v "REDACTED" >> "$HITS" || true
grep -rIEn "(npm_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk_(live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})" "$PACK" >> "$HITS" 2>/dev/null || true
grep -rIn "BEGIN [A-Z ]*PRIVATE KEY" "$PACK" >> "$HITS" 2>/dev/null || true
if [ -s "$HITS" ]; then
  echo
  echo "STOPPED: something still looks like a credential. No zip was written. Matches (values shortened):"
  cut -c1-140 "$HITS" | sed -E 's#(.{0,100}).*#\1 ...#'
  echo
  echo "Remove or redact those lines (they are inside your own copy of the SDK), then run this again."
  exit 1
fi

echo "5/5 Zipping..."
rm -f "$OUT"
( cd "$WORK" && zip -qr "$OLDPWD/$OUT" zeller-sdk-pack )
echo
echo "Files in $OUT (review before sending):"
unzip -Z1 "$OUT" | sed 's#^#  #'
echo
echo "Wrote $(pwd)/$OUT. Nothing was uploaded."
