# SafeDrive

SafeDrive is a privacy-first, offline-capable Progressive Web App (PWA) prototype for real-time eye-closure monitoring. It uses the device camera to detect face landmarks locally in the browser and provides a continuous in-app audio warning for sustained eye closure.

## Live demo

Try SafeDrive at [drivesafelly.netlify.app](https://drivesafelly.netlify.app/). For camera access, open it on a supported device or desktop browser and allow the requested camera permission.

> **Safety disclaimer:** SafeDrive is an experimental driver-assistance prototype. It is not a safety-critical system, does not replace an alert driver, safe driving practices, rest, or any vehicle safety system, and must not be relied on to prevent accidents or injury.

## Features

- Front-facing camera monitoring through the browser's MediaDevices API
- On-device MediaPipe Face Landmarker inference and eye-landmark analysis
- Personalized dynamic calibration using robust open- and closed-eye samples
- Manual threshold presets, from ultra tolerant to very sensitive
- Temporal smoothing to reduce false positives from blinks, smiles, laughter, and brief squints
- Monitoring warm-up before classification begins
- Continuous Web Audio warning that stops only after confirmed eye recovery
- Offline-first PWA with a versioned service worker and installable Home Screen experience

## Technology

- React 18 and Vite
- JavaScript (no TypeScript)
- `@mediapipe/tasks-vision` Face Landmarker with a pretrained model
- Workbox, via `vite-plugin-pwa`, for service-worker generation and precaching

## Privacy and offline processing

SafeDrive has no backend, cloud AI, analytics, user account, or remote inference path. Camera frames are processed only in memory in the current browser tab and are not recorded or uploaded.

The pretrained model is committed at [`public/models/face_landmarker.task`](public/models/face_landmarker.task). The required MediaPipe WASM runtime files are committed in [`public/mediapipe/`](public/mediapipe/). The PWA service worker precaches these local assets along with the application shell, icons, CSS, and JavaScript, so normal operation works without a connection after an initial successful load.

## Threshold modes

SafeDrive stores its settings in browser-local storage.

- **Dynamic Calibration**: collects multiple valid eye measurements during guided open- and closed-eye phases, then saves a personalized threshold for the current browser/device.
- **Manual Threshold**: lets the user select a stored preset directly. This is useful when testing different camera characteristics without recalibrating.

## Local development

Prerequisite: Node.js 18 or later is recommended.

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite. Camera access requires `localhost` during local development or HTTPS when deployed.

## Production build

```bash
npm run build
npm run preview
```

The deployable static site is generated in `dist/`. Do not commit `dist/`; regenerate it for each deployment.

## Install on iPhone

1. Deploy the contents of `dist/` to an HTTPS static host.
2. Open the deployed URL in Safari on iPhone.
3. Tap **Share** and choose **Add to Home Screen**.
4. Enable **Open as Web App** if Safari shows the option, then tap **Add**.
5. Open SafeDrive from the Home Screen once while online, allowing the service worker and local model/runtime assets to cache.

After that initial cache completes, SafeDrive can launch and run its local detection pipeline offline. iOS controls camera and audio permissions, and may limit browser execution when an app is backgrounded.

## Project layout

```text
src/                 React UI and monitoring modules
src/lib/             Camera, calibration, detection, alert, and settings logic
public/models/       Local pretrained Face Landmarker model
public/mediapipe/    Local MediaPipe WASM runtime assets
public/icons/        PWA and Apple Home Screen icons
```
