export const RT = Object.freeze({ hold: 0x21, resume: 0x7e, reset: 0x18, jogCancel: 0x85,
  feedReset: 0x90, feedPlus: 0x91, feedMinus: 0x92, spindleReset: 0x99, spindlePlus: 0x9a, spindleMinus: 0x9b });

const vector = (text) => {
  const v = text.split(',').map(Number);
  return v.length >= 3 && v.every(Number.isFinite) ? v : null;
};

export function parseStatus(line, previous = {}) {
  if (!line.startsWith('<') || !line.endsWith('>')) return null;
  const [state, ...fields] = line.slice(1, -1).split('|');
  const out = { ...previous, state, pins: '', sd: null };
  for (const field of fields) {
    const i = field.indexOf(':');
    const key = field.slice(0, i), value = field.slice(i + 1);
    if (['MPos', 'WPos', 'WCO'].includes(key)) out[key] = vector(value);
    if (key === 'FS') { const v = vector(value + ',0'); if (v) [out.feed, out.rpm] = v; }
    if (key === 'Ov') out.overrides = vector(value);
    if (key === 'Pn') out.pins = value;
    if (key === 'SD') {
      const comma = value.indexOf(',');
      const progress = Number(value.slice(0, comma));
      if (comma >= 0 && Number.isFinite(progress)) out.sd = { progress, file: value.slice(comma + 1) };
    }
  }
  // Never reuse a previously calculated coordinate after receiving a new position.
  const machineSent = fields.some(f => f.startsWith('MPos:'));
  const workSent = fields.some(f => f.startsWith('WPos:'));
  if (machineSent && !workSent) out.WPos = out.MPos && out.WCO ? out.MPos.map((v, i) => v - out.WCO[i]) : null;
  if (workSent && !machineSent) out.MPos = out.WPos && out.WCO ? out.WPos.map((v, i) => v + out.WCO[i]) : null;
  return out;
}

