type SoundSystem = 'thruster' | 'thermal' | 'shieldSensor';
type DialogueSpeaker = 'COMMANDER' | 'CADET';

let audioMuted = false;
let audioContext: AudioContext | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];
let listeningForVoices = false;

let rocketActive = false;
let rocketGainNode: GainNode | null = null;
let rocketFilterNode: BiquadFilterNode | null = null;
let rocketSources: AudioScheduledSourceNode[] = [];
let rocketStopTimer: number | null = null;
let rocketDistanceMeters = 0;
let rocketTargetGain = 0.55;

let marsLandingActive = false;
let marsLandingGainNode: GainNode | null = null;
let marsLandingWindFilter: BiquadFilterNode | null = null;
let marsLandingThrusterFilter: BiquadFilterNode | null = null;
let marsLandingWindGain: GainNode | null = null;
let marsLandingThrusterGain: GainNode | null = null;
let marsLandingThrusterToneGain: GainNode | null = null;
let marsLandingSources: AudioScheduledSourceNode[] = [];
let marsLandingStopTimer: number | null = null;
let marsLandingTargetGain = 0.35;

let marsAmbientActive = false;
let marsAmbientGainNode: GainNode | null = null;
let marsAmbientWindFilter: BiquadFilterNode | null = null;
let marsAmbientWindGain: GainNode | null = null;
let marsAmbientPadGain: GainNode | null = null;
let marsAmbientSources: AudioScheduledSourceNode[] = [];
let marsAmbientStopTimer: number | null = null;
let marsAmbientTargetGain = 0.48;
let lastMarsWindSpeed = 4.2;
let lastMarsDustTau = 0.45;

let victoryGainNode: GainNode | null = null;
let victorySources: OscillatorNode[] = [];

