# PROGRESS

Projenin ilerleme kaydı. Kapsamın tek doğru kaynağı [docs/SPEC.md](docs/SPEC.md).

## Durum

| Faz                                             | Durum                          |
| ----------------------------------------------- | ------------------------------ |
| Phase 1 — Altyapı                               | ✅ Tamamlandı (2026-10-01)     |
| Phase 2 — Oda ve Lobby                          | ✅ Tamamlandı (2026-10-01)     |
| Phase 3 — Game Engine + Quiz MVP                | ✅ Tamamlandı (2026-10-01)     |
| Phase 4 — Admin Panel (temel)                   | ✅ Tamamlandı (2026-10-02)     |
| Phase 5 — Closest Number + Sorting + Kim Yapar? | ✅ Tamamlandı (2026-10-02)     |
| Phase 6 — Image Location + Bluff                | ✅ Tamamlandı (2026-10-02)     |
| Phase 7 — Drawing (stream kanalı)               | ✅ Tamamlandı (2026-10-02)     |
| Phase 8 — Reaction + Memory                     | ⏸ Plan onay bekliyor (aşağıda) |

---

## Phase 8 — Reaction + Memory (plan, onay bekliyor)

Plan 2026-10-02'de çıkarıldı. E1–E12 kararları kullanıcının onayını bekliyor. Kullanıcı
"öneriler tamam" derse uygulamaya geçilir.

### 1. Ortak altyapı

- **Gizli faz saati:** Bugün her fazın bitiş zamanı (`endsAt`) `game:state` ve
  `round:phase` ile herkese gidiyor. Reaction'da bu, hedefin ne zaman çıkacağını önceden
  söyler. Faz efektine isteğe bağlı `hidden: true` eklenir. Motor gerçek saati kendinde tutar
  (zamanlayıcı, duraklatma, `ctx.phase`), istemcilere saati `endsAt: null` ve
  `durationMs: null` olarak gönderir.
- **Sözleşme testi:** `secretHolders` özel bir `host` değeri alabilir: host görünümü
  karşılaştırmalardan çıkarılır. Reaction'da TV denemelerin sonuçlarını canlı gösterir; gizli
  olan, telefonların birbirinin sonucunu görmemesidir.
- **Docker:** İki yeni paket için `node_modules` volume'u ve bağlama noktası.

### 2. Oyunlar

