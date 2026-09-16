> **TASLAK – Yayına almadan önce avukat onayı gereklidir.**
> Bu dosya, `docs/legal/` altındaki taslakların yayına alınabilmesi için avukatın yanıtlaması gereken soruları listeler. Hukuki görüş değildir.

# Avukata Sorulacak Açık Konular

## Taslaklar hazırlanırken kullanılan teknik bilgiler

Soruların doğru yanıtlanabilmesi için kod tabanından tespit edilen işleyiş:

- **Kimlik doğrulama:** E-posta + şifre (şifre scrypt ile özetleniyor, düz metin saklanmıyor). Kayıtta e-posta doğrulama bağlantısı (48 saat), şifre sıfırlama bağlantısı (1 saat, tek kullanımlık). Uygulamadan rezervasyon için doğrulanmış e-posta şart. E-postalar şirket kurulana kadar RALO adına açılan kişisel bir Gmail hesabından SMTP ile gönderiliyor.
- **Oturumlar:** 30 gün geçerli; veritabanında token'ın kendisi değil SHA-256 özeti tutuluyor.
- **Kullanıcı kaydı:** E-posta, şifre özeti, koşulların kabul zamanı, isteğe bağlı telefon, görünen ad, kısaltılmış ad, profil fotoğrafı (https URL veya base64 görsel, en fazla ~900 KB, veritabanında saklanıyor), Elo, maç sayısı, oyun tarafı, baskın el, tercih edilen gün/saatler, arkadaş listesi, favori kortlar, bildirim ayarları.
- **Konum:** Tarayıcı konum izniyle alınıyor, cihazda (localStorage) saklanıyor, `/api/courts` ve `/api/open-matches` isteklerine sorgu parametresi (`userLat`, `userLng`) olarak ekleniyor. Sunucuda kullanıcıya bağlı kaydedilmiyor; ancak URL'de yer aldığı için barındırma sağlayıcısı erişim günlüklerine düşebilir.
- **Mesajlar:** Yalnızca sohbet üyeleri görebiliyor. Akış gönderileri herkese açık (oturum açmadan da `/api/feed` okunabiliyor).
- **Diğer oyunculara gösterilen veriler:** Kısaltılmış ad, fotoğraf, Elo, oyun tarafı. E-posta ve telefon gizleniyor.
- **Hesap silme:** Gelecek rezervasyonlar iptal, mesaj/gönderi/bildirim/arkadaşlık silinir, kullanıcı kaydı silinir. Geçmiş rezervasyonlar kulüp kayıtları için kalıyor (kullanıcı kimliğine referans veriyor). İşletme sahibi hesabı uygulamadan silinemiyor.
- **Manuel panel rezervasyonu:** Personel müşteri adı ve telefonu giriyor; numara mevcut bir oyuncuyla eşleşirse rezervasyon o hesaba bağlanıyor, yoksa yeni oyuncu kaydı oluşturuluyor.
- **Altyapı:** Render (Frankfurt), Supabase Postgres (Frankfurt), Gmail (Google, e-posta gönderimi), Google Gemini `gemini-2.5-flash`.
- **Gemini'ye giden veri:** Paylaşım kartı üretilirken istemde yalnızca kulüp adı, ilçe, maç tarihi/saati, boş yer sayısı, Elo aralığı var. Oyuncu adı/fotoğrafı istemde yok, ama kartın kendisinde (Gemini'den bağımsız olarak) katılımcıların kısaltılmış adı, fotoğrafı ve Elo'su gösteriliyor.

---

## A. Kayıt ve genel yükümlülükler

