// Location: src/lib/assistantTime.ts
// The assistant's date and time tool (patch 0166, plan 3.2 tool 9): `current_time`. A small model does not know what day it is, so
// "how much did we sell yesterday" or "this week" would be guesses. This hands it today's date, the weekday and the time on the till,
// and the first days of the periods the data tools understand, so it can pass real dates to sales_report and find_orders.
// It reads the clock it is given and nothing else: no shop data, no network, no store. Pure, so it runs in the node tests.
import { dayKey } from './rollup';
import { rangeFor } from './assistantData';
import type { AssistantTool } from './assistantTools';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "3:05 pm", in the till's own time. */
export function clockText(d: Date): string {
  const h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}
const zoneName = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'; } catch { return 'local time'; } };

/** Today as the till sees it, counted from `now` (milliseconds). Weeks start on Monday, as in the reports. */
export function timeInfo(now: number, zone: string = zoneName()): Record<string, unknown> {
  const d = new Date(now);
  if (isNaN(d.getTime())) return { error: 'The till clock could not be read.' };
  const week = rangeFor('this_week', now); const last = rangeFor('last_month', now);
  return {
    date: dayKey(d), weekday: WEEKDAYS[d.getDay()], time: clockText(d), time_zone: zone,
    yesterday: rangeFor('yesterday', now).from, this_week_from: week.from, this_month_from: rangeFor('this_month', now).from,
    last_month_from: last.from, last_month_to: last.to,
    note: 'This is the till clock. Dates are written like 2026-10-18 and weeks start on Monday. Pass these dates to sales_report and find_orders.',
  };
}

export const currentTimeTool: AssistantTool = {
  gate: { date: 'shop', weekday: 'shop', time: 'shop', time_zone: 'shop', yesterday: 'shop', this_week_from: 'shop', this_month_from: 'shop', last_month_from: 'shop', last_month_to: 'shop' },
  def: { type: 'function', function: {
    name: 'current_time',
    description: 'Today\'s date, the weekday and the time on this till, and when this week and month started. Use it before asking for sales or orders, for any question that depends on today, such as yesterday, this week or how long ago.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  } },
  run: (_args, ctx) => timeInfo(ctx.now ?? ctx.data?.now ?? Date.now()),
};
