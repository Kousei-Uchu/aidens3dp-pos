// Location: tests/tendermachine.test.ts
// 0024: the tender machine porting point stays empty and switched off until the hardware exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TENDER_MACHINE_READY, tenderMachine } from '../src/lib/tenderMachine';

test('the tender machine is not ready, and its function does nothing', async () => {
  assert.equal(TENDER_MACHINE_READY, false);
  assert.equal(await tenderMachine({ op: 'accept', dueCents: 1000 }), undefined);
  assert.equal(await tenderMachine({ op: 'dispense', counts: { '500': 1 } }), undefined);
});
