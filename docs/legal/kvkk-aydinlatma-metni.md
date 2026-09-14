> **TASLAK – Yayına almadan önce avukat onayı gereklidir.**
> Bu metin hukuki danışmanlık niteliği taşımaz; RALO uygulamasının mevcut kod tabanı incelenerek hazırlanmış bir çalışma taslağıdır. Köşeli parantez içindeki alanlar doldurulmalı, `ACIK-KONULAR.md` dosyasındaki sorular avukat tarafından yanıtlanmalıdır.

# RALO Kişisel Verilerin Korunması Aydınlatma Metni

**Son güncelleme:** [TARİH]

Bu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("**KVKK**") 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, RALO mobil/web uygulaması ("**Uygulama**") kullanıcılarını bilgilendirmek amacıyla hazırlanmıştır.

## 1. Veri Sorumlusu

| | |
|---|---|
| Unvan | [ŞİRKET UNVANI] |
| Adres | [ADRES] |
| MERSİS No | [MERSİS] |
| Vergi Dairesi / No | [VERGİ DAİRESİ / VERGİ NO] |
| KEP adresi | [KEP ADRESİ] |
| E-posta | [KVKK İLETİŞİM E-POSTASI] |
| VERBİS kayıt no (varsa) | [VERBİS NO] |

RALO, padel kulüplerinin kortlarını listelediği ve oyuncuların rezervasyon yapıp açık maçlara katılabildiği bir platformdur. Kulüpler ("**İşletme**") kendi müşteri ve rezervasyon kayıtları bakımından ayrıca veri sorumlusu sıfatına sahip olabilir (bkz. Bölüm 5 ve Kulüp Hizmet Sözleşmesi).

## 2. İşlenen Kişisel Veriler

Aşağıdaki liste, Uygulamanın fiilen topladığı verilere göre hazırlanmıştır.

| Veri kategorisi | Veriler | Kaynak |
|---|---|---|
| Kimlik | Ad soyad (görünen ad), kısaltılmış ad (ör. "Ahmet Y.") | Kullanıcı; kulüp paneline manuel rezervasyon girilirken kulüp personeli |
| İletişim | Cep telefonu numarası | Kullanıcı; manuel rezervasyonda kulüp personeli |
| Görsel | Profil fotoğrafı (kullanıcı yüklerse) | Kullanıcı |
| Konum | Anlık konum koordinatları (yalnızca kullanıcı cihaz izni verirse) ve seçilen şehir/ilçe | Cihaz (tarayıcı konum izni) |
| Oyuncu profili | Elo seviye puanı, maç sayısı, oyun tarafı (sağ/sol), baskın el, tercih edilen gün ve saatler, favori kortlar, arkadaş listesi | Kullanıcı ve Uygulama tarafından hesaplanan |
| Müşteri işlem | Rezervasyon kayıtları (kort, tarih, saat, süre, ücret, durum, kaynak: uygulama/panel), ödeme durumu (tesiste ödendi/ödenmedi), açık maç katılımı, bekleme listesi, maç notları, maç tercihleri | Kullanıcı, kulüp personeli |
| İletişim içerikleri | Maç sohbetlerindeki ve doğrudan mesajlardaki metinler | Kullanıcı |
| Kullanıcı içerikleri | Topluluk akışı gönderileri, yanıtlar, beğeniler | Kullanıcı |
| Bildirim | Uygulama içi bildirimler ve bildirim tercihleri (hatırlatıcı, ses vb.) | Uygulama |
| İşlem güvenliği | Tek kullanımlık SMS doğrulama kodunun özeti (hash; en fazla 5 dakika, yalnızca bellekte), oturum anahtarının özeti ve oturum başlangıç/bitiş tarihleri, IP adresi ve istek kayıtları (barındırma sağlayıcısı günlükleri) | Uygulama, barındırma altyapısı |
| Kulüp personeli (İşletme kullanıcıları) | Ad, telefon, işletme rolü ve yetkileri | İşletme sahibi |

**Özel nitelikli kişisel veri:** Uygulama KVKK md. 6 kapsamında özel nitelikli kişisel veri (sağlık, biyometrik vb.) toplamayı amaçlamaz. Profil fotoğrafları yüz tanıma veya biyometrik eşleştirme amacıyla işlenmez. Kullanıcıların mesaj veya gönderi alanlarına kendi iradeleriyle özel nitelikli veri yazmamaları önerilir.