const getAudioContext = (): AudioContext | null => {
  if (audioMuted || typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext ?? (
    window as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
};

const smoothParam = (parameter: AudioParam, target: number, smoothing = 0.12): void => {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  parameter.cancelScheduledValues(now);
  parameter.setTargetAtTime(Math.max(0, target), now, smoothing);
};

const createNoiseBuffer = (context: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBuffer => {
  const frameCount = context.sampleRate * 2;
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  let pink0 = 0;
  let pink1 = 0;
  let pink2 = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const white = Math.random() * 2 - 1;
    if (color === 'brown') {
      brown = (brown + white * 0.02) / 1.02;
      data[index] = brown * 3.2;
    } else if (color === 'pink') {
      pink0 = 0.99765 * pink0 + white * 0.099046;
      pink1 = 0.963 * pink1 + white * 0.2965164;
      pink2 = 0.55 * pink2 + white * 1.0526913;
      data[index] = (pink0 + pink1 + pink2 + white * 0.1848) * 0.08;
    } else {
      data[index] = white * 0.45;
    }
  }
  return buffer;
};

const createNoiseSource = (context: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode => {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, color);
  source.loop = true;
  return source;
};

const stopSourcesAfterFade = (
  sources: AudioScheduledSourceNode[],
  nodes: (AudioNode | null)[],
  delayMilliseconds: number,
): number => window.setTimeout(() => {
  for (const source of sources) {
    try { source.stop(); } catch {}
    source.disconnect();
  }
  for (const node of nodes) node?.disconnect();
}, delayMilliseconds);

const applyContinuousMuteState = (): void => {
  if (rocketGainNode) smoothParam(rocketGainNode.gain, audioMuted ? 0 : rocketTargetGain, 0.08);
  if (marsLandingGainNode) smoothParam(marsLandingGainNode.gain, audioMuted ? 0 : marsLandingTargetGain, 0.08);
  if (marsAmbientGainNode) smoothParam(marsAmbientGainNode.gain, audioMuted ? 0 : marsAmbientTargetGain, 0.08);
  if (victoryGainNode) smoothParam(victoryGainNode.gain, audioMuted ? 0 : 0.72, 0.06);
};

export const setSoundMuted = (muted: boolean): void => {
  audioMuted = muted;
  if (muted) stopDialogue();
  applyContinuousMuteState();
  if (!muted) {
    if (rocketActive) startRocketLaunchSound();
    if (marsLandingActive) startMarsEntryAndRetroSound();
    if (marsAmbientActive) startMarsAmbientSoundscape();
  }
};

const playTone = (
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
  endFrequency?: number,
): void => {
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => {});
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
};

export const playUiClick = (): void => {
  playTone(740, 0.065, 'square', 0.035, 0, 980);
};

export const playPowerShift = (system: SoundSystem): void => {
  const baseFrequency = system === 'thruster' ? 440 : system === 'thermal' ? 330 : 550;
  playTone(baseFrequency, 0.13, 'sine', 0.055, 0, baseFrequency * 1.25);
  playTone(baseFrequency * 2, 0.1, 'triangle', 0.025, 0.055);
};

export const playStationComplete = (): void => {
  playTone(523.25, 0.24, 'sine', 0.055);
  playTone(659.25, 0.25, 'sine', 0.05, 0.08);
  playTone(783.99, 0.34, 'triangle', 0.045, 0.16);
};

export const playSamplePickup = (): void => {
  playTone(659.25, 0.18, 'triangle', 0.05);
  playTone(830.61, 0.24, 'sine', 0.045, 0.07);
  playTone(987.77, 0.32, 'sine', 0.04, 0.15);
};

export const playSafetyAlert = (): void => {
  playTone(392, 0.22, 'sine', 0.05);
  playTone(329.63, 0.34, 'sine', 0.045, 0.2);
  playTone(392, 0.24, 'triangle', 0.025, 0.48);
};

export const stopVictoryFanfare = (): void => {
  if (!victoryGainNode) return;
  smoothParam(victoryGainNode.gain, 0, 0.05);
  const sources = victorySources;
  const gain = victoryGainNode;
  victorySources = [];
  victoryGainNode = null;
  stopSourcesAfterFade(sources, [gain], 240);
};

export const playVictoryFanfare = (): void => {
  stopVictoryFanfare();
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => {});
  victoryGainNode = context.createGain();
  victoryGainNode.gain.value = audioMuted ? 0 : 0.72;
  victoryGainNode.connect(context.destination);
  victorySources = [];
  const notes = [261.63, 329.63, 392, 523.25];
  const delays = [0, 0.18, 0.36, 0.6];

  for (let index = 0; index < notes.length; index += 1) {
    const fundamental = notes[index]!;
    const start = context.currentTime + delays[index]!;
    const duration = index === notes.length - 1 ? 1.6 : 0.52;
    const chord = index === notes.length - 1 ? [fundamental, fundamental * 1.25, fundamental * 1.5] : [fundamental];
    for (const frequency of chord) {
      for (const [type, level] of [['sawtooth', 0.045], ['triangle', 0.032]] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.055);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(victoryGainNode);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
        victorySources.push(oscillator);
      }
    }
  }
};

const refreshVoiceCache = (): void => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
};

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoiceCache();
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoiceCache);
  listeningForVoices = true;
}

export const stopDialogue = (): void => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
};

export const speakDialogue = (text: string, speaker: DialogueSpeaker = 'COMMANDER'): void => {
  if (audioMuted || !text.trim() || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!listeningForVoices) {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoiceCache);
    listeningForVoices = true;
  }
  refreshVoiceCache();
  stopDialogue();
  const englishVoices = cachedVoices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const utterance = new SpeechSynthesisUtterance(text);
  if (speaker === 'COMMANDER') {
    utterance.voice = englishVoices.find((voice) => /Samantha|Victoria|Karen|Google UK English Female|Google US English|Microsoft Zira|Microsoft Aria|female/i.test(voice.name)) ?? englishVoices[0] ?? null;
    utterance.pitch = 0.92;
    utterance.rate = 0.96;
  } else {
    utterance.voice = englishVoices.find((voice) => /child|kid|young/i.test(voice.name)) ?? englishVoices[0] ?? null;
    utterance.pitch = 1.48;
    utterance.rate = 1.08;
  }
  utterance.lang = 'en-US';
  utterance.volume = 0.85;
  window.speechSynthesis.speak(utterance);
};

