#!/usr/bin/env node
/**
 * build-news.mjs — the pvsnews newsroom.
 *
 * 1. Pulls every RSS/Atom feed listed in sources.json
 * 2. Picks the single strongest fresh story per channel (AI, security)
 * 3. Writes a plain-English brief of 150 words or fewer
 * 4. Saves data/latest.json (the two front-page stories) and appends to data/archive.json
 *
 * Zero npm dependencies. Run: node scripts/build-news.mjs
 * Optional: set ANTHROPIC_API_KEY to have Claude rewrite each brief for non-technical readers.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFeed, fetchText, findOgImage, extractArticle, toBrief, wordCount,
  storyId, titleKey, canonicalUrl, stripHtml
} from './feedlib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CYCLE_HOURS = Number(process.env.CYCLE_HOURS || 3);
const MAX_WORDS = 150;
const ARCHIVE_CAP = 600;
const FRESH_HOURS = 48;

/* ---------------------------------------------------------------- scoring */

const NOISE = /(sponsored|advertorial|deal of the day|coupon|discount|best vpn|black friday|cyber monday|giveaway|webinar|podcast episode|subscribe now|newsletter sign)/i;

const KEYWORDS = {
  ai: ['ai', 'artificial intelligence', 'machine learning', 'model', 'llm', 'chatbot', 'openai',
    'anthropic', 'claude', 'gemini', 'deepmind', 'neural', 'agent', 'gpt', 'robot', 'training data',
    'nvidia', 'inference', 'copilot', 'generative'],
  sec: ['breach', 'hack', 'ransomware', 'malware', 'vulnerability', 'exploit', 'phishing', 'patch',
    'zero-day', 'cyber', 'attack', 'security', 'cve', 'leak', 'spyware', 'botnet', 'fraud', 'scam',
    'data theft', 'threat actor', 'encryption']
};

function hoursOld(iso) {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function score(item, channel) {
  const age = hoursOld(item.published);
  let s = 100;
  s -= Math.min(age, FRESH_HOURS) * 1.6;          // fresher is better
  s += (item.weight || 5) * 2.2;                   // editorial priority of the outlet
  if (item.image) s += 12;                         // a story with a real photo presents better
  const hay = (item.title + ' ' + item.body).toLowerCase();
  const hits = KEYWORDS[channel].filter(k => hay.includes(k)).length;
  s += Math.min(hits, 6) * 3;                      // on-topic for this channel
  if (wordCount(item.body) > 40) s += 8;           // enough text to summarise honestly
  if (NOISE.test(item.title)) s -= 60;             // adverts and housekeeping posts
  if (item.title.length < 25) s -= 10;
  if (/^(cve-|advisory)/i.test(item.title)) s -= 8;
  return s;
}

function tagsFor(item, channel) {
  const hay = (item.title + ' ' + item.body).toLowerCase();
  const found = KEYWORDS[channel].filter(k => hay.includes(k) && k.length > 3);
  const pretty = found.slice(0, 3).map(t => t.replace(/\b\w/g, c => c.toUpperCase()));
  return [...new Set(pretty)];
}

/* ----------------------------------------------------------- plain English */

const PROMPT = `You write a two-story news bulletin for people who are curious but not technical.
Rewrite the item below as JSON only, no markdown fences, with exactly these keys:
{"brief": "...", "whyItMatters": "..."}

Rules for "brief":
- 110 to 150 words, plain English, short sentences.
- Explain any jargon in the same sentence you use it (e.g. "ransomware, software that locks files until a payment is made").
- Only facts present in the source text. No speculation, no invented numbers, no quotes.
- Neutral news tone. Do not address the reader as "you". Do not start with "This article".

Rules for "whyItMatters": one sentence, 25 words or fewer, on the practical consequence for an ordinary person or small business.`;

async function rewriteWithClaude(item) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system: PROMPT,
        messages: [{
          role: 'user',
          content: `HEADLINE: ${item.title}\nSOURCE: ${item.source}\nTEXT: ${item.body.slice(0, 6000)}`
        }]
      })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
    if (!parsed.brief) return null;
    return {
      brief: toBrief(parsed.brief, MAX_WORDS),
      whyItMatters: stripHtml(parsed.whyItMatters || '').slice(0, 220)
    };
  } catch (err) {
    console.warn('  ! Claude rewrite unavailable, using source summary:', err.message);
    return null;
  }
}

