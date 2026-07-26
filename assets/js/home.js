import {
  loadJSON, escapeHtml, safeUrl, timeAgo, clockTime, countdown,
  placeholder, guardImages, domainOf, arrow
} from './common.js';

const channelsEl = document.getElementById('channels');
const syncedEl   = document.getElementById('synced');
const nextEl     = document.getElementById('next');
const fillEl     = document.getElementById('meterFill');

let current;
let rendered = false;

function storyCard(s, channel) {
  const isSec = channel === 'sec';
  const img = s.image
    ? `<img src="${escapeHtml(s.image)}" alt="" loading="eager" decoding="async"
           data-fallback="${placeholder(channel, s.source)}" referrerpolicy="no-referrer">`
    : `<img src="${placeholder(channel, s.source)}" alt="">`;

  const matters = s.whyItMatters
    ? `<p class="matters"><b>Why it matters</b>${escapeHtml(s.whyItMatters)}</p>` : '';

  return `
  <article class="story ${isSec ? 'story--sec' : 'story--ai'}">
    <div class="story__frame">
      ${img}
      <span class="plate"><b>${escapeHtml(s.channelCode || '')}</b> ${escapeHtml(s.channelLabel || '')}</span>
    </div>
    <div class="story__body">
      <p class="eyebrow">
        <span class="src">${escapeHtml(s.source || domainOf(s.url))}</span>
        <span aria-hidden="true">&middot;</span>
        <time datetime="${escapeHtml(s.published || '')}">${timeAgo(s.published)}</time>
      </p>
      <h2 class="story__title">
        <a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a>
      </h2>
      <p class="brief">${escapeHtml(s.brief)}</p>
      ${matters}
      <div class="story__foot">
        <span class="wordcount">${s.words || 0} words &middot; ${escapeHtml(domainOf(s.url))}</span>
        <a class="btn" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">
          Read at source ${arrow}
        </a>
      </div>
    </div>
  </article>`;
}

function emptyState(message) {
  return `
  <div class="empty">
    <h2>First transmission pending</h2>
    <p>${escapeHtml(message)}</p>
    <p>To pull the first pair of stories, open the repository on GitHub, go to
       <strong>Actions &rarr; Update news feed</strong> and choose <strong>Run workflow</strong>.
       After that it runs by itself every three hours.</p>
    <p>Running it locally works too: <code>node scripts/build-news.mjs</code></p>
  </div>`;
}

function paintClock(data) {
  if (!data?.generatedAt) {
    syncedEl.textContent = 'not synced yet';
    nextEl.textContent = 'awaiting first run';
    fillEl.style.width = '0%';
    return;
  }
  syncedEl.textContent = `synced ${clockTime(data.generatedAt)}`;
  nextEl.textContent = `next in ${countdown(data.nextUpdateAt)}`;

  const start = new Date(data.generatedAt).getTime();
  const end = new Date(data.nextUpdateAt).getTime();
  const pct = Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
  fillEl.style.width = pct + '%';
}

function render(data) {
  const ai = data?.stories?.ai;
  const sec = data?.stories?.sec;
  if (!ai && !sec) {
    channelsEl.innerHTML = emptyState('No stories have been captured yet.');
    paintClock(data);
    return;
  }
  channelsEl.innerHTML = [
    ai ? storyCard(ai, 'ai') : '',
    sec ? storyCard(sec, 'sec') : ''
  ].join('');
  guardImages(channelsEl);
  paintClock(data);
}

let cache = null;

async function refresh() {
  try {
    const data = await loadJSON('data/latest.json');
    cache = data;
    if (!rendered || data.generatedAt !== current) {
      current = data.generatedAt;
      rendered = true;
      render(data);
    } else {
      paintClock(data);
    }
  } catch (err) {
    if (!rendered) {
      rendered = true;
      channelsEl.innerHTML = emptyState('The news file could not be loaded yet: ' + err.message);
    }
  }
}

refresh();
setInterval(refresh, 5 * 60 * 1000);          // pick up a new cycle without a page reload
setInterval(() => cache && paintClock(cache), 30 * 1000);  // keep the countdown honest
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