export const startRocketLaunchSound = (): void => {
  rocketActive = true;
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => {});
  if (rocketStopTimer !== null) {
    window.clearTimeout(rocketStopTimer);
    rocketStopTimer = null;
  }
  if (rocketGainNode && rocketFilterNode) {
    updateRocketLaunchDistance(rocketDistanceMeters);
    return;
  }

  rocketGainNode = context.createGain();
  rocketFilterNode = context.createBiquadFilter();
  rocketGainNode.gain.value = 0;
  rocketFilterNode.type = 'lowpass';
  rocketFilterNode.frequency.value = 1800;
  rocketFilterNode.Q.value = 1.1;
  rocketFilterNode.connect(rocketGainNode);
  rocketGainNode.connect(context.destination);
  rocketSources = [];

  const oscillatorLayers: [number, OscillatorType, number][] = [
    [48, 'sawtooth', 0.16],
    [48, 'triangle', 0.12],
    [110, 'sine', 0.13],
  ];
  for (const [frequency, type, level] of oscillatorLayers) {
    const oscillator = context.createOscillator();
    const layerGain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    layerGain.gain.value = level;
    oscillator.connect(layerGain);
    layerGain.connect(rocketFilterNode);
    oscillator.start();
    rocketSources.push(oscillator);
  }

  const noise = createNoiseSource(context, 'brown');
  const crackleFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  crackleFilter.type = 'bandpass';
  crackleFilter.frequency.value = 950;
  crackleFilter.Q.value = 0.65;
  noiseGain.gain.value = 0.3;
  noise.connect(crackleFilter);
  crackleFilter.connect(noiseGain);
  noiseGain.connect(rocketFilterNode);
  noise.start();
  rocketSources.push(noise);
  updateRocketLaunchDistance(rocketDistanceMeters);
};

export const updateRocketLaunchDistance = (distanceMeters: number): void => {
  rocketDistanceMeters = Math.max(0, distanceMeters);
  rocketTargetGain = Math.max(0.01, 0.55 / (1 + rocketDistanceMeters * 0.018));
  if (rocketGainNode) smoothParam(rocketGainNode.gain, audioMuted ? 0 : rocketTargetGain, 0.16);
  if (rocketFilterNode) {
    const altitudeRatio = Math.min(1, rocketDistanceMeters / 450);
    smoothParam(rocketFilterNode.frequency, 1800 - altitudeRatio * 1660, 0.18);
  }
};

export const stopRocketLaunchSound = (): void => {
  rocketActive = false;
  if (!rocketGainNode) return;
  smoothParam(rocketGainNode.gain, 0, 0.14);
  const sources = rocketSources;
  const gain = rocketGainNode;
  const filter = rocketFilterNode;
  rocketSources = [];
  rocketGainNode = null;
  rocketFilterNode = null;
  rocketStopTimer = stopSourcesAfterFade(sources, [gain, filter], 550);
};

