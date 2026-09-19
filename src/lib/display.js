// Per-device display preferences, applied as data attributes on <html> so the
// stylesheet can respond: density, text size, motion, background, colour
// preset, font, reading spacing, and the collapsed sidebar / focus mode.

const KEY = 'astral-display';

export const DEFAULTS = {
  density: 'comfy', text: 'md', motion: 'full', bg: 'stars',
  preset: 'none', font: 'system', spacing: 'normal', sidebar: 'full', focus: 'off'
};

export const PRESETS = [
  { value: 'none', label: 'Astral' },
  { value: 'oled', label: 'OLED black' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'forest', label: 'Forest' },
  { value: 'contrast', label: 'High contrast' }
];

export const FONTS = [
  { value: 'system', label: 'System' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' }
];

export function readDisplay() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export function applyDisplay(d) {
  const root = document.documentElement;
  for (const k of Object.keys(DEFAULTS)) root.setAttribute(`data-${k}`, d[k] ?? DEFAULTS[k]);
  window.dispatchEvent(new Event('astral-display'));
}

export function saveDisplay(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* applies for this visit anyway */ }
  applyDisplay(d);
}

export function patchDisplay(patch) {
  saveDisplay({ ...readDisplay(), ...patch });
}
