import { MUSIC, MUSIC_MIX, type MusicTheme } from '../data/music';

type ThemeId = keyof typeof MUSIC;

const semitone = (root: number, n: number): number => root * 2 ** (n / 12);

/**
 * Procedural ambient music: a filtered drone and a sparse plucked arpeggio,
 * scheduled slightly ahead of time on the shared AudioContext. Notes come
 * from a fixed-seed LCG (no Math.random), so a theme always "composes" the
 * same way.
 */
export class Music {
  private out: GainNode | null = null;
  private drone: { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private theme: ThemeId | null = null;
  private wanted: ThemeId = 'title';
  private nextStep = 0;
  private step = 0;
  private seed = 1;
  private volume = 0.5;
  private muted = false;
  private intensity = 0;

  constructor(private readonly ctx: () => AudioContext | null) {
    window.setInterval(() => this.tick(), 100);
  }

  play(theme: ThemeId): void {
    this.wanted = theme;
  }

  /** 0 = calm exploration, 1 = sealed-room fight. */
  setIntensity(v: number): void {
    this.intensity = v;
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyLevel();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyLevel();
  }

  private applyLevel(): void {
    const ctx = this.ctx();
    if (!ctx || !this.out) return;
    const level = this.muted ? 0 : MUSIC_MIX.level * this.volume;
    this.out.gain.setTargetAtTime(level, ctx.currentTime, 0.3);
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
    return this.seed / 4294967296;
  }

  private tick(): void {
    const ctx = this.ctx();
    if (!ctx || ctx.state !== 'running') return;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      // A short feedback delay gives the plucks some space.
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.33;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      this.out.connect(ctx.destination);
      this.out.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(ctx.destination);
      this.applyLevel();
    }
    if (this.theme !== this.wanted) this.switchTheme(ctx, this.wanted);
    const theme = this.theme ? MUSIC[this.theme] : null;
    if (!theme) return;
    const stepDur = 60 / theme.bpm;
    if (this.nextStep < ctx.currentTime) this.nextStep = ctx.currentTime + 0.05;
    while (this.nextStep < ctx.currentTime + 0.3) {
      this.scheduleStep(ctx, theme, this.nextStep, stepDur);
      this.nextStep += stepDur;
      this.step++;
    }
  }

  private switchTheme(ctx: AudioContext, id: ThemeId): void {
    const out = this.out;
    if (!out) return;
    const t = ctx.currentTime;
    if (this.drone) {
      const old = this.drone;
      old.gain.gain.setTargetAtTime(0, t, MUSIC_MIX.fade / 3);
      for (const o of old.oscs) o.stop(t + MUSIC_MIX.fade * 2);
    }
    const theme = MUSIC[id];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.5, t, MUSIC_MIX.fade / 3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme.warmth;
    filter.connect(gain);
    gain.connect(out);
    const oscs = [0, 7, 12].map((n, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = semitone(theme.root, n);
      o.detune.value = (i - 1) * 6;
      o.connect(filter);
      o.start(t);
      return o;
    });
    // Slow breathing on the filter.
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = theme.warmth * 0.4;
    lfo.connect(depth);
    depth.connect(filter.frequency);
    lfo.start(t);
    oscs.push(lfo);
    this.drone = { oscs, gain, filter };
    this.theme = id;
    this.seed = id.length * 7919 + 1;
    this.step = 0;
  }

  private scheduleStep(ctx: AudioContext, theme: MusicTheme, t: number, dur: number): void {
    const out = this.out;
    if (!out) return;
    // Combat pulse on the root, every other step.
    if (this.intensity > 0 && this.step % 2 === 0) {
      this.pluck(
        ctx,
        out,
        'square',
        semitone(theme.root, 12),
        t,
        dur * 0.4,
        0.05 * this.intensity * MUSIC_MIX.combatPulse,
      );
    }
    if (this.rand() > theme.density) return;
    const n = theme.scale[Math.floor(this.rand() * theme.scale.length)] ?? 0;
    const octave = this.rand() < 0.3 ? 24 : 12;
    this.pluck(ctx, out, theme.lead, semitone(theme.root, n + octave), t, dur * 1.8, 0.09);
  }

  private pluck(
    ctx: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    freq: number,
    t: number,
    dur: number,
    peak: number,
  ): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
