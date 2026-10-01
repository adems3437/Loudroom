# PROGRESS

Projenin ilerleme kaydı. Kapsamın tek doğru kaynağı [docs/SPEC.md](docs/SPEC.md).

## Durum

| Faz                              | Durum                      |
| -------------------------------- | -------------------------- |
| Phase 1 — Altyapı                | ✅ Tamamlandı (2026-10-01) |
| Phase 2 — Oda ve Lobby           | ✅ Tamamlandı (2026-10-01) |
| Phase 3 — Game Engine + Quiz MVP | ⏸ Onay bekliyor            |

---

## Phase 2 — Oda ve Lobby

### Yapılanlar

- **Ortak sözleşmeler (`packages/shared`):**
  - Oda kodu şeması: 6 hane, baştaki rakam sıfır olamaz (100000–999999).
  - Oda ayarları (en fazla oyuncu 2–20, varsayılan 12), 12 avatar kimliği ve 12 renklik palet.
  - Host ve oyuncu görünümlerinin şemaları; oyuncu nesnesi sıkı (strict) şema, yani gizli
    alan içeremez.
  - Takma ad normalizasyonu: NFC, kontrol ve görünmez karakterlerin silinmesi, emojiyi tek
    karakter sayan uzunluk ölçümü, Türkçe büyük/küçük harf kuralına göre benzersizlik.
  - Tipli komut ve olay sözleşmeleri: `clientCommands`, `serverEventSchemas`.
- **Server:**
  - **Oda deposu:** SPEC §11'deki Redis anahtarları kullanılıyor; boşta kalan oda 4 saat sonra
    siliniyor.
  - **Oda servisi:** Bir odaya ait bütün işlemler, server içinde oda başına tek sıradan geçiyor.
  - **Görünümler:** Host'a ve oyunculara ayrı görünümler gidiyor; hiçbiri token veya token
    özeti içermiyor.
  - **Komutlar:** `room:create`, `room:join`, `room:leave`, `room:kick`, `room:lock`,
    `player:ready`, `player:update`.
  - **Olaylar:** `room:state` (sürüm numaralı tam görüntü), `player:joined`, `player:left`
    (gerekçesiyle), `player:reconnected`, `error` (KICKED / SESSION_REPLACED / SESSION_EXPIRED).
  - **Yeniden bağlanma:** Handshake'teki token ile oturum geri yükleniyor.
    - Oyuncu için 90 sn bekleme süresi var; süre dolarsa yeri boşalıyor ve token iptal ediliyor.
    - Host, oda yaşadığı sürece geri dönebiliyor.
    - Aynı oturum ikinci kez açılırsa eski bağlantı kapatılıyor.
  - **Server yeniden başlarsa:** Açılışta bütün odalar "herkes kopuk" olarak işaretleniyor ve
    oyuncuların 90 sn sayaçları yeniden başlıyor. Redis kapalıysa server yine açılıyor;
    kurtarma Redis geri gelince çalışıyor.
  - **Rate limit:** Redis'te Lua ile çalışan token bucket.
    - Bağlantı ve oda oluşturma: hash'lenmiş IP başına.
    - Komutlar: bağlantı başına.
    - Başarısız katılım denemeleri: IP başına. Başarılı katılımlar ve geri dönüşler sayılmıyor.
  - **Küfür filtresi:** Türkçe ve İngilizce listeler; rakam/sembol hileleri ve Türkçe harfler
    sadeleştiriliyor, uzatılmış harfler tek harfe indiriliyor, `=` önekiyle "yalnızca tam
    kelime" kuralı destekleniyor. Ek kelimeler dosyadan okunabiliyor.
- **Web:**
  - **`/host`:** Giriş ekranı.
  - **`/host/create`:** En fazla oyuncu sayısını seçme ve oda oluşturma.
  - **`/host/room/[roomCode]`:** Host lobby'si.
    - QR kodu (kendi çizimimiz, SVG path), katılım linki ve büyük oda kodu.
    - Avatarlı oyuncu kartları; giriş/çıkış ve dizilim animasyonlu (`motion`).
    - Kart yoğunluğu oyuncu sayısına göre değişiyor: 2, 3 veya 4 sütun.
    - Hazır / bekliyor / bağlantı koptu durumları.
    - Onaylı oyuncu çıkarma, kilit ve tam ekran.
  - **`/play`:** Oda kodu girişi.
  - **`/play/[roomCode]`:**
    - Takma ad ve avatar formu.
    - Telefon lobby'si: büyük "Hazırım" butonu, diğer oyuncular, profil düzenleme, odadan
      ayrılma.
    - "Atıldın", "başka sekmede açıldı" ve "oturum sona erdi" ekranları.
  - **Ortak:**
    - "Yeniden bağlanıyor" bandı.
    - Ekranı açık tutma (Wake Lock), titreşimli geri bildirim; ikisi de cihaz destekliyorsa.
    - Oturum token'ları `localStorage`'da tutuluyor (`useStoredSession`).
    - 12 avatarlık kendi SVG setimiz.
    - Bütün metinler `tr.json` içinde, hata kodu başına bir mesaj var.
