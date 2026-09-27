import { useCallback, useEffect, useRef, useState } from 'react';
import { startFrontCamera, stopCamera } from './lib/camera.js';
import { createFaceLandmarker } from './lib/faceLandmarker.js';
import { detectEyeState } from './lib/eyeDetection.js';
import { CALIBRATION_COUNTDOWN_MS, CALIBRATION_DURATION_MS, MIN_CALIBRATION_SAMPLES, MIN_PERSONALIZED_THRESHOLD, MAX_PERSONALIZED_THRESHOLD, calculatePersonalizedThreshold, collectEyeMeasurement } from './lib/calibration.js';
import { loadCalibration, saveCalibration } from './lib/calibrationStorage.js';
import { THRESHOLD_PRESETS, loadThresholdSettings, saveThresholdSettings } from './lib/thresholdSettings.js';
import { createTemporalEyeState } from './lib/temporalEyeState.js';
import { createAudioAlert } from './lib/audioAlert.js';

const CLOSED_ALERT_MS = 1500;
const WARMUP_MS = 3000;
const MIN_WARMUP_SAMPLES = 12;
const MAX_WARMUP_ADJUSTMENT = 0.012;
const ALERT_RECOVERY_MS = 800;

export default function App() {
  const videoRef = useRef(null); const canvasRef = useRef(null); const streamRef = useRef(null);
  const landmarkerRef = useRef(null); const animationRef = useRef(null); const operationRef = useRef('idle');
  const calibrationRunRef = useRef(null); const closedSinceRef = useRef(null); const hasAlertedRef = useRef(false);
  const warmupRunRef = useRef(null); const openSinceRef = useRef(null); const activeThresholdRef = useRef(null);
  const temporalEyeStateRef = useRef(null);
  const audioAlertRef = useRef(null);
  if (!temporalEyeStateRef.current) temporalEyeStateRef.current = createTemporalEyeState();
  if (!audioAlertRef.current) audioAlertRef.current = createAudioAlert();

  const [status, setStatus] = useState('Ready to start');
  const [eyeState, setEyeState] = useState('WAITING');
  const [ear, setEar] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [calibration, setCalibration] = useState(loadCalibration);
  const [calibrationPhase, setCalibrationPhase] = useState('idle');
  const [calibrationProgress, setCalibrationProgress] = useState(null);
  const [showCalibrationRequired, setShowCalibrationRequired] = useState(false);
  const [warmupProgress, setWarmupProgress] = useState(null);
  const [thresholdSettings, setThresholdSettings] = useState(loadThresholdSettings);

  const releaseSession = useCallback(() => {
    cancelAnimationFrame(animationRef.current); landmarkerRef.current?.close(); landmarkerRef.current = null;
    stopCamera(streamRef.current); streamRef.current = null; operationRef.current = 'idle';
    closedSinceRef.current = null; openSinceRef.current = null; hasAlertedRef.current = false; audioAlertRef.current.stop(); temporalEyeStateRef.current.reset(); setWarmupProgress(null); setIsCameraActive(false);
  }, []);
  const stopMonitoring = useCallback(() => { releaseSession(); setIsMonitoring(false); setEyeState('WAITING'); setEar(null); setStatus('Monitoring stopped'); }, [releaseSession]);
  useEffect(() => releaseSession, [releaseSession]);

  const drawEyeLandmarks = (landmarks, eyeIndices) => {
    const canvas = canvasRef.current; const video = videoRef.current; if (!canvas || !video) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#5eead4';
    eyeIndices.forEach((index) => { const point = landmarks[index]; context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2); context.fill(); });
  };
  const clearOverlay = () => { const canvas = canvasRef.current; canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); };

  const finishCalibration = (openSamples, closedSamples) => {
    try {
      const saved = saveCalibration(calculatePersonalizedThreshold(openSamples, closedSamples));
      setCalibration(saved); setCalibrationPhase('completed'); setCalibrationProgress(null); setEyeState('WAITING');
      setStatus(`Calibration completed. Saved personal threshold: ${result.threshold.toFixed(3)}`); releaseSession();
    } catch (error) { setCalibrationPhase('idle'); setCalibrationProgress(null); setStatus(error.message); releaseSession(); }
  };

  const processCalibrationFrame = (landmarks, timestamp) => {
    const run = calibrationRunRef.current; if (!run) return;
    const isCountdown = run.phase.endsWith('Countdown'); const duration = isCountdown ? CALIBRATION_COUNTDOWN_MS : CALIBRATION_DURATION_MS;
    const elapsed = timestamp - run.phaseStartedAt; const action = run.phase.startsWith('open') ? 'open' : 'closed';
    const sampleKey = `${action}Samples`;
    setCalibrationProgress({ phase: run.phase, elapsed, samples: run[sampleKey].length });
    if (isCountdown) {
      if (elapsed >= duration) { run.phase = action; run.phaseStartedAt = timestamp; run.lastSampleAt = 0; setCalibrationPhase(action); setStatus(action === 'open' ? 'Collecting normal open-eye measurements.' : 'Collecting closed-eye measurements.'); }
      return;
    }
    const measurement = collectEyeMeasurement(landmarks);
    if (measurement !== null && timestamp - run.lastSampleAt >= 70) { run[sampleKey].push(measurement); run.lastSampleAt = timestamp; setEar(measurement); }
    if (elapsed < duration) return;
    if (run.phase === 'open') { run.phase = 'closedCountdown'; run.phaseStartedAt = timestamp; setCalibrationPhase('closedCountdown'); setStatus('Get ready: you will be asked to close your eyes next.'); return; }
    finishCalibration(run.openSamples, run.closedSamples);
  };

  const finishWarmup = (samples) => {
    if (thresholdSettings.thresholdMode === 'manual') {
      operationRef.current = 'monitoring'; temporalEyeStateRef.current.reset(); setWarmupProgress(null); setEyeState('EYES OPEN'); setStatus('Monitoring active.');
      return;
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const currentOpen = sorted[Math.floor(sorted.length / 2)];
    const calibratedOpen = calibration.openBaseline || calibration.openValue;
    // Adapt only a little for a changed iPhone position/lighting. The threshold
    // never learns from closed-eye frames and remains bounded by calibration.
    const shift = Math.max(-MAX_WARMUP_ADJUSTMENT, Math.min(MAX_WARMUP_ADJUSTMENT, (currentOpen - calibratedOpen) * 0.25));
    activeThresholdRef.current = Math.max(MIN_PERSONALIZED_THRESHOLD, Math.min(MAX_PERSONALIZED_THRESHOLD, calibration.threshold + shift));
    operationRef.current = 'monitoring'; temporalEyeStateRef.current.reset(); setWarmupProgress(null); setEyeState('EYES OPEN');
    setStatus('Monitoring active.');
  };

  const runFrameLoop = () => {
    const processFrame = () => {
      if (operationRef.current === 'idle') return;
      const video = videoRef.current; const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) { animationRef.current = requestAnimationFrame(processFrame); return; }
      const timestamp = performance.now(); const result = landmarker.detectForVideo(video, timestamp); const landmarks = result.faceLandmarks[0];
      if (!landmarks) {
        clearOverlay(); setEyeState('NO FACE'); setEar(null); temporalEyeStateRef.current.reset(); closedSinceRef.current = null; hasAlertedRef.current = false;
      } else {
        const basicDetection = detectEyeState(landmarks); drawEyeLandmarks(landmarks, basicDetection.eyeIndices);
        if (operationRef.current === 'calibrating') processCalibrationFrame(landmarks, timestamp);
        else if (operationRef.current === 'warming') {
          const run = warmupRunRef.current; const measurement = collectEyeMeasurement(landmarks);
          if (measurement !== null && timestamp - run.lastSampleAt >= 70) { run.samples.push(measurement); run.lastSampleAt = timestamp; }
          const elapsed = timestamp - run.startedAt;
          setWarmupProgress({ elapsed, samples: run.samples.length }); setEyeState('STARTING');
          if (elapsed >= WARMUP_MS && run.samples.length >= MIN_WARMUP_SAMPLES) finishWarmup(run.samples);
          else if (elapsed >= WARMUP_MS) setStatus('Keep your face centered while SafeDrive finishes starting.');
        }
        else if (operationRef.current === 'monitoring') {
          const measurement = collectEyeMeasurement(landmarks);
          if (measurement === null) { temporalEyeStateRef.current.reset(); closedSinceRef.current = null; setEyeState('FACE POSITION'); setEar(null); }
          else {
            const temporalState = temporalEyeStateRef.current.update(measurement, activeThresholdRef.current || calibration.threshold, timestamp);
            setEyeState(temporalState.state); setEar(temporalState.smoothedEar);
            if (temporalState.state === 'EYES CLOSED') {
              closedSinceRef.current ??= timestamp;
              if (timestamp - closedSinceRef.current >= CLOSED_ALERT_MS && !hasAlertedRef.current) {
                hasAlertedRef.current = true; audioAlertRef.current.start().catch(() => setStatus('Audio alert could not start. Check your device sound settings.'));
              }
              openSinceRef.current = null;
            } else {
              closedSinceRef.current = null; hasAlertedRef.current = false;
              if (audioAlertRef.current.active && temporalState.state === 'EYES OPEN') {
                openSinceRef.current ??= timestamp;
                if (timestamp - openSinceRef.current >= ALERT_RECOVERY_MS) audioAlertRef.current.stop();
              } else if (temporalState.state !== 'EYES OPEN') openSinceRef.current = null;
            }
          }
        }
      }
      if (operationRef.current !== 'idle') animationRef.current = requestAnimationFrame(processFrame);
    };
    animationRef.current = requestAnimationFrame(processFrame);
  };

  const startCameraSession = async (operation) => {
    operationRef.current = operation; setIsCameraActive(true); setStatus('Requesting camera permission…');
    streamRef.current = await startFrontCamera(videoRef.current); setStatus('Loading on-device face detector…');
    landmarkerRef.current = await createFaceLandmarker(); runFrameLoop();
  };
  const startMonitoring = async () => {
    if (thresholdSettings.thresholdMode === 'dynamic' && !calibration) { setShowCalibrationRequired(true); setStatus('Calibration required before monitoring.'); return; }
    try {
      // This user gesture unlocks Web Audio on iPhone before an alert is needed.
      await audioAlertRef.current.prepare();
      temporalEyeStateRef.current.reset(); activeThresholdRef.current = thresholdSettings.thresholdMode === 'manual'
        ? THRESHOLD_PRESETS[thresholdSettings.selectedManualThreshold].value : calibration.threshold;
      warmupRunRef.current = { startedAt: 0, lastSampleAt: 0, samples: [] };
      await startCameraSession('warming'); warmupRunRef.current.startedAt = performance.now();
      setIsMonitoring(true); setWarmupProgress({ elapsed: 0, samples: 0 }); setStatus('Starting monitoring…');
    }
    catch (error) { releaseSession(); setStatus(error.message || 'Could not start the camera.'); setEyeState('ERROR'); }
  };
  const startCalibration = async () => {
    if (operationRef.current !== 'idle') return;
    setShowCalibrationRequired(false); calibrationRunRef.current = { phase: 'openCountdown', phaseStartedAt: 0, lastSampleAt: 0, openSamples: [], closedSamples: [] };
    setCalibrationPhase('openCountdown'); setCalibrationProgress({ phase: 'openCountdown', elapsed: 0, samples: 0 }); setEyeState('CALIBRATING');
    try { await startCameraSession('calibrating'); calibrationRunRef.current.phaseStartedAt = performance.now(); setStatus('Get ready to keep your eyes open normally.'); }
    catch (error) { releaseSession(); setCalibrationPhase('idle'); setStatus(error.message || 'Could not start calibration.'); setEyeState('ERROR'); }
  };

  const stateClass = eyeState === 'EYES CLOSED' ? 'closed' : eyeState === 'EYES OPEN' ? 'open' : eyeState === 'SQUINTING' ? 'squinting' : '';
  const isCountdown = calibrationPhase.endsWith('Countdown'); const isOpenStage = calibrationPhase.startsWith('open');
  const overlaySeconds = calibrationProgress ? Math.max(1, Math.ceil((CALIBRATION_COUNTDOWN_MS - calibrationProgress.elapsed) / 1000)) : 3;
  const progressDuration = isCountdown ? CALIBRATION_COUNTDOWN_MS : CALIBRATION_DURATION_MS;
  const progressPercent = calibrationProgress ? Math.min(100, (calibrationProgress.elapsed / progressDuration) * 100) : 0;

  return <main className="app-shell"><section className="monitor-card" aria-labelledby="app-title">
    <p className="eyebrow">SafeDrive</p><h1 id="app-title">Stay alert. Drive safer.</h1>
    <div className="camera-frame"><video ref={videoRef} className="camera-preview" muted playsInline aria-label="Front camera preview" /><canvas ref={canvasRef} className="landmark-overlay" aria-hidden="true" />
      {!isCameraActive && <div className="camera-placeholder">Camera preview will appear here</div>}
      {showCalibrationRequired && <div className="instruction-overlay required-overlay" role="alert"><span>Calibration required</span><strong>Before SafeDrive can start monitoring, you need to calibrate your eyes.</strong><button onClick={startCalibration}>Start calibration</button></div>}
      {calibrationProgress && <div className="instruction-overlay" aria-live="assertive"><span>{isCountdown ? 'Get ready' : 'Start'}</span>{isCountdown && <strong className="countdown-number">{overlaySeconds}</strong>}<strong className="instruction-action">{isOpenStage ? 'Keep your eyes OPEN normally' : 'Now CLOSE your eyes'}</strong><small>Collecting measurements</small><div className="overlay-progress"><i style={{ width: `${progressPercent}%` }} /></div></div>}
      {warmupProgress && <div className="instruction-overlay" aria-live="assertive"><span>Starting monitoring</span><strong className="countdown-number">{Math.max(1, Math.ceil((WARMUP_MS - warmupProgress.elapsed) / 1000))}</strong><strong className="instruction-action">Keep your eyes open naturally</strong><div className="overlay-progress"><i style={{ width: `${Math.min(100, warmupProgress.elapsed / WARMUP_MS * 100)}%` }} /></div></div>}
    </div>
    <div className={`state-panel ${stateClass}`} aria-live="polite"><span>{isMonitoring ? 'Monitoring active' : 'Current state'}</span><strong>{eyeState === 'EYES OPEN' ? 'EYES OPEN' : eyeState === 'EYES CLOSED' ? 'EYES CLOSED' : eyeState}</strong></div>
    <div className={`calibration-panel ${calibration ? 'calibrated' : ''}`}><span>Calibration</span><strong>{calibration ? 'Ready' : 'Required'}</strong></div>
    <section className="threshold-settings" aria-label="Threshold settings">
      <span>Threshold mode</span>
      <label><input type="radio" name="threshold-mode" checked={thresholdSettings.thresholdMode === 'dynamic'} onChange={() => setThresholdSettings(saveThresholdSettings({ ...thresholdSettings, thresholdMode: 'dynamic' }))} /> Dynamic calibration</label>
      <small>Detect a personalized threshold from this camera.</small>
      <label><input type="radio" name="threshold-mode" checked={thresholdSettings.thresholdMode === 'manual'} onChange={() => setThresholdSettings(saveThresholdSettings({ ...thresholdSettings, thresholdMode: 'manual' }))} /> Manual threshold</label>
      {thresholdSettings.thresholdMode === 'manual' && <div className="preset-list"><span>Choose behavior</span>{Object.entries(THRESHOLD_PRESETS).map(([key, preset]) => <label key={key}><input type="radio" name="threshold-preset" checked={thresholdSettings.selectedManualThreshold === key} onChange={() => setThresholdSettings(saveThresholdSettings({ ...thresholdSettings, selectedManualThreshold: key }))} /> {preset.label}</label>)}</div>}
    </section>
    <p className="status" role="status">{status}</p>
    <button className="monitor-button" disabled={isCameraActive && !isMonitoring} onClick={isMonitoring ? stopMonitoring : startMonitoring}>{isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}</button>
    {thresholdSettings.thresholdMode === 'dynamic' && <button className="secondary-button" disabled={isCameraActive} onClick={startCalibration}>{calibration ? 'Calibrate Again' : 'Calibrate'}</button>}
    {import.meta.env.DEV && <details className="developer-details"><summary>Developer details</summary><small>Mode: {thresholdSettings.thresholdMode} · Open baseline: {calibration?.openBaseline?.toFixed(3) ?? '—'} · Closed baseline: {calibration?.closedValue?.toFixed(3) ?? '—'} · Raw threshold: {calibration?.rawThreshold?.toFixed(3) ?? '—'} · Active threshold: {activeThresholdRef.current?.toFixed(3) ?? calibration?.threshold?.toFixed(3) ?? '—'} · Current eye value: {ear?.toFixed(3) ?? '—'} · State: {eyeState}</small></details>}
  </section></main>;
}
