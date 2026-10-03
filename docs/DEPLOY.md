# Prod kurulumu

Loudroom'u tek bir Linux sunucusunda Docker Compose ile çalıştırma rehberi (SPEC §13). Stack:

| Servis   | Görevi                                                                      |
| -------- | --------------------------------------------------------------------------- |
| nginx    | Dışarıya açık tek servis (80/443): sayfalar, `/api`, `/media`, `/socket.io` |
| web      | Next.js (standalone), non-root                                              |
| server   | NestJS API + Socket.IO + oyun motoru, non-root; ffmpeg dahil                |
| migrate  | Açılışta `prisma migrate deploy` ve kategori seed'i; bitince kapanır        |
| postgres | Veritabanı (dışarı açık değil)                                              |
| redis    | Canlı odalar ve rate limit (dışarı açık değil, AOF açık)                    |
| backup   | Her gece veritabanı + medya yedeği                                          |

## Gerekenler

- Docker Engine ve Docker Compose **2.24 veya üstü** (`docker compose version`).
- En az 2 GB RAM, 10 GB disk (imajlar, veritabanı, medya ve yedekler için daha fazlası).
- HTTPS için bir alan adı ve sertifika (ör. Let's Encrypt).

## İlk kurulum

```bash
git clone <repo> loudroom && cd loudroom
cp .env.prod.example .env.prod
```

`.env.prod` içinde en azından şunları doldur:

- `PUBLIC_URL`: Oyuncuların açacağı adres, ör. `https://parti.example.com`. QR kodları ve
  katılım linkleri bundan üretilir. `https` ise admin çerezi Secure bayrağı alır.
- `POSTGRES_PASSWORD`: `openssl rand -hex 32` (hex olsun: veritabanı adresinin içinde geçiyor).
- `IP_HASH_SECRET`: `openssl rand -hex 32`. 32 karakterden kısa ya da örnek değer olursa server
  açılmaz.

Ardından:

```bash
scripts/prod.sh up -d --build --wait
scripts/prod.sh run --rm server node dist/cli/admin-create.js --email sen@ornek.com --name "Ad"
```

`scripts/prod.sh`, `docker compose --env-file .env.prod -f compose.yml -f compose.prod.yml`
kısaltmasıdır. Prod komutlarını her zaman bununla çalıştır: düz `docker compose`, geliştirme
ayarlarının bulunduğu `.env`'i okur.

İlk admin oluşturulduktan sonra panel `PUBLIC_URL/admin` adresinde. Prod veritabanında örnek
içerik yok, yalnızca kategoriler var. İçerik panelden ya da CSV/XLSX içe aktarmayla eklenir.

`ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` prod'da tanımlıysa server açılmaz (şifresi
`.env.example` içinde duran geliştirme hesabı prod'a sızmasın diye).

## HTTPS

1. Sertifikaları bir klasöre koy: `fullchain.pem` ve `privkey.pem`. Klasörü `.env.prod` içinde
   `TLS_CERTS_DIR` ile ver (varsayılan `docker/nginx/certs`).
2. `docker/nginx/tls.conf.example` dosyasını `docker/nginx/sites/tls.conf` olarak kopyala,
   `server_name`'i alan adınla değiştir ve `docker/nginx/sites/http.conf` dosyasını sil.
3. `PUBLIC_URL`'i `https://…` yap ve yeniden başlat:
   `scripts/prod.sh up -d --force-recreate server nginx`.

HSTS başlığı yalnızca HTTPS isteklerinde gönderilir. Let's Encrypt için örnek dosya
`/.well-known/acme-challenge/` yolunu `/var/www/certbot`'tan sunar; certbot'u bu klasöre
yazacak şekilde ayrıca kur (ör. host'ta `certbot certonly --webroot`), klasörü nginx'e bağla.

## Başka bir proxy ya da CDN arkasında

Nginx, `X-Forwarded-For` başlığının **üzerine** istemcinin adresini yazar; server bu adrese
güvenir (`TRUST_PROXY=true`) ve rate limit'i buna göre uygular. Nginx'in önünde Cloudflare gibi
bir proxy varsa Nginx o proxy'nin adresini görür ve herkes tek kovayı paylaşır. Bu durumda
`docker/nginx/nginx.conf` içinde `real_ip` ayarını ekle:

```nginx
set_real_ip_from 173.245.48.0/20;   # proxy'nin adres aralıkları
real_ip_header CF-Connecting-IP;    # ya da X-Forwarded-For
```

TLS önde sonlanıyorsa (proxy → nginx HTTP), `sites/http.conf` olduğu gibi kalabilir;
`PUBLIC_URL` yine `https://…` olmalı.

## Güncelleme

```bash
git pull
scripts/prod.sh up -d --build --wait
```

`migrate` servisi yeni migration'ları uygular; server, web ve nginx yeniden başlar. Server
kapanırken açık oyunları duraklatır; yeniden açıldığında host "devam" ile sürdürür.

## Yedekleme ve geri yükleme

- `backup` servisi her gün `BACKUP_HOUR`'da (`TZ` saat dilimiyle) `pg_dump` ve medya
  arşivini `backups` volume'una yazar; `BACKUP_KEEP_DAYS` günden eskileri siler.
- Hemen yedek almak ve bu makineye (`./backups`) kopyalamak: `scripts/backup.sh`.
- Yedekleri sunucu dışında da sakla (ör. `./backups` klasörünü düzenli olarak başka bir yere
  kopyala).
- Geri yükleme (server ve web durur, canlı odalar silinir):

  ```bash
  scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.dump backups/media-YYYYMMDD-HHMMSS.tar.gz
  ```

Redis yedeklenmez: canlı odalar geçicidir.

## Doğrulama

```bash
scripts/prod-smoke.sh            # derle, başlat, health + WebSocket, yedek → geri yükleme provası
E2E=1 scripts/prod-smoke.sh      # ek olarak e2e testlerinin bir kısmı nginx üzerinden
```

Prova, son yedeği geçici bir veritabanına geri yükler ve her tablonun satır sayısını canlı
veritabanıyla karşılaştırır. E2E testleri bir admin hesabıyla giriş yapar: `.env` içindeki
`ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` ile aynı e-posta ve şifreyle `admin-create`
çalıştırılmış olmalı. Bu yalnızca test makinesi içindir.

## Loglar

```bash
scripts/prod.sh logs -f server   # JSON, satır başına bir kayıt
scripts/prod.sh logs -f nginx    # JSON erişim logu; istemci IP'si yazılmaz (KVKK)
```

## Kurumsal proxy arkasında derleme

İmaj derlemesi npm kayıt deposuna ve Google Fonts'a erişir. Ağ, TLS'i araya giren bir proxy'den
geçiyorsa proxy'nin CA sertifikasını (PEM) `.env.prod` içinde `EXTRA_CA_CERTS` ile ver. CA,
derlemeye build secret olarak geçer ve imajlarda kalmaz.

## Sorun giderme

- **Server açılmıyor, "Unsafe production environment":** `IP_HASH_SECRET` zayıf ya da
  `ADMIN_SEED_*` tanımlı (yukarıda).
- **Video yükleme "VIDEO_UNAVAILABLE":** Server imajı ffmpeg ile gelir; imajı kendin
  değiştirdiysen `FFMPEG_PATH` / `FFPROBE_PATH` ayarlarını kontrol et.
- **Admin işlemleri "CSRF_FAILED":** Tarayıcıdaki adres `PUBLIC_URL` (ya da `CORS_ORIGINS`)
  ile aynı origin olmalı.
- **Telefonlar bağlanamıyor:** `PUBLIC_URL` dışarıdan erişilebilen adres olmalı; Nginx'in
  `/socket.io/` yolunu WebSocket olarak geçirdiğini `scripts/prod-smoke.sh` doğrular.