- **Testler:**
  - shared: 40 unit test.
  - server: 64 test.
    - Unit: küfür filtresi.
    - Integration: akışlar, güvenlik, 90 sn sonunda yerin boşalması, server yeniden başlatma.
  - e2e: 6 senaryo × 2 tarayıcı.

### Bitti tanımı — son çalıştırma (2026-10-01)

| Kontrol                                                 | Sonuç                                                |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm typecheck`                                        | ✅ 4/4 görev                                         |
| `pnpm lint`                                             | ✅ 4/4 görev                                         |
| `pnpm test`                                             | ✅ shared 40/40, server 64/64                        |
| `pnpm build`                                            | ✅ 3/3 görev                                         |
| `pnpm test:e2e`                                         | ✅ 12/12 (Chromium + WebKit; Phase 1 testleri dahil) |
| `pnpm format:check`                                     | ✅                                                   |
| `docker compose down -v && docker compose up -d --wait` | ✅ Sıfırdan 36 sn'de tüm servisler healthy           |

**Kabul kriteri:** `e2e/lobby.spec.ts` dosyası şu adımları uçtan uca doğruluyor:

1. Host oda açar.
2. 3 telefon katılım linkiyle katılır ve host ekranında görünür.
3. Hazır durumu host'a yansır.
4. Bir telefon sayfayı yeniler: aynı `playerId` ve takma adla döner, kopya kart oluşmaz.
5. Host bir oyuncuyu atar: oyuncu host listesinden kaybolur, telefonunda "atıldın" ekranı
   görünür; sayfayı yenilese bile geri gelemez.
6. Oda kilitlenince yeni oyuncu katılamaz.

### Alınan kararlar (kullanıcı onaylı)

- **K1, yeniden bağlanma:** Token, Socket.IO handshake `auth` alanında gönderiliyor; SPEC'teki
  event listesi değişmedi.
- **K2, hata mesajları:** Katılımdaki "oda kilitli" ve "oda dolu" ayrı kodlar. Var olmayan,
  süresi dolmuş veya bitmiş odaların hepsi tek bir `ROOM_NOT_FOUND` veriyor; brute force
  sonrasında da yalnızca `RATE_LIMITED`.
- **K3, oyuncu atma:** Atılan oyuncunun token'ı iptal ediliyor. Oda kilitli değilse yeni bir
  takma adla tekrar katılabiliyor.
- **K4, ertelenenler:** `PAUSED` durumu, geç katılım ayarı, ses/müzik ve "host odayı kapatır"
  özelliği Phase 3'e ve sonrasına bırakıldı.
- **K5, küfür listeleri:** Türkçe ve İngilizce listeler repoda; ek kelimeler
  `PROFANITY_EXTRA_WORDS_FILE` ile ekleniyor.

### Varsayımlar ve küçük kararlar

- **Kelime listelerinin biçimi:** Planda düz metin dosyası yazıyordu; build'e dosya kopyalama
  adımı eklememek için TS dizisi olarak tutuldu (`wordlists.ts`). Ek dosya düz metin.
- **"amına" listede yok:** Sadeleştirince yaygın bir isim olan "Amina" ile aynı oluyor.
- **Rate limit varsayılanları:**

  | Kapsam                        | Ani yükleme izni | Yenilenme |
  | ----------------------------- | ---------------- | --------- |
  | Bağlantı (IP başına)          | 60               | 1/sn      |
  | Komut (bağlantı başına)       | 20               | 10/sn     |
  | Başarısız katılım (IP başına) | 10               | 10/dk     |
  | Oda oluşturma (IP başına)     | 20               | 10/dk     |

  Redis'e ulaşılamazsa sınırlar uygulanmıyor (fail open): oda zaten kullanılamaz durumda olur,
  her isteği reddetmek yalnızca yanıltıcı bir "limit aşıldı" mesajı üretirdi.

- **Token'lar:**
  - 256 bit rastgele değer (base64url).
  - Redis'te yalnızca SHA-256 özeti tutuluyor.
  - Tarayıcıda `localStorage` anahtarı `loudroom:{role}:{code}`.
- **Oyuncu renkleri:** Server atıyor; 12 renk dolunca en az kullanılan renk veriliyor.
  En fazla oyuncu 20 olduğu için renk tekrarı mümkün.
- **Socket.IO adapter anahtarı Redis DB numarasını içeriyor:** Pub/sub kanalları bütün DB'lerde
  ortak olduğu için dev ortamı (DB 0) ile testler (DB 1) aksi halde birbirini duyardı.
- **Server'ın kapattığı bağlantı:** İstemci kendisi yeniden bağlanmıyor. Atılan oyuncu anonim
  olarak yeniden bağlanıyor; oturumu başka sekmede açılan ise "Burada devam et" ile geri
  dönebiliyor.
- **Bağlantı reddedilirse:** Örneğin rate limit nedeniyle. İstemci 5 sn sonra tekrar deniyor.

### Eklenen paketler

| Paket                       | Nerede | Gerekçe                                                                              |
| --------------------------- | ------ | ------------------------------------------------------------------------------------ |
| qrcode 1.5.4, @types/qrcode | web    | SPEC §2; QR matrisini üretmek için. SVG'yi kendimiz çiziyoruz.                       |
| motion 13.4                 | web    | SPEC'teki Framer Motion'ın yeni adı; lobby'deki dizilim ve giriş/çıkış animasyonları |

Server için yeni paket gerekmedi.

### Bilinen sınırlar

- **Oda başına sıralı çalıştırma tek server'da geçerli.** Birden fazla server'a geçildiğinde
  odayı hangi server'ın yönettiğini Redis'te bir kilitle belirlemek gerekecek. Açılıştaki
  kurtarma da şu an bütün odaları kapsıyor; o zaman yalnızca sahip olunan odalarla
  sınırlanmalı.
- **"Bağlantı başka bir yerden açıldı" kontrolü** `fetchSockets` kullanıyor. Çoklu server'da
  bu, Redis üzerinden bir istek/yanıt turu demek.
- **Küfür listeleri temel düzeyde**; kesin bir filtre değiller.
- **Düz HTTP üzerinden LAN testinde Wake Lock çalışmaz** (tarayıcı güvenli bağlantı istiyor);
  iOS Safari titreşimi desteklemiyor.
- **Host ekranındaki oyuncu kartları** en fazla 20 oyuncu için boyutlandırıldı (4 sütun).

---

## Phase 1 — Altyapı

### Yapılanlar

- **Monorepo:** pnpm 12 workspaces + Turborepo 2.11, Node 24, TypeScript 6.0 (strict,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), tüm repo ESM. Kökte tek ESLint 10
  flat config ve Prettier.
- **packages/shared:** ack zarfı (`{ok:true,data} | {ok:false,code,message}`) için zod şemaları,
  `time:sync` sözleşmesi, tipli socket event haritaları (`ClientToServerEvents`,
  `clientCommandSchemas`), NTP tarzı saat farkı hesabı (en düşük RTT'li örnek seçilir).
- **apps/server (NestJS 12):**
  - zod ile doğrulanan ortam değişkenleri; geçersizse uygulama açılmaz.
  - Prisma 7 (`@prisma/adapter-pg`): SPEC §10'daki şemanın tamamı, ilk migration ve
    idempotent kategori seed'i (7 kategori).
  - ioredis bağlantıları.
  - `GET /health`: DB ve Redis kontrol edilir; ikisi de cevap verirse 200, biri vermezse aynı
    raporla 503.
  - Socket.IO gateway, Redis adapter ve `time:sync` komutu.
  - helmet ve CORS; REST uç noktaları `/api` altında, `/health` bu önekin dışında.
- **apps/web (Next.js 16):**
  - Tailwind 4 ile tasarım token'ları tek yerde (`globals.css` → `@theme`), koyu tema.
  - next-intl: varsayılan dil `tr`, URL'de dil öneki yok.
  - `/host` layout'u: 1920×1080 tasarlanıp ekrana ölçeklenen 16:9 sahne, güvenli kenar
    boşluğu, ≥32 px metin.
  - `/play` layout'u: zoom ve pull-to-refresh kapalı, klavye açılınca içerik yeniden boyutlanır,
    safe-area dikkate alınır.
  - `/admin` layout'u: realtime bağlantısı yok.
  - Canlı bağlantı göstergesi: durum, RTT ve saat farkı. `/` ve `/host` sayfalarında ayrıntılı,
    `/play` sayfasında kompakt.
- **Docker:**
  - `compose.yml`: postgres 16, AOF açık redis 7, healthcheck'ler. Portlar yalnızca 127.0.0.1'e
    açılır.
  - `compose.dev.yml`:
    - `setup`: bağımlılık kurulumu, migration ve seed'i bir kez çalıştırıp çıkar.
    - `server`: shared ve Nest için watch.
    - `web`: next dev.
  - `.env.example` dosyasındaki `COMPOSE_FILE` sayesinde düz `docker compose up` geliştirme
    ortamını kaldırır.
- **Testler:**
  - Vitest unit (shared): 15 test.
  - Vitest integration (server; gerçek Postgres ve Redis üzerinde): 10 test.
  - Playwright e2e (Chromium ve WebKit): 3 senaryo × 2 tarayıcı.
- **Belgeler:** `CLAUDE.md`, bu dosya; `docs/SPEC.md` içinde Node 22 → 24 güncellendi.

### Bitti tanımı — son çalıştırma (2026-10-01)

| Kontrol                                                 | Sonuç                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm typecheck`                                        | ✅ 4/4 görev                                                    |
| `pnpm lint`                                             | ✅ 4/4 görev                                                    |
| `pnpm test`                                             | ✅ shared 15/15, server 10/10                                   |
| `pnpm build`                                            | ✅ 3/3 görev                                                    |
| `pnpm test:e2e`                                         | ✅ 6/6 (Chromium + WebKit)                                      |
| `pnpm format:check`                                     | ✅                                                              |
| `docker compose down -v && docker compose up -d --wait` | ✅ Sıfırdan 45 sn'de tüm servisler healthy, `setup` 0 ile çıktı |
| `curl localhost:4000/health`                            | ✅ `{"status":"ok","checks":{"database":"up","redis":"up"}}`    |

