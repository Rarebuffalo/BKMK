# Near-instant analysis: what's possible, and what was built

Investigated 2026-10-30. **Goal:** a user goes from landing page to Bookmark DNA reveal in about a minute, with no X API cost to the owner.

## Bottom line

- **There is no officially supported, free and automatic way for a third-party app to read a user's private X bookmarks.**
  - The only published interface for bookmarks is the paid API.
  - X's terms forbid the methods a free extension would have to use.
- **What was built: "Copy from X".** The user opens their own bookmarks page, selects all, copies, and pastes into BKMK.exe. The paste is parsed in the browser, and the existing scan animation and reveal run straight away.
  - BKMK.exe never contacts X.
  - No extension, login or upload is needed.
  - It costs nothing.
- **The archive and file import stays as the fallback.** Live sync through the paid API stays off by default.

## 1. Could a browser extension do it?

**Technically, yes.** Once logged in, x.com loads bookmarks through its own **private GraphQL endpoint**, with cursor pagination, and renders them into the page as you scroll. Open-source tools show both of the ways an extension can collect them:

| Method | How | Problems |
|---|---|---|
| Call the internal GraphQL "Bookmarks" query with the user's session | Replays x.com's private API, as xarchive does | Undocumented, private endpoint. Query IDs and feature flags rotate every few weeks. Relies on the session cookie. **Excluded.** |
| Intercept x.com's own GraphQL responses | Patches `fetch`/XHR in the page, as twitter-web-exporter does | Still harvests data from a private API. Breaks with x.com changes. Needs broad host permissions. |
| Read the rendered page while the user (or the extension) scrolls | Content script walks the post elements | Automated extraction. Has to auto-scroll to paginate because the list is virtualised. Fragile selectors. |

None of these trigger X API charges, because no published X API is called. The obstacle is compliance.