1. **VERBİS kaydı:** RALO'nun VERBİS'e kayıt yükümlülüğü var mı? (Yıllık çalışan sayısı [__], yıllık mali bilanço [__] TL. Ana faaliyet konusu kişisel veri işlemek olarak değerlendirilir mi? Kurul'un 2018/87 ve sonraki istisna kararları bakımından durum nedir?)
2. **Kişisel Veri Saklama ve İmha Politikası:** VERBİS kaydı gerekiyorsa politika hazırlanmalı. Aydınlatma metnindeki saklama süreleri (özellikle geçmiş rezervasyonlar için 10 yıl önerisi ve barındırma günlükleri) uygun mu?
3. **Veri sorumlusu temsilcisi / irtibat kişisi** atanması gerekiyor mu?

## B. Yurt dışı aktarım

4. **Aktarım mekanizması:** Supabase ve Render verileri Frankfurt'ta tutuyor ancak şirketler ABD merkezli. KVKK md. 9 (2024 değişikliği) kapsamında hangi mekanizma kullanılmalı?
   - Kurul'un yayımladığı standart sözleşme imzalanıp 5 iş günü içinde Kurum'a bildirilmesi mi?
   - Sağlayıcıların kendi DPA/SCC (AB GDPR) belgeleri yeterli mi, yoksa Kurul standart sözleşmesi ayrıca gerekli mi? Sağlayıcı imzalamazsa ne yapılmalı?
   - ABD'deki ana şirketin/destek ekiplerinin erişimi ayrı bir aktarım sayılır mı?
5. **Türkiye'de barındırma:** Hukuki risk açısından veritabanını Türkiye'deki bir sağlayıcıya taşımak önerilir mi? Önerilmesi durumunda bu bir lansman engeli mi?
6. **Gmail (kişisel Google hesabı):** Doğrulama e-postalarının Google üzerinden gönderilmesi yurt dışına aktarım (KVKK md. 9) sayılır mı, hangi aktarım aracı gerekir? Şirket kurulmadan kişisel hesapla gönderim ve kayıtta metinlere bağlantı verilmeden "okudum, kabul ediyorum" kutusu yeterli mi, yoksa metinlerin uygulama içinde yayınlanması mı gerekir?

## C. Google Gemini

7. **Kişisel veri mi?** Gemini'ye gönderilen istem (kulüp adı + ilçe + maç tarihi/saati + Elo aralığı + boş yer sayısı) belirli bir oyuncuyu belirlenebilir kılar mı? Kılmıyorsa aydınlatma metninde yurt dışı aktarım olarak listelenmesine gerek var mı?
8. **Açık rıza, meşru menfaat veya kaldırma:** Kişisel veri sayılırsa hangisi önerilir?
   - (a) Özelliği tamamen kaldırmak ve sabit şablon metin kullanmak (kodda zaten Gemini olmadan çalışan bir yedek metin var),
   - (b) Standart sözleşme ile yurt dışı aktarım yapmak,
   - (c) Kullanıcı "yapay zekâ ile metin üret" butonuna bastığında arızi aktarım olarak işlemek.
9. **Google koşulları:** Gemini API'nin ücretsiz katmanında Google girdileri ürün geliştirme için kullanabiliyor. Ücretli katman/Vertex AI zorunlu tutulmalı mı?

## D. Açık rıza gerektiren işlemler

10. **Konum:** Koordinatlar sunucuda saklanmıyor ama istek URL'sinde gönderiliyor. Cihaz izni + aydınlatma yeterli mi, yoksa KVKK açık rızası da gerekir mi? (Teknik alternatif: koordinatları POST gövdesine taşımak ve günlüklere düşmesini engellemek.)
11. **Paylaşım kartları:** Kartta diğer katılımcıların kısaltılmış adı, fotoğrafı ve Elo'su görünüyor ve kart sosyal medyada paylaşılabiliyor. Bu işlem için taslaktaki gibi isteğe bağlı açık rıza doğru mu, yoksa katılımcıların kartta hiç gösterilmemesi mi önerilir?
12. **Profil fotoğrafı:** Fotoğrafın diğer oyunculara gösterilmesi sözleşmenin ifası kapsamında mı? Fotoğraf yüz tanıma yapılmadığı sürece özel nitelikli (biyometrik) veri sayılmaz yorumu doğru mu?
13. **Ders notlarında sağlık bilgisi:** Antrenör notlarına sakatlık bilgisi yazılması md. 6 kapsamında. Serbest metin alanında sağlık bilgisini yasaklamak yeterli mi, yoksa açık rıza akışı mı kurulmalı? Kulüp mü veri sorumlusu olmalı?
14. **Açık rıza kayıt ispatı:** Rızanın sürümüyle birlikte zaman damgalı kaydı yeterli mi?

## E. İleti ve SMS mevzuatı

15. **İYS:** Doğrulama, şifre sıfırlama ve personel daveti e-postaları ticari elektronik ileti değil, işlem iletisi sayılır mı? (Şu an yalnızca bunlar gönderiliyor.) İYS kaydı ve marka hesabı lansmandan önce zorunlu mu?
16. **Hatırlatma ve bildirimler:** Rezervasyon hatırlatmaları (şu an uygulama içi) ileride SMS/push olarak gönderilirse onay gerekir mi? "Boş yer açıldı", "arkadaşın maç açtı" gibi bildirimler ticari ileti sayılır mı?
17. **Pazarlama:** İleride kampanya SMS'i gönderilecekse onay metni ve İYS entegrasyonu nasıl kurgulanmalı?

## F. Oyuncu Kullanım Koşulları

18. **Aracı hizmet sağlayıcı sıfatı:** RALO, 6563 sayılı Kanun ve Elektronik Ticarette Aracı Hizmet Sağlayıcılar Yönetmeliği kapsamında aracı hizmet sağlayıcı mı? Ödeme tesiste yapıldığından mesafeli sözleşmeler yönetmeliği (ön bilgilendirme, cayma) RALO veya Kulüp açısından uygulanır mı? Kort kiralama "belirli bir tarihte yapılması gereken boş zaman faaliyeti" istisnasına girer mi?
19. **İptal süresi ve gelmeme:** Varsayılan 24 saat, kulüp bazında değiştirilebilir. Geç iptal/gelmeme için Kulübün tesiste ücret talep etmesi veya RALO'nun hesap kısıtlaması tüketici mevzuatına uygun mu? Bu yaptırımın rezervasyon ekranında nasıl gösterilmesi gerekir?
20. **Yaş sınırı:** 18 yaş altı kullanıcılar (padel oynayan gençler, ders modülü) için veli onayı gerekli mi? Minimum yaş kaç olmalı?
21. **Sorumluluk sınırlaması:** Tüketici işlemlerinde taslaktaki sorumluluk sınırları geçerli mi (TBK md. 115, TKHK haksız şart denetimi)?
22. **İçerik yönetimi:** Topluluk akışı ve mesajlaşma nedeniyle 5651 sayılı Kanun kapsamında "yer sağlayıcı" yükümlülükleri (içerik kaldırma, trafik verisi saklama) doğuyor mu? Sosyal ağ sağlayıcı eşiklerine takılma riski var mı?
23. **Elo:** Otomatik hesaplanan ve maç erişimini kısıtlayan Elo puanı md. 11/1-g kapsamında "kişinin aleyhine sonuç doğuran otomatik değerlendirme" sayılır mı? Elo değişim kuralları henüz belirlenmediğinden şeffaflık için ne kadar açıklama yapılmalı?

## G. Kulüp Hizmet Sözleşmesi

24. **Veri işleme rolleri:** Taslaktaki üçlü ayrım (RALO bağımsız veri sorumlusu / Kulüp bağımsız veri sorumlusu / manuel panel girişlerinde RALO veri işleyen) doğru mu? Manuel girilen telefon numarasının mevcut oyuncu hesabıyla eşleştirilmesi veri işleyen rolüyle çelişir mi? Ortak veri sorumluluğu modeli daha mı uygun?
25. **Kulüp tarafından iptal edilen uygulama rezervasyonu bedeli** ve **gelmeme durumunda bedel:** Ticari açıdan hangi seçenek seçilecek (ürün kararı bekleniyor); hukuki olarak ikisi de uygulanabilir mi?
26. **Tek taraflı tarife değişikliği:** 30 gün önceden bildirim + fesih hakkı ile tek taraflı fiyat değişikliği TTK ve TBK md. 20-25 (genel işlem koşulları) bakımından geçerli mi?
27. **Ders bedeli:** Tutar henüz belirlenmedi. Sözleşmede tutar yerine "ek tarifede ilan edilen" ifadesi yeterli mi?
28. **Delil sözleşmesi ve kötüye kullanım (5.3):** Uygulama rezervasyonunun iptal edilip panelden yeniden girilmesini bedele tabi tutan hüküm uygulanabilir mi, ispat nasıl sağlanır?
29. **Antrenörler:** Antrenörler Kulüple sözleşmeli; RALO ile antrenör arasında ayrıca bir kullanım sözleşmesi gerekir mi? Antrenör notları bakımından antrenör ayrı bir veri sorumlusu mu?
30. **Faturalama:** e-Fatura/e-Arşiv, KDV oranı, damga vergisi ve ekstre sistemi için mali müşavir görüşü.

## H. Lansman öncesi teknik düzeltme önerileri (hukuki yanıtlara bağlı)

Bu maddeler avukat onayından sonra geliştirme ekibine iletilecektir:

- Konum koordinatlarının URL yerine istek gövdesinde gönderilmesi.
- Paylaşım kartında açık rıza vermeyen katılımcıların anonim gösterilmesi. *(Uygulandı: rıza vermeyen oyuncu kartta "Oyuncu N" olarak, Elo'suz gösteriliyor.)*
- Hesap silmede geçmiş rezervasyonların kullanıcı kimliğinden ayrıştırılması (ad/telefon yerine anonim etiket).
- Açık rıza ve kullanım koşulu onaylarının sürüm + zaman damgasıyla kaydedilmesi. *(Uygulandı: kayıtta Kullanım Koşulları, Aydınlatma Metni bilgilendirmesi ve isteğe bağlı paylaşım kartı rızası; kulüp sahiplerinin Kulüp Hizmet Sözleşmesi onayı. Her kayıt belge sürümü, zaman, IP ve e-postanın HMAC özetiyle saklanıyor; rıza ayarlardan geri alınabiliyor.)*
- İşletme sahibi hesapları için silme/başvuru süreci.
- Gemini kararına göre özelliğin kaldırılması veya ücretli katmana geçilmesi.
