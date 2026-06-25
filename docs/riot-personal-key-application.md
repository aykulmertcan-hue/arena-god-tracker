# Riot Personal API Key — başvuru metni

## Nasıl başvurulur
1. https://developer.riotgames.com → giriş yap.
2. Üstte **"Register Product"** → **"Personal API Key"** seç.
3. Aşağıdaki alanları doldur → gönder. Onay e-postayla gelir (genelde birkaç gün).
4. Onaylanınca aldığın key **24 saatte expire OLMAZ** → uygulamada 🔑 ile bir kez gir, bitti.

> ⚠️ Not: Form **görüntülenebilir bir Product URL** ister. Repo şu an **private** —
> inceleyen göremez. Ya repoyu **public** yap (içeride sır yok; key sadece lokalde tutuluyor),
> ya da URL'ye herkese açık bir sayfa koy. En kolayı repoyu public yapmak.

---

## Form alanları (kopyala-yapıştır)

**Product Name**
```
Arena God Overlay
```

**Product URL**
```
https://github.com/aykulmertcan-hue/arena-god-tracker
```

**Product Description**
```
A personal, non-commercial desktop overlay that helps a single player track their
own "Arena God" challenge progress in League of Legends. During Arena (gameMode
CHERRY) champion select, it shows which champions the player has not yet placed
1st with this season, so they can pick one they still need.

How it uses the API:
- The League Client (LCU) identifies the logged-in player (puuid) and detects the
  Arena champion-select phase.
- Match-V5 reads the player's own Arena match history (queues 1700 and 1750) and
  checks each participant's subteamPlacement to detect 1st-place finishes per
  champion.
- Data Dragon provides the champion list and portrait images.

It is strictly read-only and shows ONLY the player's own placement (1st-place)
data. It does NOT display augment or item win-rates, tier lists, or any aggregated
statistical/performance data. No automation, no game-memory access, no injection —
it is a separate overlay window that uses only official Riot APIs and the LCU.

Usage is single-user / personal (plus a few friends running their own copy with
their own key). Not monetized. API usage is light: a one-time backfill of the
player's Arena history, then incremental fetches of new matches on manual refresh.
```

**APIs used:** Account-V1, Match-V5, Data Dragon, League Client (LCU).

**Not monetized / personal use:** evet.
