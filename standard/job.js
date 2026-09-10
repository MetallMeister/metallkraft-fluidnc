import { JobProgress, parseJobStatus, formatRemaining } from './job-progress.mjs';

const model = new JobProgress();
const root = document.querySelector('#job-display');
const progress = document.querySelector('#job-progress');
const percent = document.querySelector('#job-percent');
const remaining = document.querySelector('#job-remaining');
const file = document.querySelector('#job-file');
const render = () => {
  const view = model.view(performance.now());
  percent.textContent = view.percent === null ? '--' : `${view.percent.toFixed(1)}%`;
  remaining.textContent = formatRemaining(view.remaining);
  file.textContent = view.name ? view.name.split('/').at(-1) : view.label;
  file.title = view.name ? `${view.label}: ${view.name}` : view.label;
  progress.value = view.percent ?? 0;
  progress.setAttribute('aria-valuetext', view.percent === null ? '進捗不明' : `${view.percent.toFixed(1)}% 読み込み`);
  root.dataset.state = view.label;
};

// Native WebUI extension notifications only. This module never posts a message back.
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== location.origin) return;
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'notification' && message.content?.isConnected === false) model.reset();
  else if (message.type === 'stream') {
    for (const report of parseJobStatus(message.content)) model.accept(report, performance.now());
  }
  render();
});
const timer = setInterval(render, 1000);
window.addEventListener('pagehide', () => clearInterval(timer));
render();
