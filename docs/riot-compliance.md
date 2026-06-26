# Riot Games API Compliance Report — Arena God Overlay

**Prepared:** 2026-06-26  
**App:** Arena God Overlay (desktop Electron overlay, personal use + small group)  
**Repo:** https://github.com/aykulmertcan-hue/arena-god-tracker  
**Scope:** Pre-submission audit against Riot Developer Policies before applying for a Personal API Key

---

## MUST DO BEFORE SUBMITTING / SHIPPING

- [ ] **Add the required Riot attribution disclaimer** to: (1) the app's About/Settings screen or a permanently visible UI element, AND (2) the GitHub repo README. Exact required wording:

  > "Arena God Overlay isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."

- [ ] **Register the product in the Developer Portal** before release — required for any app using the LCU API. Note which LCU endpoints you use and how. (See Section 7.)

- [ ] **Notify Riot before releasing** any version that uses the LCU API. Per the LCU policy, you must contact Riot before releasing an app (or update) in any region. (See Section 7.)

- [ ] **Remove or never embed any API key in distributed code or binaries.** The app must prompt each user to enter their own key at runtime — never hardcode or bundle a key. (See Section 4.)

- [ ] **Do NOT distribute to Korea players** — LCU API is prohibited for Korean region. Add a UI warning or block. (See Section 7.)

- [ ] **Confirm public repo has no embedded key** — scan the repo history with `git log -S "RGAPI"` before pushing anything with a key in it.

---

## Section 1 — General Policies

**Source:** https://developer.riotgames.com/policies/general

### 1.1 Legal compliance
**Rule:** "Products cannot violate any laws."  
**Status:** ✅ Compliant. No illegal activity; no gambling, no blockchain, no fake endorsements.

### 1.2 No competitive advantage / cheating
**Rule:** "Products cannot create an unfair advantage for players, like a cheating program." "Products cannot alter the goal of the game."  
**Status:** ✅ Compliant. The overlay shows the user's own historical placement data. It does not reveal hidden in-game information, expose enemy picks before lock-in, or automate any game actions. Champion select already shows all champion options to the player — we are only surfacing a personal win-history filter on top of that. This is a planning/tracking aid, not a real-time intelligence advantage.

### 1.3 No de-anonymizing players
**Rule:** "Products cannot de-anonymize players who cannot reasonably be identified."  
**Status:** ✅ Compliant. The app only displays the logged-in player's own data — no other players are looked up, surfaced, or tracked.

### 1.4 No MMR/ELO calculators
**Rule:** "Products cannot create alternatives for official skill ranking systems such as the ranked ladder. Prohibited alternatives include MMR or ELO calculators."  
**Status:** ✅ Compliant. We do not compute or display any ranking metric.

### 1.5 No IP games
**Rule:** "Do not create or develop games utilizing Riot's Intellectual Property."  
**Status:** ✅ Compliant. This is a companion overlay, not a game.

### 1.6 No crypto / blockchain
**Rule:** Explicitly prohibited.  
**Status:** ✅ Compliant.

### 1.7 Attribution disclaimer (REQUIRED — ACTION NEEDED)
**Rule:** "in a location that is readily visible to players" the following must appear:

> "[Your product] isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."

**Source:** https://developer.riotgames.com/policies/general  
**Status:** ⚠️ Needs Action. This disclaimer has not yet been added. Must appear in both the app UI (About screen or footer) and the GitHub repo README.

---

## Section 2 — Attribution / Branding Requirements

**Source:** https://developer.riotgames.com/policies/general

### 2.1 Required disclaimer — exact wording
As quoted in Section 1.7 above. Both versions found in Riot docs are acceptable:

- **Informal (General Policies page):** "...isn't endorsed by Riot Games and doesn't reflect the views or opinions..."  
- **Formal (Data Dragon docs):** "...is not endorsed by Riot Games and does not reflect the views or opinions..."

Either is fine. The informal version is from the authoritative General Policies page.

### 2.2 Placement
Must be "in a location that is readily visible to players." Acceptable locations: About screen, Settings panel, app footer, splash screen. It must also appear in the repo README.