**Konum verisine ilişkin not:** Konum koordinatları yalnızca cihazınızda (tarayıcı yerel depolaması) saklanır ve yakındaki kortları mesafeye göre sıralamak için sunucuya sorgu parametresi olarak iletilir; RALO veritabanında kullanıcı hesabına bağlı olarak kaydedilmez. Ancak bu istekler barındırma sağlayıcısının teknik erişim günlüklerinde geçici olarak yer alabilir. Konum izni vermeden Uygulamayı şehir/ilçe seçerek kullanabilirsiniz.

## 3. İşleme Amaçları

1. Telefon numarası ve SMS doğrulama kodu ile üyelik oluşturulması ve oturum yönetimi,
2. Kort arama, listeleme, mesafeye göre sıralama ve kort rezervasyonu hizmetinin sunulması,
3. Rezervasyonun ilgili kulübe iletilmesi, kulüp tarafından yönetilmesi ve tesiste ödeme durumunun takibi,
4. Açık maç oluşturma, maça katılma, bekleme listesi, seviye (Elo) eşleştirmesi ve oyuncu profilinin diğer oyunculara sınırlı biçimde (kısaltılmış ad, fotoğraf, Elo, oyun tarafı) gösterilmesi,
5. Mesajlaşma, arkadaş ekleme ve topluluk akışı özelliklerinin sunulması,
6. Rezervasyon hatırlatmaları ve uygulama içi bildirimlerin gönderilmesi,
7. Açık maç paylaşım kartı ve paylaşım metni oluşturulması,
8. Kulüplere yönelik platform hizmet bedelinin (uygulama üzerinden yapılan rezervasyon başına ücret) hesaplanması ve faturalandırılması,
9. Bilgi güvenliğinin sağlanması, kötüye kullanımın (ör. SMS kodu deneme saldırısı) önlenmesi,
10. Hukuki yükümlülüklerin yerine getirilmesi, yetkili kurum taleplerinin karşılanması ve olası uyuşmazlıklarda hakların korunması.

## 4. Hukuki Sebepler (KVKK md. 5)

| Amaç | Hukuki sebep |
|---|---|
| Üyelik, oturum, rezervasyon, açık maç, mesajlaşma, bildirim (1-6) | md. 5/2-c: Sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması |
| Oyuncu profilinin diğer kullanıcılara gösterilmesi, Elo eşleştirmesi (4) | md. 5/2-c; profil fotoğrafı ve tercihlerde ayrıca md. 5/2-e ilgili kişinin kendisi tarafından alenileştirilmesi değerlendirilmelidir [AVUKAT TEYİDİ] |
| Konum ile yakın kort sıralaması (2) | md. 5/2-c ve cihaz düzeyinde kullanıcı izni; ayrıca açık rıza gerekip gerekmediği `ACIK-KONULAR.md` içinde sorulmuştur |
| Paylaşım kartı metninin yapay zekâ ile üretilmesi (7) | [AVUKAT KARARI: md. 5/2-f meşru menfaat mi, açık rıza mı? Bkz. `acik-riza-metni.md`] |
| Kulüp faturalandırması (8) | md. 5/2-f: Veri sorumlusunun meşru menfaati; md. 5/2-ç: hukuki yükümlülük (vergi mevzuatı) |
| Güvenlik, kötüye kullanımın önlenmesi (9) | md. 5/2-f: Meşru menfaat; md. 5/2-ç (5651 sayılı Kanun kapsamındaki yükümlülükler, uygulanabildiği ölçüde) |
| Hukuki yükümlülükler ve hakların korunması (10) | md. 5/2-ç ve md. 5/2-e |

## 5. Kişisel Verilerin Aktarılması (KVKK md. 8 ve md. 9)

### 5.1 Yurt içi aktarımlar