export class FluidClient {
  constructor({ url, WebSocketClass = globalThis.WebSocket, clock = () => Date.now(), onChange = () => {}, onLine = () => {} }) {
    Object.assign(this, { url, WebSocketClass, clock, onChange, onLine });
    this.status = {}; this.lastStatus = 0; this.connected = false; this.pending = null;
    this.fault = ''; this.modes = []; this.reportInches = null; this.listeners = new Set(); this.rx = ''; this.generation = 0;
  }
  get fresh() { return this.connected && !this.fault && !!this.status.state && this.clock() - this.lastStatus < 2500; }
  get idle() { return this.fresh && this.status.state === 'Idle'; }
  connect() {
    this.disconnect();
    const generation = ++this.generation;
    this.fault = ''; this.status = {}; this.modes = []; this.reportInches = null; this.lastStatus = 0; this.rx = '';
    const ws = this.ws = new this.WebSocketClass(this.url);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { if (generation !== this.generation) return; this.connected = true; this.poll(); this.onChange(); };
    let chain = Promise.resolve();
    ws.onmessage = (e) => {
      chain = chain.then(async () => {
        const data = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data instanceof ArrayBuffer ? e.data : await e.data.arrayBuffer());
        if (generation === this.generation) this.receive(data);
      }).catch(() => this.fail('受信データを処理できません。再接続してください。'));
    };
    ws.onclose = () => { if (generation === this.generation) { this.connected = false; this.rejectPending('接続が切れました。命令は再送していません。'); this.onChange(); } };
    ws.onerror = () => { if (generation === this.generation) this.fail('接続エラー。接続先とネットワークを確認してください。'); };
    this.onChange();
  }
  disconnect() {
    this.generation++;
    this.rejectPending('接続を終了しました。');
    if (this.ws) this.ws.close();
    this.ws = null; this.connected = false; this.status = {}; this.modes = []; this.reportInches = null;
    this.onChange();
  }
  fail(message) { this.fault = message; this.rejectPending(message); this.onChange(); }
  rejectPending(message) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer); const p = this.pending; this.pending = null; p.reject(new Error(message));
  }
  poll() {
    if (this.connected && this.ws?.readyState === 1) this.ws.send('?');
    this.onChange();
  }
  receive(text) {
    if (/^(currentID|CURRENT_ID):\d+\s*$/.test(text)) return;
    if (/^(activeID|ACTIVE_ID):\d+\s*$/.test(text)) { this.fail('別の操作画面が接続しました。操作をロックしました。'); return; }
    if (text.trim() === 'PING') { if (this.connected) this.ws.send('PING:60000'); return; }
    if (text.startsWith('PING:')) return;
    this.rx += text;
    if (this.rx.length > 65536) { this.rx = ''; this.fail('受信データが長すぎます。再接続してください。'); return; }
    let index;
    while ((index = this.rx.indexOf('\n')) >= 0) {
      const line = this.rx.slice(0, index).replace(/\r$/, '').trim(); this.rx = this.rx.slice(index + 1);
      if (line) this.line(line);
    }
  }
  line(line) {
    const status = parseStatus(line, this.status);
    if (status) { this.status = status; this.lastStatus = this.clock(); }
    else {
      this.onLine(line);
      if (line.startsWith('[GC:')) this.modes = line.slice(4, -1).split(' ');
      const units = line.match(/^\$\/report_inches=(true|false)$/i);
      if (units) this.reportInches = units[1].toLowerCase() === 'true';
      if (/^(ALARM:|Grbl |FluidNC )/.test(line)) {
        this.status = {}; this.modes = []; this.reportInches = null;
        this.fail(line.startsWith('ALARM:') ? line : 'コントローラが再起動しました。再接続してください。');
      }
      if (line === 'ok' && this.pending) {
        clearTimeout(this.pending.timer); const p = this.pending; this.pending = null; p.resolve();
      }
      if (line.startsWith('error:')) this.rejectPending(line);
    }
    for (const listener of [...this.listeners]) listener(line);
    this.onChange();
  }
  command(command, { timeout = 10000, states = ['Idle'], readOnly = false } = {}) {
    if (!this.fresh) return Promise.reject(new Error('状態が確認できません。再接続してください。'));
    if (this.pending) return Promise.reject(new Error('前の命令の応答待ちです。'));
    if (!readOnly && !states.includes(this.status.state)) return Promise.reject(new Error(`現在の状態では実行できません: ${this.status.state}`));
    if (!command.trim() || /[\r\n\x00-\x1f\x7f]/.test(command)) return Promise.reject(new Error('1行の命令を指定してください。'));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, timer: setTimeout(() => {
        this.fail('応答がありません。実行結果は不明です。命令は再送していません。');
      }, timeout) };
      try { this.ws.send(command.trim() + '\n'); this.onLine('> ' + command); }
      catch { this.fail('送信に失敗しました。再接続してください。'); }
      this.onChange();
    });
  }
  realtime(code) {
    // Stop/hold must remain available even when the status stream is stale.
    if (!this.connected || this.ws?.readyState !== 1) throw new Error('未接続です。実機の停止装置を使用してください。');
    if (![RT.reset, RT.hold, RT.jogCancel].includes(code) && !this.fresh) throw new Error('最新の状態を取得できません。');
    this.ws.send(new Uint8Array([code]));
    if (code === RT.reset) { this.status = {}; this.modes = []; this.fail('ソフト停止を送信しました。状態確認後、再接続してください。'); }
  }
}

export function safePath(path) {
  if (!path.startsWith('/') || /[\r\n\x00-\x1f\x7f]/.test(path) || path.split('/').includes('..')) throw new Error('無効なファイル名です。');
  return path;
}

export function jogCommand(axis, distance, feed) {
  if (!['X', 'Y', 'Z'].includes(axis) || !Number.isFinite(distance) || distance === 0 || Math.abs(distance) > 50 || !Number.isFinite(feed) || feed < 1 || feed > 1000) throw new Error('ジョグの値が範囲外です。');
  return `$J=G91 G21 ${axis}${distance} F${feed}`;
}
