import { drawCover } from './cover.js';
import { clamp, formats, freshCrop, makePanels, names, photoPlacement } from './layout.js';

const byId = (id) => document.getElementById(id);
const canvas = byId('cover');
const size = byId('size');
const stage = byId('stage');
const artboard = canvas.parentElement;
const library = byId('library');
const picker = byId('photo');
const upload = document.querySelector('.upload');
const panelSelect = byId('panel');
const zoom = byId('zoom');
const zoomValue = byId('zoom-value');
const reset = byId('reset');
const exportButton = byId('export');
const sampleButton = byId('demo');
const status = byId('status');
const caption = byId('caption');
const grade = byId('grade');
const ink = byId('ink');
const outline = byId('outline');
const outlineWeight = byId('outline-weight');
const typeSize = byId('type-size');

let layout = 'cut';
let panels = [];
let photos = [];
let selected = 0;
let cropsByLayout = {};
let drag = null;
let guideTimer;
let drawPending = false;
let exporting = false;
let loading = false;

const activeCrops = () => cropsByLayout[layout] ??= panels.map((_, i) => freshCrop(i % Math.max(1, photos.length)));

function paint() {
  drawCover(canvas, panels, activeCrops(), photos, {
    caption: caption.value, grade: grade.value, ink: ink.value, outline: outline.value,
    typeSize: Number(typeSize.value), outlineWeight: Number(outlineWeight.value) / 100,
  });
}

function redraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    paint();
  });
}

function fitStage() {
  const inset = stage.clientWidth < 600 ? 24 : 52;
  const width = Math.min(stage.clientWidth - inset, (stage.clientHeight - 42) * canvas.width / canvas.height);
  artboard.style.setProperty('--art-width', `${Math.max(1, width)}px`);
}

function syncCropControls() {
  const crop = activeCrops()[selected];
  panelSelect.value = selected;
  zoom.value = crop.zoom;
  zoomValue.value = `${crop.zoom.toFixed(2)}×`;
  zoom.disabled = reset.disabled = !photos[crop.photo];
  for (const button of library.children) {
    button.setAttribute('aria-pressed', Number(button.dataset.photo) === crop.photo);
  }
  const points = panels[selected].points.map(([x, y]) => `${1000 * x / canvas.width},${1000 * y / canvas.height}`);
  byId('crop-guide').firstElementChild.setAttribute('points', points.join(' '));
}

function clearGuide() {
  clearTimeout(guideTimer);
  artboard.classList.remove('mark');
}

function showGuide(hold = false) {
  clearTimeout(guideTimer);
  artboard.classList.add('mark');
  if (!hold) guideTimer = setTimeout(clearGuide, 850);
}

function changeGeometry() {
  const [width, height] = formats[size.value];
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  panels = makePanels(layout, size.value);
  selected = Math.min(selected, panels.length - 1);
  panelSelect.replaceChildren(...names[layout].map((name, i) => new Option(`${String(i + 1).padStart(2, '0')} · ${name}`, i)));
  byId('dimensions').textContent = `${width} × ${height} PX`;
  fitStage();
  syncCropControls();
  clearGuide();
  redraw();
}

function rebuildLibrary() {
  library.replaceChildren(...photos.map(({ name, src }, i) => {
    const button = document.createElement('button');
    const thumb = document.createElement('img');
    thumb.src = src;
    thumb.alt = '';
    button.dataset.photo = i;
    button.title = name;
    button.setAttribute('aria-label', `Use ${name} in the selected panel`);
    button.append(thumb);
    return button;
  }));
  syncCropControls();
  exportButton.disabled = exporting || !photos.length;
}

async function decodePhoto(src, name, local = false) {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    if (!image.width || !image.height) throw new Error('Empty image');
    return { src, name, image };
  } catch (error) {
    if (local) URL.revokeObjectURL(src);
    throw error;
  }
}

function startLoading() {
  loading = true;
  picker.disabled = sampleButton.disabled = true;
  status.textContent = 'Loading photos…';
}

function finishLoading() {
  loading = false;
  picker.disabled = sampleButton.disabled = false;
}

async function addPhotos(files) {
  if (loading || !files.length) return;
  startLoading();
  try {
    const results = await Promise.allSettled(files.map((file) => decodePhoto(URL.createObjectURL(file), file.name, true)));
    const added = results.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);
    if (added.length) {
      const first = photos.length;
      const slots = activeCrops();
      photos.push(...added);
      if (first === 0 || added.length > 1) {
        // Rotate assignments from the chosen panel, so subsequent batches can replace a full spread.
        slots.forEach((_, i) => { slots[(selected + i) % slots.length] = freshCrop(first + i % added.length); });
      } else {
        slots[selected] = freshCrop(first);
      }
      rebuildLibrary();
      redraw();
    }
    const skipped = results.length - added.length;
    status.textContent = skipped ? `${skipped} ${skipped === 1 ? 'file could' : 'files could'} not be opened as an image.` : 'Photos ready. Select a panel to reframe it.';
  } finally {
    finishLoading();
  }
}

const sampleCrops = {
  wide: [[0,1.03,-.56,0],[0,2.72,1,.67],[1,1.02,.1,.9],[0,1.68,.94,-.94],[1,1.85,-1,.25]],
  tall: [[0,1.02,-.45,.89],[0,2.65,1,.71],[1,1.28,.85,.96],[0,1.52,.86,-.85],[1,1.54,-.9,.12]],
};

