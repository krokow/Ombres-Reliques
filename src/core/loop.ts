export interface ClockAdvance {
  /** Number of fixed simulation steps to run this frame. */
  steps: number;
  /** Interpolation factor in [0, 1) between the previous and current sim state. */
  alpha: number;
}

/**
 * Fixed-timestep accumulator ("Fix your timestep"). The simulation always
 * advances by `stepMs`, so gameplay is identical at 30, 60 or 144 FPS.
 */
export class FixedStepClock {
  readonly stepMs: number;
  readonly stepSeconds: number;
  private accumulator = 0;

  constructor(
    hz: number,
    /** Cap to avoid the spiral of death after a tab switch or a long GC pause. */
    private readonly maxStepsPerFrame = 5,
  ) {
    this.stepMs = 1000 / hz;
    this.stepSeconds = 1 / hz;
  }

  advance(elapsedMs: number): ClockAdvance {
    this.accumulator += Math.max(0, elapsedMs);
    let steps = Math.floor(this.accumulator / this.stepMs);
    if (steps > this.maxStepsPerFrame) {
      // Drop the backlog instead of trying to catch up.
      steps = this.maxStepsPerFrame;
      this.accumulator %= this.stepMs;
    } else {
      this.accumulator -= steps * this.stepMs;
    }
    return { steps, alpha: this.accumulator / this.stepMs };
  }

  reset(): void {
    this.accumulator = 0;
  }
}

/** Rolling average FPS over a fixed time window. */
export class FpsCounter {
  private frames = 0;
  private elapsed = 0;
  fps = 0;

  constructor(private readonly windowMs = 500) {}

  frame(elapsedMs: number): void {
    this.frames++;
    this.elapsed += elapsedMs;
    if (this.elapsed >= this.windowMs) {
      this.fps = (this.frames * 1000) / this.elapsed;
      this.frames = 0;
      this.elapsed = 0;
    }
  }
}

export interface LoopCallbacks {
  /** Called once per fixed step. */
  update(): void;
  /** Called once per animation frame. `frameMs` is real elapsed time. */
  render(alpha: number, frameMs: number): void;
}

/** Drives a FixedStepClock from requestAnimationFrame. Returns a stop function. */
export function runLoop(clock: FixedStepClock, callbacks: LoopCallbacks): () => void {
  let last = performance.now();
  let handle = 0;
  const frame = (now: number): void => {
    const elapsed = now - last;
    last = now;
    const { steps, alpha } = clock.advance(elapsed);
    for (let i = 0; i < steps; i++) callbacks.update();
    callbacks.render(alpha, elapsed);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(handle);
}
