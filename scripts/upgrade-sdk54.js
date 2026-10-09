// Location: scripts/upgrade-sdk54.js
// Updates package.json in place to Expo SDK 54 / React Native 0.81 (the newest SDK inside Zeller's supported RN range 0.76–0.81).
// It only touches the packages below, so your Zeller SDK entry (tarball/registry) and anything else is left exactly as it is.
const fs = require('fs');
const path = require('path').join(__dirname, '..', 'package.json');
const p = JSON.parse(fs.readFileSync(path, 'utf8'));
const deps = {
  expo: '~54.0.37', react: '19.1.0', 'react-native': '0.81.5', '@expo/ui': '0.2.0-beta.9', '@expo/vector-icons': '^15.0.3',
  '@react-native-async-storage/async-storage': '2.2.0', 'expo-asset': '~12.0.13', 'expo-camera': '~17.0.10', 'expo-constants': '~18.0.14', 'expo-crypto': '~15.0.9', 'expo-keep-awake': '~15.0.8', 'expo-print': '~15.0.8',
  'expo-device': '~8.0.10', 'expo-document-picker': '~14.0.8', 'expo-file-system': '~19.0.24', 'expo-font': '~14.0.12', 'expo-haptics': '~15.0.8',
  'expo-secure-store': '~15.0.8', 'expo-sharing': '~14.0.8', 'expo-status-bar': '~3.0.9', 'react-native-svg': '15.12.1', 'react-native-webview': '13.15.0',
  'qrcode-generator': '^2.0.4', '@noble/ciphers': '^1.3.0',
};
const dev = { '@types/react': '~19.1.10', typescript: '~5.9.2', 'babel-preset-expo': '~54.0.12' };
p.dependencies = { ...p.dependencies, ...deps };
p.devDependencies = { ...p.devDependencies, ...dev };
p.dependencies = Object.fromEntries(Object.entries(p.dependencies).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(path, JSON.stringify(p, null, 2) + '\n');
console.log('package.json updated for Expo SDK 54.');
