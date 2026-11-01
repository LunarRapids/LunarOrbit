/** 共享纹理工具：载入图片、生成凹凸贴图与径向光晕。 */

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法载入纹理：${url}`));
    img.src = url;
  });
}

/**
 * 用月面反照率生成凹凸贴图：亮处凸起、暗色月海凹陷，
 * 让球面在掠射光下呈现环形山与月海的立体感。
 */
export function makeBumpCanvas(image, width = 1024, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);
  const d = frame.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (lum - 18) * 1.12));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

/** 生成一张径向渐变贴图，用于光晕 / 星芒 sprite。 */
export function radialGlowCanvas(size = 256, stops = null) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const list = stops || [
    [0, 'rgba(255,255,255,1)'],
    [0.12, 'rgba(255,244,222,0.92)'],
    [0.28, 'rgba(255,226,180,0.42)'],
    [0.55, 'rgba(255,214,160,0.12)'],
    [1, 'rgba(255,214,160,0)'],
  ];
  for (const [offset, color] of list) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
