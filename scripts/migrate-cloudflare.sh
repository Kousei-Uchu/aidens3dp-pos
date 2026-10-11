#!/usr/bin/env bash
# Location: scripts/migrate-cloudflare.sh     Run from anywhere:  ./scripts/migrate-cloudflare.sh
# Moves the four workers (docs-server, receipt-server, gift-claim-server, pass-server) from your OLD Cloudflare account to your NEW one.
#
# How it works (no API tokens to make by hand: it uses the wrangler login you already have):
#   1. use your existing wrangler login (it never logs in for you), which must see both accounts; read each worker's KV id and which secrets exist on the OLD account, export all KV data
#   2. switch to the NEW account id (same login, no second sign-in)
#   3. create KV namespaces, import the data, ask for the custom-domain prefix per worker, deploy
#   4. set secrets: random ones are generated, the ones only you have are asked for (typing is hidden)
#   5. print every field to change in the app and what to change it to, then clean up
# Cloudflare never returns a secret's value, so nothing can copy secrets across: they are generated or typed in.
# Gift-card Wallet passes stay off (GIFT_CARD_PASSES = "off" in pass-server/wrangler.toml is untouched).
# Not run against your accounts by me: read the prompts on the first go. Re-running is safe (it makes new namespaces each time).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
ZONE="aidens3dp.com"; WORKERS=(docs-server receipt-server gift-claim-server pass-server)
command -v jq >/dev/null && command -v node >/dev/null || { echo "Needs node and jq (brew install jq)."; exit 1; }
WORK="$(mktemp -d)"; chmod 700 "$WORK"; FAILED=(); SUMMARY=()
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask() { local a; read -rp "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48; }
tomlname() { grep -m1 -E '^name *=' "$1/wrangler.toml" | sed -E 's/.*"(.*)".*/\1/'; }
tomlkv() { grep -m1 -oE 'id *= *"[0-9a-f]{32}"' "$1/wrangler.toml" | grep -oE '[0-9a-f]{32}'; }
setu() { printf -v "URL_${1//-/_}" '%s' "$2"; }   # bash 3.2 (stock macOS) has no associative arrays
kvbinding() { grep -m1 -E '^binding *=' "$1/wrangler.toml" | sed -E 's/.*"(.*)".*/\1/'; }

say "Installing wrangler (from docs-server)"
( cd docs-server && npm install --silent ) || exit 1
WR="$ROOT/docs-server/node_modules/.bin/wrangler"; "$WR" --version
# wrangler 4 wants --remote on kv commands; wrangler 3 does not know the flag (and is always remote). Ask once instead of guessing per call.
if "$WR" kv key list --help 2>&1 | grep -q -- '--remote'; then REMOTE="--remote"; else REMOTE=""; fi
kv() { "$WR" kv "$@" $REMOTE; }
# wrangler prints banner lines ("Resource location: remote", a wrangler version line, rules) before its real output; cut only those leading lines, byte-exact after that
unbanner() { perl -0pe 's/\A(?:(?:Resource location:[^\n]*|[^\n]*wrangler[^\n]*|[─-]+|[ \t]*)\n)+//'; }
account() {   # picks the account id after a login
  local ids; ids=$("$WR" whoami 2>&1 | grep -oE '\b[0-9a-f]{32}\b' | sort -u)
  if [ "$(wc -w <<<"$ids")" = 1 ]; then echo "$ids"; else "$WR" whoami >&2; read -rp "Account id to use: " ids; echo "$ids"; fi
}

# ---------- 1. one login, both accounts ----------
say "STEP 1 of 5: using your existing wrangler login (it must be able to see BOTH accounts)"
"$WR" whoami || { echo "wrangler is not logged in here. Run '$WR login' yourself, then re-run this script."; exit 1; }
OLD_ACC="${OLD_ACC:-270d8cb8ceab0abe508731c0635b6580}"   # the account the workers are on now
NEW_ACC="${NEW_ACC:-138bcb3e0d2c6b6b055af0ca822a7ae8}"   # the account that owns $ZONE
echo "Moving from $OLD_ACC to $NEW_ACC"
[ -n "$OLD_ACC" ] && [ -n "$NEW_ACC" ] && [ "$OLD_ACC" != "$NEW_ACC" ] || { echo "Need two different account ids."; exit 1; }
export CLOUDFLARE_ACCOUNT_ID="$OLD_ACC"
"$WR" kv namespace list >/dev/null 2>&1 || { echo "This login cannot read the OLD account. Check you are a member of it with Workers access, then re-run."; exit 1; }
for d in "${WORKERS[@]}"; do
  n="$(tomlname $d)"; echo "- $d ($n)"
  "$WR" secret list --name "$n" --format json > "$WORK/$d.secrets.json" 2>/dev/null || echo '[]' > "$WORK/$d.secrets.json"
  echo "    secrets on old worker: $(jq -r '[.[].name]|join(", ")' "$WORK/$d.secrets.json")"
  old="$(tomlkv $d)"
  if [ -n "$old" ]; then
    kv key list --namespace-id "$old" 2>&1 | unbanner > "$WORK/$d.keys.json"
    if ! jq -e 'type=="array"' "$WORK/$d.keys.json" >/dev/null 2>&1; then echo "    could not read the KV key list for $d. wrangler said:"; head -8 "$WORK/$d.keys.json" | sed 's/^/      /'; FAILED+=("export KV $d"); continue; fi
    total=$(jq length "$WORK/$d.keys.json"); echo "    exporting $total KV keys"; echo '[]' > "$WORK/$d.bulk.json"; i=0
    while read -r k; do
      i=$((i+1)); name=$(jq -r .name <<<"$k"); exp=$(jq -r '.expiration // empty' <<<"$k"); meta=$(jq -c '.metadata // empty' <<<"$k")
      kv key get "$name" --namespace-id "$old" --text 2>/dev/null | unbanner > "$WORK/val.tmp"; [ "${PIPESTATUS[0]}" = 0 ] || { FAILED+=("read key $name"); continue; }
      jq --arg key "$name" --rawfile value "$WORK/val.tmp" --arg exp "$exp" --arg meta "$meta" '. + [({key:$key,value:$value} + (if $exp!="" then {expiration:($exp|tonumber)} else {} end) + (if $meta!="" then {metadata:($meta|fromjson)} else {} end))]' "$WORK/$d.bulk.json" > "$WORK/b.tmp" && mv "$WORK/b.tmp" "$WORK/$d.bulk.json"
      (( i % 50 == 0 )) && echo "    $i / $total"
    done < <(jq -c '.[]' "$WORK/$d.keys.json")
  fi
done
rm -f "$WORK/val.tmp"

# ---------- 2. switch to the NEW account (same login) ----------
say "STEP 2 of 5: switching to the new account"
export CLOUDFLARE_ACCOUNT_ID="$NEW_ACC"
"$WR" kv namespace list >/dev/null 2>&1 || { echo "This login cannot write to the NEW account."; exit 1; }
echo "Now working on $NEW_ACC"

# ---------- 3. KV, domains, deploy ----------
say "STEP 3 of 5: create storage, choose addresses, deploy"
for d in "${WORKERS[@]}"; do
  n="$(tomlname $d)"; echo; echo "== $d ($n)"; cp "$d/wrangler.toml" "$d/wrangler.toml.bak"
  old="$(tomlkv $d)"
  if [ -n "$old" ]; then
    out=$("$WR" kv namespace create "$n-$(kvbinding $d)" 2>&1); echo "$out" | tail -3
    new=$(grep -oE '"?id"?[ =:]+"[0-9a-f]{32}"' <<<"$out" | grep -oE '[0-9a-f]{32}' | head -1)
    [ -n "$new" ] || read -rp "Could not read the new namespace id. Paste it: " new
    sed -i.tmp "s/$old/$new/" "$d/wrangler.toml" && rm -f "$d/wrangler.toml.tmp"
    if [ -s "$WORK/$d.bulk.json" ] && [ "$(jq length "$WORK/$d.bulk.json")" -gt 0 ]; then kv bulk put "$WORK/$d.bulk.json" --namespace-id "$new" || FAILED+=("import KV $d"); fi
  fi
  case $d in docs-server) def="docs.pos";; receipt-server) def="receipts.pos";; gift-claim-server) def="gift.pos";; pass-server) def="pass.pos";; esac
  read -rp "What should preface .$ZONE for $d? (Enter = $def, type - for none, workers.dev only): " pre; pre="${pre:-$def}"
  awk '/^\[\[routes\]\]/{skip=1;next} /^\[/{skip=0} !skip' "$d/wrangler.toml" > "$d/wrangler.toml.t" && mv "$d/wrangler.toml.t" "$d/wrangler.toml"
  [ "$pre" != "-" ] && printf '\n[[routes]]\npattern = "%s.%s"\nzone_name = "%s"\ncustom_domain = true\n' "$pre" "$ZONE" "$ZONE" >> "$d/wrangler.toml"
  ( cd "$d" && npm install --silent >/dev/null 2>&1; "$WR" deploy ) 2>&1 | tee "$WORK/$d.deploy.txt"
  if grep -qiE "error|failed" "$WORK/$d.deploy.txt" && ! grep -qiE "deployed|Current Version ID" "$WORK/$d.deploy.txt"; then FAILED+=("deploy $d (check the message above; a hostname that already has a DNS record must be deleted in the dashboard first)"); setu "$d" "(deploy failed)"; continue; fi
  wd=$(grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' "$WORK/$d.deploy.txt" | head -1)
  if [ "$pre" != "-" ]; then setu "$d" "https://$pre.$ZONE"; else setu "$d" "${wd:-(see dashboard)}"; fi
done

# ---------- 4. secrets ----------
say "STEP 4 of 5: secrets"
has() { jq -e --arg n "$2" 'any(.[]; .name==$n)' "$WORK/$1.secrets.json" >/dev/null 2>&1; }
put() { local d=$1 name=$2 val=$3; ( cd "$d" && printf '%s' "$val" | "$WR" secret put "$name" >/dev/null 2>&1 ) && echo "  set $name" || { echo "  FAILED $name"; FAILED+=("secret $name on $d"); }; }
typed() { local d=$1 name=$2 val; has $d $name || return 0; read -rsp "  $name (hidden; Enter to skip): " val; echo; [ -n "$val" ] && { put $d $name "$val"; echo "$val"; }; }
filed() { local d=$1 name=$2 f; has $d $name || return 0; read -rp "  $name: path to the file (Enter to skip): " f; [ -n "$f" ] && [ -r "$f" ] && put $d $name "$(cat "$f")"; }

echo "receipt-server: RECEIPT_SECRET only signs uploads from the app, so a fresh one is generated."
RECEIPT_SECRET="$(rand)"; put receipt-server RECEIPT_SECRET "$RECEIPT_SECRET"

echo "gift-claim-server: CLAIM_SECRET signs every gift claim link already handed out. Changing it kills those links."
if ask "  Keep existing links working? (you will paste the current CLAIM_SECRET from the app: Settings, Gift cards, Claim page secret)"; then read -rsp "  CLAIM_SECRET (hidden): " CLAIM_SECRET; echo; else CLAIM_SECRET="$(rand)"; echo "  generated a new one; old links stop working"; fi
put gift-claim-server CLAIM_SECRET "$CLAIM_SECRET"
echo "  Shopify details (the same ones the app uses: Settings, Shopify):"
read -rp "  SHOPIFY_DOMAIN (like yourshop.myshopify.com): " v; put gift-claim-server SHOPIFY_DOMAIN "$v"; SD="$v"
read -rp "  SHOPIFY_CLIENT_ID: " v; put gift-claim-server SHOPIFY_CLIENT_ID "$v"; SC="$v"
read -rsp "  SHOPIFY_CLIENT_SECRET (hidden): " v; echo; put gift-claim-server SHOPIFY_CLIENT_SECRET "$v"; SS="$v"
read -rp "  SHOP_NAME (the name shown on gift cards): " v; put gift-claim-server SHOP_NAME "$v"; SN="$v"

echo "pass-server: POS_SECRET only signs 5 minute requests from the app, so a fresh one is generated."
POS_SECRET="$(rand)"; put pass-server POS_SECRET "$POS_SECRET"
for s in SHOP_NAME; do has pass-server $s && put pass-server $s "$SN"; done
for s in PASS_TYPE_ID TEAM_ID; do has pass-server $s && { read -rp "  $s (from Apple Developer, Enter to skip): " v; [ -n "$v" ] && put pass-server $s "$v"; }; done
for s in SIGNER_CERT_PEM SIGNER_KEY_PEM WWDR_PEM; do filed pass-server $s; done
for s in SHOPIFY_DOMAIN SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET; do has pass-server $s && { case $s in SHOPIFY_DOMAIN) put pass-server $s "$SD";; SHOPIFY_CLIENT_ID) put pass-server $s "$SC";; *) put pass-server $s "$SS";; esac; }; done
for s in AUTH_SECRET; do has pass-server $s && put pass-server $s "$(rand)"; done
for s in SHOPIFY_WEBHOOK_SECRET APNS_KEY_ID; do has pass-server $s && { echo "  (gift-card passes are off, so $s is only needed if you turn them on again)"; typed pass-server $s >/dev/null; }; done
has pass-server APNS_KEY_P8 && filed pass-server APNS_KEY_P8

