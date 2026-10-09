#!/bin/sh
# The Zeller Payments SDK is not on npm. Put the tarballs Zeller gave you in ./vendor (any *.tgz) and run:  npm run zeller
set -e
cd "$(dirname "$0")/.."
if ls vendor/*.tgz >/dev/null 2>&1; then npm install --save ./vendor/*.tgz; else echo "No vendor/*.tgz found. Copy the Zeller SDK tarballs into ./vendor first (see SETUP.md)."; exit 1; fi
