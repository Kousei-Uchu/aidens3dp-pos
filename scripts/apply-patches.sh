#!/usr/bin/env bash
# Location: scripts/apply-patches.sh
# Applies, in order, every patches/*.patch that is not yet listed in patches/APPLIED.txt, one commit per patch.
# Stops at the first patch that does not apply cleanly (later patches usually depend on it) and exits 1.
# Local use: scripts/apply-patches.sh          (commits, does not push)
# In CI:     PUSH=1 scripts/apply-patches.sh   (commits and pushes after each patch)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
LEDGER=patches/APPLIED.txt
touch "$LEDGER"
applied=0
shopt -s nullglob
for p in $(ls patches/*.patch | sort); do
  name=$(basename "$p")
  grep -qxF "$name" "$LEDGER" && continue
  echo "::group::$name"
  if ! git apply --check --whitespace=nowarn "$p" 2> /tmp/apply-err; then
    echo "::error title=Patch does not apply::$name does not apply cleanly to $(git rev-parse --short HEAD). Later patches were not tried."
    cat /tmp/apply-err; echo "::endgroup::"
    { echo "failed=$name"; } >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 1
  fi
  git apply --index --whitespace=nowarn "$p"
  echo "$name" >> "$LEDGER"
  git add "$LEDGER"
  git commit -q -m "Apply patch ${name%.patch}" -m "Applied automatically from patches/$name by scripts/apply-patches.sh."
  echo "Applied $name"; echo "::endgroup::"
  applied=$((applied + 1))
  [ "${PUSH:-0}" = 1 ] && git push -q origin HEAD
done
echo "applied=$applied" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "Applied $applied patch(es)."
