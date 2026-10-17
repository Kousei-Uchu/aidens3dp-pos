// Location: src/lib/assistantLogIO.ts
// Device side of the assistant's audit log (patch 0152). The files live in the app's Library/Application Support folder, next
// to Documents and not inside it, so Files.app cannot see them (Documents is shared on purpose, see app.json). The only way
// out is the viewer's Export log (patch 0153). Nothing here is synced or put in a backup file.
import * as FS from 'expo-file-system/legacy';
import { b64ToBytes, bytesToB64 } from './squareHistoryIO';
import { isTraining } from './trainingGuard';
import { createLogStore, logDirFromDocuments, type LogFs, type LogSink } from './assistantLog';
import { useApp } from '../state/store';

const dir = (): string => { const d = logDirFromDocuments(FS.documentDirectory); if (!d) throw new Error('This device has no app folder for the log.'); return d; };
let ready: Promise<void> | null = null;
const ensure = (): Promise<void> => {
  if (!ready) ready = FS.makeDirectoryAsync(dir(), { intermediates: true }).catch(e => { ready = null; throw e; });
  return ready;
};
const exists = async (path: string): Promise<boolean> => (await FS.getInfoAsync(path)).exists;

const fs: LogFs = {
  async read(name) {
    await ensure(); const p = dir() + name;
    if (!(await exists(p))) return null;
    return b64ToBytes(await FS.readAsStringAsync(p, { encoding: FS.EncodingType.Base64 }));
  },
  async write(name, data) {
    await ensure(); const p = dir() + name; const tmp = `${p}.tmp`;
    await FS.writeAsStringAsync(tmp, bytesToB64(data), { encoding: FS.EncodingType.Base64 });
    await FS.deleteAsync(p, { idempotent: true }); await FS.moveAsync({ from: tmp, to: p });
  },
  async remove(name) { await ensure(); await FS.deleteAsync(dir() + name, { idempotent: true }); },
  async list() {
    await ensure(); const names = await FS.readDirectoryAsync(dir()); const out: { name: string; size: number }[] = [];
    for (const n of names) {
      if (n.endsWith('.tmp')) { // a write was cut off between the delete and the move: finish it
        const real = n.slice(0, -4);
        if (!names.includes(real)) { try { await FS.moveAsync({ from: dir() + n, to: dir() + real }); const i = await FS.getInfoAsync(dir() + real); if (i.exists) out.push({ name: real, size: (i as any).size ?? 0 }); } catch { /* leave it */ } }
        else { try { await FS.deleteAsync(dir() + n, { idempotent: true }); } catch { /* leave it */ } }
        continue;
      }
      const i = await FS.getInfoAsync(dir() + n); if (i.exists && !(i as any).isDirectory) out.push({ name: n, size: (i as any).size ?? 0 });
    }
    return out;
  },
};

/** The one log for this iPad. The cap comes from the manager's setting (patch 0153). */
export const assistantLog = createLogStore(fs, { capBytes: () => { const s = useApp.getState().settings.assistant; return (s.logCapMB || 200) * 1024 * 1024; } });
/** Practice mode never writes anything real, so nothing is logged there (sending is blocked in practice mode anyway). */
export const logSink: LogSink = async (e, prompt) => { if (isTraining()) return; await assistantLog.append(e, prompt); };
