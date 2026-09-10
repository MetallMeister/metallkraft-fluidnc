const endpoint = 'https://metallmeister.net/wp-json/wp/v2/pages/4102?_fields=id,content,modified';
const status = document.querySelector('#status');
const title = document.querySelector('#title');
const summary = document.querySelector('#summary');
const refresh = document.querySelector('#refresh');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const count = document.querySelector('#count');
let notices = [], selected = 0, loadedAt = '', busy = false;

// Only text is rendered. Published HTML cannot add scripts, images or controller commands.
function parseNotices(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const element of document.querySelectorAll('script,style,iframe,object,embed,svg,math,template')) element.remove();
  const result = [];
  let current;
  for (const element of document.body.querySelectorAll('h2,h3,p,li')) {
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (/^H[23]$/.test(element.tagName)) {
      current = { title: text, paragraphs: [] };
      result.push(current);
    } else {
      if (!current) { current = { title: 'MetallMeisterからのお知らせ', paragraphs: [] }; result.push(current); }
      current.paragraphs.push(text);
    }
  }
  return result.map(item => ({title:item.title, body:item.paragraphs.join(' ')}));
}
function render() {
  const notice = notices[selected];
  title.textContent = notice?.title || '現在、新しいお知らせはありません';
  summary.textContent = notice?.body || '';
  status.textContent = loadedAt;
  count.textContent = `${selected + 1} / ${notices.length}`;
  for (const element of [previous, next, count]) element.hidden = notices.length < 2;
  previous.disabled = selected === 0;
  next.disabled = selected >= notices.length - 1;
}
async function load() {
  if (busy) return;
  busy = true;
  refresh.disabled = true;
  status.textContent = '読み込み中';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(endpoint, {credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', signal:controller.signal});
    if (!response.ok) throw new Error('Unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0, text = '';
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 262144) { await reader.cancel(); throw new Error('Response too large'); }
      text += decoder.decode(value, {stream:true});
    }
    const page = JSON.parse(text + decoder.decode());
    if (page.id !== 4102 || typeof page.content?.rendered !== 'string') throw new Error('Invalid page');
    notices = parseNotices(page.content.rendered);
    selected = 0;
    loadedAt = /^\d{4}-\d{2}-\d{2}/.test(page.modified || '') ? `${page.modified.slice(0,10).replaceAll('-','.')} 更新` : '';
    render();
  } catch {
    status.textContent = notices.length ? '更新できませんでした' : 'お知らせを取得できません';
    if (!notices.length) { title.textContent = 'MetallMeisterからのお知らせ'; summary.textContent = 'インターネット接続時に更新できます。'; }
  } finally {
    clearTimeout(timeout);
    refresh.disabled = false;
    busy = false;
  }
}
previous.addEventListener('click', () => { if (selected > 0) { selected--; render(); } });
next.addEventListener('click', () => { if (selected < notices.length - 1) { selected++; render(); } });
refresh.addEventListener('click', load);
load();