| Alıcı | Aktarılan veri | Amaç |
|---|---|---|
| Rezervasyon yapılan kulüp (İşletme) | Ad, telefon, rezervasyon ve ödeme durumu bilgileri, açık maç katılımcı bilgileri | Rezervasyonun ifası, tesiste ödeme ve kort yönetimi |
| Netgsm İletişim ve Bilgi Teknolojileri A.Ş. (Türkiye) | Telefon numarası ve doğrulama kodu içeren SMS metni | SMS ile kimlik doğrulama |
| Diğer kullanıcılar | Kısaltılmış ad, profil fotoğrafı, Elo, oyun tarafı/el tercihi, gönderiler, mesajlar (yalnızca ilgili sohbetin üyelerine) | Sosyal ve maç eşleştirme özellikleri. Telefon numaranız diğer oyunculara gösterilmez. |
| Yetkili kamu kurum ve kuruluşları, mahkemeler | Talep edilen veriler | Hukuki yükümlülükler |
| Hukuk, muhasebe, denetim danışmanları | Gerekli olduğu ölçüde | Hakların korunması, mali yükümlülükler |

### 5.2 Yurt dışı aktarımlar

Uygulamanın altyapısı yurt dışında bulunan hizmet sağlayıcılar üzerinden çalışmaktadır. Bu nedenle kişisel verileriniz yurt dışına aktarılmaktadır:

| Hizmet sağlayıcı | Konum | Aktarılan veri | Amaç |
|---|---|---|---|
| Supabase Inc. (PostgreSQL veritabanı) | Veri merkezi: Frankfurt, Almanya (AB). Şirket merkezi ABD. | Bölüm 2'deki tüm hesap, rezervasyon, mesaj, gönderi, bildirim ve oturum verileri | Verilerin saklanması |
| Render Services, Inc. (uygulama barındırma) | Sunucu bölgesi: Frankfurt, Almanya (AB). Şirket merkezi ABD. | Uygulamaya gelen tüm istekler ve bu isteklerdeki veriler, IP adresi ve teknik günlükler | Uygulamanın çalıştırılması |
| Google LLC / Google Ireland Ltd. (Gemini API) | ABD ve/veya diğer ülkeler [SÖZLEŞME/BÖLGE TEYİDİ] | Açık maç paylaşım kartı oluşturulurken: kulüp adı, ilçe, maç tarihi ve saati, boş yer sayısı, Elo aralığı. **Oyuncu adı, telefonu veya fotoğrafı gönderilmez.** | Paylaşım metni önerisi üretilmesi |

