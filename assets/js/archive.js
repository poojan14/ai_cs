import {
  loadJSON, escapeHtml, safeUrl, timeAgo, dayLabel, placeholder,
  guardImages, domainOf, CHANNELS
} from './common.js';

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

function item(s) {
  const thumb = s.image
    ? `<img src="${escapeHtml(s.image)}" alt="" loading="lazy" decoding="async"
           data-fallback="${placeholder(s.channel, s.source)}" referrerpolicy="no-referrer">`
    : `<img src="${placeholder(s.channel, s.source)}" alt="">`;
  const ch = CHANNELS[s.channel] || CHANNELS.ai;
  return `
  <li class="log-item ${s.channel === 'sec' ? 'log-item--sec' : ''} ${s.id === target ? 'is-target' : ''}" id="s-${escapeHtml(s.id)}">
    <div class="log-item__thumb">${thumb}</div>
    <div class="log-item__body">
      <p class="eyebrow">
        <span style="color:${ch.color};font-weight:600">${escapeHtml(ch.short)}</span>
        <span aria-hidden="true">&middot;</span>
        <span class="src">${escapeHtml(s.source || domainOf(s.url))}</span>
        <span aria-hidden="true">&middot;</span>
        <time datetime="${escapeHtml(s.capturedAt || '')}">${timeAgo(s.capturedAt || s.published)}</time>
      </p>
      <h3><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></h3>
      <p class="brief is-clamped">${escapeHtml(s.brief)}</p>
      <div class="log-actions">
        <button class="linky" type="button" data-expand>Read the full brief</button>
        <a class="linky linky--source" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Open source</a>
        <button class="linky" type="button" data-copy="${escapeHtml(s.id)}">Copy link</button>
      </div>
    </div>
  </li>`;
}

function render() {
  const picked = all.filter(matches);
  const page = picked.slice(0, shown);

  countEl.textContent = picked.length
    ? `${picked.length} ${picked.length === 1 ? 'story' : 'stories'} in the log`
    : 'No stories match that search yet';

  if (!all.length) {
    listEl.innerHTML = `<li class="empty"><h2>The log is empty</h2>
      <p>Every three-hour update files its two stories here. Run
      <strong>Actions &rarr; Update news feed</strong> once to start the record.</p></li>`;
    moreEl.hidden = true;
    return;
  }

  const groups = [];
  for (const s of page) {
    const label = dayLabel(s.capturedAt || s.published);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(s);
  }

  listEl.innerHTML = groups.map(g => `
    <li class="daygroup">
      <p class="daygroup__label">${escapeHtml(g.label)}</p>
      <ul class="log">${g.items.map(item).join('')}</ul>
    </li>`).join('') ||
    `<li class="empty"><h2>Nothing here</h2><p>Try a different word, or switch the channel filter back to All.</p></li>`;

  guardImages(listEl);
  moreEl.hidden = picked.length <= shown;
}

listEl.addEventListener('click', e => {
  const expand = e.target.closest('[data-expand]');
  if (expand) {
    const p = expand.closest('.log-item__body').querySelector('.brief');
    const clamped = p.classList.toggle('is-clamped');
    expand.textContent = clamped ? 'Read the full brief' : 'Show less';
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
  const chip = e.target.closest('.chip');
  if (!chip) return;
  filter = chip.dataset.channel;
  shown = PAGE;
  chipsEl.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
  render();
});

let debounce;
searchEl.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => { query = searchEl.value.trim().toLowerCase(); shown = PAGE; render(); }, 180);
});

moreEl.addEventListener('click', () => { shown += PAGE; render(); });

loadJSON('data/archive.json')
  .then(data => {
    all = (data.stories || []).sort((a, b) =>
      new Date(b.capturedAt || b.published) - new Date(a.capturedAt || a.published));
    if (target && all.some(s => s.id === target)) {
      shown = Math.max(PAGE, all.findIndex(s => s.id === target) + 1);
    }
    render();
    if (target) {
      const el = document.getElementById('s-' + target);
      if (el) el.scrollIntoView({ block: 'center' });
    }
  })
  .catch(() => { all = []; render(); });
