import { helpSetFrom, type HelpSet } from './helpBuiltin';

export async function fetchRemoteHelp(url: string, currentVersion: string, request: typeof fetch = fetch): Promise<HelpSet | null> {
  const base = url.trim().replace(/\/+$/, '');
  if (!base) throw new Error('A docs server URL is required.');
  const response = await request(`${base}/api/index`, { headers: { 'If-None-Match': `"${currentVersion}"` } });
  if (response.status === 304) return null;
  if (!response.ok) throw new Error(`Docs server returned HTTP ${response.status}.`);
  const remote = helpSetFrom(await response.json());
  if (!remote) throw new Error('Docs server returned an invalid help bundle.');
  return remote.version === currentVersion ? null : remote;
}