/* ------------------------------------------------------------------ build */

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function collect(channel, feeds) {
  const items = [];
  const results = await Promise.all(feeds.map(async feed => {
    const xml = await fetchText(feed.url, { label: feed.name });
    if (!xml) return [];
    const parsed = parseFeed(xml);
    console.log(`  \u2713 ${feed.name}: ${parsed.length} items`);
    return parsed.map(p => ({ ...p, source: feed.name, sourceSite: feed.site, weight: feed.weight }));
  }));
  for (const r of results) items.push(...r);
  return items.filter(i => hoursOld(i.published) <= FRESH_HOURS || !i.published)
    .map(i => ({ ...i, channel }));
}

function dedupe(items) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const out = [];
  for (const i of items) {
    const u = canonicalUrl(i.link);
    const t = titleKey(i.title);
    if (seenUrl.has(u) || (t && seenTitle.has(t))) continue;
    seenUrl.add(u);
    if (t) seenTitle.add(t);
    out.push(i);
  }
  return out;
}

async function buildStory(item, channelMeta, channel) {
  let image = item.image;
  if (!image) image = await findOgImage(item.link);

  // Prefer the article's own opening paragraphs; RSS blurbs are often a
  // single truncated sentence, which is what makes a summary read badly.
  const article = await extractArticle(item.link, MAX_WORDS);
  const feedText = item.body || '';
  const source = wordCount(article) >= 60 ? article : feedText;
  console.log(`     text: ${wordCount(article)} words from article, ${wordCount(feedText)} from feed`);

  const ai = await rewriteWithClaude({ ...item, body: source });
  const brief = ai?.brief || toBrief(source || item.title, MAX_WORDS);
  return {
    id: storyId(item.link),
    channel,
    channelLabel: channelMeta.label,
    channelCode: channelMeta.code,
    title: item.title,
    brief,
    whyItMatters: ai?.whyItMatters || '',
    words: wordCount(brief),
    url: canonicalUrl(item.link),
    source: item.source,
    sourceSite: item.sourceSite,
    image: image || '',
    published: item.published || new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    tags: tagsFor(item, channel),
    rewritten: Boolean(ai)
  };
}

async function main() {
  const sourcesFile = process.env.SOURCES_FILE
    ? path.resolve(process.env.SOURCES_FILE)
    : path.join(__dirname, 'sources.json');
  const config = await readJson(sourcesFile, null);
  if (!config) throw new Error('sources.json missing or invalid');

  const archive = await readJson(path.join(DATA, 'archive.json'), { stories: [] });
  const previous = await readJson(path.join(DATA, 'latest.json'), { stories: {} });
  const usedUrls = new Set((archive.stories || []).map(s => canonicalUrl(s.url)));
  const usedTitles = new Set((archive.stories || []).map(s => titleKey(s.title)));

  const stories = {};
  for (const [channel, meta] of Object.entries(config.channels)) {
    console.log(`\n\u25B8 ${meta.code} ${meta.label}`);
    const pool = dedupe(await collect(channel, meta.feeds));

    const ranked = pool
      .map(i => ({ ...i, _score: score(i, channel) }))
      .sort((a, b) => b._score - a._score);

    const lastSource = previous.stories?.[channel]?.sourceSite;
    const unseen = ranked.filter(i => !usedUrls.has(canonicalUrl(i.link)) && !usedTitles.has(titleKey(i.title)));
    const preferred = unseen.filter(i => i.sourceSite !== lastSource);
    const pick = preferred[0] || unseen[0] || ranked[0];

    if (!pick) {
      console.warn(`  ! nothing usable for ${channel}; keeping the previous story`);
      if (previous.stories?.[channel]) stories[channel] = previous.stories[channel];
      continue;
    }
    console.log(`  \u2192 picked: ${pick.title} (${pick.source}, score ${pick._score.toFixed(0)})`);
    stories[channel] = await buildStory(pick, meta, channel);
  }

  const now = new Date();
  const latest = {
    generatedAt: now.toISOString(),
    nextUpdateAt: new Date(now.getTime() + CYCLE_HOURS * 36e5).toISOString(),
    cycleHours: CYCLE_HOURS,
    stories
  };

  // Archive: newest first, no duplicates, capped.
  const existing = archive.stories || [];
  const fresh = Object.values(stories).filter(s => !existing.some(e => e.id === s.id));
  const merged = [...fresh, ...existing]
    .sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt))
    .slice(0, ARCHIVE_CAP);

  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(path.join(DATA, 'latest.json'), JSON.stringify(latest, null, 2));
  await fs.writeFile(path.join(DATA, 'archive.json'), JSON.stringify({
    updatedAt: now.toISOString(),
    count: merged.length,
    stories: merged
  }, null, 2));

  console.log(`\n\u2713 wrote data/latest.json and data/archive.json (${merged.length} in history, ${fresh.length} new)`);
}

main().catch(err => {
  console.error('\u2717 build failed:', err);
  process.exit(1);
});
