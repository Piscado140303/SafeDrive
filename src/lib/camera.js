/**
 * Opens the front-facing camera. Keeping camera access here makes it easy to
 * replace or extend it later (for example, when a PWA manages camera resume).
 */
export async function startFrontCamera(videoElement) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access.');
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    });
  } catch (error) {
    const messages = {
      NotAllowedError: 'Camera permission was denied. Enable camera access for SafeDrive in your browser settings, then try again.',
      NotFoundError: 'No camera was found on this device.',
      NotReadableError: 'The camera is unavailable or is being used by another app.',
    };
    throw new Error(messages[error.name] || 'SafeDrive could not access the camera.');
  }

  videoElement.srcObject = stream;
  await videoElement.play();
  return stream;
}

/** Stop every camera track so the browser releases the webcam indicator. */
export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
