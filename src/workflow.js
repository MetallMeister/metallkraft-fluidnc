export class Preparation {
  constructor() { this.checks = new Set(); this.revision = 0; this.context = ''; }
  reset() { this.checks.clear(); this.revision++; }
  updateContext(context) { if (context !== this.context) { this.context = context; this.reset(); } }
  set(key, value) { if (!['path', 'fixture', 'origin'].includes(key)) return; value ? this.checks.add(key) : this.checks.delete(key); this.revision++; }
  get ready() { return this.checks.size === 3; }
}
