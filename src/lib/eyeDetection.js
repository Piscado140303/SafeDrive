// MediaPipe Face Mesh indexes for the two eyelid contours. The pairs below are
// used to calculate Eye Aspect Ratio (EAR): vertical eye opening / eye width.
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const LEFT_EYE = [362, 385, 387, 263, 373, 380];

export const EYE_CLOSED_THRESHOLD = 0.21;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function calculateEyeAspectRatio(landmarks, indices) {
  const [outer, upperOuter, upperInner, inner, lowerInner, lowerOuter] =
    indices.map((index) => landmarks[index]);
  const vertical =
    distance(upperOuter, lowerOuter) + distance(upperInner, lowerInner);
  const horizontal = 2 * distance(outer, inner);
  return horizontal ? vertical / horizontal : 0;
}

/**
 * Returns a simple, explainable eye state from face landmarks. The threshold
 * is intentionally exported so a later phase can add per-user calibration.
 */
export function detectEyeState(landmarks, threshold = EYE_CLOSED_THRESHOLD) {
  const rightEAR = calculateEyeAspectRatio(landmarks, RIGHT_EYE);
  const leftEAR = calculateEyeAspectRatio(landmarks, LEFT_EYE);
  const ear = (rightEAR + leftEAR) / 2;

  return {
    ear,
    isClosed: ear < threshold,
    eyeIndices: [...RIGHT_EYE, ...LEFT_EYE],
  };
}
