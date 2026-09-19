// Small synthesized sound effects — no audio files to load. Browsers only let
// audio start after a click or key press, which every sound here follows.

const KEY = 'astral-sound';

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not worth reporting */ }
}

let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.08, slide = 0 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SOUNDS = {
  tick: () => tone(900, { dur: 0.03, type: 'square', gain: 0.02 }),
  land: () => tone(520, { dur: 0.1, type: 'triangle', gain: 0.06 }),
  good: () => { tone(660, { dur: 0.1 }); tone(880, { at: 0.08, dur: 0.14 }); },
  rare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.22, type: 'triangle', gain: 0.07 })),
  epic: () => {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.35, type: 'sawtooth', gain: 0.04 }));
    tone(80, { dur: 0.9, type: 'sine', gain: 0.12, slide: -30 });
  },
  win: () => [659, 784, 988].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.16, type: 'triangle', gain: 0.07 })),
  lose: () => tone(300, { dur: 0.3, type: 'sawtooth', gain: 0.04, slide: -160 }),
  coin: () => { tone(988, { dur: 0.06, type: 'square', gain: 0.03 }); tone(1319, { at: 0.06, dur: 0.18, type: 'square', gain: 0.03 }); },
  click: () => tone(1200, { dur: 0.02, type: 'square', gain: 0.015 })
};

export function play(name) {
  if (!soundOn()) return;
  try { SOUNDS[name]?.(); } catch { /* audio is a nicety, never an error */ }
}
