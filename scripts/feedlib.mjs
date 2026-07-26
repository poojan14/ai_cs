/**
 * feedlib.mjs — zero-dependency RSS 2.0 / Atom parsing + text helpers.
 * Runs on Node 20+ (uses global fetch). No npm install required.
 */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u2013',
  mdash: '\u2014', hellip: '\u2026', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201C', rdquo: '\u201D', middot: '\u00B7', bull: '\u2022',
  eacute: '\u00E9', copy: '\u00A9', reg: '\u00AE', trade: '\u2122', deg: '\u00B0',
  euro: '\u20AC', pound: '\u00A3', yen: '\u00A5', cent: '\u00A2', rupee: '\u20B9',
  laquo: '\u00AB', raquo: '\u00BB', times: '\u00D7', plusmn: '\u00B1',
  frac12: '\u00BD', prime: '\u2032', Prime: '\u2033', ensp: ' ', emsp: ' ',
  thinsp: ' ', shy: '', dagger: '\u2020', sect: '\u00A7', para: '\u00B6'
};

export function decodeEntities(str = '') {
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}

function safeChar(code) {
  try { return String.fromCodePoint(code); } catch { return ''; }
}

/** Strip tags, collapse whitespace, decode entities. */
export function stripHtml(html = '') {
  // Decode first: many feeds double-escape their HTML (&lt;p&gt;), so tags only
  // become visible after one pass. Decode again at the end for &amp;quot; cases.
  const decoded = decodeEntities(String(html));
  const bare = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(bare).replace(/\s+/g, ' ').trim();
}

function unwrapCdata(str = '') {
  const m = String(str).match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : str;
}

/** Read the first <tag>..</tag> value from an XML chunk. */
export function tagValue(xml, ...names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
    const m = xml.match(re);
    if (m && m[1] !== undefined) {
      const v = unwrapCdata(m[1]).trim();
      if (v) return v;
    }
  }
  return '';
}

