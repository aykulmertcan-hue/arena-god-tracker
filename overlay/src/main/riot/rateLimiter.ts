// Dual-window sliding rate limiter, ported from the Python backend.
// Honors e.g. 20 req/s AND 100 req/120s simultaneously (takes the stricter
// wait). The pure core is time-injected for testability.

export type Limit = [maxRequests: number, perSeconds: number];

export class SlidingWindowLimiter {
  private timestamps: number[] = [];
  constructor(private limits: Limit[]) {}

  private prune(now: number): void {
    const maxWindow = Math.max(...this.limits.map(([, per]) => per));
    while (this.timestamps.length && this.timestamps[0] <= now - maxWindow) {
      this.timestamps.shift();
    }
  }

  // seconds to wait until a slot is free (0 if available now). `now` in seconds.
  timeUntilAvailable(now: number): number {
    this.prune(now);
    let wait = 0;
    for (const [maxReq, per] of this.limits) {
      const relevant = this.timestamps.filter((t) => t > now - per);
      if (relevant.length >= maxReq) {
        wait = Math.max(wait, relevant[0] + per - now);
      }
    }
    return wait;
  }

  record(now: number): void {
    this.timestamps.push(now);
  }
}

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const monotonic = () => Date.now() / 1000;

export class AsyncRateLimiter {
  private core: SlidingWindowLimiter;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    limits: Limit[],
    private clock: () => number = monotonic,
    private sleepFn: (s: number) => Promise<unknown> = sleep,
  ) {
    this.core = new SlidingWindowLimiter(limits);
  }

  // Serialized: each caller waits its turn, then waits out any window.
  async acquire(): Promise<void> {
    const prev = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((r) => (release = r));
    await prev;
    try {
      for (;;) {
        const now = this.clock();
        const wait = this.core.timeUntilAvailable(now);
        if (wait <= 0) {
          this.core.record(now);
          return;
        }
        await this.sleepFn(wait);
      }
    } finally {
      release();
    }
  }

  async sleep(seconds: number): Promise<void> {
    await this.sleepFn(seconds);
  }
}
