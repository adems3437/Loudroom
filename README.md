# Loudroom

Telefonla oynanan, web tabanlı, gerçek zamanlı parti oyunu platformu (Jackbox / Kahoot tarzı).

- **Host** odayı bilgisayardan açar ve ekranı TV'ye ya da projektöre verir.
- **Oyuncular** uygulama kurmadan, telefon tarayıcısından QR kodu ya da 6 haneli oda koduyla
  katılır.
- Bir oyun oturumu, yönetim panelinde hazırlanan bir **oyun paketinden** oluşur. Paketteki
  bölümler farklı oyunlardan olabilir.

Ürünün ve mimarinin tek doğru kaynağı [docs/SPEC.md](docs/SPEC.md). Fazların ilerleyişi ve
alınan kararlar [PROGRESS.md](PROGRESS.md) içinde.

## Oyunlar

**Parti oyunları** (her bölüm kısa bir tur):

| Oyun           | Kısaca                                                          |
| -------------- | --------------------------------------------------------------- |
| Quiz           | 2–6 seçenekli sorular; görselli ya da videolu soru; seri bonusu |
| Closest Number | Sayıyı tahmin et; en yakın tahmin kazanır                       |
| Sorting        | Öğeleri doğru sıraya diz (sürükle-bırak)                        |
| Kim Yapar?     | "Kim en çok geç kalır?" — oyuncular birbirine anonim oy verir   |
| Image Location | Haritada ya da görselde doğru noktayı işaretle                  |
| Bluff          | Sahte cevap yaz, gerçeğini bul, başkalarını kandır              |
| Drawing        | Biri çizer, diğerleri tahmin eder (canlı çizim akışı)           |
| Reaction       | Hedef görününce en hızlı dokunan kazanır                        |
| Memory         | Ekranda gösterilenleri hatırla, telefondan cevapla              |
| Tombala        | Kartın telefonda; çinko ve tombala sunucuda doğrulanır          |
| Casus Kim?     | Herkes mekânı bilir, casus bilmez; tartış, oyla, casusu bul     |

