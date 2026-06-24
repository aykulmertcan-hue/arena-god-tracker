# Arena God Tracker — Tasarım Dokümanı (Spec)

_Tarih: 2026-06-24_
_Durum: Onay bekliyor (implementasyon başlamadı)_

## 1. Amaç

League of Legends "Arena" (game mode `CHERRY`, queue `1700`) modunda **Arena God** hedefini otomatik takip eden bir web uygulaması. Kullanıcı bir Riot ID (`isim#TAG`) girer; uygulama o hesabın Arena maçlarını izler ve hesap bir maçta 1. olduğunda (`subteamPlacement == 1`) ilgili şampiyonu checklist'te otomatik tikler. Hedef: ~172 şampiyonun tamamıyla 1.'lik.

## 2. Kapsam kararları (onaylanmış)

- **Local-first, prod-ready:** MVP localhost'ta çalışır; ama Docker + env-config ile yapılandırılır, böylece ileride hosting tek adım olur. Hosting şimdilik ertelendi.
- **Sıfır AI:** Uygulama hiçbir noktada LLM/Gemini/Claude/SDK çağırmaz. Tamamen deterministik: Riot API + Data Dragon.
- **Çoklu hesap, auth yok:** "Kullanıcı" = izlenen Riot hesabı. Login yok. Arkadaşlar da kendi Riot ID'lerini girip kendi checklist'lerini görebilir (veri zaten public maç verisi).
- **Hesabı hatırlama:** İlk kez Riot ID girildiğinde uygulama onu kalıcı tutar; sonraki açılışta kullanıcı doğrudan kendi checklist'ine düşer (DB'de "son kullanılan hesap" + tarayıcıda hatırlama).
- **Backfill öncelikli, canlı izleme fallback:** Riot ID girilince önce geçmiş Arena maçları çekilmeye çalışılır (backfill). Geçmiş çekilemiyorsa checklist boş başlar ve o andan itibaren canlı izleme devreye girer.
- **Varsayılan bölge:** `europe` (EUW/TR/EUNE). UI'da dropdown ile diğer bölgeler de seçilebilir.

## 3. Stack ve gerekçesi

| Katman | Seçim | Gerekçe |
|---|---|---|
| Backend + worker | Python + FastAPI (tek process, asyncio background loop) | Kalıcı poll worker gerekiyor; uzun ömürlü server bunu doğal çözer (serverless değil). Python ekosistemine aşinalık. |
| HTTP client | `httpx` (async) | Riot API async çağrıları, timeout/retry kontrolü. |
| Veri | SQLite (WAL mode) + SQLModel/SQLAlchemy | Birkaç hesap için fazlasıyla yeterli, tek dosya, deploy basit. Büyürse aynı ORM ile Postgres'e geçiş. |
| Frontend | React + Vite SPA (FastAPI statik servis eder) | ~172 şampiyonun portreli interaktif grid'i için uygun; "gerçek web app" hissi. |
| Paketleme | Docker (tek imaj: backend + statik frontend) | Prod-ready; local'de de aynı imaj çalışır. |

**Reddedilen alternatifler:**
- _Next.js full-stack:_ tek dil avantajı var ama kalıcı 60–120 sn worker serverless'te sorunlu; uzun ömürlü server gerektirir, avantajını yer.
- _Her arkadaş lokalde kendi kopyasını çalıştırır:_ her birinin kendi dev key'i + 24h expire → çok fazla friction. Tek instance tercih edildi (şimdilik local, sonra hosted).
- _HTMX + Jinja:_ build step yok ama portreli grid ve etkileşim React'te daha temiz. React seçildi.

## 4. Mimari ve akış