**What the rules say:**
- **X Terms of Service** (effective 9 Oct 2026, https://x.com/en/tos):
  - Users may not "access or search or attempt to access or search the Services by any means (automated or otherwise) other than through our currently available, published interfaces".
  - It adds: "crawling or scraping the Services in any form, for any purpose without our prior written consent is expressly prohibited".
  - A liquidated-damages clause reaches anyone who "knowingly facilitate[s]" violations. It's priced per million posts, so it's unlikely to apply at this scale, but it's aimed squarely at tool vendors.
- **Chrome Web Store** (https://developer.chrome.com/docs/webstore/program-policies/policies) requires a single narrow purpose and minimal permissions. Its Limited Use rules apply to "scraped content or otherwise automatically gathered user data". Store listings can be removed if the site owner complains.
- **Firefox AMO** (https://extensionworkshop.com/documentation/publish/add-on-policies/) has similar minimal-permission and data-transmission rules.

Bookmark-export extensions and userscripts do exist, but that's evidence of tolerance, not permission. X tightened access specifically to fight scraping (the July 2023 read caps). An extension would also make BKMK.exe's main path depend on X not changing its private internals.

**Decision: no extension.** Every implementation either uses X's private API or automates extraction from x.com. Both conflict with X's terms, and building one is "facilitating" it. That rules out the product's main path being built on it.

## 2. Options compared

| | **Copy from X (built, default)** | Extension | User-owned X API keys | Archive / file import (fallback) |
|---|---|---|---|---|
| Time to first reveal | **About a minute** | About a minute after install | Hours: developer signup, app, billing | A day or more (X prepares the archive) |
| What the user installs or connects | Nothing | An extension with host permissions on x.com | An X developer account and a card | Nothing |
| Data | Post text, author, timestamp, links, ID: everything on screen | Same or more | Full API fields | Likes only (no bookmarks); no authors |
| Volume | About a screenful per copy; paste again to add more | Whole collection (automated) | Whole collection (~800 per X) | Whole archive |
| Ongoing cost to owner | **$0** | $0 | $0 | $0 |
| Cost to user | $0 | $0 | Their own X bill (~$0.001 per bookmark as Owned Reads) | $0 |
| Reliability | Good. Keys off permalinks and author links, with fallbacks for two known layouts. Fails safe ("no posts found"). | Breaks when x.com changes | Good, while funded | Very good |
| Compliance | The user manually copies their own screen; BKMK.exe never accesses X. Low risk (see below). | Conflicts with the X ToS | Fine only if each user runs their own app. BKMK.exe may not hold or operate their keys: X Developer Agreement §III.A(e) and the Developer Policy credential rules. | None |
| Privacy | Stays in the browser | Depends on implementation | Keys and data pass through a server | Stays in the browser |
| Effort | Small (done) | Medium, plus store review and upkeep | High | Done |

**Remaining risk with "Copy from X".**
- **Why it's low:**
  - BKMK.exe makes no request to X.
  - The user views their bookmarks through X's own published interface, the website, and copies text with the operating system clipboard. That's ordinary use, not crawling.
  - BKMK.exe automates nothing on x.com: no scripts, no scrolling, no interception.
- **Why it isn't zero:** X's terms say "(automated or otherwise)" and "scraping … in any form" without defining a manual carve-out, so a strict reading is possible. This isn't legal advice. If X objects, the archive and file paths remain.

## 3. The experience now

1. **Landing:** "Copy your X bookmarks page, paste it here…" with the primary button **Get my Bookmark DNA — free**. The demo is one click away.
2. **`/import`:** the default tab is **Copy from X · fastest**, in three steps:
   1. Open `x.com/i/bookmarks` (link opens in a new tab).
   2. Press Ctrl/⌘+A, then Ctrl/⌘+C.
   3. Press Ctrl/⌘+V in the paste box.
3. **Each paste:**
   - It's parsed from the clipboard's rich HTML, and merged and de-duplicated by post ID.
   - Feedback reads "+9 new · 3 already captured", and a meter fills toward 30, the size at which the Curation Score stops scaling for sample size.
   - "Scroll down on X and copy again" encourages more.
   - A paste with no posts gets a specific hint (including that copying from the X mobile app has no post links).
4. **Analyse:** the existing scan animation with real counts, then the reveal, dashboard, library and share card, tagged IMPORTED.
5. **Never charged:** no X API call exists in this path. Live sync stays off unless the owner opts in.

## What the paste captures, and its limits

- **From rich clipboard HTML** (desktop Chrome, Edge, Firefox and Safari put this on the clipboard):
  - the post ID and permalink;
  - author handle and name;
  - the timestamp from `<time datetime>`, or derived from the post ID;
  - post text;
  - real link destinations, read from the visible text of `t.co` links, e.g. `github.com/…`, so repos and papers are recognised. That's better than the archive.
- **Quoted posts** stay part of the bookmark that quotes them, not separate saves.
- **Only rendered posts can be copied.** x.com shows roughly a screenful at a time, so large collections need several copy-and-paste rounds. That's the honest cost of not automating.
- **Plain-text-only pastes** (some mobile browsers, the X app) carry no post links. Only pasted URLs are recognised then, and the UI says so.
- **Not verified against a logged-in account:** the parser was checked against x.com's public, logged-out markup (2026-10-30) and against synthetic fixtures of the widely used logged-in markup (`article[data-testid="tweet"]`, `User-Name`, `tweetText`, `<time>`). I didn't sign in to X. **Do one real test on your own bookmarks page before relying on it.** If x.com's markup has drifted, the fallback still recognises posts by their permalinks.
- **Storage:**
  - Captured posts live in `sessionStorage`, so they survive a reload of that tab but not closing it.
  - The analysed result is kept in `localStorage`, like other imports.
  - Nothing is uploaded.

## Sources

- X Terms of Service: https://x.com/en/tos
- X Developer Agreement: https://docs.x.com/developer-terms/agreement
- X Developer Policy: https://developer.x.com/en/developer-terms/agreement-and-policy
- X bookmarks API (paid): https://docs.x.com/x-api/users/get-bookmarks
- Chrome Web Store policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- Firefox add-on policies: https://extensionworkshop.com/documentation/publish/add-on-policies/
- twitter-web-exporter (illustrates the response-interception method; not used): https://github.com/prinsss/twitter-web-exporter
- 2023 read limits citing scraping: https://abc7news.com/elon-musk-twitter-read-limits-new-policy/13450400/
