import type { GameEvent } from '../game/events';

type SoundName =
  | 'swing'
  | 'swingHeavy'
  | 'hit'
  | 'crit'
  | 'kill'
  | 'dash'
  | 'throw'
  | 'hurt'
  | 'refund'
  | 'wall'
  | 'death';

/**
 * Procedural sound effects via Web Audio: oscillators + filtered noise, no
 * audio files. The AudioContext is created lazily on the first user gesture
 * (browser autoplay policy).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private noiseOffset = 0;
  muted = false;

  constructor(volume = 0.35) {
    const unlock = (): void => {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = volume;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        // Fixed-seed LCG: no Math.random anywhere in the codebase, by convention.
        let s = 12345;
        for (let i = 0; i < len; i++) {
          s = (Math.imul(s, 1103515245) + 12345) >>> 0;
          data[i] = (s / 4294967296) * 2 - 1;
        }
      }
      void this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  onEvent(ev: GameEvent): void {
    switch (ev.type) {
      case 'swing':
        return this.play(ev.combo === 2 ? 'swingHeavy' : 'swing');
      case 'hit':
        return this.play(ev.byPlayer ? (ev.crit ? 'crit' : 'hit') : 'hurt');
      case 'kill':
        return this.play('kill');
      case 'dash':
        return this.play('dash');
      case 'throw':
        return this.play('throw');
      case 'dashRefund':
        return this.play('refund');
      case 'projectileWall':
        return this.play('wall');
      case 'playerDeath':
        return this.play('death');
      default:
        return;
    }
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'swing':
        this.noiseSweep(t, 0.09, 2600, 900, 0.35, 'bandpass');
        break;
      case 'swingHeavy':
        this.noiseSweep(t, 0.16, 1800, 400, 0.5, 'bandpass');
        break;
      case 'hit':
        this.tone(t, 'sine', 170, 55, 0.12, 0.7);
        this.noiseSweep(t, 0.05, 4000, 1500, 0.3, 'highpass');
        break;
      case 'crit':
        this.tone(t, 'sine', 200, 50, 0.16, 0.8);
        this.tone(t, 'triangle', 1400, 900, 0.12, 0.25);
        this.noiseSweep(t, 0.07, 5000, 2000, 0.35, 'highpass');
        break;
      case 'kill':
        this.tone(t, 'square', 520, 520, 0.07, 0.12);
        this.tone(t + 0.06, 'square', 780, 780, 0.12, 0.12);
        this.noiseSweep(t, 0.25, 1200, 200, 0.4, 'lowpass');
        break;
      case 'dash':
        this.noiseSweep(t, 0.14, 600, 4500, 0.35, 'bandpass');
        break;
      case 'throw':
        this.tone(t, 'triangle', 1800, 2600, 0.06, 0.15);
        break;
      case 'hurt':
        this.tone(t, 'sawtooth', 220, 80, 0.2, 0.35);
        break;
      case 'refund':
        this.tone(t, 'sine', 880, 1320, 0.09, 0.2);
        break;
      case 'wall':
        this.tone(t, 'square', 1200, 600, 0.03, 0.08);
        break;
      case 'death':
        this.tone(t, 'sawtooth', 300, 40, 0.9, 0.4);
        this.noiseSweep(t, 0.8, 1500, 100, 0.4, 'lowpass');
        break;
    }
  }

  private envelope(t: number, duration: number, peak: number): GainNode {
    const ctx = this.ctx as AudioContext;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(this.master as GainNode);
    return g;
  }

  private tone(
    t: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    peak: number,
  ): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    osc.connect(this.envelope(t, duration, peak));
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noiseSweep(
    t: number,
    duration: number,
    from: number,
    to: number,
    peak: number,
    type: BiquadFilterType,
  ): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + duration);
    src.connect(filter);
    filter.connect(this.envelope(t, duration, peak));
    // Rotate through the buffer so consecutive noises don't sound identical.
    this.noiseOffset = (this.noiseOffset + 0.137) % 0.5;
    src.start(t, this.noiseOffset);
    src.stop(t + duration + 0.02);
  }
}
