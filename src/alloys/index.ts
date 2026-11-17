// Location: src/alloys/index.ts
// 0250: the registry. The ONLY file that imports an Alloy (see dev_docs/ALLOYS.md). It is empty until the first Alloys are written in
// phase P4; the app does not read it yet, so adding it changes nothing at runtime.
import type { Alloy } from '../alloykit/types';

export const ALLOYS: Alloy[] = [];