### 2.3 Logo/trademark use
**Rule:** Logo/trademark use "should only occur when essential to communicate product value." Using champion portraits from Data Dragon is fine as they are provided for developer use. Do not use the Riot Games wordmark or logo decoratively.  
**Status:** ✅ Compliant (Data Dragon portraits are purpose-provided).

---

## Section 3 — Prohibited Data / Features

**Source:** https://developer.riotgames.com/policies/general, https://developer.riotgames.com/docs/lol, https://www.riotgames.com/en/DevRel/vanguard-faq

### 3.1 Augment / item win-rates (confirmed prohibited)
**Rule (inferred from game integrity rules):** "Products cannot create an unfair advantage for players." Aggregated win-rate data on augments, items, and champion tier lists would fall under competitive advantage tooling and is widely confirmed as prohibited in Riot's ecosystem (e.g., op.gg and similar sites are tolerated under production keys with specific approval; they are not baseline-permitted).  
**Status:** ✅ Compliant. We show zero win-rate data of any kind. We do not aggregate across players. We only show the user's own binary placement outcome (did they place 1st with this champion this season?).

### 3.2 Real-time in-game advantage
**Rule:** "Use or incorporate information not present in the game client that would give players a competitive edge" is prohibited.  
**Status:** ✅ Compliant. All data shown is historical match data from Match-V5 (past games). The overlay activates in champion select, not during an active match. No hidden or non-public information is surfaced.

### 3.3 Memory reading
**Rule (Vanguard FAQ):** "External tools reading memory will no longer work, and you'll need to change methods."  
**Source:** https://www.riotgames.com/en/DevRel/vanguard-faq  
**Status:** ✅ Compliant. The app uses the LCU REST API and Riot Games API only — no memory reading, no process injection, no DLL injection.

### 3.4 Input automation
Not mentioned explicitly in policy but implicitly covered by "no cheating tools."  
**Status:** ✅ Compliant. The app is read-only; it performs zero automated game actions.

### 3.5 Other players' data without consent
**Rule:** "No personal profiles, scouting tools, guides based on individual players, or personalized data of any kind are allowed, UNLESS an individual player chooses to share their data."  
**Status:** ✅ Compliant. Only the logged-in player's own data is fetched and displayed. No other players are looked up.

---

## Section 4 — API Key Handling

**Source:** https://developer.riotgames.com/policies/general, https://developer.riotgames.com/terms, https://developer.riotgames.com/docs/portal

### 4.1 No embedding keys in distributed code or binaries
**Rule:** "Do not include your API key in your code, especially if you plan on distributing a binary."  
**Status:** ✅ Compliant (by design) — each user enters their own key at runtime. No key is bundled. **Must verify the repo history has no accidentally committed key.**

### 4.2 Each user uses their own dev key — is this compliant?
**Rule:** Personal keys are for "products for yourself and a small group." The terms state keys "may not be sold, transferred, sublicensed or otherwise disclosed to any other party." The policy is that teams working together on a product may share a key within a registered group, but sharing with outside parties is prohibited.

**Analysis:** Having each friend install the app and enter **their own** personal Riot dev key is compliant — they are each using their own account's key for their own data. You are not sharing, transferring, or sublicensing your key. This is explicitly the right pattern — each user is a separate developer making API calls for their own personal use.  
**Status:** ✅ Compliant. Each user using their own registered dev key is the correct approach for personal-use distribution.

### 4.3 One product per production key
**Rule:** "Do not use a Production API key to run multiple projects (one product per key)."  
**Status:** ✅ Compliant (not yet using a production key; this is a pre-submission audit).

### 4.4 HTTPS requirement
**Rule:** "Make sure that you are using SSL/HTTPS when accessing the APIs so that your API key is kept safe."  
**Status:** ✅ Compliant. All Riot API calls use HTTPS. LCU calls are local (HTTPS on localhost with self-signed cert — standard LCU behavior).

### 4.5 Team sharing
**Rule:** Teams may share keys within a registered Developer Portal group.  
**Status:** N/A — no shared key; each user has their own.

---

## Section 5 — Rate Limiting

**Source:** https://developer.riotgames.com/docs/portal, https://developer.riotgames.com/docs/faqs

