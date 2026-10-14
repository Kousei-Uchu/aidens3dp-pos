// Location: scripts/zeller-notice.mjs
// Runs after every `npm install` (the `postinstall` script). If the Zeller Payments SDK is missing it prints one short,
// plain notice and exits 0, so the install never fails and nobody (person or AI) retries in a loop trying to fetch it.
//
// The SDK is closed-source and is NOT published to public npm registries. Its npm metadata may resolve, but the tarball
// itself is served from Zeller's private Artifactory, so a plain install cannot download it. It is declared as an
// OPTIONAL dependency on purpose: the install succeeds without it, and this script explains the skip. There is nothing
// to fix and no replacement to clone.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = join(root, 'node_modules', '@zeller-public', 'payments-sdk-react-native');

// Present (this machine has the SDK, or it was installed from ./vendor): say nothing.
if (existsSync(join(sdk, 'package.json'))) process.exit(0);

const rule = '='.repeat(78);
console.log(`
${rule}
The Zeller Payments SDK (@zeller-public/payments-sdk-react-native) is not installed.
This is expected and intentional. Nothing is broken and there is nothing to fix.
${rule}

  * The SDK is closed-source. It is NOT on public npm registries.
  * Its npm metadata resolves, but the tarball is served from Zeller's private
    Artifactory, so a plain \`npm install\` cannot download it.
  * It is declared as an OPTIONAL dependency, so the install still succeeds without it.

  DO NOT retry \`npm install\` or \`npm ci\` to try to fix this, and do not try to
  clone a replacement: there is none. Every retry fails the same way and wastes time.

The app itself only builds and runs on a machine that has the SDK. To install it,
put the tarballs Zeller provided in ./vendor and run \`npm run zeller\` (see SETUP.md).
${rule}
`);
process.exit(0);
