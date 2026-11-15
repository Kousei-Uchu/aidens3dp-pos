// Location: src/lib/catalogueRefresh.ts
// 0244: when the catalogue and stock are read again on their own. Pure, so the node tests can pin it.
export const CATALOGUE_REFRESH_MS = 30 * 60 * 1000;
export const refreshDue = (catalogueAt: string | undefined, catalogueLoc: string | undefined, locationId: string | undefined, now: number, queued: number): boolean => {
  if (!locationId || queued > 0) return false;
  if (!catalogueAt) return false; // nothing imported yet: the first import is the person's to run
  if (catalogueLoc !== locationId) return true;
  const t = Date.parse(catalogueAt); return !Number.isFinite(t) || now - t >= CATALOGUE_REFRESH_MS;
};
