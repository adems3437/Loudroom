# PROGRESS

Projenin ilerleme kaydı. Kapsamın tek doğru kaynağı [docs/SPEC.md](docs/SPEC.md).

## Durum

| Faz                              | Durum                                                |
| -------------------------------- | ---------------------------------------------------- |
| Phase 1 — Altyapı                | ✅ Tamamlandı (2026-10-01)                           |
| Phase 2 — Oda ve Lobby           | ✅ Tamamlandı (2026-10-01)                           |
| Phase 3 — Game Engine + Quiz MVP | ✅ Tamamlandı (2026-10-01)                           |
| Phase 4 — Admin Panel (temel)    | 🟡 Kodlandı; Mac'te iki doğrulama bekliyor (aşağıda) |

---

## Phase 4 — Admin Panel (temel)

### Yapılanlar

- **Kimlik doğrulama (A1, A2):**
  - Parolalar argon2id ile saklanıyor (`@node-rs/argon2`, OWASP'ın önerdiği varsayılanlar).
  - Oturum Redis'te tutuluyor: `admin:session:{hash}`, ayrıca kullanıcı başına bir oturum
    listesi. Çerezde 256 bit rastgele bir token var; Redis'te yalnızca SHA-256 özeti duruyor.
    Oturum 12 saat işlem yapılmazsa kapanıyor; her istek süreyi uzatıyor.
  - Çerez: httpOnly, `SameSite=Strict`. `PUBLIC_URL` https ise Secure bayrağı da ekleniyor.
  - CSRF koruması: Her oturumun bir CSRF token'ı var. Güvenli olmayan isteklerde bu token'ın
    `X-CSRF-Token` başlığında gelmesi ve `Origin` (yoksa `Referer`) adresinin izin verilen bir
    adres olması gerekiyor. Giriş isteğinde de Origin kontrol ediliyor.
  - Roller: EDITOR içerik, kategori, medya ve paketleri yönetiyor. Kullanıcı yönetimi yalnızca
    ADMIN'de (A6). Kimse kendi rolünü değiştiremiyor, kendini silemiyor; son yönetici
    silinemiyor ve rolü düşürülemiyor.
  - Rol değişikliği, şifre sıfırlama ve silme, o kullanıcının bütün oturumlarını kapatıyor.
    Kendi şifresini değiştiren kullanıcının diğer cihazlardaki oturumları kapanıyor.
  - Giriş limiti (SPEC §9, ayrı ve sıkı):
    - IP başına başarısız giriş: 10, ardından 10 dakikada 10 hak.
    - Hesap başına başarısız giriş: 5, ardından 15 dakikada 5 hak.
    - Başarılı girişler sayılmıyor (bkz. kararlar).
  - Kayıtlı olmayan bir e-posta da gerçek bir şifre kontrolü kadar sürüyor. Böylece yanıt
    süresinden hangi e-postaların kayıtlı olduğu anlaşılamıyor.
  - `pnpm admin:create --email … [--name …]` ilk yöneticiyi oluşturuyor. `--reset` şifre
    sıfırlıyor. Şifre ekrana yazılmadan iki kez soruluyor ya da `ADMIN_PASSWORD` ile veriliyor.
    Geliştirme ortamında `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` tanımlıysa seed bir yönetici
    oluşturuyor. Hesap zaten varsa şifresine dokunulmuyor.
- **REST API (`/api/admin/*`):**
  - Kategoriler, içerik, medya, paketler, kullanıcılar ve genel bakış uç noktaları.
  - Hosta açık uç nokta: `GET /api/packs`. Yalnızca yayındaki paketleri listeliyor (A5).
  - Bütün istek gövdeleri ve sorgular `packages/shared` içindeki zod şemalarıyla doğrulanıyor.
  - Hatalar tek biçimde dönüyor: `{ code, message, issues? }`.
  - IP başına REST limiti: 120 istek, saniyede 4 yenileniyor. `/health` bu limitin dışında.
- **İçerik:**
  - `data` alanı oyun modülünün şemasıyla doğrulanıyor.
  - İçeriğin referans verdiği görsellerin var olması gerekiyor. İçerik ile medya ilişkisi her
    kayıtta güncelleniyor.
  - Metin araması, durum, kategori ve zorluk filtreleri, sayfalama var.
  - İçeriğin oyun tipi sonradan değiştirilemiyor.
- **Kullanımdaki kayıtlar korunuyor (A4):**
  - Bir pakette (taslak dahil) kullanılan içerik silinemiyor.
  - Yayındaki bir pakette kullanılan içerik taslağa alınamıyor.
  - İçerikte kullanılan görsel silinemiyor.
  - İçeriği olan ya da bir paketin rastgele seçiminde kullanılan kategori silinemiyor.
  - Bu durumlarda `IN_USE` hatası dönüyor.
- **Medya:**
  - Dosyanın türü adına veya MIME başlığına göre değil, içeriğine bakılarak tespit ediliyor.
    JPEG, PNG, WebP ve GIF kabul ediliyor.
  - Bütün görseller `sharp` ile WebP'ye yeniden kodlanıyor ve uzun kenarı en fazla 2560 px
    oluyor. Bu sırada EXIF (GPS dahil), ICC ve XMP bilgileri siliniyor; fotoğrafın yönü
    korunuyor.
  - 40 megapikselden büyük görseller açılmadan reddediliyor (dekompresyon bombası koruması).
  - Boyut sınırı `MEDIA_MAX_UPLOAD_BYTES` ile ayarlanıyor; varsayılan 10 MB.
  - Dosyalar `MEDIA_DIR` klasörüne `{uuid}.webp` adıyla yazılıyor ve `/media/…` adresinden
    süresiz önbellekle sunuluyor. Depolama `MediaStorage` arayüzünün arkasında; ileride
    S3/MinIO'ya geçilebilir (SPEC §13).
- **Paketler (A5):**
  - `GamePack.status` alanı eklendi (DRAFT/PUBLISHED). Migration, mevcut paketleri yayında
    bıraktı.
  - Taslak paket eksik olabilir. Yayınlarken şunlar kontrol ediliyor:
    - En az bir bölüm var mı?
    - Oyun biliniyor mu?
    - Sabit listedeki içerikler var ve yayında mı?
    - Rastgele seçim için yeterli yayında içerik var mı?
  - Sabit listede soru sayısı listedeki içerik sayısından hesaplanıyor; tekrarlar atılıyor.
  - Host ve `game:start` yalnızca yayındaki paketleri görüyor.
- **Quiz modülü sürüm 2 (A3):**
  - İçeriğe isteğe bağlı soru görseli (`media: { type: 'image', mediaId }`) ve seçenek
    görselleri (`mediaId`) eklendi. Sürüm 1 içerik, sürüm 2'de de geçerli.
  - TV'de soru görseli ve seçenek küçük resimleri gösteriliyor; telefonda seçenek görselleri
    var.
  - Görselli içerikle de sözleşme testleri çalıştırılıyor, sızıntı testi dahil.
  - Paket kendi içerik editörünü getiriyor (`editor.tsx`). Web registry'si bu editörü
    `gameType`'a göre buluyor.
- **Web:**
  - Next `/api` ve `/media` adreslerini server'a yönlendiriyor (A2: tek adres).
  - Sayfalar: `/admin/login`, genel bakış, içerik listesi (filtre ve arama), içerik editörü
    (oyunun editörü, görsel seçici ve yükleme, ortak alanlar), kategoriler, medya kütüphanesi
    (açıklama düzenleme, silme), paket editörü (bölümler, sabit/rastgele seçim, sıralama,
    yayın hataları), kullanıcılar (yalnızca ADMIN), hesabım (şifre değiştirme).
  - Oturum yoksa panel giriş sayfasına yönlendiriyor. Girişten sonra yalnızca `/admin`
    altındaki adreslere dönülüyor.
  - Host lobby'si yayındaki paketleri listeliyor. Host seçmezse en son güncellenen paket
    seçili oluyor; yayında paket yoksa başlatma butonu kapalı ve uyarı gösteriliyor.
  - Bütün metinler `tr.json` içinde: `admin.*`, `games.quiz.editor.*`, `host.pack*`.
- **Docker:** `media-data` volume'u, server için `MEDIA_DIR`, web için `API_INTERNAL_URL`,
  setup için `ADMIN_SEED_*` eklendi.
- **SPEC:** Admin route'ları (§2), GamePack durumu ve `mediaId` kuralı (§6), admin oturum
  anahtarları (§11) güncellendi.
- **Önceki testlerde düzeltme:** Bu ortam daha hızlı olduğu için iki integration testi her
  seferinde kırmızıya döndü. Server'ın `SESSION_EXPIRED` hatası, test dinlemeye başlamadan
  önce geliyordu. `connectRefused` yardımcı fonksiyonu dinleyiciyi bağlantıdan önce kuruyor.

### Bitti tanımı — son çalıştırma (2026-10-01, bulut ortamı)

| Kontrol                                                 | Sonuç                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm typecheck`                                        | ✅ 8/8 görev                                                       |
| `pnpm lint`                                             | ✅ 8/8 görev                                                       |
| `pnpm test`                                             | ✅ 186 test: shared 44, game-sdk 6, game-quiz 41, server 95        |
| `pnpm build`                                            | ✅ 5/5 görev                                                       |
| `pnpm test:e2e`                                         | 🟡 Chromium'da 10/10 (Phase 1–3 dahil). **WebKit çalıştırılamadı** |
| `pnpm format:check`                                     | ✅                                                                 |
| `docker compose down -v && docker compose up -d --wait` | ❌ **Doğrulanamadı:** dev imajı derlenemedi                        |

**Doğrulanamayanlar ve nedenleri:**

- **WebKit:** Bulut ortamında yalnızca daha eski bir Chromium sürümü kurulu, WebKit yok.
  E2e'ler commit'lenmemiş yerel bir config ile bu Chromium'da çalıştırıldı.
- **`docker compose up`:** Ağ politikası `deb.debian.org` adresini engelliyor (403). Bu yüzden
  dev imajındaki `apt-get` adımı çalışmadı. E2e'ler aynı servislerle host modunda koşturuldu:
  `pnpm infra:up` ile sıfır veritabanı, migration, seed ve `pnpm dev`.
- Bu iki adım Mac'te çalıştırılmalı:

  ```bash
  docker compose down -v && docker compose up -d --build --wait
  pnpm test:e2e
  ```

  `--build` gerekli: dev imajına `/media-data` bağlama noktası eklendi.

**Kabul kriteri (SPEC §15 Phase 4):** `e2e/admin.spec.ts` şu adımları doğruluyor:

1. Oturum açılmadan panele girilmeye çalışılır, giriş sayfasına yönlendirilir.
2. Giriş yapılır, kategori oluşturulur.
3. Görsel seçicinin içinden PNG yüklenip soruya eklenir; 4 seçenekli, yayında bir soru
   kaydedilir.
4. Paket oluşturulur, soru eklenip yayınlanır.
5. Pakette kullanılan içeriği silme denemesi `IN_USE` ile reddedilir.
6. Host lobby'de yeni paketi seçip oyunu başlatır. TV'de görsel `/media/{id}.webp` adresinden
   gerçekten yüklenir; telefon cevaplar, sonuç ekranı gelir.
7. Paket, içerik, görsel ve kategori panelden silinir.

İkinci senaryo: hatalı giriş mesajı, yönetici yeni bir editör ekler, editör kullanıcılar
menüsünü görmez, çıkış yapınca oturum kapanır.

Server integration testleri ayrıca şunları kapsıyor:

- Çerez bayrakları; CSRF, Origin ve giriş limitleri; REST limiti; roller.
- Kendi rolünü değiştirme ve kendini silme yasakları; oturumların kapatılması.
- Modül şeması ve medya referansları.
- EXIF'in silindiği; sahte dosya (415) ve fazla büyük dosya (413) reddi.
- Kullanımdaki kayıtların korunması.
- Yayın kontrolleri; taslak paketle `game:start` reddi; görselin soru görünümüne ulaşması.

### Alınan kararlar (kullanıcı onaylı)

- **A1:** İlk yönetici `pnpm admin:create` ile, geliştirmede seed ile oluşturuluyor.
- **A2:** Panel ve API aynı adreste (Next yönlendirmesi). Oturum Redis'te; çerez httpOnly ve
  `SameSite=Strict`; CSRF token'ı ve Origin kontrolü var.
- **A3:** Quiz'e soru ve seçenek görselleri eklendi (modül sürüm 2).
- **A4:** Kullanımdaki içerik ve medya silinemiyor.
- **A5:** Paketlerin DRAFT/PUBLISHED durumu var; host paketi lobby'de seçiyor; açık uç nokta
  `GET /api/packs`.
- **A6:** Kullanıcı yönetimi yalnızca ADMIN'de.

### Varsayımlar ve küçük kararlar

- **Giriş limiti yalnızca başarısız denemeleri sayıyor:** Admin istekleri Next üzerinden
  geldiği için server'a hepsi aynı adresten (web uygulamasından) ulaşıyor. Başarılı girişler
  de sayılsaydı, birkaç girişten sonra herkes kilitlenirdi. Odaya katılımda da aynı kural
  uygulanıyor.
- **Bilinen sınır:** IP başına sayaç bu yüzden şu an fiilen tek bir ortak sayaç. Hesap başına
  limit her durumda geçerli. Gerçek istemci IP'si Phase 9'da Nginx ve `TRUST_PROXY` ile
  gelecek.
- **Medya id'si UUIDv4:** Görsel adresleri herkese açık. Zamana dayalı UUIDv7 yerine tahmin
  edilemeyen v4 kullanıldı. Görseller yetki gerektirmiyor; taslak bir sorunun görseli de
  adresini bilen biri tarafından açılabilir.
- **Seçenek metni zorunlu:** Görselli seçeneklerde de metin isteniyor. Hem TV'de etiket hem
  erişilebilirlik için gerekli.
- **Video:** Şema `media.type` alanını taşıyor ama şimdilik yalnızca `image` kabul ediyor.
  Oynatıcı Phase 9'da (SPEC §7.1).
- **Paket ayarları:** Panelde bölüm başına süre, puan çarpanı ve skor tablosu ayarlanabiliyor.
  Modülün diğer ayarları (giriş süresi, cevap değiştirme) varsayılanlarda kalıyor; şema hazır.
- **Panel istemci tarafında render ediliyor:** Oturum kontrolü `/api/admin/auth/me` ile
  yapılıyor. Asıl yetki kontrolü her istekte server'da.
- **Admin kullanıcılarının e-postaları** küçük harfe çevrilip kırpılarak saklanıyor.
- **`/admin/sessions` ve `/admin/settings`** SPEC'teki route listesinde var ama Phase 9'un
  (oturum geçmişi) konusu. Oluşturulmadı.

### Eklenen paketler

| Paket                                               | Nerede      | Gerekçe                                                                                |
| --------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| @node-rs/argon2 2.2.1                               | server      | SPEC §9 argon2. Hazır binary'lerle geliyor, kurulum script'i ve node-gyp gerektirmiyor |
| sharp 0.35.5                                        | server      | SPEC §9: görselleri yeniden kodlamak ve metadata'yı silmek için                        |
| cookie-parser 1.4.7                                 | server      | Oturum çerezini okumak için                                                            |
| @types/cookie-parser, @types/multer, @types/express | server, dev | Tipler. Multer Nest'in kendi bağımlılığı olarak zaten kurulu                           |

`sharp` ve `@node-rs/argon2` platforma uygun binary'yi isteğe bağlı paketlerden alıyor;
`allowBuilds`'e eklemek gerekmedi.

### Ortam notları (bulut oturumu)

- Bulut ortamında Node 22 kuruluydu. Node 24 `/opt` altına indirildi ve pnpm 12.8.1 onunla
  kuruldu. Önceden kurulu pnpm, turbo'nun alt süreçlerinde çalışmıyordu
  ("Exec format error").
- Docker daemon elle başlatıldı. Postgres ve Redis imajları sorunsuz indi.

### Bilinen sınırlar

- **Bu ortamda doğrulanamayanlar:** WebKit e2e ve sıfırdan `docker compose up`.
- **Next yönlendirme adresi:** `API_INTERNAL_URL`, `next build` sırasında okunuyor. Prod
  ortamında Nginx `/api` ve `/media` adreslerini doğrudan server'a yönlendirecek (Phase 9).
- **Eşzamanlı işlemler:** Görsel silinirken aynı anda o görsel bir içeriğe eklenirse, içerik
  silinmiş bir görsele referans verebilir. Bu kontrol tek bir transaction içinde değil; panel
  kullanımında olasılığı çok düşük.
- **Medya kütüphanesinde arama yok:** Sayfalama var.
- **Tek dil:** Panel yalnızca Türkçe.

---

## Phase 3 — Game Engine + Quiz MVP

### Yapılanlar

- **`packages/game-sdk`:**
  - `GameModule` sözleşmesi, K1 ile güncellendi (SPEC §5):
    - `onInput` ve görünüm fonksiyonları bağlamı (`ctx`) alıyor.
    - Host ve oyuncu görünümlerinin zod şemaları var.
    - `RoundContext` oyuncu istatistiklerini, oyuncuların bağlı olup olmadığını ve faz saatini
      taşıyor.
    - `ScoreResult` doğruluğu, cevap süresini ve cevabın kendisini içeriyor.
  - Seed'li rastgele sayı üreteci (mulberry32).
  - `./testing`:
    - Round'u engine gibi oynatan küçük bir test düzeneği.
    - Her modülün geçmesi gereken ortak sözleşme testleri: görünümler şemaya uyuyor mu,
      sonuçlar tekrarlanabilir mi, geçersiz cevap reddediliyor mu, sızıntı var mı.
    - **Sızıntı testi:** Yalnızca doğru cevabı farklı olan içerik varyantlarıyla aynı round
      oynanır. Round bitene kadar istemcilere giden her şey birebir aynı olmalı. Bilerek
      sızıntılı bir değişiklik yapıldığında testin kırmızıya döndüğü doğrulandı.
  - `./client`: Server saatine göre çizilen geri sayım halkası; renk ve şekli birlikte
    kullanan seçenek simgeleri; oyun ekranı (renderer) tipleri.
- **Quiz modülü (`packages/games/quiz`):**
  - Fazlar: INTRO → ANSWERING → REVEAL. Seçenek sırası her round'da seed ile karıştırılıyor.
  - Puan formülü SPEC §7.1'deki gibi. Seri bonusu: 3. ardışık doğru cevaptan itibaren her
    adımda +100, en fazla +500.
  - Bağlı oyuncuların hepsi cevap verince süre beklenmeden REVEAL'e geçiliyor.
  - Cevap kilitleme ve cevap değiştirme ayarı.
  - REVEAL'de cevap dağılımı gösteriliyor.
  - Host ekranında soru, geri sayım halkası, renk+şekil seçenekleri ve dağılım çubukları;
    telefonda büyük butonlar ve doğru/yanlış sonucu.
- **Engine (`apps/server/src/game`):**
  - Durum makinesi: STARTING → PLAYING → ROUND_RESULT → SCOREBOARD → … → FINISHED, ayrıca
    PAUSED. Bütün adımlar oda kilidi altında çalışıyor.
  - **Zamanlayıcı:** Her oda için tek bir zamanlayıcı var; eski zamanlayıcılar token ile
    ayıklanıyor.
  - **Gecikme toleransı:** Süre bittikten sonraki 250 ms içinde gelen cevaplar kabul ediliyor.
  - **Host komutları:** devam (`game:next`), atla, bitir, duraklat/devam, yeniden oyna.
    Host koparsa oyun otomatik duraklıyor; server yeniden başlarsa oyun kalan süresiyle
    duraklatılmış olarak geri geliyor.
  - **Sıralama:** Puana göre; eşitlikte toplam cevap süresi kısa olan önde. Cevap verilmeyen
    round'lar tam süre sayılıyor, böylece eşitliği bozmada avantaj sağlamıyor.
  - **Paket yükleyici:** Sabit id listesi ya da seed'li rastgele seçim. İçerik modülün şemasıyla
    doğrulanıp oyun durumuna kopyalanıyor.
  - **Oyun geçmişi:** `GameSession`, `SessionPlayer`, `SessionRound`, `PlayerAnswer` ve
    `ScoreEvent` arka planda, oturum başına sırayla yazılıyor. Hata oyunu durdurmuyor;
    kapanışta bekleyen yazımlar tamamlanıyor.
  - **Görünümler:** Oyun durumu her oda yayınıyla birlikte gönderiliyor. Oyuncu görünümleri
    kişiye özel olduğu için oturum kanalına gidiyor. `round:*`, `score:update` ve `game:end`
    ses ve titreşim için bildirim olarak gönderiliyor.
  - **Oda:** Oyun durumu `room:{code}:game` anahtarında. Bitmiş oda 30 dakika tutuluyor. Geç
    katılım ayarı uygulanıyor; oyun sırasında kopan oyuncunun yeri korunuyor (K4).
- **Seed:** 10 Türkçe soru ve "Genel Kültür Karışık" paketi. Sabit id'ler kullanıldığı için
  seed tekrar çalıştırılınca kayıtlar çoğalmıyor.
- **Web:**
  - Lobby'de "Oyunu başlat" butonu; oda oluştururken geç katılım ayarı.
  - Host oyun ekranı: başlangıç geri sayımı, soru, sonuç, skor tablosu (sıra değişince satırlar
    kayıyor), podyum, duraklatma katmanı; kontroller: duraklat/devam, atla, bitir (onaylı),
    ses aç/kapa, tam ekran.
  - Telefon: başlangıç geri sayımı, soru, sonuç ve kazanılan puan, sıralama, final sırası,
    duraklatma.
  - Ses efektleri WebAudio ile kodla üretiliyor (K6): tik, cevap, yeni soru, sonuç, final.
  - Oyun registry'si: `gameType` → ekranlar. Oyun metinleri `tr.json` içinde `games.*` altında.
- **SPEC:** §5 sözleşmesi güncellendi; §8'e `game:next` ve `game:restart` eklendi.
  §7.9–7.16'ya yeni oyunlar, Phase 10–13 olarak yeni fazlar eklendi.

### Bitti tanımı — son çalıştırma (2026-10-01)

| Kontrol                                                 | Sonuç                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm typecheck`                                        | ✅ 8/8 görev                                                |
| `pnpm lint`                                             | ✅ 8/8 görev                                                |
| `pnpm test`                                             | ✅ 151 test: shared 40, game-sdk 4, game-quiz 32, server 75 |
| `pnpm build`                                            | ✅ 5/5 görev                                                |
| `pnpm test:e2e`                                         | ✅ 16/16 (Chromium + WebKit; Phase 1–2 testleri dahil)      |
| `pnpm format:check`                                     | ✅                                                          |
| `docker compose down -v && docker compose up -d --wait` | ✅ Sıfırdan 47 sn                                           |

**Kabul kriterleri:**

- `e2e/game.spec.ts` akışın tamamını doğruluyor: host oda açar, telefonlar QR linkiyle katılır,
  oyun başlar ve 10 sorunun her birinde:
  - Telefonlar farklı seçenekler işaretler; son cevapla round erken biter.
  - REVEAL'de host ekranından doğru seçenek okunur. Her telefonun doğru/yanlış sonucu ve
    server'ın verdiği puan buna göre kontrol edilir: doğruya en az 500, yanlışa 0.
  - Skor tablosunun sıralaması kontrol edilir.
  - 2. soruda bir telefon sayfayı yenileyip aynı soruya geri döner.
  - Ardından podyum ve telefonlardaki final sırası kontrol edilir, "yeniden oyna" ile lobby'ye
    dönülür.
- **Cevap sızıntısı üç seviyede test ediliyor:**
  - Modül: sözleşme testindeki varyant karşılaştırması.
  - Server: integration testi; REVEAL öncesinde gönderilen bütün payload'lar taranıyor.
  - Tarayıcı: e2e testi; tarayıcıların aldığı WebSocket mesajları taranıyor.

### Alınan kararlar (kullanıcı onaylı)

- **K1, modül sözleşmesi:** Bağlam (`ctx`) bütün fonksiyonlara veriliyor, görünüm şemaları var,
  round'lar arası oyuncu istatistikleri modüle aktarılıyor.
- **K2, paket seçimi:** `game:start` isteğe bağlı bir `packId` alıyor; verilmezse en son
  güncellenen paket kullanılıyor. Seçim arayüzü Phase 4'te.
- **K3, görselli sorular:** Medya yükleme ile birlikte Phase 4'te.
- **K4, oyun sırasında kopan oyuncu:** Yeri ve puanı korunuyor; 90 saniye sonra çıkarılma
  kuralı yalnızca lobby'de geçerli.
- **K5, geçişler:** Ekranlar arası geçişler host "Devam" butonuyla elle; soru içindeki
  zamanlama (başlangıç geri sayımı, okuma süresi, cevap süresi) otomatik.
- **K6, ses:** Efektler WebAudio ile kodla üretiliyor; müzik lisanslı dosya gerektirdiği için
  ertelendi.
- **K7, yeniden oyna:** Podyumdan sonra oda aynı oyuncularla, puanlar sıfırlanmış olarak
  lobby'ye dönüyor.
- **K8, skor tablosu ayarı:** Bölümün her sorusundan sonra `showScoreboardAfter` ayarına göre
  gösteriliyor; bölümün son sorusunda her durumda gösteriliyor. Son sorudan sonra doğrudan
  podyuma geçiliyor.
- **Oyun listesi:** Kim Yapar? (Phase 5), Tombala ve Casus Kim? (Phase 10), UNO ve Pişti
  (Phase 11), Kızma Birader ve Amiral Battı (Phase 12), Okey (Phase 13). İsimler kullanıcının
  kararıyla aynen kullanılıyor; marka riski SPEC'e not edildi.

### Varsayımlar ve küçük kararlar

- **Oyun başlatma:** En az bir bağlı oyuncu yeterli; herkesin "hazır" olması zorunlu değil.
  Başlangıçta puanlar ve hazır durumu sıfırlanıyor.
- **Atla:** Oynanan soru puan verilmeden kapatılıyor ve geçmişe yazılmıyor.
- **Bitir:** Oyun her an podyuma geçebiliyor; oturum FINISHED olarak kaydediliyor.
- **Durum yayın sırası:** Server yeni durumu ack'ten önce yayınlıyor (Nest handler'ı dönmeden
  emit ediyor). Testler buna göre yazıldı.
