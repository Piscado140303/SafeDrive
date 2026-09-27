const STORAGE_KEY = 'safedrive-eye-calibration-v1';

/** Load a previously saved local calibration, discarding malformed data. */
export function loadCalibration() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Version 2 is the stable dynamic-calibration format.
    // values are intentionally recalibrated once instead of being trusted.
    return saved?.version === 2 && Number.isFinite(saved.threshold) ? saved : null;
  } catch {
    return null;
  }
}

/** Calibration is deliberately stored only in this browser's localStorage. */
export function saveCalibration(calibration) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
  return calibration;
}