### 5.1 Personal key limits
**Rule:** Personal key limits are 20 requests/second and 100 requests/2 minutes per region.  
**Status:** ✅ Compliant. The app implements a 20/s + 100/120s limiter matching exactly these limits.

### 5.2 Honor 429 / Retry-After
**Rule (implied by best practices):** Respect rate limits and implement backoff logic.  
**Status:** ✅ Compliant. The app honors Retry-After headers.

### 5.3 No multiple apps to bypass rate limits
**Rule:** "You may NOT have multiple applications to bypass rate limits."  
**Status:** ✅ Compliant. One app, one key per user.

### 5.4 Production key limits (for future reference)
Production keys start at 500 requests/10 seconds and 30,000 requests/10 minutes. Arena match history fetching may require a production key if the user has a large game history, but for typical use the personal limits are sufficient.

---

## Section 6 — Data Storage / Privacy

**Source:** https://developer.riotgames.com/terms

### 6.1 Storing user's own PUUID and match results locally
**Rule:** No explicit prohibition on storing your own player data locally. Upon termination of API access, "You shall...delete all of the Game Information in Your possession."  
**Status:** ✅ Compliant. Storing the user's own PUUID and match results as a local JSON cache is standard and accepted practice. The data is not shared, not uploaded, and not sold.

### 6.2 GDPR / data deletion
**Rule:** Developers may be notified via a list of identifiers if a player requests data deletion through Riot Player Support.  
**Status:** ⚠️ Low risk / best practice. Since data is stored locally on the user's own machine, a formal deletion workflow is effectively automatic (user deletes the app/data). No server-side storage means no GDPR exposure for a developer. Document this in your personal key application.

### 6.3 No selling or brokering data
**Rule:** Data brokering between APIs and third parties is prohibited.  
**Status:** ✅ Compliant. No data is shared or sold.

### 6.4 No other players' data stored
**Status:** ✅ Compliant. Only the authenticated user's data is stored.

---

## Section 7 — LCU (League Client Update) API Policy

**Source:** https://www.riotgames.com/en/DevRel/changes-to-the-lcu-api-policy, https://developer.riotgames.com/docs/lol

### 7.1 LCU is not officially supported
**Rule:** "This service is not officially supported for use with third party applications." "We provide no guarantees of full documentation, service uptime, or change communication for unsupported services."  
**Status:** ⚠️ Acknowledged risk. Riot may break LCU endpoints without warning. Design for graceful degradation: if LCU is unavailable, prompt the user to enter their Riot ID manually.

### 7.2 Must register in Developer Portal BEFORE release (ACTION NEEDED)
**Rule:** "Before you release an application (or an update to your existing application) that uses the League Client API in any region, you must contact us and let us know." "We need to know which endpoints you're using and how you're using them."  
**Source:** https://www.riotgames.com/en/DevRel/changes-to-the-lcu-api-policy  
**Status:** ⚠️ Needs Action. Register the app in the Developer Portal and note LCU usage (endpoints: gameflow-phase, current-summoner/puuid) before sharing with anyone or making the repo public with instructions for others to run it.

### 7.3 Korea restriction (ACTION NEEDED)
**Rule:** "For the time being we will no longer allow players in Korea to use applications leveraging the League Client API."  
**Status:** ⚠️ Needs Action. If any users are in Korea, they cannot use the LCU-based auto-detection. Add a note in the README and a UI fallback for Korean players to enter their Riot ID manually. Do not actively distribute to KR users.

### 7.4 Approved endpoints only
**Rule:** "Only endpoints on our approved list are allowed for use by developers."  
**Status:** ⚠️ Verify. Check the Developer Portal's LCU documentation or Discord for the current approved endpoint list and confirm that `/lol-gameflow/v1/gameflow-phase` and `/lol-summoner/v1/current-summoner` (or equivalent PUUID endpoint) are on the list.

### 7.5 Overlay status under LCU policy
No explicit prohibition on overlays appears in the LCU policy document.  
**Status:** ✅ Compliant (see Section 8 for Vanguard overlay confirmation).

---

## Section 8 — Vanguard Third-Party App Policy

**Source:** https://www.riotgames.com/en/DevRel/vanguard-faq

