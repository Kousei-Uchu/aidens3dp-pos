# The `tillium-dev` branch and the Tillium app identity

The Alloys work (`dev_docs/ALLOYS_PLAN.md`) and the public rebrand happen on the branch `tillium-dev`, which builds a **separate app**
from the live shop's. Nothing on the branch can touch the live shop's app, data or iCloud container.

## 1. Make the branch and a second folder

Run once, from the folder you work in now (here `aidens3dp-pos`). **Main gets none of the Alloys patches**: make the branch
first, then apply 0248 and 0249 in the new folder only.

```sh
git switch main && git pull
git branch tillium-dev main
git push -u origin tillium-dev
cd ..
git clone --branch tillium-dev --single-branch https://github.com/Kousei-Uchu/aidens3dp-pos.git aidens3dp-pos-tillium
cd aidens3dp-pos-tillium && npm install
mv ~/Downloads/0248-*.patch ~/Downloads/0249-*.patch patches/
bash ./scripts/apply-patches.sh
git push
```

You now have `aidens3dp-pos` (main, the live shop) and `aidens3dp-pos-tillium` (the branch) side by side. Each has its own
`node_modules` and `ios/` folder. Alternatively, `git worktree add ../aidens3dp-pos-tillium tillium-dev` makes the second
folder from the same repository without a second download; either works.

Every patch from 0248 on goes into `aidens3dp-pos-tillium/patches/` and is applied with `bash ./scripts/apply-patches.sh`, then
`git push`, exactly as on main. The apply-patches workflow only runs for pushes to `main`, so it does nothing on this branch.
Make sure `~/Downloads` holds only the latest copy of each patch. Bring main's fixes across with `git merge main`.

## 2. What the identity change does (patch 0249)

| Setting | Live app (main) | Tillium (`tillium-dev`) |
| --- | --- | --- |
| Bundle ID | `com.aidens3dp.pos` | `page.aspens.tillium` |
| App name and slug | Aiden's 3DPOS, `aidens3dp-pos` | Tillium, `tillium` |
| CloudKit container | `iCloud.com.aidens3dp.pos` | `iCloud.page.aspens.tillium` |
| CloudKit subscriptions | `aidens3dp-private-changes`, `aidens3dp-shared-changes` | `tillium-private-changes`, `tillium-shared-changes` |
| Apple team | `HD264P8365` | `HD264P8365` (unchanged) |

Because the bundle ID differs, Tillium installs **beside** the live app on the same iPad, with its own Keychain, local data
and iCloud container. It starts empty. User-visible strings that still say "Aiden's" are the rebrand phase (P9), not this patch.

## 3. What you need to do once (Apple and the first run)

1. **Apple Developer, Identifiers:** add an App ID `page.aspens.tillium` with the **iCloud (CloudKit)** capability, and create
   the container `iCloud.page.aspens.tillium` and attach it to that App ID. Add any other capability the live app's ID has
   (for example Wallet, if you use passes).
2. **Native project:** in the new folder run `npm run ios:reset` (a clean prebuild, because the name and bundle ID changed).
3. **CloudKit schema:** put the new container in `.cloudkit.env` (`CK_CONTAINER_ID=iCloud.page.aspens.tillium`, same
   `CK_TEAM_ID`), then `npm run cloudkit:schema` to create the record types and indexes in the new container (Development).
4. **Copy the shop's setup:** on the live app use **Settings > Backup & transfer > Show setup QR**, and on Tillium **Set up
   from another device**. It brings the settings, staff, grid and logins across over Wi-Fi without touching the live data.
5. Sales history and the catalogue do not carry over by design: the catalogue loads from Shopify, and the new container
   starts a fresh history. Use **Back up everything** on the live app first if you want a copy of its data.

## 4. Not changed here

The Cloudflare workers (`receipt-server`, `pass-server`, `gift-claim-server`, `docs-server`) and the `aidens3dp.com` domain
in `scripts/migrate-cloudflare.sh`. A public template has each user deploy their own workers; that comes later
(`ALLOYS_PLAN.md` section 8). Until then Tillium reaches the existing workers the same way the live app does.
