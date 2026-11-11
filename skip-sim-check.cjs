// Run from the app's root: node skip-sim-check.cjs
const fs = require('fs'), path = require('path');
const expoDir = path.dirname(require.resolve('expo/package.json', { paths: [process.cwd()] }));
const cliDir = path.dirname(require.resolve('@expo/cli/package.json', { paths: [expoDir] }));
const file = path.join(cliDir, 'build/src/start/platforms/ios/assertSystemRequirements.js');
let s = fs.readFileSync(file, 'utf8');
if (s.includes('SKIP_SIM_CHECK')) { console.log('already patched:', file); process.exit(0); }
const line = "    await (0, _profile.profile)(_SimulatorAppPrerequisite.SimulatorAppPrerequisite.instance.assertAsync.bind(_SimulatorAppPrerequisite.SimulatorAppPrerequisite.instance), 'SimulatorAppPrerequisite')();";
if (!s.includes(line)) { console.error('expected line not found in', file); process.exit(1); }
s = s.replace(line, "    // SKIP_SIM_CHECK: Xcode 27 has no Simulator.app (Device Hub replaced it), so this check only warns.\n    try {\n    " + line.trim() + "\n    } catch (e) { console.warn('Skipping Simulator app check: ' + e.message); }");
fs.writeFileSync(file, s);
console.log('patched:', file);
