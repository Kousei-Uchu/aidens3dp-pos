import test from 'node:test';
import assert from 'node:assert/strict';
import { PULSE_PEAK, PULSE_PEAK_AT, PULSE_SCALE_GAIN, PULSE_SECONDS, PULSE_TINT_ALPHA, hintLabel, pulseIntensity, pulseMix, pulseSamples, pulseScale, toastMs } from '../src/lib/hintPulse';

// The curve exactly as it was asked for, written out here so the test does not just compare the code with itself.
const asked = (t: number): number => 48.225 * Math.pow(t, 2) * Math.pow(0.8 - t, 3);

test('the pulse is the requested curve at every point inside 0 to 0.8 seconds', () => {
  for (let i = 1; i < 800; i++) { const t = i / 1000; assert.equal(pulseIntensity(t), asked(t), `t = ${t}`); }
  assert.equal(pulseIntensity(0.1), asked(0.1)); assert.equal(pulseIntensity(0.5), asked(0.5));
});

test('it starts and ends at zero, and is held at zero outside the pulse (the raw expression goes negative after 0.8)', () => {
  assert.equal(pulseIntensity(0), 0); assert.equal(pulseIntensity(PULSE_SECONDS), 0);
  assert.ok(asked(0.9) < 0, 'the raw expression really does go negative, so the hold matters');
  assert.equal(pulseIntensity(0.9), 0); assert.equal(pulseIntensity(5), 0); assert.equal(pulseIntensity(-0.3), 0);
  assert.equal(pulseIntensity(NaN), 0); assert.equal(pulseIntensity(Infinity), 0); assert.equal(pulseIntensity(-Infinity), 0);
});

test('it never goes below zero or to a non-number, and it rises once then falls once', () => {
  let prev = 0; let peaked = false; let turns = 0;
  for (let i = 0; i <= 900; i++) {
    const v = pulseIntensity(i / 1000); assert.ok(Number.isFinite(v) && v >= 0, `t = ${i / 1000}`);
    if (i > 0 && i <= 800) { const rising = v > prev; if (!rising && !peaked) { peaked = true; turns += 1; } if (rising && peaked) turns += 100; }
    prev = v;
  }
  assert.equal(turns, 1, 'one turning point only');
});

test('the peak is at 0.32 seconds and is about 0.546, not 1', () => {
  assert.equal(PULSE_PEAK_AT, 0.32); assert.equal(PULSE_PEAK, pulseIntensity(0.32));
  assert.ok(PULSE_PEAK > 0.54 && PULSE_PEAK < 0.55, `peak ${PULSE_PEAK}`);
  let best = 0; let at = 0; for (let i = 0; i <= 8000; i++) { const t = i / 10000; const v = pulseIntensity(t); if (v > best) { best = v; at = t; } }
  assert.ok(Math.abs(at - 0.32) < 0.0005, `peak found at ${at}`); assert.ok(Math.abs(best - PULSE_PEAK) < 1e-6);
});

test('size and colour are read off the curve: size grows by about 8% at the peak, colour is full strength exactly at the peak', () => {
  assert.equal(pulseScale(0), 1); assert.ok(Math.abs(pulseScale(PULSE_PEAK) - (1 + PULSE_SCALE_GAIN * PULSE_PEAK)) < 1e-12);
  assert.ok(pulseScale(PULSE_PEAK) > 1.07 && pulseScale(PULSE_PEAK) < 1.09);
  assert.equal(pulseMix(0), 0); assert.ok(Math.abs(pulseMix(PULSE_PEAK) - 1) < 1e-12);
  assert.equal(pulseMix(-1), 0); assert.equal(pulseMix(99), 1, 'never stronger than the full colour');
  assert.ok(PULSE_TINT_ALPHA > 0 && PULSE_TINT_ALPHA < 0.5, 'a tint, not a block of colour (the text sits on it)');
});

test('the samples used by the animation: strictly increasing, start and end at rest, hit the peak exactly, and stay close to the true curve between samples', () => {
  const s = pulseSamples();
  assert.equal(s.t.length, s.intensity.length); assert.equal(s.t.length, s.scale.length); assert.equal(s.t.length, s.mix.length);
  for (let i = 1; i < s.t.length; i++) assert.ok(s.t[i] > s.t[i - 1], 'interpolate needs a strictly increasing input range');
  assert.equal(s.t[0], 0); assert.equal(s.t[s.t.length - 1], PULSE_SECONDS);
  assert.equal(s.intensity[0], 0); assert.equal(s.intensity[s.intensity.length - 1], 0); assert.equal(s.scale[0], 1); assert.equal(s.mix[0], 0);
  const k = s.t.indexOf(PULSE_PEAK_AT); assert.ok(k > 0, 'the peak is a sample'); assert.equal(s.intensity[k], PULSE_PEAK); assert.ok(Math.abs(s.mix[k] - 1) < 1e-12);
  assert.ok(Math.max(...s.scale) < 1.09 && Math.min(...s.scale) >= 1); assert.ok(Math.max(...s.mix) <= 1 && Math.min(...s.mix) >= 0);
  // Straight lines between samples (what the native interpolation does) against the real curve, at every point.
  let worst = 0;
  for (let i = 1; i < 800; i++) {
    const t = i / 1000; let j = 1; while (s.t[j] < t) j++; const a = s.t[j - 1]; const b = s.t[j]; const f = (t - a) / (b - a);
    const lerp = s.intensity[j - 1] + (s.intensity[j] - s.intensity[j - 1]) * f; worst = Math.max(worst, Math.abs(lerp - pulseIntensity(t)));
  }
  assert.ok(worst < 0.005, `the sampled curve is within ${worst} of the real one`);
});

test('fewer samples still keep the peak and the two ends', () => {
  const s = pulseSamples(8); assert.ok(s.t.includes(0.32) && s.t.includes(0) && s.t.includes(0.8)); assert.equal(s.intensity[s.t.indexOf(0.32)], PULSE_PEAK);
});

test('the toast title says which hint this is, or that it is the answer', () => {
  assert.equal(hintLabel(1, 3, false), 'Hint 1 of 4'); assert.equal(hintLabel(3, 0, false), 'Hint 3 of 3'); assert.equal(hintLabel(4, 0, true), 'The answer');
  assert.equal(hintLabel(0, 0, false), 'Hint 1 of 1', 'never says Hint 0'); assert.equal(hintLabel(2, -5, false), 'Hint 2 of 2');
});

test('the toast stays long enough to read, never too short or too long', () => {
  assert.equal(toastMs(0), 6000); assert.equal(toastMs(10), 6000); assert.equal(toastMs(1000), 14000); assert.equal(toastMs(-4), 6000);
  assert.ok(toastMs(100) > toastMs(60) && toastMs(100) < 14000, 'a longer hint stays longer');
});