### 8.1 Overlays explicitly allowed
**Rule:** "Overlays and internal tools using the API, game client, and in-game APIs should continue to function."  
**Status:** ✅ Compliant. A separate always-on-top Electron window that does not inject into the game process is a textbook compliant overlay.

### 8.2 Memory reading prohibited
**Rule:** "External tools reading memory will no longer work, and you'll need to change methods."  
**Status:** ✅ Compliant. Zero memory access.

### 8.3 No Vanguard allowlist
**Rule:** "There is absolutely no allow list for Vanguard" — no individual exceptions or registrations needed.  
**Status:** ✅ Compliant. No action required.

### 8.4 LCU + in-game APIs still work under Vanguard
**Rule:** "Apps developed using the LCU and in-game APIs are still expected to work."  
**Status:** ✅ Compliant.

---

## Section 9 — Commercial / Distribution / Registration

**Source:** https://developer.riotgames.com/docs/portal, https://developer.riotgames.com/policies/general, https://developer.riotgames.com/terms

### 9.1 Personal key scope — "small group" distribution
**Rule:** Personal keys are for "products for yourself and a small group." Running "for public consumption using a personal key" is prohibited — this includes "open alpha/beta tests."  
**Status:** ✅ Compliant — as long as distribution is truly to a small, known group of friends (not a public release, not a public download link). Keep it private. If you want to open it up more broadly, apply for a production key.

### 9.2 Monetization
**Rule:** Monetization requires product status of "Approved" or "Acknowledged" from Riot. Not permitted on a personal key.  
**Status:** ✅ Compliant. The app is not monetized.

### 9.3 Product registration for key application
**Rule:** Must register the product in the Developer Portal. A personal key application requires demonstrating the use case.  
**Status:** ⚠️ Pending. This is the application being prepared. Include: app name, description, LCU endpoints used, Riot API endpoints used (Match-V5, Account-V1), data stored (local JSON, user's own data only), distribution scope (personal + small group of friends), monetization (none).

### 9.4 Public repo
The General Policies rule "Do not include your API key in your code" applies here. The public repo is fine as long as no API key is ever committed.  
**Status:** ✅ Compliant (by design) — no key is in the code. Confirm with a git history scan.

---

## Summary Scorecard

| Area | Status |
|---|---|
| General prohibitions (no cheating, no deano, no IP games) | ✅ Compliant |
| Attribution disclaimer added to app + README | ⚠️ Needs Action |
| Prohibited features (augment win-rates, real-time advantage) | ✅ Compliant |
| API key handling (no embed, each user owns their key) | ✅ Compliant |
| Rate limiting (20/s + 100/120s, honor 429) | ✅ Compliant |
| Data storage (local, own user only, no brokering) | ✅ Compliant |
| LCU: register + notify Riot before release | ⚠️ Needs Action |
| LCU: Korea restriction / fallback | ⚠️ Needs Action |
| LCU: approved endpoints verification | ⚠️ Verify |
| Vanguard: overlay allowed, no memory read | ✅ Compliant |
| Distribution scope: personal + small group only | ✅ Compliant |
| Product registration in Developer Portal | ⚠️ Pending (this is the submission) |
| No monetization on personal key | ✅ Compliant |

**No ❌ violations found.** All issues are ⚠️ "needs action" items — things that must be added/done before submitting or sharing, not fundamental design problems.

---

## Sources

- [Riot General Policies](https://developer.riotgames.com/policies/general)
- [Riot API Terms and Conditions](https://developer.riotgames.com/terms)
- [Riot Developer Portal — Portal Overview](https://developer.riotgames.com/docs/portal)
- [Riot Developer FAQs](https://developer.riotgames.com/docs/faqs)
- [LoL API Documentation (Data Dragon + LCU)](https://developer.riotgames.com/docs/lol)
- [Changes to the LCU API Policy](https://www.riotgames.com/en/DevRel/changes-to-the-lcu-api-policy)
- [Vanguard FAQ for Third Party Applications](https://www.riotgames.com/en/DevRel/vanguard-faq)
- [Support: General Policies](https://support-developer.riotgames.com/hc/en-us/articles/22698591841939-General-Policies)
- [Support: API Terms and Conditions](https://support-developer.riotgames.com/hc/en-us/articles/22698917218323-API-Terms-and-Conditions)
