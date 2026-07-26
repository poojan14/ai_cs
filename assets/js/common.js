/* SIGNAL/2 — shared helpers. No build step, no framework. */

export const CHANNELS = {
  ai:  { label: 'Artificial Intelligence', code: 'CH-01', color: '#5a31f4', short: 'AI' },
  sec: { label: 'Cybersecurity',           code: 'CH-02', color: '#f2a31b', short: 'Security' }
};

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
  if (!iso) return '--:--';
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
  if (isNaN(ms)) return 'soon';
  if (ms <= 0) return 'any moment';
  const mins = Math.floor(ms / 6e4);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** A calm placeholder so a missing photo never leaves a hole in the layout. */
export function placeholder(channel, label = '') {
  const c = CHANNELS[channel] || CHANNELS.ai;
  const text = escapeHtml(String(label).slice(0, 26).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c.color}" stop-opacity=".22"/>
      <stop offset="1" stop-color="#0f1620" stop-opacity=".9"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="#0f1620"/>
    <rect width="320" height="180" fill="url(#g)"/>
    <text x="18" y="150" fill="#ffffff" font-family="monospace" font-size="11" letter-spacing="2" opacity=".75">${c.code}</text>
    <text x="18" y="166" fill="#ffffff" font-family="monospace" font-size="9" letter-spacing="1.5" opacity=".45">${text}</text>
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

export const arrow =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
  '<path d="M3 8h9M8 3.5 12.5 8 8 12.5"/></svg>';
