import { detectEyeState } from './eyeDetection.js';

export const CALIBRATION_DURATION_MS = 3500;
export const CALIBRATION_COUNTDOWN_MS = 3000;
export const MIN_CALIBRATION_SAMPLES = 25;

// Tuning values deliberately live here so comfort/sensitivity can be adjusted
// later without changing collection or monitoring code.
export const COMFORTABLE_BASELINE_EAR = 0.21;
export const PERSONALIZED_THRESHOLD_WEIGHT = 0.7;
export const CLOSURE_TOLERANCE = 0.015;
export const MIN_PERSONALIZED_THRESHOLD = 0.16;
export const MAX_PERSONALIZED_THRESHOLD = 0.26;

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function removeOutliers(values) {
  const lower = percentile(values, 0.1);
  const upper = percentile(values, 0.9);
  return values.filter((value) => value >= lower && value <= upper);
}

/**
 * Reject frames without a reasonably centered, visible face. This is a small
 * quality gate for calibration; it avoids saving a threshold from a partial or
 * distant face rather than treating every MediaPipe result as trustworthy.
 */
export function hasUsableFace(landmarks) {
  if (!landmarks || landmarks.length < 468) return false;

  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return width >= 0.12 && height >= 0.12 && width <= 0.9 && height <= 0.9
    && centerX >= 0.15 && centerX <= 0.85 && centerY >= 0.15 && centerY <= 0.85;
}

/** Collect one valid EAR measurement, or null for a frame we should ignore. */
export function collectEyeMeasurement(landmarks) {
  if (!hasUsableFace(landmarks)) return null;
  const { ear } = detectEyeState(landmarks);
  return Number.isFinite(ear) && ear > 0 ? ear : null;
}

/**
 * Derive a threshold from robust sample statistics rather than a single frame.
 * The 20th/80th percentiles leave room for ordinary blinks and small movement.
 */
export function calculatePersonalizedThreshold(openSamples, closedSamples) {
  if (openSamples.length < MIN_CALIBRATION_SAMPLES || closedSamples.length < MIN_CALIBRATION_SAMPLES) {
    throw new Error('Not enough valid samples. Keep your face centered and try again.');
  }

  const stableOpen = removeOutliers(openSamples);
  const stableClosed = removeOutliers(closedSamples);
  const openValue = percentile(stableOpen, 0.2);
  const closedValue = percentile(stableClosed, 0.8);
  const separation = openValue - closedValue;

  // If the two recordings look alike, the user likely blinked or did not close
  // their eyes for the second stage. A threshold would not be reliable.
  if (openValue <= closedValue || separation < 0.035) {
    throw new Error('Eye measurements were too similar. Please recalibrate and close your eyes fully.');
  }

  // Restore the previously working personalized formula: the user's robust
  // open/closed midpoint is blended with the established comfortable baseline.
  const rawThreshold = (openValue + closedValue) / 2;
  const blendedThreshold = rawThreshold * PERSONALIZED_THRESHOLD_WEIGHT
    + COMFORTABLE_BASELINE_EAR * (1 - PERSONALIZED_THRESHOLD_WEIGHT);
  const threshold = Math.min(
    MAX_PERSONALIZED_THRESHOLD,
    Math.max(MIN_PERSONALIZED_THRESHOLD, blendedThreshold - CLOSURE_TOLERANCE),
  );

  return {
    version: 2,
    threshold,
    rawThreshold,
    openValue,
    closedValue,
    openBaseline: openValue,
    openSampleCount: openSamples.length,
    closedSampleCount: closedSamples.length,
    createdAt: new Date().toISOString(),
  };
}
