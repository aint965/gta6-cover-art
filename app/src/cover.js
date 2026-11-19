import { clamp, photoPlacement } from './layout.js';

const palettes = {
  sunset: ['#170e29', '#af466a', '#fa9063', '#ffe3a2'],
  neon: ['#0b112b', '#4b438c', '#ec5aa0', '#78ffef'],
  natural: ['#161321', '#544673', '#dc987b', '#ffe9c2'],
};

const treatments = {
  sunset: [
    [[34,13,44],[164,66,102],[255,219,147],.48],
    [[40,13,47],[224,75,109],[255,211,128],.62],
    [[16,20,58],[56,115,162],[205,250,227],.45],
    [[39,16,50],[223,62,117],[255,183,113],.59],
    [[23,15,47],[77,118,158],[255,183,158],.55],
  ],
  neon: [
    [[15,16,51],[151,52,162],[254,196,248],.56],
    [[20,19,59],[189,50,155],[255,165,214],.61],
    [[10,21,52],[38,118,153],[171,253,228],.54],
    [[28,13,52],[178,54,151],[255,184,222],.62],
    [[15,12,53],[59,89,186],[163,246,247],.60],
  ],
};

const imageCache = new WeakMap();

function gradedPhoto(image, grade, index) {
  if (grade === 'natural') return image;
  if (!imageCache.has(image)) imageCache.set(image, new Map());
  const cache = imageCache.get(image);
  const key = `${grade}:${index}`;
  if (cache.has(key)) return cache.get(key);
  const surface = document.createElement('canvas');
  const scale = Math.min(1, 1536 / Math.max(image.width, image.height));
  surface.width = Math.max(1, Math.round(image.width * scale));
  surface.height = Math.max(1, Math.round(image.height * scale));
  const ctx = surface.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, surface.width, surface.height);
  const pixels = ctx.getImageData(0, 0, surface.width, surface.height);
  const [shadow, mid, light, strength] = treatments[grade][index];
  const ramp = Array.from({ length: 256 }, (_, luma) => {
    const t = clamp((luma - 17) / 224, 0, 1);
    const [a, b, p] = t < .48 ? [shadow, mid, t / .48] : [mid, light, (t - .48) / .52];
    return a.map((channel, c) => channel + (b[c] - channel) * p);
  });
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round(.24 * data[i] + .64 * data[i + 1] + .12 * data[i + 2]);
    for (let c = 0; c < 3; c++) {
      const contrast = (luma - 128) * .19;
      data[i + c] = (data[i + c] + contrast) * (1 - strength) + ramp[luma][c] * strength;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  // Keep at most one grade per panel for each photo.
  for (const old of cache.keys()) if (old.endsWith(`:${index}`)) cache.delete(old);
  cache.set(key, surface);
  return surface;
}

function paintStockPanel(ctx, panel, palette, index) {
  const { x, y, w, h } = panel;
  const sky = ctx.createLinearGradient(x, y, x + w * .2, y + h);
  sky.addColorStop(0, palette[0]);
  sky.addColorStop(.52, palette[1]);
  sky.addColorStop(.79, palette[2]);
  sky.addColorStop(1, palette[0]);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const sunX = x + w * (index % 2 ? .35 : .64), sunY = y + h * .44;
  const radius = Math.min(w, h) * .24;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = palette[3];
  ctx.fillRect(sunX - radius, sunY - radius, 2 * radius, radius * 1.04);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(sunX - radius, sunY + i * radius * .22 + radius * .12, 2 * radius, radius * (.15 - i * .018));
  }
  ctx.restore();
  ctx.fillStyle = palette[0];
  for (let i = 0; i < 17; i++) {
    const rise = (.06 + (i * 7 % 11) * .016) * h;
    ctx.fillRect(x + i * w / 17, y + h * .75 - rise, w / (i % 2 ? 21 : 17), rise + h * .25);
  }
}