**Kart ve masa oyunları** (bir maç tek uzun bölüm; elin ya da filon yalnızca telefonunda,
masa TV'de; kopan oyuncunun yerine bot oynar):

| Oyun          | Kısaca                                                                |
| ------------- | --------------------------------------------------------------------- |
| UNO           | 2–10 kişi; +2 / +4 yığma ayarı, "UNO!" ve "Yakala!"                   |
| Pişti         | 2–4 kişi, 4 kişide eşli; pişti, Vale piştisi, hedef puan              |
| Kızma Birader | Zar sunucuda; klasik haç tahtası (6 kişilik varyant yuvarlak)         |
| Amiral Battı  | Filoyu telefonda diz; iki takım ya da paralel düellolu turnuva        |
| Okey          | 106 taş, gösterge ve okey; ıstaka yatay telefonda, boş koltuklara bot |

## Özellikler

- **Server-authoritative:** Skor, zamanlayıcı ve faz geçişleri yalnızca server'da. Doğru
  cevap sonuç ekranından önce hiçbir istemciye gitmez; bu, testlerle doğrulanır.
- **Yeniden bağlanma:** Sayfa yenilenince ya da bağlantı kopunca oyuncu aynı yerine döner;
  host koparsa oyun duraklar.
- **Kart ve masa altyapısı:** Koltuklar ve izleyiciler, sıra saati, kopan oyuncu yerine bot,
  seed'li deste ve zar; gizli el ve deste sırasının hiçbir istemciye sızmadığı testlerle
  doğrulanır.
- **Yönetim paneli:** İçerik, kategori, medya (görsel ve video), oyun paketleri, kullanıcılar
  (ADMIN / EDITOR), CSV/XLSX ile toplu içe aktarma, oyun geçmişi ve istatistikler.
- **Güvenlik:** Rate limit, oda kodu deneme koruması, küfür filtresi, argon2 ile şifre,
  httpOnly + SameSite=Strict oturum çerezi ve CSRF koruması, yüklenen dosyalarda meta veri
  silme.
- **KVKK:** Oyuncular hesapsız; oyun geçmişi ayarlanabilir süre sonunda silinir.
- **Prod:** Nginx arkasında Docker Compose, yedekleme ve geri yükleme betikleri, GitHub
  Actions CI ([docs/DEPLOY.md](docs/DEPLOY.md)).

## Teknolojiler

- **Monorepo:** pnpm workspaces + Turborepo, Node 24, TypeScript (strict)
- **Web:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Motion, next-intl
- **Server:** NestJS 12, Socket.IO (Redis adapter), REST, zod
- **Veri:** PostgreSQL 16 + Prisma 7, Redis 7
- **Medya:** sharp (görseller), ffmpeg / ffprobe (videolar)
- **Test:** Vitest (unit ve gerçek Postgres/Redis üzerinde integration), Playwright (çoklu
  tarayıcı context'iyle e2e, Chromium + WebKit)

## Hızlı başlangıç

Gerekenler: Node 24, pnpm 12, Docker. Video yüklemek için host modunda `ffmpeg`
(`brew install ffmpeg`); Docker geliştirme ortamında hazır gelir.

> Projeyi iCloud ile senkronlanan bir klasörde (ör. Masaüstü) tutma: iCloud derleme
> çıktılarına dokundukça Docker'daki server sürekli yeniden başlıyor. `~/Developer` gibi bir
> klasör kullan.

```bash
cp .env.example .env            # bir kez
docker compose up -d --wait     # postgres, redis, server :4000, web :3000
```

- Host ekranı: <http://localhost:3000/host>
- Oyuncu: <http://localhost:3000/play> (telefonla test için `.env` içindeki `PUBLIC_URL`'i
  bilgisayarın LAN adresine ayarla)
- Yönetim paneli: <http://localhost:3000/admin> — geliştirme hesabı `.env` içindeki
  `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`

Servisleri Docker yerine bilgisayarda çalıştırmak için:

```bash
pnpm install
pnpm infra:up                   # yalnızca postgres + redis
pnpm db:migrate && pnpm db:seed
pnpm dev                        # server + web + paketler, izleme modunda
```

## Komutlar

```bash
pnpm typecheck                  # TypeScript
pnpm lint                       # ESLint
pnpm test                       # unit + integration (postgres + redis gerekir)
pnpm build                      # bütün paketler ve uygulamalar
pnpm test:e2e                   # Playwright (çalışan stack gerekir)
pnpm format:check               # Prettier

pnpm db:migrate                 # migration oluştur / uygula
pnpm db:seed                    # örnek içerik, paketler ve geliştirme admin'i (idempotent)
pnpm admin:create --email sen@ornek.com --name "Ad"   # ilk yönetici; --reset ile şifre sıfırlama

scripts/prod.sh up -d --build --wait   # prod stack (.env.prod ile); ayrıntılar docs/DEPLOY.md
scripts/backup.sh                      # yedek al; geri yükleme: scripts/restore.sh <dump> <tar>
```

Bilgisayarı 8 GB olan makinelerde `pnpm typecheck|lint|test|build` komutlarına
`--concurrency=4` eklemek bellek sıkışmasını önler (CI de böyle çalışır).

## Klasör yapısı

```
apps/
  server/          NestJS — REST API, Socket.IO gateway, oyun motoru, admin API
  web/             Next.js — /host (TV), /play (telefon), /admin (panel)
packages/
  shared/          zod şemaları, socket olay ve REST sözleşmeleri
  game-sdk/        oyun modülü sözleşmesi, ortak test paketi, ortak istemci bileşenleri
  table-kit/       kart ve masa oyunları: koltuklar, sıra, bot, deste, zar, paralel sıralar
  games/*          her oyun ayrı paket: kurallar, TV ve telefon ekranları, içerik editörü
docker/            geliştirme ve prod imajları, Nginx, postgres init, yedekleme
scripts/           prod, smoke test, yedekleme ve geri yükleme
docs/SPEC.md       teknik şartname
docs/DEPLOY.md     prod kurulumu
```

Yeni bir oyun eklemek: `packages/games/` altında yeni bir paket ve server ile web
registry'lerine birer satır. Her oyun ortak sözleşme testlerini geçmek zorunda (cevap sızıntısı
testi dahil). Ayrıntılar [CLAUDE.md](CLAUDE.md) ve SPEC §5'te.

## Durum

SPEC'teki 13 fazın hepsi tamamlandı: altyapı, oda ve lobby, oyun motoru, yönetim paneli, 16
oyun, içe aktarma, oyun geçmişi ve istatistikler, videolu sorular, prod kurulumu, yedekleme
ve CI. Her fazın kararları, testleri ve bilinen sınırları [PROGRESS.md](PROGRESS.md) içinde.
