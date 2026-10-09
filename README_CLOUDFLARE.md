# DEPA Proje — Cloudflare Pages + Functions + D1 + R2

Bu paket, mevcut DEPA Proje tasarımını ve `yonetim.html` yönetim panelini koruyup Netlify Blobs API'sini Cloudflare Pages Functions, D1 ve R2 ile değiştirir.

## Paket yapısı

- `public/` — mevcut statik site dosyaları (HTML/CSS/JS/logo/görseller)
- `functions/api/[[path]].js` — `/api/*` uç noktaları
- `migrations/schema.sql` — D1 tablo şeması
- `scripts/migrate-from-netlify.mjs` — eski API erişilebiliyorsa bir defalık veri/fotoğraf aktarımı
- `wrangler.toml.example` — isteğe bağlı Wrangler yapılandırma örneği

## 1. GitHub'a yükleme

Bu ZIP'i açın ve içindeki dosyaları GitHub'daki `depaproje/depaproje` deposunun köküne yükleyin. `public/` ve `functions/` klasörlerinin kökte olduğundan emin olun. Eski HTML/CSS/JS dosyaları artık `public/` altındadır.

## 2. Cloudflare Pages projesi

1. https://dash.cloudflare.com/ adresine girin.
2. Workers & Pages → Create → Pages → Connect to Git seçin ve `depaproje/depaproje` deposunu bağlayın.
3. Production branch `main` olsun.
4. Framework preset: None; Build command boş; Build output directory `public`.
5. Deploy edin. `functions/` klasörünün repository kökünde kalması gerekir; Pages Functions `/api/*` isteklerini bu klasörden işler.

## 3. D1 veritabanı

1. Cloudflare Dashboard → Storage & databases → D1 SQL Database → Create database.
2. Veritabanı adı: `depaproje-data`.
3. D1 Console'da `migrations/schema.sql` içeriğini çalıştırın. `app_data` tablosu oluşmalıdır.
4. Pages projesi → Settings → Bindings → Add → D1 database.
5. Variable name `DB`, seçilen veritabanı `depaproje-data` olsun.

## 4. R2 görsel deposu

1. Storage & databases → R2 Object Storage → Create bucket.
2. Bucket adı `depaproje-images` olsun.
3. Pages projesi → Settings → Bindings → Add → R2 bucket.
4. Variable name `IMAGES`, bucket `depaproje-images` olsun.

## 5. Yönetici şifresi

Pages projesi → Settings → Variables and Secrets → Add.
- Name: `ADMIN_PASSWORD`
- Value: kendinizin belirlediği güçlü ve benzersiz bir şifre
- Production ortamına ekleyin; mümkünse Secret olarak kaydedin.

Bu değişikliklerden sonra yeniden deploy edin. Şifreyi GitHub'a, HTML'ye veya `wrangler.toml` dosyasına yazmayın.

## 6. İlk testler

Yeni Pages adresinde şu adresleri deneyin:
- `/api/projects` — JSON liste (ilk kurulumda `[]` beklenir)
- `/api/content` — içerik yoksa `null` döner
- `/yonetim.html` — yönetici girişi

İlk testlerde API 503 verirse D1 (`DB`) ve R2 (`IMAGES`) binding adlarını, ayrıca `ADMIN_PASSWORD` değerini kontrol edin.

## 7. Eski Netlify verilerini aktarma

**Önemli:** Kaynak ZIP yalnızca kodu içerir; Netlify Blobs içindeki canlı proje kayıtları ve fotoğraflar ZIP'in içinde değildir. Bu nedenle veri aktarımı için eski Netlify API'sinin hâlâ erişilebilir olması gerekir. Netlify kredisi nedeniyle eski API çalışmıyorsa bu script kaynak veriyi indiremez; Netlify tarafında erişim tekrar sağlanmalı veya mevcut veriler başka bir yedekten alınmalıdır.

Node.js 20+ kurulu bir bilgisayarda, paket klasöründe terminal açın ve aşağıdaki ortam değişkenlerini ayarlayın:

Windows PowerShell:

```powershell
$env:SOURCE_URL="https://ESKI-NETLIFY-ADRESINIZ.netlify.app"
$env:TARGET_URL="https://YENI-PAGES-ADRESINIZ.pages.dev"
$env:ADMIN_PASSWORD="CLOUDFLARE_YONETICI_SIFRENIZ"
node scripts/migrate-from-netlify.mjs
```

Script projeleri, proje fotoğraflarını, referans logolarını ve düzenlenebilir site içeriğini hedef API'ye aktarır. Önce hedef sitede yeni bir boş kurulum kullanın. Script'i iki kere çalıştırmak kayıtları çoğaltabilir; önce aktarımın tek seferde başarılı olduğundan emin olun.

## 8. Alan adı

Yeni `pages.dev` adresinde siteyi ve yönetim panelini doğrulamadan `depaproje.com` DNS kayıtlarını değiştirmeyin. Sonrasında Cloudflare Pages → Custom domains bölümünden alan adını ekleyin. E-posta DNS kayıtlarını silmeyin/değiştirmeyin.

## Notlar

- API girişinde `x-admin-password` başlığı kullanılır; şifre `sessionStorage` içinde tutulduğu için çıkışta silinir.
- Projeler ve site metinleri D1'de JSON olarak, görseller R2'de saklanır.
- `ADMIN_PASSWORD` tanımlı değilse giriş API'si açıklayıcı 503 yanıtı verir.
- Ücretsiz planların kullanım ve saklama limitleri vardır; yüksek trafik veya çok büyük fotoğraf arşivinde limitleri kontrol edin.
