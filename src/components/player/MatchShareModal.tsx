import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal.js';
import { api } from '../../services/api.js';
import { 
  Sparkles, Download, Share2, Copy, Check, RefreshCw, 
  Instagram, MessageCircle, Eye, Calendar, Clock, MapPin, Users 
} from 'lucide-react';

interface MatchShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchData: any;
}

export const MatchShareModal: React.FC<MatchShareModalProps> = ({
  isOpen,
  onClose,
  matchData
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [format, setFormat] = useState<'STORY' | 'POST'>('STORY');
  const [themeKey, setThemeKey] = useState<'SUNSET' | 'NEON_NIGHT' | 'CHAMPIONSHIP' | 'CYBER_AMBER'>('SUNSET');
  const [loading, setLoading] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [aiCaption, setAiCaption] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const THEMES = [
    {
      key: 'SUNSET',
      label: 'Altın Gün Batımı',
      icon: '🌅',
      bgUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&auto=format&fit=crop&q=80',
      primaryColor: '#f59e0b',
      accentColor: '#fbbf24',
      mood: 'Gün batımı panoramik cam kortta heyecanlı açık maç!'
    },
    {
      key: 'NEON_NIGHT',
      label: 'Gece & Neon Kort',
      icon: '⚡',
      bgUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&auto=format&fit=crop&q=80',
      primaryColor: '#fbbf24',
      accentColor: '#eab308',
      mood: 'Projektörler altında gece padel maçı ve hızlı ralliler!'
    },
    {
      key: 'CHAMPIONSHIP',
      label: 'Şampiyona Sahası',
      icon: '🏆',
      bgUrl: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=1200&auto=format&fit=crop&q=80',
      primaryColor: '#f59e0b',
      accentColor: '#d97706',
      mood: 'Yüksek tempolu ve dengeli Elo seviyesinde şampiyona maçı.'
    },
    {
      key: 'CYBER_AMBER',
      label: 'Dinamik Padel Ralli',
      icon: '🔥',
      bgUrl: 'https://images.unsplash.com/photo-1519766304817-4f37bda74a29?w=1200&auto=format&fit=crop&q=80',
      primaryColor: '#d97706',
      accentColor: '#f59e0b',
      mood: 'Keyifli dostluk maçı, takımını tamamla ve oyna!'
    }
  ] as const;

  const currentTheme = THEMES.find(t => t.key === themeKey) || THEMES[0];

  // Render canvas card image
  const renderCardImage = (bgImg?: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas || !matchData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isStory = format === 'STORY';
    const width = 1080;
    const height = isStory ? 1920 : 1080;

    canvas.width = width;
    canvas.height = height;

    const { match, court, business, participants = [], pricePerPlayer } = matchData;
    const activeParticipants = participants.filter((p: any) => p.status === 'ACTIVE');
    const availableSpots = Math.max(0, 4 - activeParticipants.length);

    // 1. Draw Background
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.drawImage(bgImg, 0, 0, width, height);
    } else {
      // Fallback dark gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(0.5, '#1e1b4b');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Dark Cinematic Overlay Gradient
    const overlayGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (themeKey === 'SUNSET') {
      overlayGrad.addColorStop(0, 'rgba(15, 23, 42, 0.65)');
      overlayGrad.addColorStop(0.4, 'rgba(69, 26, 3, 0.75)');
      overlayGrad.addColorStop(1, 'rgba(2, 6, 23, 0.95)');
    } else if (themeKey === 'NEON_NIGHT') {
      overlayGrad.addColorStop(0, 'rgba(15, 23, 42, 0.7)');
      overlayGrad.addColorStop(0.4, 'rgba(46, 16, 101, 0.8)');
      overlayGrad.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
    } else {
      overlayGrad.addColorStop(0, 'rgba(15, 23, 42, 0.7)');
      overlayGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.85)');
      overlayGrad.addColorStop(1, 'rgba(2, 6, 23, 0.97)');
    }
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Subtle Court Grid Lines Illustration
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 4;
    ctx.strokeRect(60, 60, width - 120, height - 120);

    // Inner glowing decorative frame
    ctx.strokeStyle = currentTheme.primaryColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(80, 80, width - 160, height - 160);

    // 4. Header Badge (ARENAMATE • AÇIK PADEL MAÇI)
    const badgeY = isStory ? 180 : 150;
    ctx.fillStyle = currentTheme.primaryColor;
    ctx.beginPath();
    ctx.roundRect(width / 2 - 260, badgeY, 520, 64, 32);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RALO • AÇIK PADEL MAÇI', width / 2, badgeY + 43);

    // 5. Main Title (Venue & Court)
    const titleY = isStory ? 340 : 270;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px serif, Georgia, sans-serif';
    ctx.textAlign = 'center';
    const venueText = business?.name || 'RALO Padel';
    ctx.fillText(venueText, width / 2, titleY);

    ctx.fillStyle = currentTheme.accentColor;
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(court?.name || 'Panoramik Cam Kort', width / 2, titleY + 60);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '28px sans-serif';
    ctx.fillText(`📍 ${[business?.district, business?.city].filter(Boolean).join(', ') || 'Türkiye'}`, width / 2, titleY + 115);

    // 6. Match Info Card Box (Date, Time, Duration)
    const boxY = isStory ? 580 : 470;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(140, boxY, width - 280, isStory ? 380 : 250, 32);
    ctx.fill();
    ctx.stroke();

    // Date & Time Typography
    const dateObj = new Date(match.startAt);
    const dateStr = dateObj.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = match.startAt.split('T')[1].slice(0, 5);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`📅 ${dateStr}`, width / 2, boxY + 70);

    ctx.fillStyle = currentTheme.primaryColor;
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(`⏰ ${timeStr}  (${match.durationMinutes} Dakika)`, width / 2, boxY + 145);

    // Elo & Price Chips inside Box
    const chipsY = boxY + 210;
    // Elo Chip
    ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
    ctx.beginPath();
    ctx.roundRect(width / 2 - 340, chipsY, 320, 54, 16);
    ctx.fill();
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`⚡ Seviye: ${match.minElo || 1200} - ${match.maxElo || 1600} Elo`, width / 2 - 180, chipsY + 36);

    // Price Chip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(width / 2 + 20, chipsY, 320, 54, 16);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`💳 Kişi Başı: ${pricePerPlayer} ₺`, width / 2 + 180, chipsY + 36);

    // 7. Player Spots Availability Grid
    const slotsY = isStory ? 1040 : 760;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`KADRO DURUMU: ${activeParticipants.length} / 4 DOLU`, width / 2, slotsY);

    const slotWidth = 180;
    const slotGap = 20;
    const totalSlotsWidth = 4 * slotWidth + 3 * slotGap;
    const startX = (width - totalSlotsWidth) / 2;

    for (let i = 0; i < 4; i++) {
      const p = activeParticipants[i];
      const sx = startX + i * (slotWidth + slotGap);
      const sy = slotsY + 30;

      if (p) {
        // Filled Slot
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(sx, sy, slotWidth, isStory ? 200 : 130, 20);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        // Without the player's explicit share-card consent the card shows no name or Elo
        const consented = p.shareCardConsent === true;
        ctx.fillText(consented ? (p.userMaskedName || `Oyuncu ${i + 1}`) : `Oyuncu ${i + 1}`, sx + slotWidth / 2, sy + 50);

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(consented ? `${p.userElo ?? 1400} Elo` : 'Kadroda', sx + slotWidth / 2, sy + 85);

        if (isStory) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '18px sans-serif';
          ctx.fillText(p.playSide === 'LEFT' ? 'Sol Kanat' : p.playSide === 'RIGHT' ? 'Sağ Kanat' : 'Çift Yön', sx + slotWidth / 2, sy + 140);
        }
      } else {
        // Empty Slot (Vibrant glowing vacancy)
        ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
        ctx.strokeStyle = currentTheme.primaryColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(sx, sy, slotWidth, isStory ? 200 : 130, 20);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = currentTheme.primaryColor;
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText('🎾', sx + slotWidth / 2, sy + (isStory ? 70 : 50));

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('BOŞ KOLTUK', sx + slotWidth / 2, sy + (isStory ? 120 : 90));

        if (isStory) {
          ctx.fillStyle = currentTheme.accentColor;
          ctx.font = 'bold 18px sans-serif';
          ctx.fillText('Katıl!', sx + slotWidth / 2, sy + 160);
        }
      }
    }

    // 8. Call to Action Banner
    const ctaY = isStory ? 1420 : 930;
    if (isStory) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.strokeStyle = currentTheme.primaryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(140, ctaY, width - 280, 260, 28);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = currentTheme.primaryColor;
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(availableSpots > 0 ? `🔥 SON ${availableSpots} OYUNCU ARANIYOR!` : 'KADRO DOLMAK ÜZERE!', width / 2, ctaY + 80);

      ctx.fillStyle = '#ffffff';
      ctx.font = '28px sans-serif';
      ctx.fillText('RALO üzerinden maç koltuğunu anında kap.', width / 2, ctaY + 140);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('ralo.app/acik-maclar', width / 2, ctaY + 200);

      // Footer Branding
      ctx.fillStyle = '#64748b';
      ctx.font = '22px sans-serif';
      ctx.fillText('RALO • The Social Network for Padel', width / 2, height - 100);
    } else {
      // 1:1 post bottom bar
      ctx.fillStyle = currentTheme.primaryColor;
      ctx.beginPath();
      ctx.roundRect(160, ctaY, width - 320, 64, 20);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(`🔥 ${availableSpots > 0 ? `SON ${availableSpots} KOLTUK` : 'MAÇ DOLU'} • RALO ÜZERİNDEN KATIL`, width / 2, ctaY + 42);
    }

    // Save as Data URL
    try {
      const dataUrl = canvas.toDataURL('image/png');
      setGeneratedImageUrl(dataUrl);
    } catch (e) {
      console.warn('Canvas export warning:', e);
    }
  };

  const generatePreview = async () => {
    if (!matchData?.match?.id) return;
    setLoading(true);
    setStatusMessage('Yapay zeka maç önizleme görseli hazırlanıyor...');

    try {
      // 1. Call server API
      const res = await api.generateMatchShareCard(matchData.match.id, {
        theme: themeKey,
        format
      });

      if (res?.aiCaption) {
        setAiCaption(res.aiCaption);
      } else {
        const { match, business } = matchData;
        setAiCaption(`${business?.name} (${business?.district}) kortunda ${new Date(match.startAt).toLocaleDateString('tr-TR')} saat ${match.startAt.split('T')[1].slice(0, 5)} için padel oyuncusu arıyoruz! 🎾 Elo: ${match.minElo || 1200}-${match.maxElo || 1600}. Maça katılmak için bağlantıya tıkla! #RALO #Padel`);
      }

      // 2. Load the background image and draw to canvas
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        renderCardImage(img);
        setLoading(false);
        setStatusMessage(null);
      };
      img.onerror = () => {
        // Render with fallback gradient
        renderCardImage();
        setLoading(false);
        setStatusMessage(null);
      };
      img.src = currentTheme.bgUrl;
    } catch (err: any) {
      console.warn('Generate error, using local generator:', err);
      // Fallback local draw
      renderCardImage();
      const { match, business } = matchData;
      setAiCaption(`${business?.name || 'RALO'} açık padel maçı için kadro kuruluyor! 🎾 ${new Date(match.startAt).toLocaleDateString('tr-TR')} saat ${match.startAt.split('T')[1].slice(0, 5)}. Katılmak için hemen tıkla! #RALO #Padel`);
      setLoading(false);
      setStatusMessage(null);
    }
  };

  useEffect(() => {
    if (isOpen && matchData) {
      generatePreview();
    }
  }, [isOpen, format, themeKey]);

  const handleDownload = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    link.download = `ralo-mac-${matchData?.match?.id || 'padel'}-${format.toLowerCase()}.png`;
    link.href = generatedImageUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatusMessage('Görsel başarıyla cihazınıza indirildi! 📥');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleNativeShare = async () => {
    const shareUrl = `${window.location.origin}/acik-mac/${matchData?.match?.id}`;
    const shareText = aiCaption || `RALO Açık Padel Maçımıza Katılın! 🎾 ${shareUrl}`;

    if (navigator.share) {
      try {
        // Try sharing file if supported
        if (generatedImageUrl && navigator.canShare && navigator.canShare({ files: [] })) {
          const res = await fetch(generatedImageUrl);
          const blob = await res.blob();
          const file = new File([blob], `ralo-mac-${matchData?.match?.id}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'RALO Padel Maçı',
              text: shareText,
              files: [file]
            });
            return;
          }
        }

        await navigator.share({
          title: 'RALO Padel Maçı',
          text: shareText,
          url: shareUrl
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleWhatsAppShare = () => {
    const shareUrl = `${window.location.origin}/acik-mac/${matchData?.match?.id}`;
    const text = encodeURIComponent(`${aiCaption}\n\n👉 Maça Katıl: ${shareUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/acik-mac/${matchData?.match?.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setStatusMessage('Maç bağlantısı panoya kopyalandı! 📋');
    setTimeout(() => {
      setCopiedLink(false);
      setStatusMessage(null);
    }, 3000);
  };

  const handleCopyCaption = () => {
    if (!aiCaption) return;
    navigator.clipboard.writeText(aiCaption);
    setCopiedCaption(true);
    setStatusMessage('Sosyal medya metni panoya kopyalandı! 📋');
    setTimeout(() => {
      setCopiedCaption(false);
      setStatusMessage(null);
    }, 3000);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Maçı Paylaş • AI Görsel Önizleme"
      description="Sosyal medya için yapay zeka ile etkileşimli maç afişi ve hikaye görseli oluşturun."
      maxWidth="lg"
    >
      <div className="space-y-4 pt-2">
        
        {/* Format & Theme Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
          
          {/* Format Selector */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setFormat('STORY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                format === 'STORY'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📱 Hikaye (9:16)
            </button>
            <button
              type="button"
              onClick={() => setFormat('POST')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                format === 'POST'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🖼️ Gönderi (1:1)
            </button>
          </div>

          {/* Regenerate Button */}
          <button
            type="button"
            disabled={loading}
            onClick={generatePreview}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 min-h-[36px]"
          >
            <Sparkles className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'AI Üretiyor...' : 'AI ile Görseli Yenile'}</span>
          </button>
        </div>

        {/* AI Theme Presets */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
            AI Atmosfer & Tasarım Teması:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {THEMES.map((t) => {
              const isSelected = t.key === themeKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setThemeKey(t.key as any)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-2xs ring-1 ring-amber-400'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{t.icon}</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{t.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {t.mood}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status / Feedback Banner */}
        {statusMessage && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center justify-between">
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Visual Preview Container */}
        <div className="relative bg-slate-950 rounded-3xl p-4 flex flex-col items-center justify-center border border-slate-800 shadow-inner overflow-hidden min-h-[320px]">
          
          {/* Hidden Canvas used to generate image */}
          <canvas ref={canvasRef} className="hidden" />

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-white text-xs">
              <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <div className="flex items-center gap-1.5 font-bold text-amber-400">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>AI Sosyal Medya Görseli Oluşturuluyor...</span>
              </div>
              <p className="text-[11px] text-slate-400 max-w-xs text-center">
                Padel kortu, maç detayları ve slot kadrosu görsel karta işleniyor.
              </p>
            </div>
          ) : generatedImageUrl ? (
            <div className="relative group max-w-[340px] max-h-[460px] overflow-hidden rounded-2xl shadow-2xl border border-amber-500/40">
              <img
                src={generatedImageUrl}
                alt="AI Maç Önizleme Kartı"
                className="w-full h-auto object-contain rounded-2xl transition-transform group-hover:scale-[1.01]"
              />
              <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-xs text-[10px] font-black text-amber-400 border border-amber-500/30">
                {format === 'STORY' ? '9:16 Story' : '1:1 Post'}
              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-xs py-12">Önizleme hazırlanıyor...</div>
          )}
        </div>

        {/* AI Social Media Caption Box */}
        {aiCaption && (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>AI Tarafından Hazırlanan Paylaşım Metni:</span>
              </span>
              <button
                type="button"
                onClick={handleCopyCaption}
                className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copiedCaption ? <Check className="w-3 h-3 text-amber-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCaption ? 'Kopyalandı' : 'Metni Kopyala'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-mono select-all bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              {aiCaption}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!generatedImageUrl || loading}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Görseli İndir (PNG)</span>
          </button>

          <button
            type="button"
            onClick={handleNativeShare}
            disabled={!generatedImageUrl || loading}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Share2 className="w-4 h-4 text-amber-400" />
            <span>Sosyal Medyada Paylaş</span>
          </button>

          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp ile Paylaş</span>
          </button>
        </div>

        {/* Direct Link Copy Button */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleCopyLink}
            className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer py-1"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-amber-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Bağlantı Kopyalandı!' : 'Maç Bağlantısını Kopyala'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>

      </div>
    </Modal>
  );
};
