# Party Game Platformu — Teknik Şartname (v2)

> Bu dosya projenin **tek doğru kaynağıdır**. Repo içinde `docs/SPEC.md` olarak durur.
> Claude Code her oturumda önce bu dosyayı ve `PROGRESS.md`'yi okur.

---

## 0. Claude Code çalışma kuralları

1. **Önce plan:** Bir faza başlamadan önce o fazın planını çıkar (dosya listesi, kararlar, riskler) ve onayımı bekle.
2. **Tek seferde tek faz.** Faz bitince dur, özet ver, onay almadan sonraki faza geçme.
3. **Bitti tanımı (her faz):** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` ve ilgili e2e testleri yeşil olmadan "tamamlandı" deme. Komutları gerçekten çalıştır, çıktısını özetle.
4. **Mock yok, TODO yok** — ama sırası gelmemiş özellikler için boş klasör, stub veya yer tutucu dosya da oluşturma. Sadece o fazın kapsamını yaz, eksiksiz yaz.
5. **Çalışanı bozma:** Önceki fazların testleri her fazda tekrar çalışır ve geçer.
6. **Kayıt tut:** Her faz sonunda `PROGRESS.md`'yi güncelle (yapılanlar, alınan kararlar, varsayımlar, bilinen sınırlar). Anlamlı adımlarda conventional commit at.
7. **CLAUDE.md:** Phase 1'de repo kökünde `CLAUDE.md` oluştur: komutlar, klasör yapısı, kod kuralları, bu dosyaya referans. Değiştikçe güncelle.
8. **Belirsizlik:** Küçük kararlarda makul varsayım yap ve `PROGRESS.md`'ye yaz. Mimariyi etkileyen veya geri alması zor kararlarda sor.
9. **Bağımlılıklar:** Kararlı, bakımı süren paketleri seç; eklediğin her paketi gerekçesiyle `PROGRESS.md`'ye yaz.

---

## 1. Ürün

Sony PlayLink / Jackbox / Kahoot benzeri, özgün, web tabanlı gerçek zamanlı parti oyunu platformu.

- **Host:** Bilgisayar/tablet; ekran TV veya projektöre verilir.
- **Oyuncular:** Uygulama kurmadan telefon tarayıcısından katılır.
- Host oda açınca **6 haneli oda kodu + QR + katılım linki** üretilir (`https://domain/play/583921`).
- Oyuncu nickname ve avatar seçer, lobby'de host ekranına anında düşer.
- Host başlatınca host ekranı ve tüm telefonlar WebSocket ile senkron çalışır.
- Bir oyun oturumu birden fazla mini oyundan (round) oluşur.

---

## 2. Teknoloji ve repo yapısı

