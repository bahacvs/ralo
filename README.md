# ArenaMate - Padel Kort Rezervasyonu & Açık Maç Bulma Platformu

ArenaMate, Türkiye'deki padel tutkunlarını ve padel kulübü işletmelerini aynı full-stack mimaride buluşturan, çift taraflı (oyuncu & işletme) ve erişilebilir (WCAG 2.2 AA) bir rezervasyon platformudur.

---

## 🚀 Öne Çıkan Özellikler

### 1. Oyuncular İçin (Mobile-First)
- **Kort ve Saat Arama**: İzmir & Çeşme & Urla bölgesindeki kortları filtreleme (Kapalı, Açık Panoramik, zemin tipi, semt, saatlik ücret).
- **Zaman Dilimi Seçimi & Rezervasyon**: 60, 90 veya 120 dakikalık bloklar halinde anlık müsaitlik görüntüleme ve rezervasyon oluşturma.
- **Açık Maçlar & Oyuncu Bulma**:
  - 4 kişilik koltuk düzeni (Slot 0..3) ile seviyeye uygun (Elo aralıklı) açık maçlar.
  - Oyuncu gizliliği için maskelenmiş isimler (Örn: *Baha Ç.*).
  - Kontenjan dolduğunda otomatik **Yedek Listesi (Waitlist)** yönetimi ve bir oyuncu ayrıldığında sıradaki yedeğin otomatik asil kadroya terfi ettirilmesi.
- **Maç Sohbeti & Bildirimler**: Katılınan maçlar için grup içi iletişim.
- **Oyuncu Profili**: Elo derecesi, oynanan maç sayısı, kort pozisyonu (Sol Kanat / Sağ Kanat / Çift Yön), baskın el ve tercih edilen zamanlar.
- **Hesap ve Gizlilik**: KVKK uyumlu veri maskelemesi ve 2 adımlı güvenli hesap silme (`HESABIMI SIL` doğrulaması ile).

### 2. Padel İşletmeleri İçin (Desktop-First Yönetim Portalı)
- **Günlük Program & Takvim**:
  - Tüm kortların günlük çizelgesini tek ekranda izleme.
  - Zaman Çizelgesi (Timeline) ve Ekran Okuyucu Dostu Sıralı Liste (Accessible List View) görünümleri arasında tek tıkla geçiş.
  - Tarih seçici ve "Bugüne Dön" aksiyonu.
- **Manuel Rezervasyon**: Telefon veya resepsiyondan gelen talepler için anlık çakışma kontrollü rezervasyon girişi.
- **Saat Blokajı**: Bakım, kulüp antrenmanı, turnuva veya hava muhalefeti sebepleriyle kort saatlerini kapatma/açma.
- **Tahsilat ve No-Show Takibi**:
  - Tesiste nakit/POS tahsilat durumunu işaretleme.
  - Gelmeyen oyuncuları **Gelmedi (No-Show)** olarak işaretleyerek oyuncu güvenilirlik skorunu güncelleme.
- **Kort ve Fiyat Yönetimi**: Yeni kort ekleme, saatlik ücret belirleme, aktif/pasif durumu değiştirme.
- **Personel Yetkilendirme**: Resepsiyon ve Tesis Müdürü rolleriyle yetki sınırlandırması.
- **Haftalık Raporlar**: Doluluk yüzdesi, tahsil edilen ciro ve no-show analizleri.

---

## 🛠️ Mimari ve Teknoloji

- **Önyüz (Frontend)**: React 19, TypeScript, Tailwind CSS, Lucide Icons.
- **Sunucu (Backend)**: Node.js, Express REST API, Atomic In-Memory JSON Persistence (`server/store.ts`).
- **Doğrulama & Oturum**: OTP (Tek Kullanımlık Kod) simülasyonu, role dayalı session yönetimi.
- **Geliştirici Rol Değiştirici (Demo Role Switcher)**: Ekranın üst çubuğunda yer alan araç ile `OYUNCU`, `İŞLETME SAHİBİ` ve `PERSONEL` hesapları arasında anında geçiş yapılabilir.

---

## 👥 Hazır Demo Hesapları

| Rol | İsim | Telefon | Tesis / Açıklama |
|---|---|---|---|
| **Oyuncu** | Baha Çavuşoğlu | `0532 100 2030` | 1.450 Elo, Doğrulanmış Oyuncu |
| **İşletme Sahibi** | Kemal Demirbağ | `0532 200 4050` | Padel Arena Urla (3 Kort) |
| **Personel** | Ece Çetin | `0532 300 6070` | Resepsiyonist Yetkisi |

*(Geliştirme ortamında OTP SMS kodu olarak `123456` kullanılabilir veya tek tıkla Demo Switcher üzerinden geçiş yapılabilir.)*

---

## 🧪 Testler

Sistem aşağıdaki 3 kritik kuralı doğrulamak için otomatik test paketine sahiptir:
1. **Çift Rezervasyon Çakışma Koruması**: Aynı kort ve saat aralığı için ikinci bir rezervasyonun engellenmesi.
2. **Çoklu Kiracı (Multi-Tenant) İzolasyonu**: Başka bir işletmeye ait yönetim paneli verilerine erişimin 403 Forbidden ile reddedilmesi.
3. **Açık Maç 4 Kişi Kontenjan Sınırı**: 4 kişilik kadro dolduğunda yeni katılımcıların doğrudan yedek listesine aktarılması.

Testleri çalıştırmak için:
```bash
npm test
```

---

## 💻 Geliştirme & Derleme Komutları

```bash
# Bağımlılıkların derlenmesi ve test edilmesi
npm run lint
npm test

# Üretim derlemesi
npm run build

# Uygulamayı başlatma
npm start
```