export const startMarsEntryAndRetroSound = (): void => {
  marsLandingActive = true;
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => {});
  if (marsLandingStopTimer !== null) {
    window.clearTimeout(marsLandingStopTimer);
    marsLandingStopTimer = null;
  }
  if (marsLandingGainNode) {
    smoothParam(marsLandingGainNode.gain, audioMuted ? 0 : marsLandingTargetGain, 0.12);
    return;
  }

  marsLandingGainNode = context.createGain();
  marsLandingGainNode.gain.value = 0;
  marsLandingGainNode.connect(context.destination);
  marsLandingWindFilter = context.createBiquadFilter();
  marsLandingWindFilter.type = 'bandpass';
  marsLandingWindFilter.frequency.value = 600;
  marsLandingWindFilter.Q.value = 0.75;
  marsLandingWindGain = context.createGain();
  marsLandingWindGain.gain.value = 0.22;
  marsLandingThrusterFilter = context.createBiquadFilter();
  marsLandingThrusterFilter.type = 'lowpass';
  marsLandingThrusterFilter.frequency.value = 480;
  marsLandingThrusterFilter.Q.value = 0.9;
  marsLandingThrusterGain = context.createGain();
  marsLandingThrusterGain.gain.value = 0.12;
  marsLandingThrusterToneGain = context.createGain();
  marsLandingThrusterToneGain.gain.value = 0.025;

  const noise = createNoiseSource(context, 'pink');
  noise.connect(marsLandingWindFilter);
  marsLandingWindFilter.connect(marsLandingWindGain);
  marsLandingWindGain.connect(marsLandingGainNode);
  noise.connect(marsLandingThrusterFilter);
  marsLandingThrusterFilter.connect(marsLandingThrusterGain);
  marsLandingThrusterGain.connect(marsLandingGainNode);

  const thrusterPulse = context.createOscillator();
  thrusterPulse.frequency.value = 75;
  thrusterPulse.type = 'triangle';
  thrusterPulse.connect(marsLandingThrusterToneGain);
  marsLandingThrusterToneGain.connect(marsLandingGainNode);
  const pulseLfo = context.createOscillator();
  const pulseDepth = context.createGain();
  pulseLfo.frequency.value = 4;
  pulseDepth.gain.value = 0.065;
  pulseLfo.connect(pulseDepth);
  pulseDepth.connect(marsLandingThrusterGain.gain);
  noise.start();
  thrusterPulse.start();
  pulseLfo.start();
  marsLandingSources = [noise, thrusterPulse, pulseLfo];
  smoothParam(marsLandingGainNode.gain, audioMuted ? 0 : marsLandingTargetGain, 0.18);
};

export const updateMarsLandingAudio = (heightAboveGround: number): void => {
  const heightRatio = Math.min(1, Math.max(0, heightAboveGround) / 45);
  const retroIntensity = 1 - heightRatio;
  if (marsLandingWindFilter) smoothParam(marsLandingWindFilter.frequency, 220 + heightRatio * 380, 0.2);
  if (marsLandingWindGain) smoothParam(marsLandingWindGain.gain, 0.08 + heightRatio * 0.2, 0.18);
  if (marsLandingThrusterFilter) smoothParam(marsLandingThrusterFilter.frequency, 260 + retroIntensity * 420, 0.16);
  if (marsLandingThrusterGain) smoothParam(marsLandingThrusterGain.gain, 0.12 + retroIntensity * 0.22, 0.12);
  if (marsLandingThrusterToneGain) smoothParam(marsLandingThrusterToneGain.gain, 0.025 + retroIntensity * 0.08, 0.12);
  marsLandingTargetGain = 0.35 + retroIntensity * 0.2;
  if (marsLandingGainNode) smoothParam(marsLandingGainNode.gain, audioMuted ? 0 : marsLandingTargetGain, 0.12);
};

export const playMarsTouchdownThud = (): void => {
  playTone(65, 0.34, 'triangle', 0.18, 0, 28);
  const context = getAudioContext();
  if (!context) return;
  const noise = createNoiseSource(context, 'white');
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  const start = context.currentTime + 0.055;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.07, start + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(start);
  noise.stop(start + 0.84);
};

export const stopMarsEntryAndRetroSound = (): void => {
  marsLandingActive = false;
  if (!marsLandingGainNode) return;
  smoothParam(marsLandingGainNode.gain, 0, 0.16);
  const sources = marsLandingSources;
  const nodes: (AudioNode | null)[] = [
    marsLandingGainNode,
    marsLandingWindFilter,
    marsLandingThrusterFilter,
    marsLandingWindGain,
    marsLandingThrusterGain,
    marsLandingThrusterToneGain,
  ];
  marsLandingSources = [];
  marsLandingGainNode = null;
  marsLandingWindFilter = null;
  marsLandingThrusterFilter = null;
  marsLandingWindGain = null;
  marsLandingThrusterGain = null;
  marsLandingThrusterToneGain = null;
  marsLandingStopTimer = stopSourcesAfterFade(sources, nodes, 600);
};