/** Read an attribute from the first matching self-closing or open tag. */
export function tagAttr(xml, tagName, attr) {
  const re = new RegExp(`<${tagName}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function atomLink(xml) {
  // Prefer rel="alternate" (or no rel) with an http href.
  const links = xml.match(/<link\b[^>]*>/gi) || [];
  for (const l of links) {
    const rel = (l.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1] || 'alternate';
    const href = (l.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (href && rel.toLowerCase() === 'alternate') return decodeEntities(href);
  }
  for (const l of links) {
    const href = (l.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (href) return decodeEntities(href);
  }
  return '';
}

function pickImage(chunk, htmlBody) {
  const candidates = [
    tagAttr(chunk, 'media:content', 'url'),
    tagAttr(chunk, 'media:thumbnail', 'url'),
    tagAttr(chunk, 'enclosure', 'url'),
    tagAttr(chunk, 'itunes:image', 'href')
  ];
  const inline = (htmlBody || '').match(/<img\b[^>]*src\s*=\s*["']([^"']+)["']/i);
  if (inline) candidates.push(decodeEntities(inline[1]));
  for (const c of candidates) {
    if (c && /^https?:\/\//i.test(c) && !/\.(svg|gif)(\?|$)/i.test(c)) return c;
  }
  return '';
}

/** Parse an RSS 2.0 or Atom document into normalised items. */
export function parseFeed(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const items = [];

  for (const chunk of blocks) {
    const title = stripHtml(tagValue(chunk, 'title'));
    let link = tagValue(chunk, 'link');
    if (!link || /^\s*</.test(link)) link = '';
    if (!link) link = atomLink(chunk);
    if (!link) link = tagValue(chunk, 'guid');
    link = decodeEntities(link);
    const rawBody = decodeEntities(
      tagValue(chunk, 'content:encoded') ||
      tagValue(chunk, 'description') ||
      tagValue(chunk, 'summary') ||
      tagValue(chunk, 'content') || ''
    );
    const dateStr =
      tagValue(chunk, 'pubDate', 'dc:date', 'published', 'updated', 'lastBuildDate') || '';
    const parsed = dateStr ? new Date(dateStr) : null;

    if (!title || !/^https?:\/\//i.test(link)) continue;

    items.push({
      title,
      link: canonicalUrl(link),
      body: stripHtml(rawBody),
      image: pickImage(chunk, rawBody),
      author: stripHtml(tagValue(chunk, 'dc:creator', 'author', 'name')),
      published: parsed && !isNaN(parsed) ? parsed.toISOString() : null
    });
  }
  return items;
}

const TRACKING = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref_?src|guccounter|s_cid|oc$)/i;

/** Remove tracking params so the same story from two feeds dedupes correctly. */
export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    let out = u.toString();
    if (out.endsWith('?')) out = out.slice(0, -1);
    return out;
  } catch {
    return url;
  }
}

/** Stable short id for a story (used for permalinks + dedupe). */
export function storyId(url) {
  let h1 = 0x811c9dc5;
  const s = canonicalUrl(url);
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(36).padStart(7, '0');
}

/** Normalise a title for fuzzy duplicate detection. */
export function titleKey(title = '') {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(w => w.length > 3).slice(0, 8).join(' ');
}

/** Trim prose to a whole number of sentences within `maxWords`. */
export function toBrief(text, maxWords = 150) {
  const clean = stripHtml(text)
    .replace(/\s*\[(\u2026|\.\.\.)\]\s*$/, '')
    .replace(/^(read more|continue reading)[:\s-]*/i, '')
    // WordPress and Feedburner tack these onto every item
    .replace(/\s*The post .{0,120}? appeared first on .{0,80}?\.?\s*$/i, '')
    .replace(/\s*(Continue reading|Read more)\s*[\u2026.]*\s*$/i, '')
    .replace(/\s*This article( was)? (originally )?appeared.{0,80}$/i, '')
    .trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [clean];
  const out = [];
  let count = 0;
  for (const s of sentences) {
    const words = s.trim().split(/\s+/).filter(Boolean).length;
    if (count + words > maxWords) break;
    out.push(s.trim());
    count += words;
  }
  if (!out.length) {
    return clean.split(/\s+/).slice(0, maxWords).join(' ').replace(/[,;:]$/, '') + '\u2026';
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function wordCount(text = '') {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

/** Fetch with a timeout and a polite UA. Returns '' on any failure. */
export async function fetchText(url, { timeout = 15000, label = '' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Signal2Bot/1.0; +https://github.com/)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } catch (err) {
    console.warn(`  ! skipped ${label || url}: ${err.message}`);
    return '';
  } finally {
    clearTimeout(t);
  }
}

const JUNK = new RegExp([
  'subscribe', 'newsletter', 'sign up', 'sign-up', 'cookie', 'advertisement',
  'all rights reserved', 'follow us', 'read more', 'related:', 'share this',
  'getty images', 'photo:', 'image:', 'illustration:', 'you may also like',
  'privacy policy', 'terms of service', 'enable javascript', 'log in',
  'this site uses', 'support our work', 'donate', 'sponsored'
].join('|'), 'i');

/**
 * Pull the opening paragraphs of the article itself, so the summary is written
 * from real reporting rather than whatever fragment the RSS feed carried.
 * Returns '' whenever the page cannot be read — the caller falls back to the feed.
 */
export async function extractArticle(pageUrl, maxWords = 150) {
  const html = await fetchText(pageUrl, { timeout: 14000, label: 'article ' + pageUrl });
  if (!html) return '';

  // Narrow to the article container when the page offers one.
  let scope = html;
  const containers = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+class=["'][^"']*(?:article-?body|post-?content|entry-?content|story-?body|articleBody)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  ];
  for (const re of containers) {
    const m = html.match(re);
    if (m && m[1] && m[1].length > 400) { scope = m[1]; break; }
  }

  scope = scope
    .replace(/<(script|style|nav|aside|form|figcaption|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ');

  const paras = (scope.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [])
    .map(p => stripHtml(p))
    .filter(t => {
      if (t.length < 60) return false;              // captions, bylines, stubs
      if (JUNK.test(t)) return false;
      if (/^by\s+\w+/i.test(t) && t.length < 120) return false;
      if (!/[.!?]/.test(t)) return false;           // headings caught by <p>
      return true;
    });

  if (!paras.length) return '';

  const out = [];
  let count = 0;
  for (const p of paras) {
    const words = p.split(/\s+/).length;
    if (count && count + words > maxWords + 40) break;
    out.push(p);
    count += words;
    if (count >= maxWords) break;
  }
  return out.join(' ');
}

/** Look for an og:image on the article page (used only for the two picks). */
export async function findOgImage(pageUrl) {
  const html = await fetchText(pageUrl, { timeout: 12000, label: 'og:image ' + pageUrl });
  if (!html) return '';
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && /^https?:\/\//i.test(m[1])) return decodeEntities(m[1]);
  }
  return '';
}