```
[Tarayıcı / React SPA]
        │  REST
        ▼
[FastAPI app] ── startup ──> [Poll Worker (asyncio loop)]
   │  read/write                     │  N sn'de bir aktif hesaplar
   ▼                                 ▼
[SQLite (WAL)] <───────── [Rate-limited Riot client (httpx)]
                                     │  account-v1 / match-v5
                                     ▼
                              [Riot API]
   [Data Dragon] ──> şampiyon listesi + portreler (startup + günlük)
```

### Poll döngüsü (her N sn, N = 60–120 config)
```
her aktif watched_account için:
  eğer backfill_status == running/none ve backfill isteniyorsa:
    throttled backfill job çalıştır
  değilse:
    GET match ids (queue=1700, count≈20)
    processed_match'te OLMAYAN id'leri filtrele
    her yeni id için:
      GET maç detayı
      processed_match'e atomik yaz (UNIQUE constraint)
      participant.subteamPlacement == 1 ise → checklist_entry complete + first_win_match_id
    last_polled_at güncelle
```

### Idempotency (aynı maçı iki kez işlememe)
- `processed_match` tablosunda `UNIQUE(watched_account_id, match_id)`.
- Maç işlenmeden atomik olarak buraya yazılır → örtüşen poll veya process restart'ında bile çift işleme imkânsız. Source of truth = bu tablo (cursor'a güvenilmez).

### Backfill akışı
```
match ids'i sayfalayarak çek (queue=1700, start=0, count=100, exhaust olana dek)
her id (işlenmemişse) → detay çek → processed_match'e yaz → 1.'likse tikle
backfill_status = done, progress güncellenir (UI'da gösterilir)
geçmiş hiç dönmezse → backfill_status = done (boş), canlı izleme devreye girer
```

## 5. Veri modeli

```
watched_account
  id (pk), game_name, tag_line, puuid (unique),
  routing (americas|europe|asia), platform (euw1|tr1|eun1|...),
  backfill_status (none|running|done), backfill_progress (int),
  last_polled_at, is_active (bool), created_at

champion                       # Data Dragon'dan
  key (pk, riot champ id int), id (string, "Aatrox"),
  name, image_filename, ddragon_version

checklist_entry
  watched_account_id (fk), champion_key (fk),
  completed (bool), first_win_match_id (nullable), completed_at (nullable)
  UNIQUE(watched_account_id, champion_key)

processed_match                # idempotency + audit
  watched_account_id (fk), match_id,
  champion_name, subteam_placement, game_end_ts, processed_at
  UNIQUE(watched_account_id, match_id)

app_state                      # "son kullanılan hesap" + ddragon meta
  key, value
  # ör: last_used_account_id, ddragon_version, last_ddragon_check_at
```

Not: `completed` alanı `checklist_entry`'de tutulur ama her zaman `processed_match`'ten yeniden türetilebilir (audit + replay imkânı).

## 6. Riot API entegrasyonu

| Adım | Endpoint | Routing |
|---|---|---|
| Riot ID → puuid | `/riot/account/v1/accounts/by-riot-id/{name}/{tag}` | regional |
| Maç ID listesi | `/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=1700&start&count` | regional |
| Maç detayı | `/lol/match/v5/matches/{matchId}` | regional |

Detayda: `info.participants[]` içinden bizim `puuid` → `championName` + `subteamPlacement`. `== 1` ise 1.'lik.

**Routing map (UI sunucu → regional cluster):**
- `europe`: EUW1, EUN1, TR1, RU
- `americas`: NA1, BR1, LA1, LA2, OC1
- `asia`: KR, JP1

Varsayılan: `europe`.

**Rate limit yönetimi (merkezi token-bucket):**
- Dev key: 20 req/s **ve** 100 req/2dk → her iki pencereyi de saygılayan tek global limiter.
- Backfill ağır kısım (100 id + ~100 detay). 100 req/2dk'da tam backfill ~2+ dk → kuyruğa al, throttle et, progress göster.
- Polling ucuz: hesap başına 1 ids çağrısı + sadece yeni maçların detayı.

