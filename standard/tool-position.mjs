import { parseStatus } from '../src/protocol.js';

// Display-only state. Never turn a missing coordinate or unknown unit into zero.
export class ToolPosition {
  constructor() { this.reset(); }
  reset() { this.status = {}; this.units = null; this.wcs = ''; this.received = -Infinity; }
  accept(line, now) {
    if (/^(?:Grbl |FluidNC |ALARM:)/.test(line)) { this.reset(); return; }
    const unit = line.match(/^\$\/report_inches=(true|false)$/i);
    if (unit) {
      const next = unit[1].toLowerCase() === 'true' ? 25.4 : 1;
      if (this.units !== next) { this.status = {}; this.received = -Infinity; }
      this.units = next;
    }
    const modal = line.match(/^\[GC:([^\]]+)\]$/);
    if (modal) {
      const wcs = modal[1].split(/\s+/).find(word => /^G5[4-9]$/.test(word)) || '';
      if (this.wcs !== wcs) { this.status = {}; this.received = -Infinity; }
      this.wcs = wcs;
    }
    if (!line.startsWith('<')) return;
    const fields = [...line.matchAll(/\|(MPos|WPos|WCO):([^|>]+)/g)];
    if (!fields.some(f => ['MPos','WPos'].includes(f[1])) || fields.some(f => f[2].split(',').length < 3 || f[2].split(',').some(v => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)))) {
      this.received = -Infinity; return;
    }
    const status = parseStatus(line, this.status);
    if (status) { this.status = status; this.received = now; }
  }
  position(pathWcs, now) {
    if (now - this.received > 3000 || !this.units || !pathWcs || this.wcs !== pathWcs) return null;
    const values = this.status.WPos?.slice(0,3);
    return values?.length === 3 && values.every(Number.isFinite) ? values.map(v => v * this.units) : null;
  }
}
