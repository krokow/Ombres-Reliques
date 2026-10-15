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
  | 'death'
  | 'veil'
  | 'ambush'
  | 'blink'
  | 'ultStart'
  | 'ultFail'
  | 'explosion'
  | 'shoot'
  | 'summon'
  | 'tick'
  | 'doors'
  | 'cleared'
  | 'secret'
  | 'descend'
  | 'switch'
  | 'ko'
  | 'revive'
  | 'block'
  | 'parry'
  | 'quake'
  | 'frost'
  | 'fire'
  | 'bolt'
  | 'levelUp'
  | 'pick'
  | 'coin'
  | 'chest'
  | 'buy'
  | 'relicGet'
  | 'potion'
  | 'thunder';

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
        if (ev.dot) return this.play('tick');
        return this.play(ev.byPlayer ? (ev.crit ? 'crit' : 'hit') : 'hurt');
      case 'veil':
        return this.play('veil');
      case 'ambush':
        return this.play('ambush');
      case 'blink':
        return this.play('blink');
      case 'ultStart':
        return this.play('ultStart');
      case 'ultFail':
        return this.play('ultFail');
      case 'explosion':
        return this.play('explosion');
      case 'enemyShoot':
        return this.play('shoot');
      case 'summon':
        return this.play('summon');
      case 'doorsLocked':
        return this.play('doors');
      case 'roomCleared':
      case 'stairsOpen':
        return this.play('cleared');
      case 'secretFound':
        return this.play('secret');
      case 'floor':
        return this.play('descend');
      case 'switch':
        return this.play('switch');
      case 'levelUp':
        return this.play('levelUp');
      case 'cardTaken':
      case 'talentTaken':
      case 'equip':
        return this.play('pick');
      case 'pickup':
        return this.play(ev.kind === 'gold' ? 'coin' : 'pick');
      case 'chestOpen':
        return this.play('chest');
      case 'purchase':
        return this.play('buy');
      case 'relic':
      case 'altarUsed':
        return this.play('relicGet');
      case 'consumable':
        if (ev.id === 'potion') return this.play('potion');
        if (ev.id === 'thunder') return this.play('thunder');
        return;
      case 'ko':
        return this.play('ko');
      case 'revive':
        return this.play('revive');
      case 'block':
        return this.play('block');
      case 'parry':
        return this.play('parry');
      case 'shockwave':
        return this.play(ev.color === 'frost' ? 'frost' : 'quake');
      case 'taunt':
        return this.play('quake');
      case 'cast':
        if (ev.spell === 'fire') return this.play('fire');
        if (ev.spell === 'frost') return this.play('frost');
        if (ev.spell === 'meteor') return;
        return this.play('bolt');
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
      case 'veil':
        this.noiseSweep(t, 0.5, 300, 1200, 0.35, 'lowpass');
        break;
      case 'ambush':
        this.tone(t, 'triangle', 660, 990, 0.12, 0.18);
        break;
      case 'blink':
        this.tone(t, 'square', 1800, 300, 0.08, 0.15);
        this.noiseSweep(t, 0.08, 6000, 2000, 0.25, 'highpass');
        break;
      case 'ultStart':
        this.tone(t, 'sawtooth', 90, 45, 0.5, 0.3);
        this.tone(t, 'sine', 440, 880, 0.25, 0.15);
        break;
      case 'ultFail':
        this.tone(t, 'square', 150, 140, 0.12, 0.1);
        break;
      case 'explosion':
        this.tone(t, 'sine', 120, 30, 0.5, 0.9);
        this.noiseSweep(t, 0.6, 2500, 120, 0.7, 'lowpass');
        break;
      case 'shoot':
        this.tone(t, 'triangle', 500, 200, 0.08, 0.15);
        break;
      case 'summon':
        this.tone(t, 'sine', 220, 330, 0.4, 0.15);
        this.tone(t + 0.1, 'sine', 233, 349, 0.4, 0.12);
        break;
      case 'doors':
        this.tone(t, 'square', 80, 60, 0.4, 0.3);
        this.noiseSweep(t, 0.4, 800, 200, 0.4, 'lowpass');
        break;
      case 'cleared':
        this.tone(t, 'triangle', 523, 523, 0.12, 0.15);
        this.tone(t + 0.1, 'triangle', 659, 659, 0.12, 0.15);
        this.tone(t + 0.2, 'triangle', 784, 784, 0.25, 0.15);
        break;
      case 'secret':
        this.noiseSweep(t, 0.4, 3000, 300, 0.4, 'lowpass');
        this.tone(t + 0.2, 'sine', 880, 1760, 0.3, 0.15);
        break;
      case 'descend':
        this.tone(t, 'sine', 440, 110, 0.8, 0.25);
        break;
      case 'switch':
        this.tone(t, 'triangle', 330, 660, 0.12, 0.2);
        this.noiseSweep(t, 0.15, 800, 4000, 0.2, 'bandpass');
        break;
      case 'ko':
        this.tone(t, 'sawtooth', 260, 60, 0.6, 0.3);
        break;
      case 'revive':
        this.tone(t, 'sine', 392, 784, 0.4, 0.2);
        this.tone(t + 0.15, 'sine', 523, 1046, 0.4, 0.15);
        break;
      case 'block':
        this.tone(t, 'square', 900, 500, 0.06, 0.15);
        break;
      case 'parry':
        this.tone(t, 'triangle', 1800, 1200, 0.25, 0.3);
        this.tone(t, 'triangle', 2700, 2400, 0.2, 0.15);
        break;
      case 'quake':
        this.tone(t, 'sine', 90, 35, 0.45, 0.8);
        this.noiseSweep(t, 0.4, 1200, 100, 0.5, 'lowpass');
        break;
      case 'frost':
        this.noiseSweep(t, 0.3, 6000, 2500, 0.25, 'highpass');
        this.tone(t, 'sine', 1500, 1900, 0.2, 0.08);
        break;
      case 'fire':
        this.noiseSweep(t, 0.6, 400, 1500, 0.4, 'bandpass');
        break;
      case 'bolt':
        this.tone(t, 'sine', 900, 1500, 0.07, 0.12);
        break;
      case 'levelUp':
        this.tone(t, 'triangle', 523, 523, 0.1, 0.18);
        this.tone(t + 0.08, 'triangle', 659, 659, 0.1, 0.18);
        this.tone(t + 0.16, 'triangle', 784, 784, 0.1, 0.18);
        this.tone(t + 0.24, 'triangle', 1046, 1046, 0.3, 0.2);
        break;
      case 'pick':
        this.tone(t, 'sine', 660, 990, 0.15, 0.2);
        break;
      case 'coin':
        this.tone(t, 'square', 1320, 1760, 0.05, 0.06);
        break;
      case 'chest':
        this.tone(t, 'triangle', 392, 392, 0.1, 0.2);
        this.tone(t + 0.1, 'triangle', 523, 523, 0.1, 0.2);
        this.tone(t + 0.2, 'triangle', 659, 659, 0.1, 0.2);
        this.tone(t + 0.3, 'triangle', 784, 784, 0.3, 0.2);
        break;
      case 'buy':
        this.tone(t, 'square', 988, 988, 0.06, 0.1);
        this.tone(t + 0.07, 'square', 1319, 1319, 0.12, 0.1);
        break;
      case 'relicGet':
        this.tone(t, 'sine', 330, 660, 0.5, 0.2);
        this.tone(t + 0.1, 'sine', 495, 990, 0.5, 0.15);
        break;
      case 'potion':
        this.noiseSweep(t, 0.3, 400, 1600, 0.25, 'bandpass');
        this.tone(t + 0.1, 'sine', 600, 900, 0.2, 0.15);
        break;
      case 'thunder':
        this.noiseSweep(t, 0.7, 4000, 150, 0.8, 'lowpass');
        this.tone(t, 'sawtooth', 120, 40, 0.6, 0.4);
        break;
      case 'tick':
        this.tone(t, 'sine', 300, 250, 0.04, 0.08);
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