**Kabul kriterlerinin karşılığı:**

- _"docker compose up ile her şey ayağa kalkar, health yeşil"_ → yukarıdaki son iki satır.
- _"web sayfası canlı socket bağlantısını ve saat farkını gösterir"_ → e2e testi; ayrıca
  tarayıcıda elle kontrol edildi.
- _"tüm kontroller geçer"_ → tablonun tamamı.

### Alınan kararlar (kullanıcı onaylı)

1. **Node 24 LTS** (SPEC'te 22 yazıyordu): Node 22'nin desteği Nisan 2027'de bitiyor, 24'ünki
   Nisan 2028'de.
2. **SPEC §10'daki tam şema Phase 1'de kuruldu.** Seed yalnızca kategorileri ekliyor. Örnek
   quiz paketi Phase 3'te, admin kullanıcısı (argon2) Phase 4'te gelecek.
3. **Prod compose, prod Dockerfile ve Nginx Phase 9'a ertelendi.**
4. **Paket kapsamı `@loudroom/*`; portlar:** web 3000, server 4000.

### Varsayımlar ve küçük kararlar

- **Paket derleme:** `packages/shared` düz `tsc` ile `dist/`'e derleniyor (ESM ve `.d.ts`).
  Nest decorator metadata'ya ihtiyaç duyduğu için TS kaynağını doğrudan tüketemiyor. tsup ise
  bakım modunda.
- **Socket adresi:** Build anında koda gömülmüyor. Sayfa açıldığında `SOCKET_PORT` sunucudan
  okunur ve tarayıcı `location.hostname:SOCKET_PORT` adresine bağlanır. `SOCKET_PORT` boşsa aynı
  origin kullanılır (Phase 9'da Nginx arkası). Bu yüzden `/`, `/host` ve `/play` dinamik
  render ediliyor.
- **Socket.IO yalnızca WebSocket taşımasıyla çalışıyor** (long-polling yok). Böylece ileride
  birden fazla instance'a geçişte sticky session gerekmeyecek.
- **Redis bağlantıları:**
  - Pub/sub bağlantıları `maxRetriesPerRequest: null` ile çalışıyor; Redis kesilince komutlar
    hata vermek yerine geri gelmesini bekliyor.
  - Socket.IO adapter'ının yakalamadığı komut hataları loglanıyor. Aksi halde Node 24'te
    unhandled rejection süreci düşürürdü.
  - Bağlantı kesilmesi ve geri gelmesi kesinti başına bir kez loglanıyor.
- **Kapanış sırası:** Redis bağlantıları `onApplicationShutdown` aşamasında, yani Socket.IO
  kapandıktan sonra kapanıyor. Bu sayede adapter abonelikleri temiz bırakabiliyor (test ediliyor).
- **Health:** Her kontrol için 2 sn zaman aşımı var.
- **Ortam değişkenleri:**
  - Server ve web, kökteki `.env` dosyasını kendileri okuyor.
  - Gerçek ortam değişkenleri (Docker) her zaman öncelikli.
  - Turbo'nun strict env modu yüzünden `dev` görevine gereken değişkenler `passThroughEnv`
    ile geçiriliyor.
- **Saat ölçümü:** Bağlantı kurulunca 5 örnek alınıyor, en düşük RTT'li örnek kullanılıyor ve
  ölçüm her 30 sn'de bir yenileniyor. İstemci saati olarak
  `performance.timeOrigin + performance.now()` kullanılıyor (monoton artan saat).
- **Şema ayrıntıları:**
  - Süre alanları birimiyle adlandırıldı (`defaultTimeLimitMs`, `timeLimitMs`).
  - `SessionRound.contentSnapshot` eklendi; içerik sonradan düzenlense veya silinse de oyun
    geçmişi korunuyor.
  - Kimlikler UUIDv7.
- **Test ortamı:**
  - Integration testleri `loudroom_test` veritabanını ve Redis'in 1 numaralı DB'sini kullanıyor.
  - `loudroom_test` veritabanını postgres init script'i oluşturuyor; bu script yalnızca volume
    ilk kez oluşturulurken çalışır.
  - Testler dosya dosya sırayla çalışıyor.
- **Ürün adı:** Arayüzde çalışma adı olarak "Loudroom" kullanılıyor. Tek bir yerden
  (`messages/tr.json`) değiştirilebilir.
- **Font:** Inter (gövde) ve Bricolage Grotesque (başlık). Türkçe karakterler için `latin-ext`
  alt kümesi yükleniyor. Fontlar build sırasında Google Fonts'tan indirildiği için build
  internet erişimi gerektiriyor.

### Eklenen paketler ve gerekçeleri

Sürümler tam olarak sabitlendi (`saveExact: true`).

| Paket                                                                       | Nerede          | Gerekçe                                                                                                                    |
| --------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| turbo 2.11.5                                                                | kök, dev        | Monorepo görev çalıştırma ve önbellek (SPEC §2)                                                                            |
| typescript 6.0.3                                                            | kök, dev        | 7.x henüz typescript-eslint tarafından desteklenmiyor                                                                      |
| eslint 10, @eslint/js, typescript-eslint 8.71, globals                      | kök, dev        | Lint, type-aware kurallar                                                                                                  |
| eslint-plugin-react-hooks, @next/eslint-plugin-next                         | kök, dev        | React ve Next kuralları                                                                                                    |
| prettier, prettier-plugin-tailwindcss                                       | kök, dev        | Biçimlendirme ve Tailwind sınıf sıralaması                                                                                 |
| vitest 5                                                                    | kök, dev        | Unit ve integration testleri (SPEC §14)                                                                                    |
| @types/node 24                                                              | kök, dev        | Node 24 tipleri                                                                                                            |
| zod 4.6                                                                     | shared, server  | Sözleşmeler ve tüm doğrulama (SPEC §3)                                                                                     |
| @nestjs/common, core, platform-express, websockets, platform-socket.io 12.1 | server          | NestJS, REST ve WebSocket                                                                                                  |
| reflect-metadata, rxjs                                                      | server          | Nest'in zorunlu yardımcı paketleri                                                                                         |
| socket.io 4.8.3                                                             | server          | Nest'in bağımlı olduğu sürüme sabitlendi (iki kopya oluşmasın diye)                                                        |
| @socket.io/redis-adapter 8.3                                                | server          | SPEC §3: ileride çoklu instance için hazırlık                                                                              |
| ioredis 6                                                                   | server          | Redis istemcisi; Lua desteği sonraki fazlardaki rate limit ve kilitler için                                                |
| @prisma/client, @prisma/adapter-pg, prisma 7.10, pg                         | server          | ORM ve migration'lar; Prisma 7 driver adapter ile çalışıyor (npm'deki `latest` etiketi 8.0 RC olduğu için 7.10'da kalındı) |
| helmet 8                                                                    | server          | Güvenlik başlıkları (SPEC §9)                                                                                              |
| @nestjs/cli                                                                 | server, dev     | `nest build` / `nest start --watch`                                                                                        |
| @swc/core, unplugin-swc                                                     | server, dev     | Vitest'te decorator metadata üretimi (Nest DI için gerekli)                                                                |
| socket.io-client                                                            | server dev, web | Integration testleri ve tarayıcı istemcisi                                                                                 |
| tsx                                                                         | server, dev     | Prisma seed script'ini çalıştırmak için                                                                                    |
| @types/pg                                                                   | server, dev     | pg tipleri                                                                                                                 |
| next 16.3, react / react-dom 19.3                                           | web             | Frontend (SPEC §2)                                                                                                         |
| next-intl 4                                                                 | web             | i18n (SPEC §12)                                                                                                            |
| tailwindcss 4, @tailwindcss/postcss                                         | web             | Stil ve tasarım token'ları                                                                                                 |
| @playwright/test 1.63                                                       | web, dev        | E2E testleri (SPEC §14)                                                                                                    |
| @types/react, @types/react-dom                                              | web, dev        | Tipler                                                                                                                     |

Bilerek eklenmeyenler:

- `@nestjs/config` ve `nestjs-zod`: Ortam doğrulaması ve ack yardımcısı birkaç düzine satır.
- `@nestjs/terminus`: Redis kontrolü zaten içinde yok.
- `supertest`: Yerleşik `fetch` yeterli.
- `@nestjs/testing`: Testler gerçek uygulamayı ayağa kaldırıyor.
- `pnpm-workspace.yaml` → `allowBuilds` ayarı: `@parcel/watcher` (next-intl'in bağımlılığı)
  için build script'i kapalı. Kendi derlediği yedek koda gerek yok; hazır binary'ler opsiyonel
  paketlerden geliyor.

### Bilinen sınırlar

- **Docker içinde hot reload'u bir kod değişikliğiyle uçtan uca denemedim.** Watcher'lar
  çalışıyor ve loglarda "Watching for file changes" görünüyor.
- **Telefonla LAN üzerinden test için ayar gerekiyor:** `PUBLIC_URL`, bilgisayarın LAN IP'sine
  ayarlanmalı (ör. `http://192.168.1.20:3000`) ve ardından
  `docker compose up -d --force-recreate` çalıştırılmalı. HTTP üzerinden Screen Wake Lock
  çalışmaz; ayrıca iOS Safari `navigator.vibrate` desteklemiyor. Bu ikisi Phase 2'nin konusu.
- **Henüz server → client event'i yok:** `ServerToClientEvents` boş; event'ler Phase 2'de
  gelecek.
- **İngilizce dil dosyası henüz yok:** Altyapı hazır; `en.json` eklenmesi ve dil seçimi
  ileride yapılacak.
- **GitHub Actions kurulmadı** (SPEC'te opsiyonel).
- **Turborepo anonim telemetri topluyor:** Bu davranış dev container'da kapalı; host'ta
  `pnpm exec turbo telemetry disable` ile kapatılabilir.
- **`AGENTS.md`'yi turbo yönetiyor:** AI agent algıladığında bu dosyayı kendisi yazıyor; repoda
  tutuluyor.

### Sonraki fazlar için açık riskler (Phase 1 öncesi değerlendirmeden)

- **Rate limit (Phase 2):** Partide herkes aynı Wi-Fi NAT IP'sinden çıkıyor. IP başına katılım
  sınırı yalnızca başarısız denemeleri saymalı ve token'la yeniden bağlanma sınıra dahil
  edilmemeli.
- **Modül sözleşmesi (Phase 3):**
  - Seri bonusu ve "önce cevaplayan önde" kuralı round'lar arası veri istiyor; engine'in
    oyuncu başına tuttuğu veriler `RoundContext` ile modüle verilmeli.
  - `onInput` ve görünüm fonksiyonlarına `ctx` parametresi eklenmeli.
  - Görünümler zod şemalı olmalı.
- **Oyun paketlerinde ayrı giriş noktaları:** Server React kodunu yüklememeli; `/server` ve
  `/client` giriş noktaları ayrılmalı.
- **Restart sonrası devam:** Server açılışta aktif odaların zamanlayıcılarını kayıtlı
  `endsAt` değerlerinden yeniden kurmalı. Redis AOF şimdiden açık.
- **Süre bitiminde tolerans:** Geç gelen input reddedilirken ağ gecikmesi için ~250 ms tolerans
  düşünülmeli.
