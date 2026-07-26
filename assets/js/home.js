import {
  loadJSON, escapeHtml, safeUrl, timeAgo, clockTime, countdown,
  placeholder, guardImages, domainOf, initTheme, renderUpdateLog,
  CHANNELS, ICONS, ARROW
} from './common.js';

initTheme();

const editionEl = document.getElementById('edition');
const pulseEl   = document.getElementById('pulseText');
const upEl      = document.getElementById('statUpdated');
const nextEl    = document.getElementById('statNext');
const archEl    = document.getElementById('statArchive');

let stamp;
let rendered = false;
let cache = null;

function card(s, channel) {
  const ch = CHANNELS[channel] || CHANNELS.ai;
  const img = s.image
    ? `<img src="${escapeHtml(s.image)}" alt="" loading="eager" decoding="async"
         referrerpolicy="no-referrer" data-fallback="${placeholder(channel, s.source)}">`
    : `<img src="${placeholder(channel, s.source)}" alt="">`;
  const matters = s.whyItMatters
    ? `<p class="matters"><b>Why this matters</b><span>${escapeHtml(s.whyItMatters)}</span></p>` : '';

  return `
  <article class="card card--${channel === 'sec' ? 'sec' : 'ai'}">
    <div class="card__media">
      ${img}
      <span class="badge">${ICONS[channel] || ICONS.ai} ${escapeHtml(ch.label)}</span>
    </div>
    <div class="card__body">
      <p class="card__meta">
        <span class="outlet">${escapeHtml(s.source || domainOf(s.url))}</span>
        <span class="sep">/</span>
        <time datetime="${escapeHtml(s.published || '')}">${timeAgo(s.published)}</time>
      </p>
      <h2 class="card__title">
        <a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a>
      </h2>
      <p class="card__brief">${escapeHtml(s.brief)}</p>
      ${matters}
      <div class="card__foot">
        <a class="cta" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">
          Read at ${escapeHtml(domainOf(s.url))} ${ARROW}
        </a>
        <button class="iconlink" type="button" data-share="${escapeHtml(s.url)}"
                data-title="${escapeHtml(s.title)}" aria-label="Share this story" title="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
        </button>
        <span class="mono card__words">${s.words || 0} words</span>
      </div>
    </div>
  </article>`;
}

function notice(message) {
  return `
  <div class="notice">
    <h2>Nothing published yet</h2>
    <p>${escapeHtml(message)}</p>
    <p>To fetch the first pair of stories, open the repository on GitHub and choose
       <strong>Actions → Update news feed → Run workflow</strong>. After that it runs on its own
       every three hours.</p>
    <p>Locally: <code>node scripts/build-news.mjs</code></p>
  </div>`;
}

function paintStatus(data) {
  if (!data?.generatedAt) {
    pulseEl.textContent = 'Waiting for the first update';
    upEl.textContent = '—';
    nextEl.textContent = '—';
    return;
  }
  pulseEl.textContent = `Live · updated ${clockTime(data.generatedAt)}`;
  upEl.textContent = clockTime(data.generatedAt);
  nextEl.textContent = countdown(data.nextUpdateAt);
}

function render(data) {
  const ai = data?.stories?.ai;
  const sec = data?.stories?.sec;
  editionEl.innerHTML = (!ai && !sec)
    ? notice('No stories have been captured yet.')
    : [ai ? card(ai, 'ai') : '', sec ? card(sec, 'sec') : ''].join('');
  guardImages(editionEl);
  paintStatus(data);
}

async function refresh() {
  try {
    const data = await loadJSON('data/latest.json');
    cache = data;
    if (!rendered || data.generatedAt !== stamp) {
      stamp = data.generatedAt;
      rendered = true;
      render(data);
    } else {
      paintStatus(data);
    }
  } catch (err) {
    if (!rendered) {
      rendered = true;
      editionEl.innerHTML = notice('The news file could not be loaded: ' + err.message);
      paintStatus(null);
    }
  }
}

// Share the story natively where the browser supports it, copy the link otherwise.
editionEl.addEventListener('click', async e => {
  const btn = e.target.closest('[data-share]');
  if (!btn) return;
  const url = btn.dataset.share;
  const title = btn.dataset.title;
  try {
    if (navigator.share) await navigator.share({ title, url });
    else {
      await navigator.clipboard.writeText(url);
      btn.setAttribute('title', 'Link copied');
      btn.style.color = 'var(--topic)';
      setTimeout(() => { btn.style.color = ''; btn.setAttribute('title', 'Share'); }, 1600);
    }
  } catch (err) { /* the person dismissed the share sheet */ }
});

// The archive figures are a nice-to-have; a failure here must not block the page.
loadJSON('data/archive.json')
  .then(d => {
    const list = d.stories || [];
    archEl.textContent = `${d.count || list.length} stories`;
    renderUpdateLog(list);
  })
  .catch(() => { archEl.textContent = '—'; renderUpdateLog([]); });

refresh();
setInterval(refresh, 5 * 60 * 1000);
setInterval(() => cache && paintStatus(cache), 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
