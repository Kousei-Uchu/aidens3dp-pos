#!/bin/sh
# Recreate the ios/ folder from scratch. Fixes "two .xcodeproj files" (a stale project left behind when the app
# name/slug changed) and most "stuck on selecting device / timed out" builds caused by a half-generated project.
#   npm run ios:reset
set -e
cd "$(dirname "$0")/.."

echo "==> 1/5 Removing the old native project (ios/) and Xcode caches for this app"
rm -rf ios
rm -rf "$HOME"/Library/Developer/Xcode/DerivedData/ShopifyPOS-* 2>/dev/null || true

echo "==> 2/5 Making sure dependencies are installed"
[ -d node_modules ] || npm install

echo "==> 3/5 Regenerating ios/ (expo prebuild --clean)"
npx expo prebuild --platform ios --clean

echo "==> 4/5 Checking the result"
COUNT=$(find ios -maxdepth 1 -name '*.xcodeproj' | wc -l | tr -d ' ')
echo "    .xcodeproj files in ios/: $COUNT (should be 1)"
find ios -maxdepth 1 -name '*.xcodeproj' -o -maxdepth 1 -name '*.xcworkspace'

echo "==> 5/5 Connected devices Xcode can see"
xcrun xctrace list devices 2>/dev/null | sed -n '1,25p' || echo "    (xcrun not available - is Xcode installed?)"

cat <<'TXT'

Next:  npm run ios
If it still says "timed out" while selecting the device, check, in this order:
  1. iPad/iPhone is unlocked, and you tapped "Trust This Computer".
  2. Settings > Privacy & Security > Developer Mode is ON on the device (restarts it once).
  3. Xcode > Window > Devices and Simulators shows the device as "Connected" (not "Preparing"/"Unavailable").
  4. Try a different cable/port, or unplug and replug; avoid hubs.
  5. Run this once with the device name:  npx expo run:ios --configuration Release --device "<name from the list above>"
  6. The project folder should NOT live in iCloud Drive / Desktop / Documents sync. Slow file systems make every step
     (node_modules, Pods) crawl. Move it to e.g. ~/dev/zeller-pos.
TXT
