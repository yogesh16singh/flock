// now/sleep are injected in tests so we don't actually wait a minute
export class Pace {
  private hits: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async take(): Promise<void> {
    if (this.limit <= 0) return;
    for (;;) {
      const time = this.now();
      this.hits = this.hits.filter((hit) => time - hit < this.windowMs);
      if (this.hits.length < this.limit) {
        this.hits.push(time);
        return;
      }
      const wait = this.windowMs - (time - this.hits[0]) + 5;
      await this.sleep(Math.max(wait, 5));
    }
  }
}