**Hata/retry stratejisi:**
- `429` → `Retry-After` header'ına uy, requeue.
- `5xx` → exponential backoff (max retry).
- `404` (account) → "geçersiz Riot ID", kullanıcıya göster.
- `403` → key geçersiz/expired → log + UI'da admin uyarısı.
- Network/timeout → retry.

**API key yönetimi:**
- Key `.env` (`RIOT_API_KEY`) üzerinden, koda gömülmez.
- Dev key 24 saatte expire → local'de kullanıcı [developer.riotgames.com](https://developer.riotgames.com) üzerinden yeniler. Env'den hot-reload desteklenir (restart gerekmez).
- Hosting fazında production key başvurusu (Faz 2).

## 7. Şampiyon listesi (Data Dragon) ve güncel kalma

- Versiyon: `https://ddragon.leagueoflegends.com/api/versions.json` → ilk eleman en güncel patch.
- Şampiyonlar: `.../cdn/{version}/data/en_US/champion.json`.
- Portreler: `.../cdn/{version}/img/champion/{file}` (frontend doğrudan CDN'den çeker; backend dosya saklamaz).
- **Sync:** startup'ta + günde bir `versions.json` kontrol. Yeni versiyon varsa şampiyonları upsert et; yeni şampiyon çıktıysa tüm hesaplara o şampiyon için `checklist_entry` (unchecked) ekle → Arena God hedefi otomatik genişler.
- MVP'de tam roster işlenir (Arena'da nadir disable durumları için manuel exclusion Faz 2).

## 8. API yüzeyi (FastAPI — MVP)

```
POST /api/accounts            { game_name, tag_line, server, backfill: bool }
                              → puuid çöz, watched_account oluştur, last_used set et
GET  /api/accounts/current    → son kullanılan hesap (hatırlama)
GET  /api/accounts/{id}/checklist
                              → şampiyon grid + completed durumları + ilerleme (x/172)
GET  /api/accounts/{id}/status
                              → backfill_status, progress, last_polled_at
GET  /api/champions           → Data Dragon roster (key, name, image, version)
```
Frontend, checklist'i periyodik (ör. 10 sn) `GET checklist` ile tazeler (MVP). SSE/WebSocket Faz 2.

## 9. MVP kapsamı vs sonraki fazlar

**MVP:**
1. Riot ID + sunucu gir → puuid çöz → watched_account oluştur, hatırla.
2. Opsiyonel backfill (progress'li); geçmiş yoksa canlı izlemeye düş.
3. Arka plan poller canlı izler, yeni 1.'likte otomatik tik.
4. Checklist UI: 172 şampiyon portreli grid, checked/unchecked, ilerleme sayacı, hangi maçta tamamlandığı.
5. Data Dragon sync. SQLite. Docker. Local çalışır, auth yok.

**Faz 2+:**
- Hosting (Fly.io/Railway) + production Riot key.
- Auth / hesap sahipliği (özel checklist).
- SSE/WebSocket ile anlık UI push.
- Maç feed'i, placement dağılımı (augment/item winrate DEĞİL — Riot policy gereği yasak).
- "Arena God'a N şampiyon kaldı" bildirimi.
- Ölçek: ayrı worker process + Postgres + Redis kuyruk.

## 10. Policy notu

- Kişisel/izlenen hesabın maç geçmişini gösteren takip aracı Riot tarafından izinli.
- Augment / Arena item win rate **gösterilmez** (yasak). Uygulama yalnızca 1.'lik (placement) takibi yapar.

## 11. Açık/varsayılana bağlanan kararlar

Aşağıdakiler makul varsayılanlarla bağlandı; itiraz olursa revize edilir:
- Poll aralığı: 90 sn (60–120 config aralığında).
- Backfill derinliği: Riot'un döndürdüğü tüm `queue=1700` geçmişi (exhaust).
- Auth: yok (local + public veri).
- Frontend tazeleme: 10 sn polling (MVP).
