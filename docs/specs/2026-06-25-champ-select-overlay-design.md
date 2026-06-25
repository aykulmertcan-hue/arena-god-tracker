# Arena God Overlay — Champ-Select Overlay Design (Spec)

_Tarih: 2026-06-25_
_Durum: Onaylandı (Yaklaşım B). Hedef: çalışan final, kullanıcının kendi Riot dev key'iyle._

## 1. Amaç

League of Legends Arena şampiyon-seçim ekranındayken, oyuncuya **bu sezon henüz 1.'lik almadığı şampiyonları** gösteren cross-platform bir masaüstü overlay. Oyuncu doğru şampiyonu (Arena God için eksik olanı) seçebilsin. İstemcinin içine değil, üstünde duran şeffaf pencere olarak çalışır.

## 2. Onaylanmış kararlar

- **Yaklaşım B:** Kendi içinde Electron uygulaması (Mac + Windows). Python yok; mevcut Python backend mantığı TypeScript'e **port** edilir (referans: `docs/references/riot-api.md`).
- **LCU ile otomatik:** giriş yapılan hesabı LCU'dan okur (Riot ID yazılmaz); Arena champ-select algılayınca overlay otomatik görünür, seçim bitince gizlenir.
- **Artımlı tarama:** ilk çalıştırmada tek seferlik backfill, sonra yalnızca yeni maçlar (idempotent).
- **Sezon-filtreli:** sadece `season_start` (2026-04-29) sonrası 1.'likler sayılır (oyundaki challenge'la birebir).
- **Key:** kullanıcının kendi Riot **dev key**'i (ayarlardan girilir). Hosting/production key yok (şimdilik).
- **Yerel depo:** JSON dosyası (Electron `userData`). Native modül yok.
- **Overlay:** etkileşimli, always-on-top, çerçevesiz, şeffaf pencere.

## 3. Stack

