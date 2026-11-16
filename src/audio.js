import { BLOCKS } from './blocks.js';

const groundTones = {
  grass: [820, 0.27, 'lowpass', 270],
  earth: [470, 0.38, 'lowpass', 175],
  sand: [1280, 0.58, 'bandpass', 220],
  stone: [930, 1.10, 'bandpass', 154],
  wood: [740, 0.95, 'bandpass', 196],
  glass: [2310, 1.84, 'bandpass', 780],
  water: [560, 1.15, 'lowpass', 192],
};

const safeVolume = value => Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));

export class GameAudio {
  constructor(volume = 0.7) {
    this._volume = safeVolume(volume);
    this.context = null;
    this.bus = null;
    this.wind = null;
    this.noiseBuffer = null;
    this.lastFootstep = -1;
    this.lastHit = -1;
    this.ambience = { enabled: false, outdoors: 1, night: 0, underwater: false };
  }

  get volume() {
    return this._volume;
  }

  set volume(value) {
    this._volume = safeVolume(value);
    if (this.bus) this.bus.gain.setTargetAtTime(this._volume * 0.8, this.context.currentTime, 0.08);
  }

  unlock() {
    if (!this.context) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      try {
        this.context = new Audio();
        this.bus = this.context.createGain();
        this.bus.gain.value = this._volume * 0.8;
        this.bus.connect(this.context.destination);
        this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      } catch {
        this.context?.close().catch(() => {});
        this.context = null;
        this.bus = null;
        return;
      }
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  setEnvironment({ enabled = true, outdoors = 1, night = 0, underwater = false } = {}) {
    this.ambience = { enabled, outdoors, night, underwater };
    if (!this.context || (this.context.state !== 'running' && !this.wind)) return;
    if (!this.wind && enabled) this.createWind();
    if (!this.wind) return;

    const depth = safeVolume(outdoors);
    const dark = safeVolume(night);
    const time = this.context.currentTime;
    const amount = enabled ? (underwater ? 0.20 : 0.072 + depth * 0.107 + dark * 0.018) : 0;
    this.wind.gain.gain.setTargetAtTime(amount, time, 0.55);
    this.wind.filter.frequency.setTargetAtTime(underwater ? 72 : 160 + depth * (1 - dark * 0.38) * 310, time, 0.65);
  }

  createWind() {
    const ctx = this.context;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus);
    src.start();
    this.wind = { src, filter, gain };
  }

  note(frequency, endFrequency, length, loudness, wave = 'sine', delay = 0) {
    const ctx = this.context;
    const time = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, time);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, time + length);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(loudness, time + Math.min(length * 0.23, 0.028));
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    osc.connect(gain);
    gain.connect(this.bus);
    osc.start(time);
    osc.stop(time + length + 0.01);
  }

  noise(frequency, length, loudness, type = 'lowpass', resonance = 0.7, delay = 0) {
    const ctx = this.context;
    const time = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = this.noiseBuffer;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, time);
    filter.frequency.exponentialRampToValueAtTime(frequency * 0.56, time + length);
    filter.Q.value = resonance;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(loudness, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus);
    src.start(time, Math.random() * 1.1);
    src.stop(time + length + 0.01);
  }

  play(name, variant) {
    if (!this.context || this.context.state !== 'running' || this._volume <= 0) return;
    if (!this.wind && this.ambience.enabled) this.setEnvironment(this.ambience);
    const material = typeof variant === 'number' ? BLOCKS[variant]?.sound : variant;
    const [frequency, q, filter, thump] = groundTones[material] || groundTones.grass;
    const softness = 0.9 + Math.random() * 0.22;
    const pitch = frequency * softness;
    const time = this.context.currentTime;
    switch (name) {
      case 'step':
      case 'footstep':
        if (time - this.lastFootstep < 0.095) return;
        this.lastFootstep = time;
        this.noise(pitch, 0.13, 0.11, filter, q);
        this.note(thump * softness, thump * 0.48, 0.075, 0.027);
        break;
      case 'dig':
      case 'mine':
        if (time - this.lastHit < 0.13) return;
        this.lastHit = time;
        this.noise(pitch * 1.52, 0.09, 0.14, filter, q);
        this.note(thump * 1.6, thump * 0.75, 0.071, 0.029, 'triangle');
        break;
      case 'break':
        this.noise(pitch * 1.21, 0.25, 0.26, filter, q);
        this.noise(pitch * 2.75, 0.14, 0.09, 'bandpass', 0.43, 0.025);
        this.note(thump, thump * 0.41, 0.13, 0.075, 'triangle');
        break;
      case 'place':
        this.noise(pitch * 0.91, 0.17, 0.18, filter, q);
        this.note(thump * 1.07, thump * 0.53, 0.12, 0.10, 'triangle');
        break;
      case 'land':
        this.noise(pitch * 0.78, 0.17, 0.18, filter, q);
        this.note(121, 47, 0.14, 0.067);
        break;
      case 'swim':
      case 'splash':
        this.noise(500, 0.29, 0.24, 'lowpass', 1.6);
        this.note(125 + Math.random() * 40, 355, 0.18, 0.046);
        break;
      case 'jump':
        this.noise(pitch * 0.82, 0.10, 0.09, filter, q);
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(730 + i * 340, 0.11, 0.12, 'bandpass', 0.88, 0.08 * i);
        break;
      case 'hurt':
      case 'death':
        this.note(180, 44, 0.33, 0.16, 'triangle');
        this.noise(340, 0.24, 0.20, 'lowpass', 0.7);
        break;
      case 'attack':
        this.noise(1040, 0.16, 0.23, 'bandpass', 0.5);
        this.note(236, 88, 0.11, 0.066, 'triangle');
        break;
      case 'collect':
      case 'pickup':
        this.note(680, 920, 0.11, 0.05, 'sine');
        break;
      case 'craft':
      case 'success':
      case 'achievement':
        this.note(392, 416, 0.33, 0.087, 'triangle');
        this.note(523, 540, 0.32, 0.075, 'sine', 0.105);
        this.note(659, 671, 0.40, 0.086, 'sine', 0.20);
        if (name !== 'craft') this.note(784, 795, 0.45, 0.085, 'sine', 0.32);
        break;
      case 'open':
      case 'inventory':
      case 'click':
      case 'select':
        this.note(427, 294, 0.09, 0.044, 'triangle');
        break;
      default:
        break;
    }
  }

  suspend() {
    this.context?.suspend().catch(() => {});
  }
}