- **Monorepo:** pnpm workspaces + Turborepo, Node 24 LTS, TypeScript `strict`.
- **Frontend:** Next.js (App Router), React, Tailwind CSS, Framer Motion, `@dnd-kit` (sürükle-bırak), `qrcode`.
- **Backend:** NestJS, Socket.IO, REST, `zod` ile doğrulama.
- **DB:** PostgreSQL 16 + Prisma (JSONB uygun yerlerde).
- **Realtime/cache:** Redis 7 (oyun durumu, Socket.IO Redis adapter, rate limit).
- **Test:** Vitest (unit/integration), Playwright (e2e, çoklu tarayıcı context'i).
- **Deploy:** Docker + Docker Compose, prod'da Nginx.

```
apps/
  web/            # Next.js — /host, /play, /admin route grupları ayrı layout'larla
  server/         # NestJS — REST + Socket.IO gateway + GameEngine
packages/
  shared/         # zod şemaları, socket event sözleşmeleri, ortak tipler, sabitler
  game-sdk/       # GameModule arayüzü, yardımcılar, modül sözleşme testleri
  games/
    quiz/         # her oyun kendi paketi: schema.ts, server.ts, host.tsx, player.tsx
    ...           # (diğer oyunlar sırası gelince eklenir)
docs/SPEC.md
PROGRESS.md
CLAUDE.md
```

Route'lar:
```
/host  /host/create  /host/room/[roomCode]
/play  /play/[roomCode]
/admin /admin/login /admin/content /admin/content/categories /admin/game-packs /admin/media
/admin/users /admin/account /admin/sessions /admin/settings
```

Socket event ve payload tipleri **yalnızca** `packages/shared` içinde tanımlanır; hem web hem server buradan import eder.

---

## 3. Temel mimari prensipler

- **Server-authoritative:** Skor, oyun durumu, zamanlayıcı ve faz geçişleri yalnızca server'da. Client sadece "niyet" (komut) gönderir.
- **Görünüm projeksiyonu:** Tam oyun durumu hiçbir client'a gitmez. Her modül `getHostView` ve `getPlayerView(playerId)` üretir. Doğru cevap REVEAL fazından önce hiçbir payload'da bulunmaz (bunu test et).
- **Zaman:** Server her faz için `endsAt` (epoch ms) yayınlar; saniyelik timer broadcast'i yok. Client'lar `time:sync` ile saat farkını ölçer ve geri sayımı lokal çizer. Süre bitişini server kendi zamanlayıcısıyla uygular; geç gelen input reddedilir.
- **Durum kalıcılığı:** Oda ve oyun durumu her geçişte Redis'e serileştirilir; server yeniden başlarsa aktif odalar kaldığı yerden devam edebilir.
- **Ölçekleme:** MVP tek backend instance. Socket.IO Redis adapter kurulu olur; ileride çoklu instance için oda sahipliği (room → node) Redis kilidiyle yönetilecek şekilde tasarla, şimdi implemente etme.
- **Doğrulama:** Her socket event'i ve REST isteği zod ile doğrulanır. Komutlar ack callback ile `{ ok: true, data } | { ok: false, code, message }` döner.
- **İdempotency:** Input'lar `roundId` taşır; aynı oyuncunun aynı round'a tekrar cevabı modül kuralına göre reddedilir veya güncellenir.

---

## 4. Oda ve bağlantı sistemi

**Oda kodu:** `crypto` ile rastgele 6 hane, aktif odalar arasında çakışmasız, TTL'li (hareketsizlikte 4 saat, FINISHED sonrası 30 dk).

**Oda durumları:** `LOBBY → STARTING → PLAYING → ROUND_RESULT → SCOREBOARD → … → FINISHED`, ayrıca `PAUSED`.
`PLAYING` içinde modülün alt fazları olur (ör. `INTRO`, `ANSWERING`, `LOCKED`, `REVEAL`).

**Oyuncu alanları:** `id, roomCode, nickname, avatar, color, score, connected, ready, joinedAt, lastSeenAt, sessionTokenHash`.

**Reconnect:**
- Katılımda oyuncuya `playerToken` verilir, `localStorage`'da tutulur. Socket id'ye güvenilmez.
- Bağlantı koparsa slot 90 sn korunur; dönüşte `room:state` + `game:state` snapshot'ı gönderilir.
- Host da `hostToken` ile döner. Host koparsa oyun otomatik `PAUSED` olur.

**Host kontrolleri:** oyuncu atma, odayı kilitleme, duraklat/devam, round atla, oyunu bitir.

**Kurallar:** max oyuncu (varsayılan 12, ayarlanabilir), oda içinde nickname benzersiz, geç katılım ayarlanabilir (kapalı / 0 puanla katıl).

**Telefon:** Screen Wake Lock API (ekran kapanıp bağlantı kopmasın), `navigator.vibrate` ile dokunsal geri bildirim, "yeniden bağlanıyor" bandı.

---

## 5. Game Engine ve modül sözleşmesi

Core engine yalnızca bu sözleşmeyi bilir. Modüller **saf ve senkron** fonksiyonlardan oluşur; IO, zamanlayıcı, kalıcılık ve yayını engine yapar. Böylece modüller kolay test edilir ve yeni oyun eklemek core'a dokunmayı gerektirmez.

```ts
interface GameModule<Content, Settings, State, Input, HostView, PlayerView> {
  id: string;                     // 'quiz'
  name: string;
  version: number;
  contentSchema: ZodType<Content>;
  settingsSchema: ZodType<Settings>;
  defaultSettings: Settings;
  inputSchema: ZodType<Input>;
  hostViewSchema: ZodType<HostView>;      // istemciye giden şeklin tamamı; sızıntı testleri de kullanır
  playerViewSchema: ZodType<PlayerView>;
  capabilities: { minPlayers: number; maxPlayers: number; usesStream?: boolean };

  createRound(ctx: RoundContext<Content, Settings>): Transition<State>;
  onInput(state: State, input: Input, meta: InputMeta, ctx: RoundContext<Content, Settings>): Transition<State>;
  onTimer(state: State, ctx: RoundContext<Content, Settings>): Transition<State>;
  score(state: State, ctx: RoundContext<Content, Settings>): ScoreResult[];
  // ScoreResult: { playerId, points, correct, responseTimeMs, answer, breakdown }
  onSkip?(state: State, ctx: RoundContext<Content, Settings>): Transition<State> | null;
  // host "atla" dediğinde; yoksa ya da null dönerse round puansız düşer
  stream?: { schema: ZodType<Chunk>; accepts(state, playerId, ctx): boolean;
             cost(chunk): number; limits: { maxChunks: number; maxCost: number } };
  // round:stream kullanan oyunlar (Drawing); paketler modül durumuna girmez

  getHostView(state: State, ctx: RoundContext<Content, Settings>): HostView;
  getPlayerView(state: State, playerId: string, ctx: RoundContext<Content, Settings>): PlayerView;
}

type Transition<S> = { state: S; effects?: Effect[] };
// Effect: { type: 'phase', phase, durationMs | null, hidden? } | { type: 'endRound' }
//   hidden: saat sunucuda kalır, istemciler fazı süresi ve bitişi olmadan görür (Reaction)
//       | { type: 'reject', playerId, code: 'ROUND_CLOSED' | 'ALREADY_ANSWERED' | 'INVALID_INPUT'
//                                          | 'TOO_CLOSE' | 'TEXT_REJECTED' }
```

- `RoundContext`: round id/sırası, içerik, ayarlar, puan çarpanı, oyuncular (bağlı olup olmadıkları dahil), engine'in round'lar arası tuttuğu oyuncu istatistikleri (skor, seri, toplam cevap süresi), aktif faz saati (`endsAt` duraklatmada kaydırılır), `now`, round'a özel seed'li rastgelelik (testte deterministik), içeriğin referans verdiği görsellerin boyutları (`media`, oyun başlarken `Media`'dan okunur) ve oyuncu metinleri için küfür kontrolü (`moderation`).
- Bir round'un sabit süresi olmak zorunda değildir; zamanlamayı modül faz efektleriyle yönetir (sıra tabanlı oyunlar dahil).
- **Stream kanalı:** Çizim gibi yüksek frekanslı veriler için `round:stream` — kalıcılığa yazılmaz, throttle edilir, yine server üzerinden geçer ve doğrulanır. Modül paketin şemasını, kimin hangi fazda gönderebileceğini (`accepts`) ve round limitini verir; taşıma, doğrulama ve geçmiş motordadır. Canlı paketler yalnızca host'a gider; yeniden bağlanan host'a ve gönderebilen oyuncuya (çizen) round'un geçmişi `reset` ile gönderilir.
- **Client tarafı:** Her oyun paketi `HostRenderer` ve `PlayerRenderer` bileşenlerini (faza göre) export eder. Web'de bir registry `gameType → renderer` eşler. Player UI oyun tipine ve faza göre dinamik render edilir.
- **Kayıt:** Yeni oyun = yeni paket + server ve web registry'lerine birer satır.
- **Sözleşme testi:** `game-sdk` içinde her modülün geçmesi gereken ortak test paketi (projeksiyonda cevap sızmıyor, geçersiz input reddediliyor, skor deterministik vb.).

---

## 6. İçerik modeli

Oyun tipleri çok farklı içerik yapısına sahip olduğundan tek bir sabit `Question` modeli yerine **genel içerik modeli** kullanılır:

- `ContentItem { id, gameType, data (JSONB), categoryId, difficulty, tags[], locale, status (DRAFT|PUBLISHED), mediaIds[], defaultTimeLimit, baseScore, createdBy, timestamps }`
- `data`, ilgili modülün `contentSchema`'sı ile hem kayıt hem okuma sırasında doğrulanır.
  - Quiz: `{ question, options: [{ id, text, mediaId? }], correctOptionId, media?: { type: 'image', mediaId } }` (2–6 seçenek)
  - Yüklenen dosyaya referans veren her alan `mediaId` adını taşır; server varlığını kontrol eder ve kullanımdaki dosyanın silinmesini engeller.
  - Closest Number: `{ question, answer, unit?, displayFormat: 'number' | 'year' }` (yıl tam sayıdır)
  - Sorting: `{ question, items: [{ id, text, mediaId? }] (3–8, doğru sırada), labels?: { first, last } }`
  - Kim Yapar?: `{ question, title? }` (seçenekler round başında bağlı oyunculardan üretilir)
  - Image Location: `{ question, mediaId, target: { x, y } (0..1), radius? }` (yarıçap uzun kenarın oranı)
  - Bluff: `{ question, answer, acceptedAnswers?: string[] (≤5), decoys: string[] (2–6) }`
  - Drawing: `{ word, alternatives?: string[] (≤5) }`
  - Reaction: `{ title, variant: 'classic' | 'goNoGo' }`
  - Memory: `{ title, items: [{ id, label, emoji?, mediaId? }] (8–24) }` (her öğede emoji ya da görsel)
  - Diğer oyunlar kendi şemalarıyla.
- **GamePack:** `id, name, description, status (DRAFT|PUBLISHED), settings, rounds[]` — host yalnızca yayındaki paketleri görür; yayınlarken her bölümün oynanabilir olduğu kontrol edilir.
- **GamePackRound:** `order, gameType, contentSelection (sabit id listesi VEYA kategori/zorluk/adet ile rastgele), questionCount, timeLimit, scoreMultiplier, showScoreboardAfter, settings`
  - `settings`: bölümün, oyunun varsayılan ayarlarından farklı olan ayarları (üst düzey anahtarlar). Varsayılanlarla birleştirilip modülün `settingsSchema`'sı ile doğrulanır; paket editöründe oyunun kendi ayar formuyla düzenlenir.
- Oyun başlarken pack'in o anki hali `GameSession.packSnapshot`'a kopyalanır (sonradan düzenleme geçmiş oyunları bozmaz).

---

## 7. Oyun modları

Genel: tüm skor formülleri modül ayarlarından yapılandırılabilir; eşitliklerde deterministik kural (önce cevaplayan önde).

### 7.1 Quiz (MVP)
- 2–6 seçenek, süre limiti, görselli soru; video için `media.type` alanı hazır ama oynatıcı sonraki faz.
- Cevap gönderilince kilitlenir (ayar: değiştirilebilir).
- Herkes cevaplayınca süre beklenmeden erken bitiş.
- Skor: `points = round(baseScore * (0.5 + 0.5 * remaining/total)) * multiplier`, yanlış = 0; seri bonusu (ör. 3+ doğru serisinde +100/adım, üst sınırlı).
- REVEAL: doğru cevap animasyonu + cevap dağılım grafiği; telefonda "doğru/yanlış + kazanılan puan".
- Renk körü dostu: seçenekler renk + şekil ile ayrışır.

### 7.2 Closest Number
- Telefonda sayısal klavye, TR binlik ayırıcı gösterimi.
- Skor: büyük sayılarda adil olması için göreli hata (log ölçek) veya sıralama bazlı; ayarlanabilir.
- REVEAL: sayı doğrusu üzerinde tüm tahminler ve doğru cevap.

### 7.3 Sorting
- `@dnd-kit` ile dokunmatik sürükle-bırak; dokunmatik olmayan yedek (yukarı/aşağı butonları).
- Skor: doğru konumdaki öğe oranı (ayar: Kendall tau ile kısmi puan).

### 7.4 Image Location
- Koordinatlar görselin **doğal boyutuna göre** 0..1 normalize edilir; `object-contain` boşlukları ve en-boy oranı hesaba katılır.
- Mesafe en-boy düzeltmeli hesaplanır, yumuşak azalan puan eğrisi.
- REVEAL: host'ta tüm oyuncu noktaları ve doğru nokta.
- Haritalar/görseller lisansı uygun (kendi üretimimiz veya public domain) olmalı.

### 7.5 Drawing
- Sırayla çizen oyuncu; gizli kelime yalnızca ona gider.
- Çizgi noktaları normalize, ~50 ms'lik paketlerle `round:stream` üzerinden; host canlı çizer, geç bağlanan host için stroke geçmişi tutulur.
- Tahmin eşleştirme: TR küçük harf dönüşümü (i/İ, ı/I), aksan normalizasyonu, uzun kelimelerde 1 harf toleransı; "çok yakın" ipucu.
- Puan: ilk doğru tahmin en yüksek, sonrakiler azalan; tahmin edildikçe çizen de puan alır.
- Host çizimi atlayabilir/gizleyebilir.

### 7.6 Bluff
- Fazlar: `WRITE → VOTE → REVEAL`.
- Oyuncunun sahte cevabı gerçek cevaba (normalize + bulanık eşleşme) çok yakınsa reddedilir, yeniden yazması istenir.
- Aynı sahte cevaplar birleştirilir; oyuncu kendi cevabına oy veremez.
- Puan: gerçek cevabı seçmek +1000; senin sahte cevabını seçen her oyuncu için +500.
- Metinler küfür filtresinden geçer.

### 7.7 Reaction
- Tam adalet ağ üzerinden mümkün değil; hedef **telefonda** gösterilir (TV gecikmesi değişken olduğundan host ekranı bu mod için referans alınmaz).
- Tepki süresi client'ta `performance.now()` ile hedefin ekrana çizildiği kareden dokunmaya kadar ölçülür; server makullük kontrolü yapar (ör. <100 ms reddedilir, ölçülen RTT ile tutarlılık, maksimum süre).
- Erken basma cezası; birden çok deneme, medyan alınır.

### 7.8 Memory
- Host ekranında N saniye nesne/kart gösterimi, ardından telefonda sorular: hangisi yoktu, hangisi vardı, kaç tane vardı.
- Sorular içerik setinden server'da üretilir.

### 7.9 Kim Yapar?
- Soru bir ifadedir ("Kim en çok geç kalır?"); seçenekler odadaki oyunculardır. İçerik yalnızca soru metnini tutar, seçenekleri server round başında aktif oyunculardan üretir.
- Oyuncu kendine oy verebilir (ayar, varsayılan açık).
- Puan: en çok oy alan kişiyi (eşitlikte en çok oy alanlardan birini) seçenler puan alır; ayarlanabilir.
- Oylar anonimdir; REVEAL'de yalnızca oy dağılımı avatarlarla gösterilir, en çok oy alana o soruya özel bir "unvan" verilir.
- En az 3 oyuncu.

### 7.10 Tombala
- Her oyuncuya server'ın ürettiği bir kart düşer (3 satır × 9 sütun, satır başına 5 sayı, 1–90); kart telefonda.
- Host ekranında torbadan çekilen sayı ve çekilmiş sayılar tablosu; çekiliş aralığı ayarlanabilir, host elle de çekebilir.
- Oyuncu sayıyı telefonda işaretler; server doğrular (çekilmemiş sayı işaretlenemez). Otomatik işaretleme ayarı.
- Ödüller: 1. çinko, 2. çinko, tombala. Oyuncu "Çinko!" / "Tombala!" bastığında server kartı doğrular; hatalı iddia cezası ayarlanabilir.
- Herkes aynı anda oynar; oyuncu sınırı oda sınırıdır.

### 7.11 Casus Kim?
- Herkese aynı mekân gösterilir; casus (büyük gruplarda iki casus, ayar) mekânı görmez.
- Sorular sözlü sorulur; telefonda sıranın kimde olduğu ve kalan süre gösterilir.
- Süre bitince ya da çoğunluk isteyince oylama yapılır. Casus, yakalanmadan önce mekânı tahmin ederek de kazanabilir.
- Puan: casus yakalanırsa diğer oyuncular, kaçarsa ya da mekânı bilirse casus kazanır.
- En az 4 oyuncu. Mekân listesi içerik olarak yönetilir.

### Kart ve masa oyunları — ortak kurallar (7.12–7.16)
- Bir maç tek uzun round olarak çalışır; sıra zamanlayıcıları modülün faz efektleriyle kurulur; kazanan belli olunca round biter, skor ve podyum ekranları aynen kullanılır.
- **Koltuk sistemi:** Oyunun koltuk sayısından fazla oyuncu varsa fazlası izleyici olur ya da takım kurulur (oyuna göre).
- **Sıra zaman aşımı:** Süresi dolan oyuncu için otomatik hamle veya sıra atlama (ayar); kopan oyuncunun yerine bot geçebilir.
- Gizli bilgi (el, ıstaka, gemi yerleşimi) yalnızca sahibinin telefonuna gider; masa/tahta TV'de. Her hamle server'da doğrulanır.
- **İsimler ve görseller:** Oyun adları ürün sahibinin kararıyla aynen kullanılır. "UNO" ve "Kızma Birader" tescilli markalardır (yayına almadan önce hukuki değerlendirme gerekir). Kart, taş ve tahta tasarımları tamamen özgün olmalıdır; orijinal ürünlerin görselleri kullanılmaz.

### 7.12 Okey
- 4 koltuk, klasik okey: 106 taş, gösterge ve okey taşı.
- Istaka telefonda, taşlar sürükle-bırak ile dizilir (`@dnd-kit`); orta deste ve atılan taşlar TV'de.
- Bitiş (per/seri ve çift) server'da doğrulanır; puanlama ayarlanabilir.

### 7.13 Pişti
- 2–4 oyuncu (4 kişide eşli oyun seçeneği), 52 kart; el telefonda, yerdeki kartlar TV'de.
- Pişti ve kart puanları klasik kurallarla; oyun belirlenen puana ya da el sayısına göre biter.

### 7.14 UNO
- 2–10 oyuncu; renk ve sayı eşleştirme, özel kartlar (atla, yön değiştir, +2, renk seç, +4).
- Son kart kalınca telefondan "UNO!" denir; unutan oyuncu yakalanırsa ceza kartı çeker.
- El telefonda, deste ve yer TV'de.

### 7.15 Kızma Birader
- 2–4 koltuk (6 kişilik varyant ayarı); zar ve piyon seçimi telefonda, tahta TV'de.
- Klasik kurallar: 6 ile çıkış, 6 gelince tekrar atış, rakip piyonu yeme; bitiriş sırasına göre sıralama.

### 7.16 Amiral Battı
- Temelde 2 kişilik: gemiler telefonda gizlice yerleştirilir, atışlar telefondan yapılır; TV iki tarafın atış haritasını gemileri göstermeden gösterir.
- Parti için iki mod: iki takım (takım üyeleri sırayla atış yapar) veya eşleşmeli düello turnuvası.

---

## 8. Realtime event sözleşmesi

Adlandırma: `alan:eylem`. Client → server **komutlar** (ack'li), server → client **olaylar**.

Client → server:
```
room:create  room:join  room:leave  room:kick  room:lock
player:ready  player:update
game:start  game:pause  game:resume  game:skip  game:end
game:next  game:restart
round:input  round:stream
time:sync
```
Server → client:
```
room:state  player:joined  player:left  player:reconnected
game:state  round:start  round:phase  round:result  round:stream
score:update  game:end  error
```
- `round:stream` (istemci → server) **ack'siz** tek istisnadır: yüksek frekanslı paketler cevap beklemez, kendi hız kovası vardır, server reddettiğini sessizce düşürür. Server → istemci `round:stream`: `{ roundId, reset, chunks, full }`.
- `game:next`: host sonuç / skor tablosu ekranından ilerler. `game:restart`: oyun bittikten sonra aynı oyuncularla lobby'ye döner.
- Oyun durumu kaynağı `game:state`'tir (izleyiciye özel); `round:*`, `score:update`, `game:end` efektler (ses, titreşim) için bildirimdir.
- Hepsinin payload şeması `packages/shared` içinde zod ile tanımlı.
- Client hiçbir zaman skor veya state değeri göndermez.

---

## 9. Güvenlik ve gizlilik

- Doğru cevap REVEAL öncesi hiçbir payload'da yok — unit ve e2e testle doğrulanır.
- Skor yalnızca backend'de hesaplanır.
- **Rate limit (Redis):** socket event'leri oyuncu başına token bucket; oda katılım denemesi IP başına (ör. 10/dk); REST throttler; admin login ayrı ve sıkı limit.
- **Oda kodu brute-force:** deneme limiti, yalnızca aktif odalar geçerli, kısa TTL, "oda bulunamadı" ile "limit aşıldı" dışında bilgi sızdırmayan hata.
- **Input:** nickname 2–16 karakter, Unicode NFC normalize, kontrol karakterleri ve zero-width karakterler temizlenir; TR/EN küfür listesi (yapılandırılabilir). React escaping; `dangerouslySetInnerHTML` yasak.
- **Admin auth:** argon2 hash, httpOnly + secure cookie oturum, CSRF koruması, roller `ADMIN` / `EDITOR`.
- **Upload:** MIME sniff, boyut limiti, görseller `sharp` ile yeniden kodlanır ve EXIF silinir.
- helmet, CORS kısıtı, secret'lar yalnızca env'de.
- **KVKK:** Oyuncular hesapsız; yalnızca nickname/avatar tutulur, IP loglanmaz veya kısa saklama süresiyle tutulur; oturum geçmişi için saklama süresi ayarı.

---

## 10. Veritabanı (Prisma)

Aktif oda ve canlı oyun durumu **Redis'te** yaşar (geçicidir). PostgreSQL'e kalıcı olanlar yazılır:

- `User` (admin/editor)
- `Category`
- `ContentItem` (JSONB `data`)
- `Media` (dosya yolu, tip, boyut, genişlik/yükseklik, alt metin)
- `GamePack`, `GamePackRound`
- `GameSession` (roomCode, hostu, packSnapshot JSONB, başlangıç/bitiş, durum)
- `SessionPlayer` (oturumdaki oyuncu: nickname, avatar, final skor, sıra)
- `SessionRound` (oynanan round, içerik referansı)
- `PlayerAnswer` (input JSONB, doğru mu, cevap süresi)
- `ScoreEvent` (puan, gerekçe/breakdown JSONB)

İndeksler ve ilişkiler düşünülerek tasarlanır; migration'lar repo'da, seed script'i MVP için örnek içerik üretir.

---

## 11. Redis anahtar düzeni

```
room:{code}               # oda meta + durum (TTL'li)
room:{code}:players       # oyuncular
room:{code}:game          # serileştirilmiş engine/modül durumu
room:{code}:stream        # çizim stroke geçmişi (sonraki round başlarken ve oyun bitince silinir)
room:{code}:stream:cost   # o round'un stream limitine sayılan toplam
token:player:{hash}       # token → oyuncu/oda
token:host:{hash}
admin:session:{hash}      # admin oturumu (çerezdeki token'ın SHA-256'sı → kullanıcı, CSRF token'ı)
admin:user-sessions:{id}  # kullanıcının oturumları (şifre/rol değişince hepsi kapanır)
rl:{scope}:{key}          # rate limit
```

---

## 12. UI / UX

**Genel stil:** modern, enerjik, premium game-show hissi; çocuk uygulaması gibi değil. Koyu tema, yüksek kontrast, tasarım token'ları (renk, tipografi, spacing) tek yerde.

**Host (TV/projektör):**
- 1920×1080 hedef; 16:9 sahne, ekrana ölçeklenen (scale-to-fit) layout; farklı çözünürlüklerde oran korunur.
- Büyük tipografi (1080p'de gövde metni ≥ 32 px), projektör taşmasına karşı güvenli kenar boşluğu.
- Lobby: oyun adı, dev oda kodu, QR, katılım linki, avatarlı oyuncu listesi, hazır durumu.
- Ses efektleri + müzik (aç/kapa), tam ekran butonu.
- Animasyonlu leaderboard (sıra değişince yukarı/aşağı kayma, Framer Motion `layout`), finalde podyum animasyonu.

**Player (telefon):**
- Mobile-first, portrait, başparmak bölgesinde ≥ 56 px dokunma alanları, minimum metin.
- Gamepad hissi: büyük renkli butonlar, basışta anlık görsel + titreşim geri bildirimi.
- Double-tap zoom ve pull-to-refresh engelli, klavye açılınca layout kaymaz.
- Etkileşim tipleri: seçenek, metin, sayı, sürükle-bırak, çizim, görsel üzerinde nokta seçme.

**Avatarlar:** Kendi tasarımımız SVG seti (telifli karakter yok) + oyuncu rengi.
**Dil:** Varsayılan Türkçe; metinler i18n altyapısında (ör. `next-intl`), İngilizce eklemeye hazır.

---

## 13. Docker ve ortamlar

- `compose.yml` (ortak) + `compose.dev.yml` + `compose.prod.yml`.
- **Dev:** hot reload, postgres, redis; Nginx yok. Telefonla test için servisler `0.0.0.0`'a bağlanır, `PUBLIC_URL` LAN IP'sine ayarlanabilir, QR bu adresi kullanır.
- **Prod:** multi-stage build, non-root kullanıcı, healthcheck'ler, açılışta `prisma migrate deploy`, Nginx (WebSocket upgrade, gzip, statik cache, TLS için hazır yapı).
- Medya: MVP'de Docker volume; `StorageService` arayüzü ile ileride S3/MinIO'ya geçilebilir.
- `.env.example` tüm değişkenleri açıklamalarıyla içerir.

---

## 14. Test ve kalite

- ESLint + Prettier, TypeScript strict, `pnpm` script'leri Turborepo ile.
- **Unit (Vitest):** oyun modülleri, skor formülleri, projeksiyonlar, normalizasyon fonksiyonları.
- **Integration:** gerçek Redis ile test server'a `socket.io-client` ile bağlanan akış testleri.
- **E2E (Playwright):** 1 host (1920×1080) + 3 oyuncu (mobil viewport) context'i ile tam akış.
- `/health` endpoint'i (DB + Redis kontrolü).
- Opsiyonel: GitHub Actions ile lint/typecheck/test/build.

---

## 15. Fazlar

Her faz sonunda Bölüm 0'daki bitti tanımı uygulanır.

**Phase 1 — Altyapı**
Monorepo, Docker dev ortamı, PostgreSQL + Prisma (ilk migration + seed), Redis, NestJS iskeleti + `/health`, Next.js iskeleti (host/play/admin layout'ları), `packages/shared`, Socket.IO bağlantısı + `time:sync`, `CLAUDE.md`, `PROGRESS.md`.
*Kabul:* `docker compose up` ile her şey ayağa kalkar, health yeşil, web sayfası canlı socket bağlantısını ve ölçülen saat farkını gösterir, tüm kontroller geçer.

**Phase 2 — Oda ve Lobby**
Oda oluşturma, kod, QR, katılım linki, nickname/avatar, gerçek zamanlı lobby, hazır durumu, reconnect (oyuncu + host), kick/lock, rate limit ve brute-force koruması, input sanitizasyonu.
*Kabul:* E2E: host oda açar, 3 oyuncu katılır, biri sayfayı yeniler ve aynı slotla döner, biri atılır.

**Phase 3 — Game Engine + Quiz MVP**
`game-sdk`, engine, Quiz modülü (host + player renderer), skor, REVEAL, dağılım grafiği, round sonu scoreboard, final podyum, `GameSession` kalıcılığı, seed'de 10 Türkçe soruluk örnek pack.
*Kabul (MVP):* Host Create → QR → telefonlar katılır → lobby → Start → soru → telefondan cevap → server skoru → sonuç → leaderboard → sonraki soru → oyun sonu akışı E2E testle uçtan uca geçer; projeksiyonda cevap sızmadığı testle doğrulanır.

**Phase 4 — Admin Panel (temel)**
Auth, rol, Quiz içerik CRUD, kategoriler, medya yükleme, GamePack oluşturma; host oyuna başlarken pack seçer.

**Phase 5 —** Closest Number + Sorting + Kim Yapar?
**Phase 6 —** Image Location + Bluff
**Phase 7 —** Drawing (stream kanalı)
**Phase 8 —** Reaction + Memory
**Phase 9 —** CSV/XLSX import (önizleme + doğrulama), oturum geçmişi ve istatistikler, video desteği, prod sertleştirme, yedekleme.

**Phase 10 —** Tombala + Casus Kim?
**Phase 11 —** Kart/masa altyapısı (koltuk/izleyici, sıra zaman aşımı, bot) + UNO + Pişti
**Phase 12 —** Kızma Birader + Amiral Battı
**Phase 13 —** Okey

MVP (Phase 3) tamamen çalışmadan Phase 5+ oyunlarına geçilmez.
