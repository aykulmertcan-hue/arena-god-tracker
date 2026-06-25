# Windows .exe oluşturma (kendi PC'nde)

Bu adımlar Windows makinende çalıştırılır. Sonunda arkadaşlarına yollayacağın
tek bir **portable .exe** çıkar (kurulum gerektirmez, çift tıkla çalışır).

## 1. Gereksinimler (bir kez)

- **Node.js LTS** (20+): https://nodejs.org → indir, kur.
- **Git** (kodu çekmek için; istersen ZIP de indirebilirsin): https://git-scm.com

## 2. Kodu al

```powershell
git clone https://github.com/aykulmertcan-hue/arena-god-tracker.git
cd arena-god-tracker\overlay
```
(GitHub'dan "Code → Download ZIP" yapıp `overlay` klasörüne girsen de olur.)

## 3. Bağımlılıkları kur

```powershell
npm install
```

## 4. (Önerilir) Önce dev modda dene

`.exe` üretmeden önce çalıştığını gör:
```powershell
npm run dev
```
Bir pencere açılmalı. League açıkken Riot dev key'ini yapıştır → **Yenile** → Arena
şampiyon seçiminde overlay belirir. Pencere açılmıyorsa konsoldaki hatayı bana yolla.

## 5. .exe üret

```powershell
npm run package
```
Çıktı **`dist\`** klasöründe:
- **`dist\ArenaGodOverlay-portable.exe`** ← arkadaşlarına bunu yolla (tek dosya, kurulumsuz)
- `dist\Arena God Overlay-0.1.0-x64.exe` ← isteyene kurulumlu sürüm

## 6. Arkadaşların kullanımı

1. `ArenaGodOverlay-portable.exe`'ye çift tıkla.
2. **Windows SmartScreen** "tanınmayan uygulama" uyarısı verirse → **More info → Run anyway** (imzasız olduğu için normal; antivirüs de imzasız Electron exe'sine takılabilir).
3. Pencereye **kendi Riot dev key'ini** yapıştır (https://developer.riotgames.com — ücretsiz, **24 saatte bir yenilenir**).
4. League açıkken **Yenile** → ilk tarama (tüm Arena geçmişi, birkaç dk).
5. Arena şampiyon seçimine girince overlay ekranın üstünde eksik şampiyonları gösterir. League **"Borderless"** modda olsun ki üstte görünsün.

## Notlar

- Her arkadaş **kendi** dev key'ini girer (paylaşılan tek key rate limit'e takılır + ToS).
- Sıfır-key "aç çalışsın" deneyimi için backend host + production key gerekir (sonraki faz).
- İmzalama yok → SmartScreen uyarısı normal. İleride kod imzalama sertifikası eklenebilir.
- Sorun çıkarsa: `npm run dev` çıktısındaki hatayı bana ilet.
