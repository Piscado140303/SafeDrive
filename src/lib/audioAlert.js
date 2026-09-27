/** A single reusable Web Audio alarm. Preparing it in a button gesture helps iOS permit later playback. */
export function createAudioAlert() {
  let context; let oscillator; let gain; let active = false;
  const ensureContext = async () => {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state !== 'running') await context.resume();
  };
  return {
    async prepare() { await ensureContext(); },
    async start() {
      if (active) return;
      await ensureContext();
      gain = context.createGain(); gain.gain.value = 0.16; gain.connect(context.destination);
      oscillator = context.createOscillator(); oscillator.type = 'square'; oscillator.frequency.value = 880; oscillator.connect(gain); oscillator.start();
      active = true;
    },
    stop() { if (!active) return; oscillator.stop(); oscillator.disconnect(); gain.disconnect(); oscillator = null; gain = null; active = false; },
    get active() { return active; },
  };
}
