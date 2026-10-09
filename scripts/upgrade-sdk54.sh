#!/bin/sh
# One-shot upgrade to Expo SDK 54 (React Native 0.81). Run from the project folder:  sh scripts/upgrade-sdk54.sh
# Needs Node 20.19.4+ (or 22 LTS) and Xcode 16.1+.
set -e
cd "$(dirname "$0")/.."
node scripts/upgrade-sdk54.js
npm install || npm install --legacy-peer-deps
npx expo prebuild --platform ios --clean      # regenerates ios/ (drops the old fmt Podfile workaround, which RN 0.81 no longer needs)
echo
echo "Done. Next: open ios/*.xcworkspace, pick your Team under Signing & Capabilities, set the scheme to Release, and Run."
