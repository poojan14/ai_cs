import {
  loadJSON, escapeHtml, safeUrl, timeAgo, dayLabel,
  placeholder, guardImages, domainOf, initTheme, renderUpdateLog,
  initSearchShortcut, CHANNELS
} from './common.js';

initTheme();

const listEl   = document.getElementById('log');
const countEl  = document.getElementById('count');
const searchEl = document.getElementById('search');
const chipsEl  = document.getElementById('chips');
const moreEl   = document.getElementById('more');

const PAGE = 20;
let all = [];
let filter = 'all';
let query = '';
let shown = PAGE;

const target = new URLSearchParams(location.search).get('id');

function matches(s) {
  if (filter !== 'all' && s.channel !== filter) return false;
  if (!query) return true;
  const hay = `${s.title} ${s.brief} ${s.source} ${(s.tags || []).join(' ')}`.toLowerCase();
  return query.split(/\s+/).every(w => hay.includes(w));
}

function entry(s) {
  const ch = CHANNELS[s.channel] || CHANNELS.ai;
  const img = s.image
    ? `<img src="${escapeHtml(s.image)}" alt="" loading="lazy" decoding="async"
         referrerpolicy="no-referrer" data-fallback="${placeholder(s.channel, s.source)}">`
    : `<img src="${placeholder(s.channel, s.source)}" alt="">`;

  return `
  <li class="entry ${s.channel === 'sec' ? 'entry--sec' : ''} ${s.id === target ? 'is-target' : ''}"
      id="s-${escapeHtml(s.id)}">
    <div class="entry__media">${img}</div>
    <div class="entry__body">
      <p class="entry__kicker">${escapeHtml(ch.short)}</p>
      <h3><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></h3>
      <p class="entry__meta">${escapeHtml(s.source || domainOf(s.url))} ·
        <time datetime="${escapeHtml(s.capturedAt || '')}">${timeAgo(s.capturedAt || s.published)}</time></p>
      <p class="entry__brief is-clamped">${escapeHtml(s.brief)}</p>
      <div class="entry__actions">
        <button class="plainlink" type="button" data-expand>Read summary</button>
        <a class="plainlink plainlink--go" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Original</a>
        <button class="plainlink" type="button" data-copy="${escapeHtml(s.id)}">Copy link</button>
      </div>
    </div>
  </li>`;
}

function render() {
  const picked = all.filter(matches);
  const page = picked.slice(0, shown);

  countEl.textContent = picked.length
    ? `${picked.length} ${picked.length === 1 ? 'summary' : 'summaries'}`
    : 'No matches';

  if (!all.length) {
    listEl.innerHTML = `<li class="notice" style="margin-top:1.4rem"><h2>Nothing here yet</h2>
      <p>Each update files its two summaries here. Run
      <strong>Actions → Update news feed → Run workflow</strong> once to start the record.</p></li>`;
    moreEl.hidden = true;
    return;
  }

  const groups = [];
  for (const s of page) {
    const label = dayLabel(s.capturedAt || s.published);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(s);
  }

  listEl.innerHTML = groups.length
    ? groups.map(g => `
      <li class="daygroup">
        <p class="mono">${escapeHtml(g.label)}</p>
        <ul class="entries">${g.items.map(entry).join('')}</ul>
      </li>`).join('')
    : `<li class="notice" style="margin-top:1.4rem"><h2>No matches</h2>
       <p>Try a different word, or set the filter back to All.</p></li>`;

  guardImages(listEl);
  moreEl.hidden = picked.length <= shown;
}

listEl.addEventListener('click', e => {
  const expand = e.target.closest('[data-expand]');
  if (expand) {
    const p = expand.closest('.entry').querySelector('.entry__brief');
    const clamped = p.classList.toggle('is-clamped');
    expand.textContent = clamped ? 'Read summary' : 'Show less';
    return;
  }
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    const url = `${location.origin}${location.pathname}?id=${copy.dataset.copy}`;
    navigator.clipboard?.writeText(url).then(() => {
      copy.textContent = 'Link copied';
      setTimeout(() => (copy.textContent = 'Copy link'), 1800);
    }).catch(() => (copy.textContent = 'Press ctrl+c'));
  }
});

chipsEl.addEventListener('click', e => {
  const seg = e.target.closest('.seg');
  if (!seg) return;
  filter = seg.dataset.channel;
  shown = PAGE;
  chipsEl.querySelectorAll('.seg').forEach(s => s.setAttribute('aria-pressed', String(s === seg)));
  render();
});

let debounce;
searchEl.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => { query = searchEl.value.trim().toLowerCase(); shown = PAGE; render(); }, 180);
});

moreEl.addEventListener('click', () => { shown += PAGE; render(); });

initSearchShortcut(searchEl);

loadJSON('data/archive.json')
  .then(data => {
    all = (data.stories || []).sort((a, b) =>
      new Date(b.capturedAt || b.published) - new Date(a.capturedAt || a.published));
    if (target && all.some(s => s.id === target)) {
      shown = Math.max(PAGE, all.findIndex(s => s.id === target) + 1);
    }
    render();
    renderUpdateLog(all);
    if (target) document.getElementById('s-' + target)?.scrollIntoView({ block: 'center' });
  })
  .catch(() => { all = []; render(); renderUpdateLog([]); });
