# Request to X: guidance and permission for user-authorized bookmark import

**Status:** draft, not sent. Prepared 2026-11-02. Nothing in BKMK.exe retrieves X bookmarks today, and nothing will until X answers in writing and the owner approves the next phase.

## Before you send it

1. **Fill in every `[bracketed]` field.** This draft deliberately contains no names, company details or contact addresses. Use only details that are true.
2. **Find the right channel yourself.** This draft doesn't include an X address. Use a contact or support route that X currently lists for developers, for example in the X Developer Console or on [docs.x.com](https://docs.x.com). Ask there whether policy questions should go to the Developer Platform team or to Legal.
3. **Re-check the cited terms and prices.** The quotes and prices below were read on 2026-11-01. If X has changed them since, update the figures and dates.
4. **Keep the reply.** Store X's written answer, or a record that it didn't answer, next to this file. The import approach is chosen only after reviewing it.

---

**Subject:** Permission request: user-authorized import of a user's own bookmarks for BKMK.exe

Hello X Developer Platform team,

My name is [Your name], and I build BKMK.exe ([https://bkmk-ashy.vercel.app](https://bkmk-ashy.vercel.app)), an independent web app [operated by: your name or legal entity]. I'm writing to ask for X's written guidance, and if appropriate, permission, before I implement any method of importing a user's X bookmarks. I have not built or released such a method.

### What BKMK.exe is

BKMK.exe turns a person's own X bookmarks into a personal, game-like profile called a "Bookmark DNA":

- an archetype (for example "The Builder" or "The Researcher");
- a Curation Score;
- topic breakdowns;
- badges with visible rules;
- a searchable library of what they saved, with links back to the original posts on X.

Classification is rules-based and transparent; no AI model is trained on or fed user content. Users can share a summary card, which shows totals and badges, never bookmark contents. BKMK.exe currently has no ads, payments or subscriptions.

### How it works today

- **Official integration, built but switched off.** BKMK.exe has a complete OAuth 2.0 (PKCE) integration with `GET /2/users/{id}/bookmarks`, using the scopes `tweet.read users.read bookmark.read offline.access`. It's switched off because pay-per-use reads aren't affordable for this project right now. When I checked X's pricing page on 1 Nov 2026, it listed $0.005 per post read and $0.010 per user read. Please correct me if those figures are out of date.
- **What visitors can use instead:** a demo profile built from synthetic sample data, and local imports that run in the browser: files people already have, or text they copy by hand from their own X bookmarks page and paste in. None of these contacts X or automates anything on x.com.
- **On the site:** "Connect with X" is clearly marked as not enabled, and the site says I'm preparing to ask X for guidance and permission.

### The experience I'd like to offer

1. The user signs in to X normally, in their own browser.
2. They choose "Import my bookmarks" in BKMK.exe and explicitly authorize it.
3. Their own bookmarks are imported and analysed.
4. They see their Bookmark DNA and library.

No copying, pasting, archive requests or file uploads.

### Why I'm asking about a browser extension or local companion

Because of cost, I'm evaluating whether a user-installed browser extension, or a small local companion, could import a user's own bookmarks from their signed-in browser session, at the user's explicit request, without paid API reads. Tools like this already exist for personal use. I have **not** assumed that this is permitted for a hosted product, and I'm aware of these provisions:

- **X Terms of Service** (effective 9 Oct 2026):
  - "You may not access the Services in any way other than through the currently available, published interfaces that we provide."
  - "crawling or scraping the Services in any form, for any purpose without our prior written consent is expressly prohibited."
  - It is also a violation "to facilitate or assist others in violating these Terms, including by distributing products or services that enable or encourage violation."
- **X Developer Agreement** (last updated 27 Apr 2026): §III.B (Commercial Use), §III.L (pay-per-use scope) and §III.M (when an Enterprise plan is required).
- **X Developer Policy:** "express and informed consent", and its note that "a person authenticating into your service does not by itself constitute consent."

That's why I'm asking before building anything.

### Safeguards I would commit to

- **The user starts every import.** Nothing runs in the background or on a schedule unless the user turns it on and X allows it.
- **Own bookmarks only.** Never another person's data. No other X data: no DMs, likes, followers or timelines.
- **No credentials collected.** BKMK.exe would never ask for, store or transmit X passwords, two-factor codes, session cookies or tokens. Its servers would never receive them.
- **Local first.** Bookmarks would be processed in the user's browser where possible. Anything sent to BKMK.exe would be limited to what the profile needs: post ID, post text, author handle and display name, post date, and link URLs. Media would not be downloaded.
- **Gentle on X.** Requests paced to normal browsing, existing limits respected, and any rate limit, verification prompt or error treated as a hard stop, never worked around.
- **User control.** One-click deletion of everything BKMK.exe holds. Today, server-side account data is deleted automatically after 90 days of inactivity, and locally imported data stays in the user's browser until they delete it.
- **No resale or redistribution.** No selling, licensing, sharing with third parties, or training models on user content.
- **Clear disclosure** to users of what is read, where it goes and how to remove it. Happy to show X the exact wording.
- **Willing to stop or change** the method at any time if X asks.

### Questions for X

**Policy and permission**
1. Is a user-installed browser extension or local companion that imports a user's own bookmarks, at their explicit request, permitted for a product like BKMK.exe? If only with written permission, how do I apply, and what would X need from me?
2. Does X treat these methods differently?
   - reading the bookmarks page the user has open;
   - capturing data X's own web app has already loaded in that page;
   - the extension making its own requests on the user's behalf.
3. Does the answer change for a free product versus a product that later charges users?
4. Would X prefer that this kind of import not be built at all, with users sent to an official route instead?

**Technical**

5. Is there an official, documented way for a user to export or share their own bookmarks with an app they choose, other than paid API reads?
6. If X permits an extension-based method, which mechanism does X prefer, and what rate limits or behaviour must it follow?

**Commercial use and access**

7. Under the Developer Agreement, is BKMK.exe a "limited number of end-users" or early-stage integration while it remains free and small? At what point would X expect an Enterprise plan?
8. Could BKMK.exe be eligible for API credits, for example through the Exhibit or Public Utility programmes, or through any developer, startup or non-profit programme, so the existing official integration could be switched on?

**Approval**

9. What written confirmation should I keep on file, and what conditions would apply, before releasing any import method?

### Willing to adapt

I'll change the design to fit X's requirements, including:

- using only official interfaces;
- limiting volume;
- adding disclosures or consent steps X specifies;
- not offering the feature at all.

I'll wait for X's answer before implementing anything.

Thank you for your time.

[Your name]
[Your role, if any]
[Contact email you control]
BKMK.exe · [https://bkmk-ashy.vercel.app](https://bkmk-ashy.vercel.app)
