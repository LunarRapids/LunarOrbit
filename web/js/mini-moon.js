import { loadImage } from './textures.js';

const DEG = Math.PI / 180;

let sprite = null;
// HeroMoon 渲染的 640px 满月中，月面直径约占 582px
const CROP = { x: 29, y: 29, w: 582, h: 582 };

export async function setMiniSprite(url) {
  sprite = await loadImage(url);
}

/**
 * 在 2D 画布上绘制带真实纹理的迷你月相。
 * 月面贴图取自 3D 满月渲染，再用柔和的明暗界线遮罩出相位。
 */
export function drawMiniMoon(canvas, angleDeg, size) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.455;
  const angle = ((angleDeg % 360) + 360) % 360;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (sprite) {
    ctx.drawImage(sprite, CROP.x, CROP.y, CROP.w, CROP.h, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#cfc6b8';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();

  const waxing = angle < 180;
  const a = Math.cos(angle * DEG);
  const mirror = waxing ? 1 : -1;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, waxing);
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const t = Math.PI / 2 - (i / steps) * Math.PI;
    const x = cx + mirror * a * r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(5, 8, 16, 0.9)';
  ctx.filter = 'blur(0.6px)';
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 241, 218, 0.09)';
  ctx.lineWidth = Math.max(0.5, size * 0.008);
  ctx.stroke();
}