export const startMarsAmbientSoundscape = (): void => {
  marsAmbientActive = true;
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => {});
  if (marsAmbientStopTimer !== null) {
    window.clearTimeout(marsAmbientStopTimer);
    marsAmbientStopTimer = null;
  }
  if (marsAmbientGainNode) {
    smoothParam(marsAmbientGainNode.gain, audioMuted ? 0 : marsAmbientTargetGain, 0.2);
    return;
  }

  marsAmbientGainNode = context.createGain();
  marsAmbientGainNode.gain.value = 0;
  marsAmbientGainNode.connect(context.destination);
  marsAmbientWindFilter = context.createBiquadFilter();
  marsAmbientWindFilter.type = 'lowpass';
  marsAmbientWindFilter.frequency.value = 150;
  marsAmbientWindFilter.Q.value = 0.65;
  marsAmbientWindGain = context.createGain();
  marsAmbientWindGain.gain.value = 0.18;
  const wind = createNoiseSource(context, 'brown');
  wind.connect(marsAmbientWindFilter);
  marsAmbientWindFilter.connect(marsAmbientWindGain);
  marsAmbientWindGain.connect(marsAmbientGainNode);

  marsAmbientPadGain = context.createGain();
  marsAmbientPadGain.gain.value = 0.035;
  marsAmbientPadGain.connect(marsAmbientGainNode);
  const padFrequencies = [73.416, 110, 174.614];
  marsAmbientSources = [wind];
  padFrequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.connect(marsAmbientPadGain!);
    oscillator.start();
    marsAmbientSources.push(oscillator);
  });
  const breathingLfo = context.createOscillator();
  const breathingDepth = context.createGain();
  breathingLfo.frequency.value = 0.08;
  breathingDepth.gain.value = 0.012;
  breathingLfo.connect(breathingDepth);
  breathingDepth.connect(marsAmbientPadGain.gain);
  breathingLfo.start();
  marsAmbientSources.push(breathingLfo);
  updateMarsAmbientWind(lastMarsWindSpeed, lastMarsDustTau);
};

export const updateMarsAmbientWind = (windSpeedMps: number, dustTau: number): void => {
  lastMarsWindSpeed = Math.max(0, windSpeedMps);
  lastMarsDustTau = Math.max(0, dustTau);
  const windRatio = Math.min(1, lastMarsWindSpeed / 30);
  if (marsAmbientWindFilter) smoothParam(marsAmbientWindFilter.frequency, 110 + windRatio * 150, 0.5);
  if (marsAmbientWindGain) smoothParam(marsAmbientWindGain.gain, 0.12 + windRatio * 0.24 + Math.min(1, lastMarsDustTau / 4) * 0.06, 0.45);
  marsAmbientTargetGain = 0.48 + windRatio * 0.12;
  if (marsAmbientGainNode) smoothParam(marsAmbientGainNode.gain, audioMuted ? 0 : marsAmbientTargetGain, 0.35);
};

export const stopMarsAmbientSoundscape = (): void => {
  marsAmbientActive = false;
  if (!marsAmbientGainNode) return;
  smoothParam(marsAmbientGainNode.gain, 0, 0.2);
  const sources = marsAmbientSources;
  const nodes: (AudioNode | null)[] = [
    marsAmbientGainNode,
    marsAmbientWindFilter,
    marsAmbientWindGain,
    marsAmbientPadGain,
  ];
  marsAmbientSources = [];
  marsAmbientGainNode = null;
  marsAmbientWindFilter = null;
  marsAmbientWindGain = null;
  marsAmbientPadGain = null;
  marsAmbientStopTimer = stopSourcesAfterFade(sources, nodes, 750);
};
