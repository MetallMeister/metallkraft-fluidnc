export const staleMs = 5000;

// Consume only complete standard status reports; never interpret or send G-code.
export function parseJobStatus(text) {
  if (typeof text !== 'string' || text.length > 16384) return [];
  return [...text.matchAll(/<([^<>\r\n]+)>/g)].flatMap(([, body]) => {
    const [stateCode, ...fields] = body.split('|');
    const state = stateCode.split(':')[0];
    if (!/^(Idle|Run|Hold|Door|Tool|Alarm|Check|Home|Jog|Sleep)$/.test(state)) return [];
    const sd = fields.find(field => field.startsWith('SD:'));
    const data = sd?.match(/^SD:(\d+(?:\.\d+)?),(.+)$/);
    const percent = data ? Number(data[1]) : null;
    return [{ state, name: data?.[2] || '', percent: percent !== null && percent >= 0 && percent <= 100 ? percent : null }];
  });
}

export class JobProgress {
  reset() { this.job = null; this.last = null; }
  constructor() { this.reset(); }

  accept(report, now) {
    if (!report.name || report.percent === null || ['Alarm','Check','Home','Jog','Sleep'].includes(report.state)) {
      this.reset();
      this.last = { ...report, now };
      return;
    }
    const previous = this.last;
    const gap = previous ? now - previous.now : Infinity;
    if (!this.job || this.job.name !== report.name || report.percent < this.job.percent || gap > staleMs || gap < 0) {
      this.job = { name: report.name, percent: report.percent, runningMs: 0, samples: [] };
    } else if (report.state === 'Run' && previous.state === 'Run') {
      this.job.runningMs += gap;
    }
    const job = this.job;
    job.percent = report.percent;
    // Start a fresh rate window across pauses. No pause time counts.
    if (report.state !== 'Run' || previous?.state !== 'Run') job.samples = [];
    if (report.state === 'Run') {
      if (job.samples.at(-1)?.time !== job.runningMs) job.samples.push({ time: job.runningMs, percent: report.percent });
      while (job.samples.length > 1 && (job.samples[0].time < job.runningMs - 60000 || job.samples.length > 600)) job.samples.shift();
    }
    this.last = { ...report, now };
  }

  view(now) {
    if (!this.last || now - this.last.now > staleMs) return { label: '受信待ち', percent: null, remaining: null, name: '' };
    if (!this.job) return { label: this.last.state === 'Idle' ? '実行ファイルなし' : '進捗情報なし', percent: null, remaining: null, name: '' };
    const { state } = this.last;
    const { name, percent, samples } = this.job;
    let remaining = null;
    const first = samples[0], last = samples.at(-1);
    if (state === 'Run' && percent < 100 && first && last && last.time - first.time >= 10000 && last.percent - first.percent >= 0.5) {
      remaining = (last.time - first.time) / 1000 * (100 - percent) / (last.percent - first.percent);
      if (!Number.isFinite(remaining) || remaining > 7 * 86400) remaining = null;
    }
    const label = ['Hold','Door','Tool'].includes(state) ? '一時停止中' : percent === 100 ? '読込済・完了未確認' : state === 'Run' ? '加工中' : '待機中';
    return { label, percent, remaining, name };
  }
}

export function formatRemaining(seconds) {
  if (seconds === null) return '--';
  // File bytes are not machining time: avoid false second-level precision.
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? `約${minutes}分` : `約${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
