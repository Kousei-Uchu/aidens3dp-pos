let Crypto: any;
try { Crypto = require('expo-crypto'); } catch { /* node / tests */ }
export const uid = (): string => {
  try { return Crypto.randomUUID(); } catch { /* fall through */ }
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
};
export const shortId = () => uid().replace(/-/g, '').slice(0, 10);
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
