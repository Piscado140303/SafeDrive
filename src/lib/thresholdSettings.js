export const THRESHOLD_PRESETS = {
  ultraTolerant: { label: 'Ultra tolerant', value: 0.12 },
  extraTolerant: { label: 'Extra tolerant', value: 0.14 },
  veryTolerant: { label: 'Very tolerant', value: 0.16 },
  tolerant: { label: 'Tolerant', value: 0.18 },
  balanced: { label: 'Balanced', value: 0.21 },
  sensitive: { label: 'Sensitive', value: 0.23 },
  verySensitive: { label: 'Very sensitive', value: 0.25 },
};

const STORAGE_KEY = 'safedrive-threshold-settings-v1';
const DEFAULTS = { thresholdMode: 'dynamic', selectedManualThreshold: 'balanced' };

export function loadThresholdSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
  catch { return DEFAULTS; }
}

export function saveThresholdSettings(settings) {
  const next = { ...DEFAULTS, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