async function loadSamples() {
  if (loading) return;
  startLoading();
  try {
    const ids = [];
    for (const [src, name] of [['./samples/boulevard.jpg', 'Boulevard'], ['./samples/pier.jpg', 'Pier']]) {
      let id = photos.findIndex((photo) => photo.src === src);
      if (id === -1) {
        const sample = await decodePhoto(src, name);
        id = photos.push(sample) - 1;
      }
      ids.push(id);
    }
    const slots = activeCrops();
    slots.forEach((_, index) => { slots[index] = freshCrop(ids[index % ids.length]); });
    if (layout === 'cut') {
      const preset = sampleCrops[size.value === 'wide' ? 'wide' : 'tall'];
      cropsByLayout.cut = preset.map(([photo, zoom, x, y]) => ({ photo: ids[photo], zoom, x, y }));
    }
    rebuildLibrary();
    clearGuide();
    redraw();
    status.textContent = 'Sample photos ready. Click any panel to edit its crop.';
  } catch {
    status.textContent = 'Could not open the sample photos.';
  } finally {
    finishLoading();
  }
}

function panPanel(dx, dy) {
  const crop = activeCrops()[selected];
  const image = photos[crop.photo]?.image;
  if (!image) return;
  const placed = photoPlacement(image, panels[selected], crop);
  if (placed.rangeX > .01) crop.x = clamp(crop.x + dx / placed.rangeX, -1, 1);
  if (placed.rangeY > .01) crop.y = clamp(crop.y + dy / placed.rangeY, -1, 1);
  redraw();
}

function pointerOnCanvas(event) {
  const box = canvas.getBoundingClientRect();
  return [(event.clientX - box.left) * canvas.width / box.width, (event.clientY - box.top) * canvas.height / box.height];
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || drag) return;
  const [x, y] = pointerOnCanvas(event);
  const ctx = canvas.getContext('2d');
  const index = panels.findIndex((panel) => ctx.isPointInPath(panel.path, x, y));
  if (index < 0) return;
  selected = index;
  syncCropControls();
  showGuide(true);
  drag = { x, y, id: event.pointerId };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return;
  const [x, y] = pointerOnCanvas(event);
  panPanel(x - drag.x, y - drag.y);
  Object.assign(drag, { x, y });
});

canvas.addEventListener('lostpointercapture', () => {
  drag = null;
  showGuide();
});

canvas.addEventListener('keydown', (event) => {
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!moves[event.key]) return;
  event.preventDefault();
  const [x, y] = moves[event.key];
  const step = event.shiftKey ? 40 : 12;
  showGuide();
  panPanel(x * step, y * step);
});

library.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const index = Number(button.dataset.photo);
  if (activeCrops()[selected].photo !== index) activeCrops()[selected] = freshCrop(index);
  syncCropControls();
  showGuide();
  redraw();
});

picker.addEventListener('change', () => {
  const files = Array.from(picker.files);
  picker.value = '';
  addPhotos(files);
});

upload.addEventListener('dragover', (event) => {
  event.preventDefault();
  upload.classList.add('over');
});
upload.addEventListener('dragleave', () => upload.classList.remove('over'));
upload.addEventListener('drop', (event) => {
  event.preventDefault();
  upload.classList.remove('over');
  addPhotos(Array.from(event.dataTransfer.files));
});

sampleButton.addEventListener('click', loadSamples);
size.addEventListener('change', changeGeometry);
for (const button of byId('layouts').querySelectorAll('button')) {
  button.addEventListener('click', () => {
    layout = button.dataset.layout;
    for (const peer of button.parentNode.children) peer.setAttribute('aria-pressed', peer === button);
    changeGeometry();
  });
}
for (const control of [caption, grade, ink, outline, outlineWeight, typeSize]) control.addEventListener('input', redraw);
panelSelect.addEventListener('change', () => {
  selected = Number(panelSelect.value);
  syncCropControls();
  showGuide();
});
zoom.addEventListener('input', () => {
  activeCrops()[selected].zoom = Number(zoom.value);
  syncCropControls();
  showGuide();
  redraw();
});
reset.addEventListener('click', () => {
  activeCrops()[selected] = freshCrop(activeCrops()[selected].photo);
  syncCropControls();
  showGuide();
  redraw();
});

exportButton.addEventListener('click', () => {
  if (exporting) return;
  exporting = true;
  exportButton.disabled = true;
  clearGuide();
  paint();
  const filename = `sundown-${canvas.width}x${canvas.height}.png`;
  canvas.toBlob((blob) => {
    exporting = false;
    exportButton.disabled = false;
    if (!blob) {
      status.textContent = 'Could not save the PNG. Please try again.';
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    status.textContent = `Saved ${filename}`;
  }, 'image/png');
});

new ResizeObserver(fitStage).observe(stage);
const demo = new URLSearchParams(location.search).get('demo');
if (demo === 'neon') {
  size.value = 'portrait';
  grade.value = 'neon';
  ink.value = '#fff1ea';
  caption.value = 'PIER\nPRESSURE';
}
changeGeometry();
if (demo === 'sunburn' || demo === 'neon') loadSamples();