function paintPanel(ctx, panel, crop, photo, grade, index) {
  const { x, y, w, h } = panel;
  ctx.save();
  ctx.clip(panel.path);
  paintStockPanel(ctx, panel, palettes[grade], index);
  if (photo) {
    const placed = photoPlacement(photo, panel, crop);
    ctx.drawImage(gradedPhoto(photo, grade, index), placed.x, placed.y, placed.w, placed.h);
  }
  const shade = ctx.createLinearGradient(x, y, x + w * .25, y + h);
  shade.addColorStop(0, '#140b2633');
  shade.addColorStop(.32, '#140b2600');
  shade.addColorStop(.68, '#180a2920');
  shade.addColorStop(1, '#1a0c40a0');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function measuredLines(ctx, caption, size, maxWidth) {
  const maxLine = maxWidth / .89;
  const lines = [];
  ctx.font = `900 ${size}px Impact, 'Arial Black', 'DejaVu Sans', sans-serif`;
  for (const paragraph of caption.trim().toUpperCase().split(/\n/)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (line && ctx.measureText(`${line} ${word}`).width > maxLine * 1.35) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawCaption(ctx, w, h, settings, unit) {
  const maxWidth = w * (w > h * 1.3 ? .64 : .86);
  let size = unit * .187 * settings.typeSize / 100;
  const lines = measuredLines(ctx, settings.caption, size, maxWidth);
  if (!lines.length) return;
  size = Math.min(size, h * .47 / (lines.length * .82));
  ctx.font = `900 ${size}px Impact, 'Arial Black', 'DejaVu Sans', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const leading = size * .82;
  const baseY = h * (w > h * 1.3 ? .823 : .817);
  const gradientGlow = ctx.createRadialGradient(w / 2, baseY - leading * lines.length * .42, 0, w / 2, baseY - leading * lines.length * .42, w * .43);
  gradientGlow.addColorStop(0, '#28132cb8');
  gradientGlow.addColorStop(.48, '#2e143178');
  gradientGlow.addColorStop(1, '#170d2400');
  ctx.fillStyle = gradientGlow;
  ctx.fillRect(0, 0, w, h);
  lines.forEach((line, i) => {
    const width = ctx.measureText(line).width || 1;
    const scaleX = Math.min(.98, maxWidth / width);
    const y = baseY - (lines.length - i - 1) * leading;
    const flavor = settings.grade === 'neon' ? '#75f5e7' : '#ffb273';
    ctx.save();
    ctx.translate(w / 2, y);
    ctx.transform(scaleX, 0, -.145, 1, 0, 0);
    ctx.strokeStyle = settings.outline;
    if (settings.outlineWeight) {
      ctx.lineWidth = size * .13 * settings.outlineWeight;
      ctx.strokeText(line, size * .015, size * .082);
    }
    ctx.fillStyle = i % 2 ? '#823460' : '#92454e';
    ctx.fillText(line, size * .015, size * .065);
    if (settings.outlineWeight) {
      ctx.strokeText(line, 0, 0);
      ctx.lineWidth = size * .025 * settings.outlineWeight;
      ctx.strokeStyle = i % 2 ? '#ff8caf' : '#ffd293';
      ctx.strokeText(line, 0, 0);
    }
    const ink = ctx.createLinearGradient(0, -size * .76, 0, size * .022);
    ink.addColorStop(0, settings.ink);
    ink.addColorStop(.47, settings.ink);
    ink.addColorStop(.51, settings.ink);
    ink.addColorStop(1, i % 2 && settings.grade !== 'neon' ? '#ff88ad' : flavor);
    ctx.fillStyle = ink;
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
}

function drawFrame(ctx, w, h, unit, count, grade) {
  const rim = unit * .026;
  ctx.strokeStyle = '#120d1e';
  ctx.lineWidth = rim * 1.28;
  ctx.strokeRect(0, 0, w, h);
  const foil = ctx.createLinearGradient(0, 0, w, h);
  foil.addColorStop(0, '#ffda9a');
  foil.addColorStop(.46, '#a85a71');
  foil.addColorStop(1, grade === 'neon' ? '#81f7df' : '#f5a692');
  ctx.strokeStyle = foil;
  ctx.lineWidth = unit * .0017;
  ctx.strokeRect(rim * .6, rim * .6, w - rim * 1.2, h - rim * 1.2);
  ctx.strokeRect(rim, rim, w - rim * 2, h - rim * 2);

  const x = rim + unit * .028, y = rim + unit * .035;
  const tail = rim + unit * .037;
  ctx.font = `700 ${unit * .014}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const badge = 'SUNDOWN / PHOTO SERIES';
  const badgeWidth = ctx.measureText(badge).width + unit * .035;
  ctx.fillStyle = '#1b1126';
  ctx.fillRect(x, y - unit * .014, badgeWidth, unit * .029);
  ctx.fillStyle = '#ffdbad';
  ctx.fillText(badge, x + unit * .017, y + unit * .001);

  ctx.save();
  ctx.translate(w - tail, h - tail);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1b1126';
  ctx.fillRect(-unit * .16, -unit * .014, unit * .16, unit * .03);
  ctx.fillStyle = '#ffd9b2';
  ctx.fillText(`${String(count).padStart(2, '0')} FRAMES`, -unit * .016, unit * .002);
  ctx.restore();
}

function drawFlares(ctx, w, h, unit, grade) {
  const flare = grade === 'neon' ? '#aaffec' : '#ffe4aa';
  for (const [x, y, r] of [[.137,.667,.022],[.858,.572,.031],[.885,.545,.011],[.162,.708,.009]]) {
    ctx.save();
    ctx.translate(w * x, h * y);
    const radius = unit * r;
    ctx.fillStyle = flare;
    ctx.shadowColor = grade === 'neon' ? '#54fbe1' : '#ff527b';
    ctx.shadowBlur = radius * .72;
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.quadraticCurveTo(radius * .10, -radius * .12, radius * .78, 0);
    ctx.quadraticCurveTo(radius * .10, radius * .12, 0, radius);
    ctx.quadraticCurveTo(-radius * .10, radius * .12, -radius * .78, 0);
    ctx.quadraticCurveTo(-radius * .10, -radius * .12, 0, -radius);
    ctx.fill();
    ctx.restore();
  }
}

export function drawCover(canvas, panels, crops, photos, settings) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const { width: w, height: h } = canvas;
  const unit = Math.min(w, h);
  ctx.fillStyle = '#130d20';
  ctx.fillRect(0, 0, w, h);
  panels.forEach((panel, i) => paintPanel(ctx, panel, crops[i], photos[crops[i].photo]?.image, settings.grade, i));
  ctx.lineJoin = 'round';
  for (const panel of panels) {
    ctx.strokeStyle = '#160e23';
    ctx.lineWidth = unit * .011;
    ctx.stroke(panel.path);
    ctx.strokeStyle = settings.grade === 'neon' ? '#da83bd' : '#e29b79';
    ctx.lineWidth = unit * .0012;
    ctx.stroke(panel.path);
  }
  drawFlares(ctx, w, h, unit, settings.grade);
  drawCaption(ctx, w, h, settings, unit);
  drawFrame(ctx, w, h, unit, panels.length, settings.grade);
}
