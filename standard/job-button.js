import { JobProgress, parseJobStatus, formatRemaining } from './job-progress.mjs';

// Reuse the progress model and the preview's existing read-only status stream.
export function useJobButton(hooks, jsx, machine) {
  const modelRef = hooks.sO(null);
  if (!modelRef.current) modelRef.current = new JobProgress();
  const [view, setView] = hooks.eJ(null);
  hooks.d4(() => {
    const model = modelRef.current;
    const render = () => {
      const next = model.view(performance.now());
      setView({ ...next, remaining: formatRemaining(next.remaining) });
    };
    const listener = event => {
      const frame = document.querySelector('#extra_content_metallkraft-preview iframe');
      if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
      const data = event.data;
      if (data?.kind === 'mk-preview-status') {
        for (const report of parseJobStatus(data.report)) model.accept(report, performance.now());
      } else if (['mk-preview-disconnected','mk-preview-reloaded'].includes(data?.kind)) model.reset();
      else return;
      render();
    };
    window.addEventListener('message', listener);
    const timer = setInterval(render, 1000);
    return () => { window.removeEventListener('message', listener); clearInterval(timer); };
  }, []);
  return () => {
    const state = machine.status?.state;
    if (!['Run', 'Hold', 'Door', 'Tool'].includes(state)) return {};
    const label = view?.label === '受信待ち' ? '通信確認中' : state === 'Run' ? '加工中' : '一時停止中';
    const percent = view?.percent ?? null;
    return {
      class: 'btn mk-job-status do-not-disable', disabled: true,
      'aria-label': '加工状況', 'data-job-state': state,
      'data-tooltip': '読込率は加工完了率ではありません。残り時間は目安です。',
      children: [
        jsx('div', { class: 'mk-job-status-heading', children: [jsx('strong', { children: label }), jsx('span', { children: percent === null ? '--' : percent.toFixed(1) + '%' })] }),
        jsx('progress', { max: 100, value: percent ?? undefined, 'aria-label': 'ファイル読み込み進捗' }),
        jsx('div', { class: 'mk-job-status-detail', children: [jsx('span', { children: '読込率' }), jsx('span', { children: '残り目安 ' + (state === 'Run' ? view?.remaining ?? '--' : '--') })] }),
      ],
    };
  };
}