# ---------- 5. what to change in the app ----------
say "STEP 5 of 5: change these in the app"
cat <<APP

 Settings > Receipts
   Receipt server URL ........ $URL_receipt_server
   Receipt server secret ..... $RECEIPT_SECRET

 Settings > Gift cards
   Pass server URL ........... $URL_pass_server
   Pass server secret ........ $POS_SECRET
   Claim page URL ............ $URL_gift_claim_server
   Claim page secret ......... $CLAIM_SECRET

 Help website (docs) ......... $URL_docs_server
 Not changed: Shopify login, Square, anything else in the app.
 Do this on EVERY register (secrets live in each iPad's Keychain). Then use Settings > Receipts > Send test receipt.
APP
has pass-server SHOPIFY_WEBHOOK_SECRET && echo " Shopify admin: the webhook that pointed at the old pass server must point at $URL_pass_server."
if [ ${#FAILED[@]} -gt 0 ]; then say "Things that did not work (do these by hand):"; printf ' - %s\n' "${FAILED[@]}"; fi

# ---------- cleanup ----------
say "Cleaning up"
echo "Left you logged in to wrangler (run 'npx wrangler logout' if you want to revoke it)."
rm -rf "$WORK" && echo "Deleted the temp folder with the exported KV data."
for d in "${WORKERS[@]}"; do rm -f "$d/wrangler.toml.bak"; done; echo "Removed the wrangler.toml backups."
echo "The workers' wrangler.toml files now hold the new KV ids and domains: review with 'git diff' and commit them."
echo "Keep the old Cloudflare account's workers until the test receipt, a gift claim and a pass all work. Then delete them there."
echo "Clear this terminal now (the secrets above are on screen): run 'clear' and close the window."