- **Reaction** (`reaction`, `@loudroom/game-reaction`):
  - İçerik: `{ title, variant: 'classic' | 'goNoGo' }`.
    - `classic`: hedef çıkınca bas.
    - `goNoGo`: bazı denemelerde hedef yerine bir tuzak çıkar (başka şekil ve renk); tuzağa
      basmak ceza. Tuzaklı denemeler medyana girmez.
  - Fazlar: INTRO → her deneme için ARMED (gizli, seed ile 1,5–4 sn) → GO (hedef, en fazla
    `maxReactionMs` = 1,5 sn) → ATTEMPT_RESULT (~1,5 sn) → … → REVEAL. Deneme sayısı ayar,
    varsayılan 3. Herkes basınca GO beklemeden biter.
  - Hedef TV'de değil telefonda gösterilir (SPEC §7.7). TV yalnızca "Hazır ol… / BAS!"
    durumunu ve deneme sonuçlarını gösterir; referans alınmaz.
  - Ölçüm telefonda:
    - Hedefin çizildiği kare (`requestAnimationFrame` zamanı) ile dokunmanın
      `event.timeStamp`'i arası; ikisi de `performance.now()` saatinde.
    - Telefon hedef ekrana gelince `shown`, basınca `tap` (ölçülen ms) gönderir.
  - Sunucunun makullük kontrolü:
    - 100 ms'den kısa ya da `maxReactionMs`'den uzun süre geçersiz.
    - `tap`'ten önce `shown` gelmiş olmalı.
    - `shown` GO'dan sonra en fazla 1,5 sn içinde gelmeli.
    - İki mesajın sunucuya varış arası ile bildirilen süre en fazla 300 ms farklı olabilir
      (aynı bağlantının iki mesajı benzer gecikmeyle gelir).
    - Uymayan deneme geçersiz sayılır ve ceza süresi yazılır.
  - Erken basma (ARMED'da) ve süresinde basmama: o deneme `maxReactionMs` sayılır.
  - Oyuncunun sonucu, geçerli denemelerinin medyanı.
  - Puan: medyana göre sıra; 1000, sıra başına −150, en az 300. Hiç geçerli denemesi yoksa 0.
    Eşitlikte en iyi tek deneme, sonra katılma sırası. `correct`: medyanı `goodMs`'nin
    (varsayılan 450 ms) altında.
- **Memory** (`memory`, `@loudroom/game-memory`):
  - İçerik bir nesne seti: `{ title, items: [{ id, label, emoji?, mediaId? }] (8–24) }`.
    Her öğede emoji ya da görsel olmalı.
  - Tahta (sunucuda, round seed'iyle): Setten `distinctCount` (varsayılan 6) öğe seçilir ve
    `boardSize` (varsayılan 9) kutuya tekrarlarla dağıtılır; böylece "kaç tane" sorusu anlamlı
    olur.
  - Fazlar: INTRO → SHOW (tahta TV'de `showMs`, varsayılan 8 sn; telefonlarda "Ekrana bak!")
    → QUESTIONS → REVEAL.
  - QUESTIONS: Telefonda sırayla `questionCount` (varsayılan 3) soru, 4 seçenekli. Herkes aynı
    soruları alır. Tahta bu sırada TV'de de gizli.
    - "Hangisi ekrandaydı?": 1 vardı + 3 yoktu.
    - "Hangisi ekranda yoktu?": 3 vardı + 1 yoktu.
    - "Kaç tane {X} vardı?": sayılar.
    - Soru türleri seed ile karışık sırada. Her soru bir kez cevaplanır; herkes bitirince
      erken REVEAL.
  - Puan: doğru cevap başına 400 (ayar), hız yok. `correct`: hepsi doğru.
  - REVEAL: TV'de tahta, her sorunun doğru cevabı ve kaç kişinin bildiği; telefonda kendi
    cevapları ve doğruları.
  - Gizli bilgi: doğru cevaplar ve tahta telefonlara hiç gitmez (yalnızca seçenekler).
    Oyuncuların cevapları REVEAL'e kadar birbirinden gizli (`secretScripts`). Doğru cevabın
    sızmadığı ayrıca birim testinde kontrol edilir.
- Her iki oyun Phase 5–7 kalıbında: `schema.ts`, `server.ts`, `host.tsx`, `player.tsx`,
  `editor.tsx`, `settings-editor.tsx`, testler; registry'lere birer satır; metinler
  `games.<id>` altında.

### 3. Admin ve seed

- **Reaction editörü:** başlık ve tür (klasik / tuzaklı).
- **Memory editörü:** set adı; öğe listesi (etiket, emoji ya da görsel, ekle / çıkar).
- **Ayar formları:**
  - Reaction: deneme sayısı, en uzun süre, "iyi" eşiği, puanlar, tuzak oranı.
  - Memory: tahta boyu, farklı öğe sayısı, gösterim süresi, soru sayısı, soru başı puan.
- **Seed:**
  - 2 Reaction içeriği (Klasik, Renk tuzağı).
  - Emoji ile 4 Memory seti: meyveler, hayvanlar, eşyalar, taşıtlar; 12–16 öğe.
  - Yayında "Refleks ve Hafıza" paketi: 2 Reaction + 3 Memory, en az 1 oyuncu.

### 4. Testler

- **Unit:**
  - Reaction: gizli ARMED saati, deneme akışı, erken basma, geçersiz süreler (100 ms altı,
    üst sınır, `shown` yokken `tap`, varış aralığı uyuşmazlığı), medyan, tuzak, sıra puanı.
  - Memory: tahta üretimi (tekrarlar, seed ile belirli), soru üretimi (dört seçenek, tek
    doğru, sayı seçenekleri), puan.
  - Telefon görünümlerinde tahta ve doğru cevap yok.
  - Sözleşme testleri: `secretScripts` ve gerektiğinde `secretHolders: ['host']`.
- **Integration:**
  - Gizli fazın `endsAt`'i hiçbir socket'e gitmiyor ama zamanlayıcı ve duraklatma doğru
    çalışıyor.
  - Reaction denemeleri gerçek varış zamanlarıyla kontrol ediliyor.
  - Memory'de doğru cevaplar REVEAL öncesi hiçbir payload'da yok; puanlar.
- **E2E (host + 3 telefon, Chromium + WebKit):**
  - "Refleks ve Hafıza" oynanır.
  - Reaction'da telefonlar hedef görününce (en az 150 ms bekleyip) basar; biri bir denemede
    erken basar ve cezayı görür; TV'de sonuç sıralaması çıkar.
  - Memory'de tahta TV'de görünür, sonra kaybolur; telefonlar soruları cevaplar; REVEAL'de
    doğrular gösterilir.
  - WebSocket çerçevelerinde GO zamanı ve Memory'nin doğru cevapları REVEAL öncesi yok.

### Onay bekleyen kararlar

- **E1:** gameType'lar `reaction` ve `memory`; paketler `@loudroom/game-reaction` ve
  `@loudroom/game-memory`.
- **E2:** Faz efektine `hidden: true` (motor saati tutar, istemcilere `endsAt` gitmez).
- **E3:** Reaction ölçümü telefonda; `shown` + `tap` mesajlarıyla varış aralığı
  karşılaştırması (±300 ms), 100 ms alt sınırı, 1,5 sn üst sınır.
- **E4:** Deneme sayısı 3, medyan; erken basma ve kaçırma `maxReactionMs` cezası.
- **E5:** Reaction'da `classic` ve `goNoGo` (tuzaklı) türleri.
- **E6:** Reaction puanı sıraya göre (1000 / −150 / en az 300); `correct` = medyan < 450 ms.
- **E7:** TV'de deneme sonuçları canlı; sözleşme testine `secretHolders: ['host']`.
- **E8:** Memory içeriği emoji ya da görselli nesne seti; tahta ve sorular sunucuda seed ile.
- **E9:** Üç soru türü (vardı / yoktu / kaç tane), 4 seçenek, herkes aynı soruları alır.
- **E10:** Memory puanı doğru cevap başına 400; hız yok; `correct` = hepsi doğru.
- **E11:** Tahta TV'de yalnızca SHOW ve REVEAL'de; telefonlara hiç gitmez.
- **E12:** Seed: 2 Reaction + 4 Memory seti, "Refleks ve Hafıza" paketi.

**Eklenecek paket:** Yok. Emojiler cihazın kendi yazı tipiyle çiziliyor, ek varlık gerekmiyor.

### Riskler

- **Cihaz farkları:** Ekran yenileme hızı (60/120 Hz, ±16 ms) ve dokunmatik gecikmesi
  telefonlar arasında farklı; ağ üzerinden tam adalet mümkün değil (SPEC §7.7). Ölçüm ağ
  gecikmesinden bağımsız ama cihazdan bağımsız değil.
- **Hile:** Süreyi telefon bildiriyor. Kontroller kaba hileyi (çok kısa süre, uydurma zaman)
  yakalar; ustaca sahte `shown` zamanlamasını yakalayamaz.
- **Arka plana geçen telefon:** Ekran kapanırsa ya da sekme arka plandaysa `shown` gecikir ve
  deneme geçersiz sayılır. Wake lock zaten var.
- **Emoji görünümü:** Cihazdan cihaza değişir (TV'deki ile telefondaki farklı görünebilir).
  Her öğede etiket de gösterilir.
- **E2E zamanlaması:** Playwright çok hızlı basarsa 100 ms sınırına takılır; testler bilerek
  bekleyerek basar.

---

## Phase 7 — Drawing (stream kanalı)

Plan 2026-10-02'de onaylandı (D1–D12: "öneriler tamam") ve aynı gün Mac'te uygulandı.

### Yapılanlar

- **Stream sözleşmesi (game-sdk):**
  - `GameModule.stream` (isteğe bağlı): `schema`, `accepts(state, playerId, ctx)`,
    `cost(chunk)`, `limits`. `GameModule`'e yedinci tip parametresi (`StreamChunk`, varsayılan
    `never`).
  - Renderer'lara `stream` prop'u: `subscribe(listener)` (önce o ana kadar gelen her şey
    `reset` olarak, sonra yeni paketler) ve `send(chunk)`. `StreamUpdate.full` round
    limitinin dolduğunu söylüyor.
  - Sözleşme testine `secretHolders`: gizli içeriği bilmesi gereken oyuncular (çizen)
    `secretVariants` karşılaştırmasından çıkarılıyor; host ve diğer herkes hâlâ kontrol
    ediliyor.
- **Shared:** `ClientStream.RoundStream` (`round:stream`, ack'siz) ve
  `roundStreamRequestSchema`; server olayı `round:stream`
  (`{ roundId, reset, chunks, full }`, en fazla 5.000 paket).
- **Server:**
  - `GameGateway`'de ack'siz `round:stream` işleyicisi, yalnızca oyuncu oturumları. Kendi
    hız kovası `stream` (soket başına 60, saniyede +30).
  - `GameStreamService`: odayı kilitsiz okur. Oda PLAYING değilse (duraklatma dahil), round
    id eskiyse, şema ya da `accepts` uymazsa paketi düşürür. Uygunsa geçmişe yazar ve yalnızca
    host kanalına iletir. Limit dolunca gönderen sokete bir kez `full: true` gider.
  - `StreamStore`: `room:{code}:stream` listesi (her kayıt round id'siyle) ve
    `room:{code}:stream:cost` toplamı. Limit kontrolü ve ekleme tek Lua betiğinde (atomik).
    Odanın TTL'ini taşır. Yeni round başlarken ve oyun bitince siliniyor; sonuç ekranında
    host yenilenirse çizim geri gelsin diye round bitince değil.
  - Yeniden bağlanma (`resume`): host'a ve `accepts` true olan oyuncuya (çizen) o round'un
    geçmişi `reset: true` ile gönderiliyor.
- **Web:**
  - `StreamHub`: React state'i dışında tutulan round paketleri. Yalnızca o round'a abone olan
    renderer'lar çağrılıyor. Geç açılan renderer o ana kadar gelen her şeyi `reset` olarak
    alıyor.
  - Gönderen telefonun kendi paketleri de hub'a yazılıyor. Duraklatmada telefondaki round
    ekranı kaldırılıp geri geldiğinde çizenin tuvali kaybolmuyor.
  - `sendStream` (ack'siz emit; bağlantı koparken Socket.IO tamponluyor).
- **Drawing** (`drawing`, `@loudroom/game-drawing`):
  - İçerik `{ word, alternatives? }`.
  - Çizen sırası: round başında bağlı oyuncular, katılma sırasıyla, `roundIndex mod n`.
    2'den az bağlı oyuncu varsa `SKIPPED`.
  - Fazlar INTRO (çizen kelimeyi görür) → DRAWING (80 sn) → REVEAL. Tahmin edenlerin hepsi
    bilince erken REVEAL.
  - Tahmin: katlanmış hali eşitse doğru; 6+ harfte 1 harf hata da doğru. 3–5 harfte 1,
    6+ harfte 2 harf uzaksa yalnızca tahmin edene "çok yakın". Yanlışlar TV akışında (son 30),
    yakın ve doğru tahminler hiçbir zaman akışta değil. Küfürlü tahmin `TEXT_REJECTED`; bilen
    oyuncu tekrar tahmin edemez; çizen tahmin edemez.
  - Puan: 1000, sıra başına −150, en az 300; çizen bilen başına +250 (hepsi ayar, çarpanla).
    `correct`: bildi; yanlış tahmin edip bilemeyen false; hiç tahmin etmeyen ve çizen null.
  - "Atla" çizimi bitirip kelimeyi gösteriyor, o ana kadarki puanlar kalıyor (`onSkip`).
  - Stream: yalnızca çizen ve yalnızca DRAWING'de. Paket = en fazla 16 işlem
    (`line`: en fazla 64 nokta, `undo`, `clear`), 8 renk (beyaz = silgi), 3 kalınlık, 0..1000
    koordinat, 4:3 tuval. Round limiti 3.000 paket / 30.000 maliyet (nokta + işlem başına 1).
  - Tuval: `DrawingModel` (çizgiler, geri al, temizle) ve `CanvasController` (React dışında
    boyama, 50 ms'lik gönderim kuyruğu, 2 birimden yakın noktaları atma). Yeni noktalar
    artımlı, yeniden çizimde çizgiler ikinci derece eğrilerle yumuşatılıyor. Piksel sayısı
    ekran boyu × devicePixelRatio.
  - TV: tuval, çizen, süre, harf kutuları, bilenler, yanlış tahmin akışı, "Çizimi gizle"
    (yalnızca o ekranda bulanıklaştırma). Telefon: çizen için tuval ve araçlar; tahmin eden
    için kutu, kendi tahminleri ve "çok yakın" etiketi.
  - Admin: kelime ve alternatifler editörü; ayar formu (puanlar, harf kutuları).
- **Seed:** 41 Türkçe kelime (hayvan, yiyecek, eşya, meslek, spor, doğa; zorluk dereceli,
  bazılarında alternatif yazılış) ve yayında "Çiz Bil" paketi (rastgele 6 kelime, en az 2
  oyuncu).
- **turbo.json:** `"concurrency": "30"`. Bu paketle dev modundaki kalıcı izleme görevleri
  10'a çıktı ve turbo'nun varsayılan sınırı (10) Docker'daki server'ı başlatmaz hale getirdi.

### Testler

- **Unit (drawing):**
  - Tahmin eşleştirme: İ/ı, boşluk, alternatif, 1 harf toleransı, "çok yakın" sınırları,
    kısa kelimeler.
  - Tuval modeli: devam eden çizgi, geri al, temizle.
  - Çizen rotasyonu, `SKIPPED`, kelimenin yalnızca çizende olması, akış ve ipucu ayrımı,
    retler, erken REVEAL, puan sırası ve alt sınır, çarpan, `onSkip`, `accepts`.
  - Sözleşme testi `secretHolders` ile.
  - Tahmin edenlere kelimenin ilk harfini sızdıran geçici bir modül gizlilik kontrolüne
    takıldı (deneme silindi).
- **Integration** (`test/drawing.test.ts`, gerçek Redis/Socket.IO):
  - Çizen olmayanın, bozuk ve eski round'un paketleri düşüyor.
  - Canlı paket yalnızca host'a gidiyor, oyuncular almıyor; Redis'te birikiyor.
  - Yeniden bağlanan host'a ve çizene geçmiş `reset` ile geliyor, tahmin edene gelmiyor.
  - Duraklatmada paket alınmıyor.
  - Kelime REVEAL'den önce host'a ve tahmin edenlere hiç gitmiyor.
  - Puanlar 500 / 1000 / 850; sonraki round'da çizen değişiyor ve geçmiş boş.
  - Limit: 40 büyük paketten 28'i saklanıyor, çizene tek `full`. Hız kovası 200 paketlik
    bir seli 55–120 arasına indiriyor.
  - Seed testi: kelimeler ve paket.
- **E2E** (`e2e/drawing.spec.ts`, Chromium + WebKit):
  - Çizen telefonda fareyle iki çizgi çizer, TV'de `data-strokes` 2 olur. Geri al TV'den de
    siler.
  - TV yenilenir (oyun duraklar, devam ettirilir), çizim geri gelir. "Çizimi gizle" açılıp
    kapatılır.
  - Yanlış tahmin TV akışında görünür; "çok yakın" yalnızca tahmin edenin telefonunda kalır,
    TV'ye düşmez.
  - REVEAL'den önce kelime host'un ve tahmin edenlerin WebSocket çerçevelerinde yok.
  - İkisi de bilince round erken biter; çizen 500 puan alır.
  - İkinci çizimde sıra Mehmet'te ve tuval boş; "Atla" kelimeyi gösterir.

### Bitti tanımı — son çalıştırma (2026-10-02, Mac)

Stack `docker compose up -d --build --wait` ile kuruldu; seed "Çiz Bil"i ekledi.

| Kontrol             | Sonuç                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`    | ✅ 20/20 görev                                                                                                                                                      |
| `pnpm lint`         | ✅ 20/20 görev                                                                                                                                                      |
| `pnpm test`         | ✅ 393 test: shared 45, game-sdk 33, quiz 44, closest-number 60, sorting 24, who-would 18, image-location 20, bluff 19, drawing 25, server 105 (13 koşullu atlandı) |
| `pnpm build`        | ✅ 11/11 görev                                                                                                                                                      |
| `pnpm test:e2e`     | ✅ 28/28 (Chromium + WebKit; Phase 1–6 dahil)                                                                                                                       |
| `pnpm format:check` | ✅                                                                                                                                                                  |

Yol boyunca:

- **Gizle butonu:** E2E, "Çizim gizlendi" yazısının tuvalin tamamını kaplayıp "Çizimi göster"
  butonunu tıklanamaz yaptığını yakaladı; host çizimi geri açamıyordu. Yazı tıklamaları
  geçiriyor.
- **Docker'daki dev server:** turbo'nun eşzamanlılık sınırı nedeniyle başlamadı (yukarıda).
- **Tek seferlik WebKit hatası:** Drawing e2e'si WebKit'teki ilk koşusunda bir kez 9,6 sn'de
  kırmızı oldu; ayrıntısı bir sonraki koşuda üzerine yazıldığı için kayboldu. Sonra WebKit'te
  13, Chromium'da 6 tekrarın hepsi ve tam koşu yeşil. Nedeni bulunamadı; tekrarlarsa trace ile
  incelenmeli.

### Alınan kararlar (kullanıcı onaylı)

- **D1:** `drawing` / `@loudroom/game-drawing`.
- **D2:** Stream modülde isteğe bağlı tanım; taşıma, doğrulama, geçmiş motorda.
- **D3:** `round:stream` ack'siz, kendi hız kovası; canlı yalnızca host'a, geçmiş `reset` ile.
- **D4:** 4:3, 0..1000, line/undo/clear, 8 renk, 3 kalınlık, 3.000 / 30.000 limit.
- **D5:** Redis'te geçmiş, Postgres'e yazılmıyor.
- **D6:** Çizen sırası katılma sırasıyla dönüşümlü.
- **D7:** İçerik `{ word, alternatives? }`, harf kutuları varsayılan açık.
- **D8:** Eşleştirme eşikleri, gizli "çok yakın", TV'de yanlış tahmin akışı.
- **D9:** 1000 / −150 / en az 300, çizene bilen başına +250.
- **D10:** Erken REVEAL, "Atla" puanları korur, "Çizimi gizle" yalnızca TV'de.
- **D11:** Telefon araçları; çizim yalnızca TV'de.
- **D12:** Seed kelimeleri ve "Çiz Bil".

### Varsayımlar ve küçük kararlar

- **Geçmiş ne zaman silinir:** Planda "round başlarken ve biterken" yazıyordu. Sonuç
  ekranında host sayfası yenilenirse çizimin geri gelmesi için round bitince değil, sonraki
  round başlarken ve oyun bitince siliniyor.
- **Limit maliyeti:** nokta sayısı + işlem başına 1 (boş `undo`/`clear` selleri de sayılsın).
- **"Çok yakın" için en az 3 harf:** 2 harfli kelimelerde ("ev") ipucu verilmiyor.
- **Tahmin uzunluğu:** kelime sınırı + 10 karakter (40'a kadar).
- **`room:{code}:stream:cost`** anahtarı SPEC §11'e eklendi.
- **Hub'a kendi paketlerini yazmak:** Duraklatmadan dönen çizen telefonun tuvali hub'dan
  yeniden kuruluyor; server geçmişi yalnızca yeniden bağlanmada geliyor.
- **Çizenin `correct` değeri null:** Motorun kuralı gereği çizenin serisi o round'da
  sıfırlanıyor.

### Eklenen paketler

Yok. Çizim Canvas 2D API'siyle, yumuşatma kendi kodumuzla.

### Bilinen sınırlar

- **Çizen koparsa:** Round süre bitene ya da host "Atla" diyene kadar sürüyor (motor
  modüllere bağlantı değişimini bildirmiyor). Çizen dönünce tuvali geçmişten geliyor.
- **Gerçek iPhone'da parmakla çizim** elle denenmedi. `touch-action: none` ve pointer events
  kullanılıyor; e2e WebKit'te fareyle çiziyor.
- **Kilitsiz okuma:** Round değişirken gelen bir paket yeni round'un maliyet toplamına bir kez
  sayılabilir; geçmişe round id'siyle yazıldığı için gösterilmez.
- **Çizim denetimi yok:** Uygunsuz çizim için yalnızca TV'de gizleme var.
- **Canlı çizimde yumuşatma yok:** Canlı gelen parçalar düz segmentler; tuval yeniden
  çizildiğinde (boyut değişimi, geri al, yenileme) yumuşatılıyor.

---

## Phase 6 — Image Location + Bluff

Plan 2026-10-02'de onaylandı (C1–C12: "öneriler tamam") ve aynı gün Mac'te uygulandı.

### Yapılanlar

- **Motor ve game-sdk:**
  - `RoundContext.media`: Pack loader, oyun başlarken içeriğin referans verdiği görsellerin
    boyutlarını `Media` tablosundan okuyup round kaydına yazıyor (`PlannedRound.media`).
  - `RoundContext.moderation`: Server, nickname'lerdeki küfür filtresini veriyor (TR/EN
    listeler + `PROFANITY_EXTRA_WORDS_FILE`). Görünüm projeksiyonlarına çağrıldığında hata
    fırlatan bir moderasyon veriliyor; görünümler metin kontrol etmemeli.
  - Yeni ret kodları `TOO_CLOSE` ve `TEXT_REJECTED` (sdk, shared ack kodları, çeviriler).
  - Metin yardımcıları: `cleanText`, `foldText` (Türkçe I/ı–İ/i, aksan ve noktalama atma),
    `editDistance` (komşu harf takası 1 sayılır), `isNearMatch` (4+ harfte 1, 9+ harfte 2
    hata; uzun olanın harf sayısına göre).
  - `containedRect`, `toImagePoint`, `fromImagePoint` ve `ContainedImage` bileşeni:
    `object-contain` çizilen görselin gerçek alanı ve tam onun üstünde bir katman. TV,
    telefon ve admin editörü aynı hesabı kullanıyor; ölçeklenen host sahnesinde de doğru.
  - İsteğe bağlı `GameModule.onSkip`: Host round sırasında "Atla" derse modül karar verebilir.
    Yoksa ya da `null` dönerse round eskisi gibi puansız düşer.
  - Sözleşme testi: `secretScripts` öğeleri içerik de taşıyabiliyor (`{ content, script }`);
    yeni `revealPhase` alanı, gizliliğin round sonuna değil bir fazın başına kadar
    sürdüğünü söylüyor (Bluff'ın zamanlı açılışı). Harness `media` ve `blockedWords` alıyor.
- **Image Location** (`imageLocation`, `@loudroom/game-image-location`):
  - İçerik `{ question, mediaId, target: { x, y }, radius? }`. Fazlar INTRO → ANSWERING →
    REVEAL. Görüntülerde görselin boyutu da var; bilinmiyorsa kare varsayılıyor.
  - Mesafe piksel üzerinden hesaplanıp uzun kenara bölünüyor (en-boy düzeltmeli).
  - Puan: tam puan yarıçapında (varsayılan %3 ya da içerikteki `radius`) taban puan. Sonra
    smoothstep ile azalıyor, %30'da 0. `correct`: yarıçap içinde.
  - Telefon: dokun → iğne, tekrar dokun → taşı, "Gönder" → kesin. Görsel ekran genişliğinde,
    en fazla ekranın %60'ı yüksekliğinde.
  - REVEAL: host'ta görsel üzerinde avatarlı iğneler, hedef noktası, tam puan halkası ve
    uzaklık sıralaması (uzun kenarın yüzdesi). Telefonda kendi iğnesi, hedef ve sıra.
  - Admin editörü: görsel seçilir, önizlemede tıklanarak hedef konur, halka yarıçapı gösterir.
- **Bluff** (`bluff`, `@loudroom/game-bluff`):
  - İçerik `{ question, answer, acceptedAnswers?, decoys }`. Yem cevaplar doğru cevaba ya da
    birbirine benzeyemez (şema kontrolü).
  - Fazlar INTRO → WRITE → VOTE → REVEAL → (saat bitince) round sonu.
  - Yazma: Blöf temizlenir, en fazla 40 karakter. Doğru cevaba ya da kabul edilen bir yazılışa
    çok yakınsa `TOO_CLOSE`, küfürlüyse `TEXT_REJECTED`; oyuncu yeniden yazar. Blöf kesin.
  - Oylama: Seçenekler doğru cevap + blöfler (aynı katlanmış yazılışlar birleşir) + gerekirse
    yem cevaplar (en az 4 seçenek). Bir yem cevapla aynı blöf o yem cevabın yerini alır.
    Seçenekler metne göre dizilip seed ile karıştırılıyor, id'ler sıradan geliyor, hepsi
    Türkçe büyük harf. Kimse kendi blöfüne oy veremez; oy kesin.
  - Puan: doğru cevap +1000, blöfünü seçen her oyuncu için yazar(lar)ına +500 (ayar).
  - REVEAL: Seçilen blöfler en az seçilenden başlayarak, sonra doğru cevap. Her adım ~3 sn
    (çok adımda kısalıyor, toplam ~25 sn). Adım ve adım içi ilerleme (önce metin, sonra
    kananlar, sonra yazar) REVEAL fazının saatinden hesaplanıyor. Saat bitince round
    puanlanıyor; telefonlar o ana kadar "Ekrana bak!" gösteriyor.
  - Açılış sırasında "Atla": açılışı bitirip puanlıyor (`onSkip`).
  - En az 2 oyuncu.
- **Seed** (`src/seed/map-pack.ts`):
  - `scripts/build-seed-maps.ts` Natural Earth GeoJSON'ından (10m ülkeler + göller ve 50m
    ülkeler) etiketsiz Türkiye ve dünya haritası SVG'si üretiyor. SVG'ler repoda (~310 KB +
    ~240 KB).
  - Seed, SVG'leri `sharp` ile 2000 px genişliğinde WebP'ye çevirip `MEDIA_DIR`'e ve `Media`
    tablosuna yazıyor (sabit id'ler).
  - 10 Image Location sorusu: 7 Türkiye (Ankara, İstanbul, İzmir, Trabzon, Göreme, Van Gölü,
    Ağrı Dağı), 3 dünya (Tokyo, Kahire, Rio de Janeiro). Hedefler enlem/boylamdan haritanın
    projeksiyonuyla hesaplanıyor (`maps/projection.ts`).
  - 10 Bluff sorusu (kabul edilen yazılışlar ve yem cevaplarla).
  - Yayında "Harita ve Blöf" paketi: her oyundan rastgele 3 soru, en az 2 oyuncu.
- **Web:** registry'lere iki satır, çeviriler, Docker volume'ları.

### Testler

- **Unit:**
  - game-sdk: metin katlama (İ/ı, aksan), düzenleme mesafesi, yakınlık eşiği, letterbox
    dönüşümleri.
  - Image Location: mesafe, puan eğrisi, içerik yarıçapı, sıralama, bilinmeyen boyut.
  - Bluff: `TOO_CLOSE`/`TEXT_REJECTED`/uzunluk, birleştirme, yem cevap doldurma ve yer
    değiştirme, kendi blöfüne oy, puanlar (birleşik yazarlar), açılış adımları ve süresi,
    `onSkip`.
  - Sözleşme testi: Image Location gizli hedef + gizli iğneler. Bluff yazar takası ve doğru
    cevap ↔ blöf takası. Doğru cevabı ilk sıraya koyan geçici bir sızdırıcı modül bu kontrole
    takıldı (deneme silindi).
- **Integration** (`test/location-bluff.test.ts`):
  - Görsel boyutu `Media`'dan görünüme ulaşıyor. Hedef REVEAL'den önce hiçbir socket'e
    gitmiyor.
  - Server'ın kendi listesiyle küfür reddi; `TOO_CLOSE` ("ÜÇ!", "3"), kendi blöfüne oy.
    Açılıştan önce `truth`/`authors`/`voters` hiçbir payload'da yok.
  - Puanlar açılış saati bitince geliyor. İkinci soruda açılış atlanınca puanlar korunuyor.
  - Seed testi: haritalar geçici bir klasöre çiziliyor, içerik şemaları, paket.
- **E2E** (`e2e/map-bluff.spec.ts`, Chromium + WebKit):
  - "Harita ve Blöf" host + 3 telefonla.
  - Image Location: telefonda dokun, taşı, gönder; TV'de 3 iğne ve hedef.
  - Bluff: her telefon önce doğru cevabı yazıp "çok yakın" uyarısı alıyor, sonra blöf
    yazıyor; kendi blöfü kapalı; aşamalı açılış doğru cevapla bitiyor, sonra telefonlarda
    sonuç.
  - REVEAL öncesi çerçevelerde `"target"`, `"truth"`, `"authors"` yok.
  - Admin senaryosuna Image Location (görsel yükle, tıklayarak hedef koy) ve Bluff (cevaba
    benzeyen yem cevabın reddi) eklendi.

### Bitti tanımı — son çalıştırma (2026-10-02, Mac)

Stack `docker compose up -d --build --wait` ile yeni imajla kuruldu; seed haritaları ve
"Harita ve Blöf"ü ekledi.

| Kontrol             | Sonuç                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`    | ✅ 18/18 görev                                                                                                                                          |
| `pnpm lint`         | ✅ 18/18 görev                                                                                                                                          |
| `pnpm test`         | ✅ 365 test: shared 45, game-sdk 33, quiz 44, closest-number 60, sorting 24, who-would 18, image-location 20, bluff 19, server 102 (11 koşullu atlandı) |
| `pnpm build`        | ✅ 10/10 görev                                                                                                                                          |
| `pnpm test:e2e`     | ✅ 26/26 (Chromium + WebKit; Phase 1–5 dahil)                                                                                                           |
| `pnpm format:check` | ✅                                                                                                                                                      |

Yol boyunca: Ekran görüntülerinde Bluff açılışı sırasında host'ta "Atla" butonunun
durduğu ve motorun bunu "round'u puansız düşür" olarak uyguladığı görüldü. `onSkip`
bunun için eklendi (planda yoktu; C12'nin "Atla ile geçilebilir" sözünü tutmak için).

### Alınan kararlar (kullanıcı onaylı)

- **C1:** `imageLocation` / `@loudroom/game-image-location`, `bluff` / `@loudroom/game-bluff`.
- **C2:** Görsel boyutları pack loader'dan `ctx.media` ile.
- **C3:** Image Location puanı: %3 (ya da `radius`) tam puan, smoothstep, %30'da 0.
- **C4:** Dokun–taşı–gönder; yakınlaştırma yok.
- **C5:** Bluff içeriği `acceptedAnswers` + `decoys`, en az 4 seçenek, büyük harf.
- **C6:** `TOO_CLOSE` eşiği, birleştirme, kendi blöfüne oy yok, erken geçişler.
- **C7:** 1000 / 500 puan, en az 2 oyuncu.
- **C8:** `ctx.moderation`, `TOO_CLOSE`, `TEXT_REJECTED`.
- **C9:** Metin eşleştirme game-sdk'de.
- **C10:** İçerikli `secretScripts`.
- **C11:** Natural Earth haritaları, "Harita ve Blöf" paketi; "Parti Karışık" değişmedi.
- **C12:** Faz saatiyle adım adım açılış; puanlar animasyondan sonra.

### Varsayımlar ve küçük kararlar

- **`onSkip`** sözleşmeye isteğe bağlı eklendi (yukarıda). Diğer oyunlarda "Atla" eskisi gibi.
- **Yakınlık eşiği** iki metnin uzun olanının harf sayısına göre (kısa olana göre
  "kaplumbağa" ile "kaplmbaa" eşleşmiyordu).
- **Benzerlik boşluksuz karşılaştırılıyor:** "New York" = "newyork".
- **Bluff seçenek birleştirmesi** katlanmış metnin tam eşitliğiyle (yakınlıkla değil):
  "Sekiz" ve "sekiz!" birleşir, "Sekiz" ve "Sekis" ayrı kalır.
- **Açılış süresi:** adım = 24 sn / adım sayısı (1,5–3 sn arası), sonuna 1,5 sn bekleme.
- **Görsel boyutu bilinmiyorsa** (eski kayıt, silinmiş satır) Image Location kare varsayar.
- **Harita projeksiyonu** eşdikdörtgen (Türkiye'de boylamlar cos 39° ile kısaltılmış).
  Hedefler aynı fonksiyonla hesaplandığı için görselle birebir uyumlu.
- **Dünya sorularında** tam puan yarıçapı %2 (uzun kenar ~40.000 km → ~800 km).
- **Bluff'ta blöf yazmayan oyuncu da oy verebilir;** blöf yazıp oy vermeyen de
  kandırdıkları için puan alır.

### Eklenen paketler

Yok. Harita betiği bağımlılıksız (Node `fetch`); `sharp` server'da zaten vardı.

### Bilinen sınırlar

- **Yakınlaştırma yok:** Küçük telefonlarda ince hedefler zor; seed soruları buna göre seçildi.
- **Duraklatmada Bluff açılışı:** Host ekranındaki animasyon, duraklatma örtüsünün altında
  ilerlemeye devam ediyor; devam edilince saat geri kayıp aynı adımdan sürüyor.
- **Bluff sayı ↔ kelime eşleşmesi otomatik değil:** "7" ve "yedi" için içerikte
  `acceptedAnswers` gerekiyor.
- **Küfür filtresi yanlış pozitif verebilir:** Oyuncu yeniden yazabiliyor.
- **Seed haritaları sabit:** Değiştirmek için betik elle çalıştırılıp SVG'ler commit'lenmeli.

---

## Phase 5 — Closest Number + Sorting + Kim Yapar?

Plan 2026-10-02'de onaylandı (B1–B9: "öneriler tamam") ve aynı gün Mac'te uygulandı.

### Yapılanlar

- **Sözleşme testi (game-sdk/testing):**
  - `secretScripts`: Aynı oyuncular aynı anlarda farklı seçim yapar. Round bitene kadar host
    görünümü ve girdisi değişmeyen oyuncuların görünümleri birebir aynı kalmalı.
  - `anonymousScripts`: Oy dağılımı aynı, oyların sahipleri farklı. Round bittikten sonra da
    host'un ve girdisi değişmeyen oyuncuların gördükleri ve puanları aynı kalmalı.
  - Senaryoların zamanlaması (kim, ne zaman) referansla aynı olmak zorunda; test bunu da
    kontrol ediyor.
  - `secretVariants` artık isteğe bağlı. Her oyun `secretVariants` ya da `secretScripts`'ten
    en az birini vermeli. Quiz'e `secretScripts` eklendi.
  - Kontrollerin gerçekten sızıntı yakaladığı, oyuncunun oyunu soru metnine sızdıran geçici
    bir modülle denendi: iki kontrol de kırmızı oldu (deneme dosyası silindi).
- **game-sdk/client:**
  - `formatNumber`: Türkçe sayı biçimi (1.234.567,5); yıllar ayırıcısız.
  - Ayar formu parçaları: `SettingNumber`, `SettingChoice`, `SettingToggle`, `SettingsGrid`.
  - Renderer'lara `Avatar` prop'u (`AvatarProps`). Web kendi avatar setiyle dolduruyor;
    bilinmeyen avatar kimliği daireye düşüyor.
  - `GameRenderer.settings` (isteğe bağlı): `settingsSchema`, `defaultSettings`, `Editor`.
- **Bölüme özel oyun ayarları:**
  - `PackRoundInput.settings`: oyunun varsayılanlarından farklı olan üst düzey ayarlar
    (gönderilmezse `{}`).
  - Server her kayıtta (taslak dahil) varsayılanlarla birleştirip modülün `settingsSchema`'sı
    ile doğruluyor. Hata: `400 VALIDATION_ERROR`, yolu `rounds.<i>.settings.<alan>`.
  - Paket editöründe her bölümde kapalı gelen bir "Oyun ayarları" bölümü var; oyunun kendi
    formu açılıyor, yalnızca değişen anahtarlar kaydediliyor. Oyun türü değişince ayarlar
    sıfırlanıyor.
  - Pack loader zaten varsayılan ← paket ← bölüm sırasıyla birleştiriyordu; değişmedi.
  - Quiz'e de ayar formu eklendi: taban puan, seri bonusu adımı, cevap değiştirme.
- **Closest Number** (`closestNumber`, `@loudroom/game-closest-number`):
  - İçerik `{ question, answer, unit?, displayFormat: 'number' | 'year' }`; yıl tam sayı.
    Cevap ve tahminler ±10¹² aralığında.
  - Fazlar INTRO → ANSWERING → REVEAL. Tahmin gönderilince kesinleşiyor. Herkes tahmin
    edince süre beklenmiyor.
  - Puan (varsayılan, `relative`): `pay = 1 − ln(1 + hata/ölçek) / ln(1 + M)`, en az 0.
    Sayılarda ölçek cevabın büyüklüğü (cevap 0 ise 1), M = `maxRelativeError` (varsayılan 1
    = %100). Yıllarda ölçek 1 yıl, M = `maxYearError` (varsayılan 100 yıl). Örnek: %10 hata
    → 862, %50 → 415, 10 yıl hata → 480 puan.
  - Puan (`rank`): en yakın tam puan, sonrakiler (n − sıra)/n. Eşit uzaklıkta önce
    cevaplayan önde, sonra katılma sırası.
  - `correct`: en yakın tahmin(ler). Eşit uzaklıktaki tahminler aynı puanı alır, ikisi de
    "en yakın" sayılır.
  - Telefon: `inputMode="decimal"` (yılda `numeric`), yazarken binlik ayırıcı, birim etiketi.
  - REVEAL: sayı doğrusu. Doğru, cevabı ve hâlâ puan alan tahminleri kapsıyor; daha uzak
    tahminler kenarda okla. Üst üste binen avatarlar yukarı diziliyor. Altında ilk 8 tahminin
    sıralaması.
- **Sorting** (`sorting`, `@loudroom/game-sorting`):
  - İçerik `{ question, items: [{ id, text, mediaId? }], labels?: { first, last } }`; öğeler
    3–8 tane ve doğru sırada.
  - Başlangıç sırası: öğeler id'ye göre dizilip round seed'iyle karıştırılıyor; doğru sıradan
    bağımsız (sözleşme testi doğruluyor). Host ve bütün telefonlar aynı sırayla başlıyor.
  - Puan: varsayılan doğru yerdeki öğe oranı; ayar olarak Kendall (doğru sıralı çift oranı =
    (tau + 1) / 2). Hız bonusu yok. `correct`: sıranın tamamı doğru.
  - Gönderilen sıra kilitli; ayar açıksa süre bitene kadar değiştirilebilir (o durumda erken
    REVEAL yok).
  - Telefon: `@dnd-kit` ile sürükle-bırak. Sürükleme yalnızca tutamaçtan başlıyor: farede
    4 px hareketle, dokunmatikte 120 ms basılı tutunca. Böylece sayfa kaydırması çakışmıyor.
    Her satırda yukarı/aşağı butonları, klavye ile sürükleme de var.
  - REVEAL: doğru sıra, her öğe için doğru yere koyanların yüzdesi ve tam doğru yapan sayısı.
    Telefonda her öğe için ✓/✗.
- **Kim Yapar?** (`whoWould`, `@loudroom/game-who-would`):
  - İçerik `{ question, title? }`. Fazlar INTRO → VOTING → REVEAL.
  - Seçenekler round başında bağlı olan oyuncular. Round sırasında kopan oyuncu seçenek
    olarak kalıyor. Oyun en az 3 bağlı oyuncuyla başlıyor (`minPlayers: 3`, motorun mevcut
    kontrolü). Round başında 3'ten az bağlı oyuncu varsa round `SKIPPED` fazıyla puansız
    bitiyor ve ekranda "en az 3 bağlı oyuncu gerekiyor" yazıyor.
  - Oy kesin; kendine oy varsayılan açık (ayar). Herkes oy verince erken REVEAL.
  - Puan: en çok oy alanı (eşitlikte birini) seçenler `baseScore` (1000) alır; en çok oy
    alan(lar) ayrıca `winnerPoints` (varsayılan 0) alır. `correct`: en çok oy alanlardan
    birini seçti. Hiç oy yoksa kimse puan almaz.
  - Anonimlik: host ve diğer telefonlar yalnızca oy sayılarını, kazananları ve unvanı görür.
    Her telefon yalnızca kendi oyunu görür. Oylar yalnızca server'daki round durumunda.
- **Ortak web değişiklikleri:**
  - Registry'lere üç satır; admin'deki "Yeni içerik" butonları registry'den kendiliğinden
    çıktı.
  - Renderer'lar round id'siyle key'leniyor: yarım kalmış bir sıralama ya da yazılmış bir
    sayı sonraki round'a taşınmıyor.
  - `GET /api/packs` artık `minPlayers` döndürüyor; lobby'de paketin yanında "en az 3
    oyuncu" yazıyor.
  - Bütün metinler `games.<id>` (editör `.editor`, ayarlar `.settings`) ve
    `admin.gameTypes` altında.
- **Seed** (`src/seed/party-pack.ts`, sabit id'lerle idempotent): 8 Closest Number sorusu
  (2'si yıl), 6 Sorting sorusu, 10 Kim Yapar? ifadesi (unvanlı). Yayında "Parti Karışık"
  paketi: quiz, Closest Number, Sorting, Kim Yapar? sırasıyla, her biri yayındaki içerikten
  rastgele 2 soru (8 round). Her oyunun sonunda skor tablosu.
- **Docker:** Üç paket için `node_modules` volume'u ve dev imajında bağlama noktaları.
  Çekince bir kez `docker compose up -d --build` gerekli.

### Testler

- **Unit:**
  - Closest Number: formül (0 ve negatif cevap, ölçek, log eğrisi), sıralama modu, yıllar,
    eşitlik, Türkçe yazım/ayrıştırma, sayı doğrusu yerleşimi.
  - Sorting: konum ve Kendall payları, doğrudan bağımsız başlangıç sırası, kilit/değiştirme,
    geçersiz sıralar.
  - Kim Yapar?: kendine oy ayarı, eşitlik, kazanan puanı, hiç oy olmaması, 3'ün altında
    `SKIPPED`, round sırasında kopan aday.
  - Hepsi sözleşme testinden geçiyor (Kim Yapar? anonimlik kontrolü dahil).
- **Integration** (`test/party.test.ts`, motor ve gerçek Redis/Postgres üzerinden):
  - Karışık paket: Closest Number → Sorting → Quiz. Geçersiz girdiler `INVALID_INPUT`, ikinci
    tahmin `ALREADY_ANSWERED`. REVEAL'den önce hiçbir socket'e doğru cevap ya da
    `correctOrder` gitmiyor. Ayşe'nin serisi oyunlar arasında taşınıyor: üçüncü doğrusunda
    (taban puanı 0 yapılmış quiz bölümünde) yalnızca +100 seri bonusu alıyor.
  - Kim Yapar?: 2 oyuncuyla başlatma `NOT_ENOUGH_PLAYERS`. Kendine oy (kapalıyken) ve
    bilinmeyen aday reddediliyor. Puanlar 1000/100/1000/0. Host olaylarında `votedFor` hiç
    yok; her telefon yalnızca kendi oyunu görüyor. İki oyuncu kopunca sonraki soru `SKIPPED`.
  - Admin API: yeni oyunların içerik doğrulaması, bölüm ayarlarının doğrulanması ve
    saklanması, `/api/packs`'te `minPlayers`. Seed: iki kez çalıştırma, içerik şemaları,
    paket bölümleri.
- **E2E:**
  - `e2e/party.spec.ts`: host + 3 telefonla "Parti Karışık" paketinin 8 round'u. Closest
    Number'da yazarken biçimlenme ve kilit ekranı. Sorting'de Chromium'da tutamaçla
    sürükle-bırak, WebKit'te ok butonları. Kim Yapar?'ta 3 oyla kazanan, unvan ve herkesin
    "doğru" sonucu. Her oyunun ilk round'unda REVEAL'den önce WebSocket çerçevelerinde
    `"answer":` ve `correctOrder` yok; TV hiçbir zaman `votedFor` almıyor.
  - `e2e/admin.spec.ts` yeni senaryo: üç oyun için editörler (eksik cevap uyarısı, Türkçe
    biçim, sunucudan dönen değerler) ve bir bölümün oyun ayarını değiştirip kaydetme.

### Bitti tanımı — son çalıştırma (2026-10-02, Mac)

Node 24.21.0, pnpm 12.8.1, Docker 29.8.1, Playwright 1.63. Stack
`docker compose up -d --build --wait` ile yeni imajla kuruldu (seed "Parti Karışık"ı ekledi).

| Kontrol             | Sonuç                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`    | ✅ 14/14 görev                                                                                                                 |
| `pnpm lint`         | ✅ 14/14 görev                                                                                                                 |
| `pnpm test`         | ✅ 303 test: shared 45, game-sdk 12, quiz 44, closest-number 60, sorting 24, who-would 18, server 100 (8 koşullu test atlandı) |
| `pnpm build`        | ✅ 8/8 görev                                                                                                                   |
| `pnpm test:e2e`     | ✅ 24/24 (Chromium + WebKit; Phase 1–4 dahil)                                                                                  |
| `pnpm format:check` | ✅                                                                                                                             |

Atlanan 8 test, sözleşme testinin bir fixture'da verilmeyen kontrolleri (ör. anonimlik
kontrolü yalnızca Kim Yapar?'ta var).

Yol boyunca karşılaşılanlar:

- İlk tam `pnpm test` koşusunda `room-recovery` testi (server yeniden başlatma) bir kez 5 sn
  zaman aşımına düştü. Tek başına 3/3, tam koşuyla 2/2 yeşil. Yük altında (artık 7 paketin
  testleri paralel) iki Nest uygulamasını art arda başlatan test yavaşlayabiliyor; kod
  değişikliği yapılmadı.
- İlk tam e2e koşusunda yeni admin testi REST hız sınırına takıldı (bkz. bilinen sınırlar);
  test sayfa yeniden yüklemeleri olmadan yeniden yazıldı.
- Sorting e2e'si sürüklemeden hemen sonra "Gönder"e basınca tıklama kayboluyordu: dnd-kit
  sürükleme bittikten sonraki 50 ms'deki tıklamaları yutuyor. Test 100 ms bekliyor.

### Alınan kararlar (kullanıcı onaylı)

- **B1:** gameType'lar `closestNumber`, `sorting`, `whoWould`; paketler
  `@loudroom/game-closest-number`, `@loudroom/game-sorting`, `@loudroom/game-who-would`.
- **B2:** Closest Number varsayılan puanı log ölçekli göreli hata; sıralama modu ayar; hız
  yalnızca eşitliği bozar.
- **B3:** Sorting 3–8 öğe; varsayılan konum oranı, Kendall ayar; hız bonusu yok; gönderilince
  kilitli (ayarla değiştirilebilir).
- **B4:** Kim Yapar? kuralları (yukarıda).
- **B5:** `correct`: Closest Number'da en yakın, Sorting'de tam doğru sıra, Kim Yapar?'ta en
  çok oy alanlardan birini seçmek.
- **B6:** Bölüme özel oyun ayarları paket editöründe.
- **B7:** Sözleşme testine gizli girdi ve anonimlik kontrolleri.
- **B8:** Avatar bileşeni renderer'lara prop olarak.
- **B9:** Seed'e örnek içerik ve karışık paket.

### Varsayımlar ve küçük kararlar

- **"Log ölçekli göreli hata"** formülü `1 − ln(1 + hata/ölçek) / ln(1 + M)` olarak
  yorumlandı: tam isabette 1, M'de 0. Cevap 0 ya da negatif olduğunda da tanımlı. Yıllarda
  göreli hata anlamsız olduğu için (1990 ile 2000 %0,5 fark) ölçek 1 yıl ve ayrı bir
  `maxYearError` (100 yıl) kullanıldı.
- **Closest Number'da cevap değiştirme yok** (planda ayar yoktu); tahmin kesin.
- **Sorting başlangıç sırası** doğru sırayla aynı çıkabilir (n öğede 1/n! olasılık). Bunu
  önlemek doğru sırayı bilmeyi gerektirir ve sızıntı testinin yakalayacağı bir bağımlılık
  yaratır; bilerek bırakıldı.
- **Kim Yapar?:** Odadan ayrılan oyuncunun oyu sayılmıyor (Quiz'in dağılımıyla aynı kural).
  En çok oy alan oyuncu oy vermemiş olsa da `winnerPoints` alıyor (`correct` null).
- **`SKIPPED` round'unda** herkesin `correct` değeri null; motorun kuralı gereği seriler
  sıfırlanıyor (cevapsız quiz sorusu gibi).
- **Ayarlar fark olarak saklanıyor:** Varsayılanlar sonradan değişirse, bölümde
  değiştirilmemiş ayarlar yeni varsayılanı alır. `settings` gönderilmezse `{}`; Phase 4
  istemcileri bozulmadı.
- **Ayarlar taslakta da doğrulanıyor:** Biçimsel bir hata; içerik eksikliği gibi yalnızca
  yayınlarken kontrol edilmiyor.
- **Paket editöründe süre ayarı** bölümün kendi "Soru süresi" alanında kaldı; ayar
  formlarında giriş süresi (`introMs`) gösterilmiyor.
- **"Parti Karışık"** sabit liste yerine rastgele çekiliş kullanıyor: her oyunda farklı
  sorular gelsin diye. Bu yüzden dev veritabanındaki başka yayında quiz içerikleri de
  (ör. admin e2e'nin oluşturdukları) çıkabilir.
- **Seed'deki bilgiler** yaygın kabul gören değerler: Everest 8.849 m, Türkiye 783.562 km²,
  Kızılırmak 1.355 km, ışık 299.792 km/sn; il nüfus sıralaması TÜİK 2023.

### Eklenen paketler

| Paket                    | Nerede            | Gerekçe                                                             |
| ------------------------ | ----------------- | ------------------------------------------------------------------- |
| @dnd-kit/core 6.3.1      | game-sorting      | SPEC §2, §7.3: dokunmatik sürükle-bırak (sensörler, klavye erişimi) |
| @dnd-kit/sortable 10.0.0 | game-sorting      | Sıralanabilir liste (dikey strateji, `arrayMove`)                   |
| @dnd-kit/utilities 3.2.2 | game-sorting      | Sürükleme dönüşümünü CSS'e çevirmek için                            |
| react-dom 19.3.0         | game-sorting, dev | dnd-kit'in peer bağımlılığı; tip kontrolü için (web zaten kuruyor)  |

`@dnd-kit/core`'un son sürümü 2024 sonundan; kararlı ve yaygın kullanılıyor. Yeni yazılan
`@dnd-kit/react` henüz 0.x olduğu için seçilmedi.

### Bilinen sınırlar

- **E2E ve hız sınırı:** Dev stack'te bütün tarayıcılar server'a web container'ının
  adresinden geliyor; e2e paketi tek bir REST kovasını (120, saniyede +4) paylaşıyor. Dev
  modunda React StrictMode istekleri ikilediği için sayfa yüklemesi çok olan testler kovayı
  boşaltabilir. Gerekirse kovalar CLAUDE.md'deki komutla sıfırlanabilir.
- **Gerçek cihazda sürükle-bırak** Playwright'ın WebKit'iyle (butonlarla) ve Chromium'la
  (fareyle) doğrulandı; iPhone'da parmakla sürükleme elle denenmedi.
- **Sorting'de 7–8 öğe** telefonda "Gönder" butonuna kaydırmayı gerektirebiliyor.
- **Sayı doğrusu** 20 oyuncuda kalabalıklaşabiliyor; üst üste binenler yukarı diziliyor ama
  sıra sayısı sınırsız.

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
- **Giriş formu kilidi (Mac doğrulamasında bulundu):** WebKit, React hydration sırasında
  server'da render edilmiş kontrollü input'lara önceden yazılan metni siliyor. `/admin/login`
  açılır açılmaz yazan biri (ya da e2e testi) boş e-postayla kalıyordu; tarayıcının `required`
  kontrolü gönderimi engellediği için hata mesajı da çıkmıyordu. Form alanları bir
  `<fieldset disabled>` içinde; oturum durumu `loading` iken (yani hydration ve `/auth/me`
  bitene kadar) kilitli. Playwright `fill` alanın açılmasını kendisi beklediği için testler
  değişmedi.
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

### Bitti tanımı — Mac doğrulaması (2026-10-02)

Bulut ortamında yapılamayan iki adım Mac'te (Node 24.21.0, pnpm 12.8.1, Docker 29.8.1,
Playwright 1.63: Chromium 153, WebKit 26.6) temiz bir klonla çalıştırıldı.

| Kontrol                                                         | Sonuç                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `docker compose down -v && docker compose up -d --build --wait` | ✅ Sıfır volume; migration, seed, server ve web `healthy`    |
| `pnpm test:e2e` (ilk çalıştırma)                                | ❌ 19/20: WebKit'te `roles` testi (5 denemede 4 kez kırmızı) |
| `pnpm typecheck`                                                | ✅ 8/8 görev                                                 |
| `pnpm lint`                                                     | ✅ 8/8 görev                                                 |
| `pnpm test`                                                     | ✅ 186 test: shared 44, game-sdk 6, game-quiz 41, server 95  |
| `pnpm build`                                                    | ✅ 5/5 görev                                                 |
| `pnpm test:e2e` (düzeltmeden sonra)                             | ✅ 20/20 (Chromium + WebKit; Phase 1–3 dahil)                |
| `pnpm format:check`                                             | ✅                                                           |

Kırmızı testin nedeni ve düzeltmesi "Yapılanlar → Giriş formu kilidi" altında.

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

- **Bulut ortamında doğrulanamayanlar** (WebKit e2e ve sıfırdan `docker compose up`)
  2026-10-02'de Mac'te doğrulandı.
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
