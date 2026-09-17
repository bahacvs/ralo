/** Upload limit enforced by the server (bytes of the decoded image), with some headroom. */
const MAX_UPLOAD_BYTES = 650_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel okunamadı. Lütfen JPEG, PNG veya WebP bir fotoğraf seçin.'));
    };
    img.src = url;
  });
}

/**
 * Shrinks a photo in the browser (longest side maxSize px, JPEG) until it fits the upload limit and
 * returns it as a data URL. Phone camera photos of several MB end up around 200-400 KB.
 */
export async function resizeImageForUpload(file: File, maxSize = 1600): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Lütfen bir görsel dosyası seçin.');
  const img = await loadImage(file);
  let size = maxSize;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tarayıcınız görsel işlemeyi desteklemiyor.');
    ctx.fillStyle = '#ffffff'; // transparent PNGs become white instead of black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const bytes = Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
      if (bytes <= MAX_UPLOAD_BYTES) return dataUrl;
    }
    size = Math.round(size * 0.75);
  }
  throw new Error('Fotoğraf küçültülemedi. Lütfen daha küçük bir fotoğraf seçin.');
}
