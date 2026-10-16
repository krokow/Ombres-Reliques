import { MUSIC, MUSIC_MIX, type MusicTheme } from '../data/music';

type ThemeId = keyof typeof MUSIC;

const semitone = (root: number, n: number): number => root * 2 ** (n / 12);

/**
 * Procedural ambient music: overlapping pad chords with slow attacks, a few
 * soft bell notes taken from the chord (always consonant), scheduled a bit
 * ahead on the shared AudioContext. Fixed-seed LCG, no Math.random.
 */
export class Music {
  private out: GainNode | null = null;
  /** Theme currently scheduled, and the one asked for. */
  private theme: ThemeId | null = null;
  private wanted: ThemeId = 'title';
  private nextChord = 0;
  private chord = 0;
  private seed = 1;
  private volume = 0.35;
  private muted = false;
  private intensity = 0;

  constructor(private readonly ctx: () => AudioContext | null) {
    window.setInterval(() => this.tick(), 200);
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
    this.out.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
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
      // Gentle low-pass on the whole mix: nothing shrill, ever.
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      this.out.connect(tone);
      tone.connect(ctx.destination);
      this.applyLevel();
    }
    if (this.theme !== this.wanted) {
      // New theme: start on its first chord, after a short gap for the old pads to fade.
      this.theme = this.wanted;
      this.chord = 0;
      this.seed = this.theme.length * 7919 + 1;
      this.nextChord = Math.max(this.nextChord, ctx.currentTime + 0.3);
    }
    const theme = MUSIC[this.theme];
    while (this.nextChord < ctx.currentTime + 0.5) {
      this.scheduleChord(ctx, theme, this.nextChord);
      this.nextChord += theme.chordSeconds;
      this.chord++;
    }
  }

  private scheduleChord(ctx: AudioContext, theme: MusicTheme, t: number): void {
    const out = this.out;
    if (!out) return;
    const notes = theme.chords[this.chord % theme.chords.length] ?? [0];
    const dur = theme.chordSeconds;
    // Pad: each chord tone as two slightly detuned soft voices, long fade in/out.
    for (const n of notes) {
      for (const detune of [-5, 5]) {
        this.voice(
          ctx,
          out,
          'triangle',
          semitone(theme.root, n),
          detune,
          t,
          dur * 1.35,
          0.07,
          dur * 0.4,
          theme.warmth,
        );
      }
    }
    // Bass: the chord root an octave down.
    this.voice(
      ctx,
      out,
      'sine',
      semitone(theme.root, (notes[0] ?? 0) - 12),
      0,
      t,
      dur * 1.2,
      0.12,
      1.2,
      400,
    );
    // A few bell notes from the chord, an octave or two up.
    for (let beat = 0; beat < 4; beat++) {
      if (this.rand() > theme.bellChance) continue;
      const n = notes[Math.floor(this.rand() * notes.length)] ?? 0;
      const up = this.rand() < 0.5 ? 12 : 24;
      this.voice(
        ctx,
        out,
        'sine',
        semitone(theme.root, n + up),
        0,
        t + (beat * dur) / 4,
        2.2,
        0.05,
        0.01,
        3000,
      );
    }
    // Sealed-room fight: a soft heartbeat on the low root.
    if (this.intensity > 0) {
      const beats = Math.round(dur / 0.75);
      for (let i = 0; i < beats; i++) {
        this.thump(
          ctx,
          out,
          semitone(theme.root, -12),
          t + i * 0.75,
          0.25 * this.intensity * MUSIC_MIX.combatPulse,
        );
      }
    }
  }

  private voice(
    ctx: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    freq: number,
    detune: number,
    t: number,
    dur: number,
    peak: number,
    attack: number,
    cutoff: number,
  ): void {
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.01, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private thump(ctx: AudioContext, out: AudioNode, freq: number, t: number, peak: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }
}
