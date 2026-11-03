// Location: src/lib/migrationPanel.ts
// CloudKit sync, patch 7 (screen, words): what the "Move the shop to iCloud" section of the Cloud sync page says and offers, worked out from
// the controller's view and this till's role. Pure, so every sentence and every button rule is tested in Node (tests/migrationpanel.test.ts).
// The page itself (screens/CloudSync.tsx) only draws what this returns.
import { MIGRATION_PHASES } from './migrationLease';
import type { MigrationView } from './cloudkit/migrationControl';

export type PanelRole = 'owner' | 'participant' | 'none';
export type MigrationPanel = {
  /** False when the section should not be drawn at all. */
  show: boolean;
  title: string;
  /** The sentence for the lease's state, or what is running now. */
  status: string;
  /** What the last attempt on this iPad ended with, or ''. */
  outcome: string;
  /** What the setup does, shown to the owner until it is done. */
  explain: string[];
  /** How far a running import is, or ''. */
  progress: string;
  primary: { label: string } | null;
  showStop: boolean;
};

const STEP_NAME: Record<string, string> = { settings: 'settings', drawer: 'cash drawer', layout: 'button layout', carts: 'saved carts', sales: 'sales', rollups: 'sales totals' };

const EXPLAIN = [
  'Copies this shop\'s settings, cash drawer, button layout, saved carts, sales and sales totals from Shopify into iCloud, then checks that every record arrived.',
  'Shopify keeps its copy and nothing is deleted. The other tills keep working as they do now.',
  'Keep the app open until it finishes. If it is interrupted, press the button again and it carries on where it stopped.',
];

/** The sentence for how the last attempt on this iPad ended. */
export function outcomeLine(last: MigrationView['last']): string {
  if (!last) return '';
  switch (last.kind) {
    case 'done': return 'Done. Every record is in iCloud and the counts match.';
    case 'finished': return 'The records are copied. The check has not been done yet.';
    case 'short': return `${last.message} Press the button to copy what is missing.`;
    case 'failed': return `The setup stopped at the ${STEP_NAME[last.phase] ?? last.phase} step: ${last.message} Press the button to carry on.`;
    case 'lost': return 'Another iPad took over the setup, so this one stopped.';
    case 'stopped': return 'Stopped. Press the button to carry on.';
    case 'wait': return '';
    case 'refused': return last.why;
  }
}

export function migrationPanel(v: MigrationView | null, role: PanelRole, practice: boolean): MigrationPanel {
  const hidden: MigrationPanel = { show: false, title: '', status: '', outcome: '', explain: [], progress: '', primary: null, showStop: false };
  if (!v || role === 'none') return hidden;
  const owner = role === 'owner';
  const step = v.phase ? MIGRATION_PHASES.indexOf(v.phase) + 1 : 0;
  const progress = v.running && v.phase ? `Step ${step} of ${MIGRATION_PHASES.length}, ${STEP_NAME[v.phase]}: ${v.imported} so far.` : '';
  const carryOn = !v.done && !!v.last && ['failed', 'short', 'stopped', 'lost'].includes(v.last.kind);
  return {
    show: true,
    title: 'Move the shop to iCloud',
    status: v.line,
    outcome: v.running ? '' : outcomeLine(v.last),
    explain: owner && !v.done ? EXPLAIN : [],
    progress,
    primary: owner && !practice && v.canStart ? { label: carryOn ? 'Carry on setting up sync' : 'Set up sync' } : null,
    showStop: owner && v.running,
  };
}
