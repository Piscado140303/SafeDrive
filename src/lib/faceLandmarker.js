import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Both assets are served by Vite from /public. This avoids any runtime cloud API.
const WASM_ROOT = '/mediapipe';
const MODEL_PATH = '/models/face_landmarker.task';

/** Load MediaPipe's pretrained Face Landmarker for browser video frames. */
export async function createFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  });
}
