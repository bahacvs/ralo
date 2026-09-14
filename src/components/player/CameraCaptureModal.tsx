import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, CameraOff, RotateCw, Check, X, RefreshCw, 
  Upload, AlertCircle, CheckCircle2, Sparkles, FlipHorizontal
} from 'lucide-react';
import { Modal } from '../common/Modal.js';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePhoto: (photoDataUrl: string) => Promise<void>;
  currentAvatarUrl?: string;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onSavePhoto,
  currentAvatarUrl
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [mirror, setMirror] = useState<boolean>(true);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const [shutterEffect, setShutterEffect] = useState<boolean>(false);

  // Stop media stream tracks
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  // Check if multiple camera devices exist
  const checkMultipleCameras = async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      }
    } catch {
      // ignore
    }
  };

  // Start camera stream
  const startCamera = useCallback(async () => {
    stopStream();
    setCameraError(null);
    setIsStarting(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsStarting(false);
      setCameraError('Tarayıcınız veya ortamınız kamera erişimini desteklemiyor. Alternatif olarak dosya yükleyebilirsiniz.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 720 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsStreaming(true);
            setIsStarting(false);
          }).catch(() => {
            setIsStreaming(true);
            setIsStarting(false);
          });
        };
      }
      checkMultipleCameras();
    } catch (err: any) {
      setIsStarting(false);
      setIsStreaming(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Kamera erişim izni verilmedi. Lütfen tarayıcınızın adres çubuğundaki kilit simgesinden kamera iznini onaylayın.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('Cihazınızda uygun bir kamera bulunamadı.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Kamera başka bir uygulama tarafından kullanılıyor olabilir.');
      } else {
        setCameraError('Kameraya erişilirken bir hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
      }
    }
  }, [facingMode, stopStream]);

  // Lifecycle control
  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setCameraError(null);
      startCamera();
    } else {
      stopStream();
      setCapturedImage(null);
      setCameraError(null);
    }

    return () => {
      stopStream();
    };
  }, [isOpen, startCamera, stopStream]);

  // Toggle between front and back camera
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    setMirror(nextMode === 'user');
  };

  // Capture current frame from video to canvas
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !isStreaming) return;

    // Trigger visual shutter flash
    setShutterEffect(true);
    setTimeout(() => setShutterEffect(false), 200);

    const canvas = canvasRef.current || document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 640;
    const size = Math.min(width, height);

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Center-crop the video frame to square for profile
    const startX = (width - size) / 2;
    const startY = (height - size) / 2;

    ctx.save();

    // Mirror if selfie camera and mirror is on
    if (facingMode === 'user' && mirror) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      video,
      startX,
      startY,
      size,
      size,
      0,
      0,
      size,
      size
    );
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);

    // Stop camera feed after photo is taken to save battery/bandwidth
    stopStream();
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  // Fallback file upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Lütfen 5MB\'dan küçük bir fotoğraf seçiniz.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCapturedImage(reader.result);
        stopStream();
      }
    };
    reader.readAsDataURL(file);
  };

  // Save the captured image as profile photo
  const handleConfirmSave = async () => {
    if (!capturedImage) return;

    setIsSaving(true);
    try {
      await onSavePhoto(capturedImage);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Profil fotoğrafı kaydedilemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopStream();
        onClose();
      }}
      title="Profil Fotoğrafı Çek"
      description="Cihazınızın kamerasını kullanarak anlık yeni profil fotoğrafı belirleyin."
      maxWidth="md"
    >
      <div className="space-y-4 pt-1">
        
        {/* Viewfinder / Preview Area */}
        <div className="relative w-full aspect-square max-w-[340px] mx-auto rounded-3xl overflow-hidden bg-slate-950 border-4 border-slate-800 dark:border-slate-700 shadow-lg flex items-center justify-center">
          
          {/* Shutter visual flash effect */}
          {shutterEffect && (
            <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-200 pointer-events-none" />
          )}

          {/* Captured Image Review Mode */}
          {capturedImage ? (
            <div className="relative w-full h-full">
              <img
                src={capturedImage}
                alt="Çekilen Profil Fotoğrafı"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-amber-500 text-slate-950 text-[11px] font-black px-2.5 py-1 rounded-xl backdrop-blur-xs flex items-center gap-1 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Fotoğraf Hazır</span>
              </div>
            </div>
          ) : cameraError ? (
            /* Error Fallback View */
            <div className="p-6 text-center text-slate-300 space-y-3 z-10">
              <div className="w-12 h-12 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-400 mx-auto flex items-center justify-center">
                <CameraOff className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-rose-300">Kamera Açılamadı</p>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-[260px] mx-auto">
                  {cameraError}
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2 max-w-[220px] mx-auto">
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Yeniden Dene</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Galeriden / Dosya Seç</span>
                </button>
              </div>
            </div>
          ) : (
            /* Live Camera Stream View */
            <div className="relative w-full h-full flex items-center justify-center">
              {isStarting && (
                <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center text-slate-300 gap-2">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-medium">Kamera başlatılıyor...</span>
                </div>
              )}

              {/* Hidden Canvas for capture processing */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Live Video Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-transform ${
                  facingMode === 'user' && mirror ? '-scale-x-100' : 'scale-x-100'
                }`}
              />

              {/* Face Target Silhouette Guide */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Oval face guide */}
                <div className="w-56 h-72 rounded-[45%] border-2 border-dashed border-white/60 shadow-2xl flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/40" />
                </div>
                {/* Crosshair accents */}
                <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-white/70" />
                <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-white/70" />
                <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-white/70" />
                <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-white/70" />
              </div>

              {/* Quick in-viewfinder controls */}
              <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                {facingMode === 'user' && (
                  <button
                    type="button"
                    onClick={() => setMirror(!mirror)}
                    title={mirror ? 'Aynalama Açık (Kapat)' : 'Aynalama Kapalı (Aç)'}
                    className="w-9 h-9 rounded-xl bg-slate-900/70 hover:bg-slate-900 text-white backdrop-blur-md flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                  >
                    <FlipHorizontal className={`w-4 h-4 ${mirror ? 'text-amber-400' : 'text-slate-300'}`} />
                  </button>
                )}

                {hasMultipleCameras && (
                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    title="Kamerayı Değiştir (Ön/Arka)"
                    className="w-9 h-9 rounded-xl bg-slate-900/70 hover:bg-slate-900 text-white backdrop-blur-md flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="absolute bottom-3 left-3 right-3 text-center pointer-events-none">
                <span className="text-[10px] font-medium text-white/90 bg-slate-950/60 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/10">
                  Yüzünüzü kılavuzun içine hizalayın
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Hidden File Input for fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Bottom Control Action Bar */}
        <div className="pt-2">
          {capturedImage ? (
            /* Review Actions */
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRetake}
                disabled={isSaving}
                className="flex-1 min-h-[46px] px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Yeniden Çek</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="flex-1 min-h-[46px] px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Profil Fotoğrafı Yap</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Live Camera Capture Actions */
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-4 w-full">
                
                {/* Secondary upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Galeriden Seç"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Galeriden Seç</span>
                </button>

                {/* Primary Shutter Button */}
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={!isStreaming || isStarting}
                  aria-label="Fotoğrafı Çek"
                  className={`w-16 h-16 rounded-full border-4 border-amber-500 bg-white dark:bg-slate-900 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group hover:ring-4 hover:ring-amber-200 dark:hover:ring-amber-950`}
                >
                  <div className="w-12 h-12 rounded-full bg-amber-500 group-hover:bg-amber-400 transition-colors flex items-center justify-center">
                    <Camera className="w-6 h-6 text-slate-950" />
                  </div>
                </button>

                {/* Camera Flip (if device has front/back) or Close */}
                {hasMultipleCameras ? (
                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    title="Kamerayı Çevir"
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span className="hidden sm:inline">Kamerayı Çevir</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      stopStream();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>İptal</span>
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                Net bir açı yakaladığınızda ortadaki kamera butonuna basın.
              </p>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
};
