// A short confirmation window makes expressions and ordinary blinks stable.
export const SMOOTHING_WINDOW_MS = 320;
export const CLOSED_CONFIRMATION_MS = 700;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Maintains eye history for a single monitoring session. A value below the
 * personalized threshold is first reported as a temporary squint; only a
 * stable, smoothed low value becomes EYES CLOSED.
 */
export function createTemporalEyeState() {
  let samples = [];
  let lowSince = null;

  return {
    reset() {
      samples = [];
      lowSince = null;
    },
    update(ear, threshold, timestamp) {
      samples.push({ ear, timestamp });
      samples = samples.filter((sample) => timestamp - sample.timestamp <= SMOOTHING_WINDOW_MS);
      const smoothedEar = median(samples.map((sample) => sample.ear));

      if (smoothedEar >= threshold) {
        lowSince = null;
        return { state: 'EYES OPEN', smoothedEar, closedFor: 0 };
      }

      lowSince ??= timestamp;
      const closedFor = timestamp - lowSince;
      return {
        state: closedFor >= CLOSED_CONFIRMATION_MS ? 'EYES CLOSED' : 'SQUINTING',
        smoothedEar,
        closedFor,
      };
    },
  };
}
