/* pvsnews — shared helpers. No build step, no framework. */

export const CHANNELS = {
  ai:  { label: 'Artificial Intelligence', short: 'AI',       color: '#52d1ff' },
  sec: { label: 'Cybersecurity',           short: 'Security', color: '#ff8360' }
};

export const ICONS = {
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M19.1 4.9l-2.9 2.9M7.8 16.2l-2.9 2.9"/></svg>',
  sec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 4.5 5.6v5.6c0 4.6 3.2 8.9 7.5 10.3 4.3-1.4 7.5-5.7 7.5-10.3V5.6z"/><path d="M9.4 12.2l1.9 1.9 3.5-3.6"/></svg>'
};

export const ARROW =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4"/></svg>';

/** GitHub Pages caches aggressively — ask for a fresh copy every load. */
export async function loadJSON(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Only http(s) links ever reach the DOM. */
export function safeUrl(url = '') {
  return /^https?:\/\//i.test(url) ? url : '#';
}

export function domainOf(url = '') {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function clockTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function countdown(toIso) {
  const ms = new Date(toIso).getTime() - Date.now();
  if (isNaN(ms)) return '—';
  if (ms <= 0) return 'any moment';
  const mins = Math.floor(ms / 6e4);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** A gradient stand-in so a blocked photo never leaves a hole in the layout. */
export function placeholder(channel, label = '') {
  const dark = document.documentElement.dataset.theme !== 'light';
  const c = CHANNELS[channel] || CHANNELS.ai;
  const text = escapeHtml(String(label).slice(0, 28));
  const base = dark ? '#0d1320' : '#e9edf4';
  const ink = dark ? '#8b97ab' : '#5c6678';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c.color}" stop-opacity=".28"/>
      <stop offset="1" stop-color="${c.color}" stop-opacity="0"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="${base}"/>
    <rect width="320" height="180" fill="url(#g)"/>
    <text x="18" y="166" fill="${ink}" font-family="monospace" font-size="10" letter-spacing="1.5">${text}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Swap in the placeholder if a publisher blocks hotlinking. */
export function guardImages(root = document) {
  root.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', () => {
      if (img.dataset.failed) return;
      img.dataset.failed = '1';
      img.src = img.dataset.fallback;
    }, { once: true });
  });
}

/** Light/dark switch, remembered on this device. */
export function initTheme() {
  const btn = document.getElementById('theme');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'light' ? '#f4f7fb' : '#0a0e16');
    try { localStorage.setItem('pvs-theme', next); } catch (e) {}
  });
}