| Katman | Seçim |
|---|---|
| Çatı | Electron + electron-vite + TypeScript |
| UI | React (overlay penceresi) |
| Riot/LCU HTTP | Node `fetch` (Electron'da yerleşik) + `ws` (LCU WebSocket) |
| Depo | JSON dosyası (`userData/store.json`) |
| Test | Vitest (saf mantık için) |
| Paketleme | electron-builder (Mac dmg + Windows nsis) — Faz 2 dağıtım |

## 4. Mimari ve süreçler

```
[Electron Main (Node)]
  ├─ lcu/connector  → lockfile bul, port+token, REST(https self-signed) + WS(wss)
  ├─ lcu/watcher    → current-summoner (puuid) + gameflow phase + queueId(Arena?)
  ├─ riot/client    → account-v1?(gerekmez, puuid LCU'dan), match-v5 ids/detay
  ├─ riot/rate-limiter → 20/s + 100/120s (çift pencere, Python portu)
  ├─ riot/ddragon   → versions + champion.json (cache)
  ├─ core/scanner   → backfill + artımlı + sezon checklist (1700+1750, subteamPlacement==1)
  ├─ core/store     → JSON persist (account, processed matches, champions, settings)
  └─ overlay/window → BrowserWindow (transparent, alwaysOnTop, frameless) show/hide
        │  IPC
        ▼
[Renderer (React)]  → "bu sezon eksik şampiyonlar" grid + ilerleme (x/total)
```

**Olay akışı:**
1. Açılış → ayarlardan Riot key oku. Key yoksa ayar penceresi.
2. LCU'ya bağlan (League açıksa) → `current-summoner` → puuid + platform → routing.
3. Hesap depoda yoksa: tek seferlik backfill (her iki Arena queue). Varsa: artımlı tarama.
4. Periyodik + her oyun sonrası artımlı tarama.
5. LCU gameflow `ChampSelect` **ve** queueId ∈ {1700,1750} → overlay göster (eksik şampiyonlar).
6. Faz çıkışı / Arena değil → overlay gizle.

## 5. LCU entegrasyonu (detay)

- **Lockfile yolu:** macOS `~/.../LeagueClient/lockfile` veya Riot'un kurulu dizini; Windows `C:\Riot Games\League of Legends\lockfile`. Process'ten de tespit edilebilir (`LeagueClientUx` komut satırı argümanları `--app-port`, `--remoting-auth-token`). MVP: bilinen kurulum yollarını + lockfile'ı dene.
- **Lockfile formatı:** `name:pid:port:password:protocol` (`:` ayrılmış).
- **Auth:** Basic `riot:<password>`, base64. HTTPS self-signed sertifika → `rejectUnauthorized:false` (veya Riot root cert). Host `127.0.0.1:<port>`.
- **REST:** `GET /lol-summoner/v1/current-summoner` → `puuid`, `gameName`, `tagLine`. `GET /lol-gameflow/v1/session` → `phase`, `gameData.queue.id`.
- **WebSocket (wss):** `OnJsonApiEvent_lol-gameflow_v1_session` aboneliği ile faz değişimini canlı al (polling fallback de var).
- **Bölge:** `current-summoner`/`/riot-client-auth` veya platform bilgisinden routing (TR1→europe). Map mevcut (Python routing portu).

## 6. Tarama motoru (Python portu)

- `ARENA_QUEUE_IDS = [1700, 1750]`.
- `getArenaMatchIds(puuid, routing, queue, start, count)` her queue için.
- `getMatch(matchId, routing)` → participant (puuid eşleşmesi) → `championName`, `subteamPlacement`.
- 1.'lik = `subteamPlacement === 1`. Şampiyon eşleşmesi `champion.id === championName` (DDragon string id).
- `seasonStartMs` filtresi: yalnızca `gameEndTimestamp >= seasonStartMs` olan 1.'likler.
- Idempotency: işlenen match id'leri depoda; yalnızca yeni id'ler çekilir.
- Rate limiter: çift pencere (20/s, 100/120s), 429 `Retry-After`, 5xx backoff.

## 7. Veri modeli (JSON store)

```jsonc
{
  "settings": { "riotApiKey": "...", "seasonStart": "2026-04-29" },
  "champions": { "version": "16.13.1", "list": [{ "key", "id", "name", "image" }] },
  "account": { "puuid", "gameName", "tagLine", "routing", "platform" },
  "processedMatches": { "<matchId>": { "champ": "Aatrox", "place": 1, "ts": 170... } },
  "lastScanAt": 170...
}
```
Türetilen "bu sezon eksik" = tüm şampiyonlar − {sezon içinde place==1 olan champion id'ler}.

## 8. Overlay UI

- Çerçevesiz, şeffaf, always-on-top BrowserWindow; başlangıç konumu ekran köşesi (sonra hafıza).
- İçerik: başlık "Arena God — bu sezon", ilerleme (örn. 32/168), ve **eksik şampiyonlar** portreli grid (DDragon CDN). İstenirse "tamamlananları göster" geçişi.
- Champ-select dışında gizli; champ-select'te otomatik görünür.
- Etkileşimli (sürüklenebilir başlık, scroll). Tıklama-geçişli mod Faz 2.

## 9. Hata yönetimi

- League kapalı / lockfile yok → "League bekleniyor" durumu, periyodik yeniden dene.
- Riot key yok/geçersiz (401/403) → ayar penceresinde net uyarı + key güncelleme.
- Rate limit → limiter + 429 saygı.
- LCU bağlantı kopması → reconnect döngüsü.
- Ağ hatası → retry/backoff; backfill kaldığı yerden (idempotent).

## 10. Test

- **Birim (Vitest):** `parseLockfile`, routing map, rate limiter (enjekte saat), scanner (sezon filtresi, idempotency, queue birleştirme, champion eşleşmesi), gameflow/queue tespit mantığı (sahte LCU arayüzü).
- **Entegrasyon (manuel/script):** scanner gerçek Riot key ile kullanıcının puuid'inde çalıştırılıp sezon sayısı doğrulanır (beklenen 32).
- LCU canlı bağlantısı ve overlay görünümü manuel doğrulanır (League açıkken).

## 11. Kapsam — MVP vs sonra

- **MVP (hedef, final):** cross-platform Electron, LCU oto hesap + Arena champ-select tetik, tarama motoru portu, sezon-eksik overlay, kullanıcı dev key'i ayarlardan. Mac'te uçtan uca çalışır.
- **Faz 2:** imzalı kurulumlar (electron-builder dağıtım), production key/host (per-user key derdini bitirir), tıklama-geçişli overlay, konum hafızası, all-time/sezon anahtarı, otomatik key-expiry hatırlatma.

## 12. Yerleşim

Mevcut repoda `overlay/` alt klasörü (monorepo). `docs/references/riot-api.md` ortak referans.