- **Görünüm doğrulaması:** Server görünümleri çalışma anında şemayla doğrulamıyor (sözleşme
  testi bunu güvence altına alıyor). Web her görünümü ilgili oyunun şemasıyla doğruluyor;
  doğrulama başarısız olursa "gösterilemiyor" mesajı çıkıyor.
- **Seçenek renkleri:** Oyuncu renklerinden ayrı, sabit 6 renk + 6 şekil.

### Eklenen paketler

Yeni harici paket eklenmedi. Yeni çalışma alanı içi paketler: `@loudroom/game-sdk` ve
`@loudroom/game-quiz`. game-sdk'da `react` ve `vitest` isteğe bağlı peer bağımlılık olarak
tanımlı.

### Ortam notu: iCloud

Proje, iCloud ile senkronize edilen Masaüstü'nde duruyor. iCloud 12 binden fazla dosyayı diskten
boşaltmıştı; bu dosyalar boş okunduğu için ESLint çöktü. Kullanıcı klasörde "İndirilmiş Olarak
Tut" seçeneğini açtı. Kaynak dosyalar indirildi ve `git status` ile doğrulandı; `node_modules`
pnpm'in iCloud dışındaki deposundan yeniden kuruldu. Bu seçeneğin açık kalması gerekiyor.
Kontrol komutu `CLAUDE.md` içinde.

### Bilinen sınırlar

- **Yarıda kalan oyun kayıtları:** Süresi dolan odanın yarıda kalmış oyunu veritabanında ACTIVE
  olarak kalıyor. Temizlik ve saklama süresi Phase 9'da (oturum geçmişi) ele alınacak.
- **Görselli soru ve medya:** Phase 4.
- **Müzik:** Yok (K6).
- **Paket seçme arayüzü:** Phase 4.
- **Çoklu server:** Açılıştaki "oyunu duraklat" kurtarması bütün odaları kapsıyor; çoklu
  server'da yalnızca sahip olunan odalarla sınırlanmalı.
- **E2E süresi:** 10 soruluk tam akış tarayıcı başına yaklaşık 50 saniye sürüyor.

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
