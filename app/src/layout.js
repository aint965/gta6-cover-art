export const formats = { wide: [1920, 1080], portrait: [1080, 1350], square: [1080, 1080] };

const cuts = {
  wide: [
    [[0,0],[.365,0],[.307,1],[0,1]],
    [[.365,0],[.694,0],[.665,.53],[.334,.59]],
    [[.694,0],[1,0],[1,.58],[.665,.53]],
    [[.334,.59],[.665,.53],[.638,1],[.307,1]],
    [[.665,.53],[1,.58],[1,1],[.638,1]],
  ],
  tall: [
    [[0,0],[.598,0],[.538,.47],[0,.54]],
    [[.598,0],[1,0],[1,.305],[.563,.275]],
    [[.563,.275],[1,.305],[1,.60],[.538,.47]],
    [[0,.54],[.538,.47],[.596,1],[0,1]],
    [[.538,.47],[1,.60],[1,1],[.596,1]],
  ],
};

const strips = [
  [[0,0],[.347,0],[.294,1],[0,1]],
  [[.347,0],[.704,0],[.651,1],[.294,1]],
  [[.704,0],[1,0],[1,1],[.651,1]],
];

const grid = [
  [[0,0],[.56,0],[.505,.505],[0,.58]],
  [[.56,0],[1,0],[1,.431],[.505,.505]],
  [[0,.58],[.505,.505],[.451,1],[0,1]],
  [[.505,.505],[1,.431],[1,1],[.451,1]],
];

export const names = {
  cut: ['Lead', 'Vista', 'Coast', 'Detail', 'Finale'],
  strip: ['Left', 'Center', 'Right'],
  grid: ['Upper left', 'Upper right', 'Lower left', 'Lower right'],
};

export function makePanels(layout, format) {
  const [width, height] = formats[format];
  const rim = Math.min(width, height) * .026;
  const polygons = layout === 'cut' ? cuts[format === 'wide' ? 'wide' : 'tall'] : layout === 'strip' ? strips : grid;
  return polygons.map((polygon) => {
    const points = polygon.map(([x, y]) => [rim + x * (width - 2 * rim), rim + y * (height - 2 * rim)]);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const x = Math.min(...xs), y = Math.min(...ys);
    const path = new Path2D();
    points.forEach(([px, py], i) => i ? path.lineTo(px, py) : path.moveTo(px, py));
    path.closePath();
    return { points, path, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  });
}

export const freshCrop = (photo = 0) => ({ photo, zoom: 1, x: 0, y: 0 });
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function photoPlacement(image, panel, crop) {
  const scale = Math.max(panel.w / image.width, panel.h / image.height) * crop.zoom;
  const w = image.width * scale, h = image.height * scale;
  const rangeX = Math.max(0, (w - panel.w) / 2), rangeY = Math.max(0, (h - panel.h) / 2);
  return { w, h, rangeX, rangeY, x: panel.x - rangeX + rangeX * crop.x, y: panel.y - rangeY + rangeY * crop.y };
}
