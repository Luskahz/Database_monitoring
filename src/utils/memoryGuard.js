import { RAM_HIGH_MB, RAM_LOW_MB, RAM_GUARD_INTERVAL_MS, ADAPTIVE_RAM_GUARD } from '../../config/index.js';

const MB = 1024 * 1024;

export class MemoryGuard {
  constructor() {
    this.state = 'NORMAL';
    this.listeners = new Set();
    this.timer = null;
  }
  start() {
    if (!ADAPTIVE_RAM_GUARD || this.timer) return;
    this.timer = setInterval(() => {
      const rssMB = process.memoryUsage().rss / MB;
      if (this.state === 'NORMAL' && rssMB > RAM_HIGH_MB) {
        this.state = 'HIGH';
        this._emit();
      } else if (this.state === 'HIGH' && rssMB < RAM_LOW_MB) {
        this.state = 'NORMAL';
        this._emit();
      }
    }, RAM_GUARD_INTERVAL_MS);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  onChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  _emit() {
    for (const cb of this.listeners) cb(this.state);
  }
  isHigh() {
    return ADAPTIVE_RAM_GUARD && this.state === 'HIGH';
  }
  async waitForNormal() {
    if (!this.isHigh()) return;
    await new Promise(resolve => {
      const off = this.onChange(s => {
        if (s === 'NORMAL') {
          off();
          resolve();
        }
      });
    });
  }
}

export const memoryGuard = new MemoryGuard();