1 Haziran 2024'te yürürlüğe giren değişiklikle KVKK md. 9 uyarınca yurt dışı aktarım; (i) Kurul tarafından yeterlilik kararı verilmiş ülkelere, (ii) yeterlilik kararı yoksa md. 9/4'teki uygun güvencelerden biri (ör. Kurulca ilan edilen standart sözleşmenin imzalanması ve 5 iş günü içinde Kurum'a bildirilmesi) sağlanarak, ya da (iii) arızi hallerde md. 9/6'daki istisnalarla yapılabilir.

**[AVUKAT KARARI]** RALO'nun yukarıdaki aktarımlar için dayanacağı mekanizma: [STANDART SÖZLEŞME / BAĞLAYICI ŞİRKET KURALLARI / DİĞER]. Standart sözleşme tarihleri ve Kurum'a bildirim tarihleri: [TARİHLER]. Açık rıza, süreklilik arz eden aktarımlar için bir dayanak olarak kullanılmamalıdır (md. 9/6-a yalnızca arızi aktarımlar içindir); bu nedenle bu metin yurt dışı aktarımı açık rızaya bağlamamaktadır.

## 6. Kişisel Veri Toplamanın Yöntemi

Kişisel verileriniz; Uygulama üzerindeki kayıt, profil, rezervasyon, mesaj ve gönderi formları, cihazınızın konum izni, kulüp personelinin yönetim paneline yaptığı girişler ve sunucu altyapısının otomatik kayıtları aracılığıyla elektronik ortamda, tamamen veya kısmen otomatik yollarla toplanmaktadır.

## 7. Saklama Süreleri

Aşağıdaki süreler taslak niteliğindedir; Kişisel Veri Saklama ve İmha Politikası ile uyumlu hale getirilmelidir. **[AVUKAT TEYİDİ]**

| Veri | Saklama süresi |
|---|---|
| SMS doğrulama kodu (hash) | En fazla 5 dakika; yalnızca sunucu belleğinde tutulur, veritabanına yazılmaz |
| Oturum kaydı (token hash) | 30 gün veya çıkış yapılana/hesap silinene kadar |
| Hesap ve profil verileri | Hesap aktif olduğu sürece; hesap silindiğinde derhal silinir |
| Mesajlar, gönderiler, yanıtlar, beğeniler, bildirimler, arkadaş listesi | Hesap silindiğinde derhal silinir |
| Gelecek tarihli rezervasyonlar ve açık maç katılımları | Hesap silindiğinde iptal edilir ve katılım kayıtları silinir |
| Geçmiş rezervasyon kayıtları | Kulübün ve platformun ticari/mali kayıt yükümlülükleri nedeniyle [SÜRE, ör. 10 yıl – TTK md. 82, VUK md. 253] saklanır; hesap silindikten sonra ad/telefon ile ilişkilendirilmeden tutulması hedeflenir [TEKNİK TEYİT: şu an geçmiş rezervasyonlarda kullanıcı kimliği referansı kalmaktadır] |
| Kulüp faturalandırma kayıtları | [SÜRE, ör. 10 yıl] |
| Barındırma sağlayıcısı erişim günlükleri | [SÜRE – Render ve Supabase varsayılan saklama sürelerine göre doldurulacak] |
| Tarayıcıda saklanan konum ve şehir tercihi | Kullanıcı tarayıcı verilerini temizleyene kadar (yalnızca cihazda) |

Saklama süresi sona eren veriler silinir, yok edilir veya anonim hale getirilir.

## 8. İlgili Kişinin Hakları (KVKK md. 11)

KVKK'nın 11. maddesi uyarınca herkes, veri sorumlusuna başvurarak kendisiyle ilgili;

a) Kişisel veri işlenip işlenmediğini öğrenme,
b) Kişisel verileri işlenmişse buna ilişkin bilgi talep etme,
c) Kişisel verilerin işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme,
ç) Yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü kişileri bilme,
d) Kişisel verilerin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme,
e) KVKK md. 7'de öngörülen şartlar çerçevesinde kişisel verilerin silinmesini veya yok edilmesini isteme,
f) (d) ve (e) bentleri uyarınca yapılan işlemlerin, kişisel verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,
g) İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle kişinin kendisi aleyhine bir sonucun ortaya çıkmasına itiraz etme,
ğ) Kişisel verilerin kanuna aykırı olarak işlenmesi sebebiyle zarara uğraması hâlinde zararın giderilmesini talep etme

haklarına sahiptir.

**Uygulama içi araçlar:** Profil bilgilerinizi Uygulama içinden düzeltebilir, "Hesabımı Sil" işlevi ile hesabınızı ve Bölüm 7'de belirtilen verilerinizi silebilirsiniz. İşletme sahibi hesapları uygulama içinden silinemez; bu hesaplar için aşağıdaki başvuru yolunu kullanınız.

**Elo puanı hakkında:** Elo seviye puanı maç sonuçlarından otomatik olarak hesaplanır ve açık maçlara katılım için seviye aralığı filtresinde kullanılır. Bu otomatik değerlendirmeye itiraz etme hakkınız (md. 11/1-g) saklıdır.

## 9. Başvuru Yolu

Haklarınıza ilişkin taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak:

- Islak imzalı dilekçe ile [ADRES] adresine şahsen veya noter aracılığıyla,
- [KEP ADRESİ] adresine kayıtlı elektronik posta ile,
- Güvenli elektronik imza veya mobil imza ile ya da Uygulamada kayıtlı telefon numaranızla ilişkilendirilmiş hesabınız üzerinden [KVKK İLETİŞİM E-POSTASI] adresine e-posta ile

iletebilirsiniz. Başvurunuzda ad soyad, T.C. kimlik numarası (yabancılar için uyruk ve pasaport/kimlik no), tebligata esas adres, varsa e-posta/telefon ve talep konusunun bulunması gerekir.

Başvurular, talebin niteliğine göre en geç **otuz (30) gün** içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul tarafından belirlenen tarifedeki ücret alınabilir. Başvurunuzun reddedilmesi, cevabın yetersiz bulunması veya süresinde cevap verilmemesi hâlinde, cevabı öğrendiğiniz tarihten itibaren 30 gün ve her hâlde başvuru tarihinden itibaren 60 gün içinde Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.
