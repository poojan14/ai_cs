# pvsnews

**AI and cybersecurity, every three hours.**

A self-updating news site for GitHub Pages. The front page carries exactly two stories — one on
artificial intelligence, one on cybersecurity — each summarised in 150 words or fewer for readers
who are not specialists. Every three hours a GitHub Action reads the public feeds
of established newsrooms, picks the strongest fresh story on each channel, and files the pair into a
searchable history.

No server, no database, no build step, no npm dependencies.

---

## Deploy it in five minutes

**1. Create the repository**

On GitHub, click **New repository**. Name it whatever you like, keep it **Public** (Pages is free
for public repos), and don't add a README — this folder already has one.

**2. Upload these files**

Easiest route in a browser: on the empty repo page choose **uploading an existing file**, then drag
in *everything from this folder, including the hidden `.github` folder*. Commit to `main`.

If you prefer the command line:

```bash
cd pvsnews
git init -b main
git add .
git commit -m "pvsnews"
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git push -u origin main
```

> Dragging files into the browser uploader sometimes drops hidden folders. After uploading, check
> that `.github/workflows/update-news.yml` is in the repo. If it is missing, add it with
> **Add file → Create new file** and paste the path `.github/workflows/update-news.yml`.

**3. Turn on Pages**

**Settings → Pages → Build and deployment**. Set *Source* to **Deploy from a branch**, branch
**main**, folder **/ (root)**. Save. Your address appears within a minute:
`https://YOUR-NAME.github.io/YOUR-REPO/`

**4. Let the workflow write to the repo**

**Settings → Actions → General → Workflow permissions**. Choose **Read and write permissions** and
save. Without this the update job cannot commit the news it fetches.

**5. Run the first update**

**Actions → Update news feed → Run workflow**. It takes about 30 seconds. Refresh your site and the
two stories are there. From then on it runs by itself every three hours.

That's the whole deployment.

---

## Optional: plain-English briefs written by Claude

Out of the box, each brief is the publisher's own summary trimmed to 150 words. That is accurate but
still written for a tech audience.

Add a repository secret named `ANTHROPIC_API_KEY` (**Settings → Secrets and variables → Actions →
New repository secret**) and the workflow will instead have Claude rewrite every brief in plain
English, explain the jargon inline, and add a one-line *Why it matters*. Roughly a few cents a day
at eight updates.

Nothing else changes — if the key is missing or the call fails, the site quietly falls back to the
publisher summary.

---

## Making it yours

| What you want to change | Where |
| --- | --- |
| The news sources | `scripts/sources.json` — add or remove any RSS/Atom feed, `weight` sets priority |
| How often it updates | `cron` in `.github/workflows/update-news.yml`, and `CYCLE_HOURS` if you change it |
| Colours, type, spacing | the token block at the top of `assets/css/site.css` |
| Site name and footer | `index.html` and `archive.html` (search for `pvsnews`) |
| Accent colours and theme | the token block at the top of `assets/css/site.css` |
| Brief length | `MAX_WORDS` in `scripts/build-news.mjs` |

Cron runs on UTC. `0 */3 * * *` fires at 00:00, 03:00, 06:00 and so on. GitHub often starts
scheduled jobs a few minutes late on busy runners; that is normal and the countdown on the site
tolerates it.

To preview locally:

```bash
node scripts/build-news.mjs     # fetch a fresh pair of stories
python3 -m http.server 8000     # then open http://localhost:8000
```

---

## What is in the box

```
index.html                     front page — the two current stories
archive.html                   full history, filterable and searchable
assets/css/site.css            the whole design system
assets/js/common.js            formatting, image fallbacks, safety helpers
assets/js/home.js              front page rendering + live countdown
assets/js/archive.js           filters, search, expand, permalinks
scripts/build-news.mjs         the newsroom: fetch, score, pick, summarise
scripts/feedlib.mjs            dependency-free RSS/Atom parser
scripts/sources.json           the feed list
data/latest.json               the two current stories (written by the workflow)
data/archive.json              everything published so far
.github/workflows/update-news.yml   the three-hour schedule
.nojekyll                      tells Pages to serve the files as-is

The site is dark by default with a light/dark switch in the header; the choice is
remembered per device.
```

## How a story gets chosen

1. Every feed on the channel is fetched in parallel; a feed that is down is skipped, not fatal.
2. Items are deduplicated by canonical URL and by fuzzy title, so the same story from three outlets
   counts once.
3. Each item is scored on freshness, the outlet's weight, whether it has a usable image, how well it
   matches the channel's vocabulary, and whether there is enough text to summarise honestly.
   Sponsored posts, deals and coupon pages are pushed to the bottom.
4. Anything already in the history is excluded, and the picker prefers a different outlet from last
   cycle, so the front page keeps moving.
5. The opening paragraphs of the article itself are read and cleaned of bylines, captions,
   newsletter pitches and cookie notices. Summaries are written from that text, not from the
   one-line RSS blurb, which is what makes them read like real writing. If the page cannot be
   read, the feed summary is used instead.
6. The winner gets an image (from the feed, or the article's own `og:image`), a summary of 150
   words or fewer, and a permanent entry in the archive.

## Good manners

The site summarises and links; it does not republish. Headlines, images and reporting remain the
property of the original publishers, every card links straight back to them, and briefs are capped
at 150 words. If a publisher asks to be removed, delete their entry from `scripts/sources.json`.

Images are hotlinked from the publisher. If one blocks that, a generated channel-coloured card
appears instead, so the layout never breaks.

## If something looks wrong

| Symptom | Fix |
| --- | --- |
| Site says "First transmission pending" | Run **Actions → Update news feed → Run workflow** once |
| Workflow fails at the commit step | Settings → Actions → General → **Read and write permissions** |
| Nothing happens on schedule | GitHub pauses cron on repos with no activity for 60 days — push any commit to wake it |
| Fonts look plain | The Google Fonts request was blocked; the fallback stack is intentional and safe |
| A story looks stale | Only stories from the last 48 hours are eligible; if every fresh item was already used, the previous pick stays until something new lands |

MIT licensed. Built to be edited.
