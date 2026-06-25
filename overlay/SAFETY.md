# SAFETY — Vanguard / ToS boundary (READ BEFORE ADDING FEATURES)

This overlay is intentionally in Riot's **allowed** category: a separate
always-on-top window that reads the **LCU** (localhost REST) and the official
**Riot Web API**. It never touches the game. Riot's anti-cheat **Vanguard**
(kernel-level) does not flag this kind of tool — the same pattern Blitz /
Porofessor / Mobalytics use. It also only appears during **champ select**
(client phase), before the Vanguard-protected game process is even running.

## NEVER add these — they WILL trip Vanguard and can get accounts banned

- ❌ **Injecting into the game/client process** (DLL injection, render/Direct3D
  hooks, drawing *inside* the game). Keep the overlay a separate OS window.
- ❌ **Reading or writing game memory** (process memory scans, pointers).
- ❌ **Input automation / scripting** (auto-pick, auto-accept, simulated clicks
  or key presses into the game or client).
- ❌ **Loading kernel drivers** or anything requiring elevated/kernel access.
- ❌ Reading any data not exposed by the LCU or the official Riot Web API.

## SAFE — what this app does and may keep doing

- ✅ Separate Electron window (`alwaysOnTop`), no injection.
- ✅ LCU REST over `127.0.0.1` (auto account + gameflow phase) — explicitly
  permitted by Riot's LCU policy.
- ✅ Official Riot Match-V5 / Account-V1 / Data Dragon over HTTPS.
- ✅ Placement (1st-place) tracking only — **no augment/item win-rate** display
  (that specific feature is prohibited by Riot policy).

## Other constraints

- **Korea:** Riot does not permit LCU-based apps for KR players.
- **Public distribution:** notify Riot (Developer Relations) before releasing.
- LCU is unofficial/unsupported and may change on any patch.
