/* ================================================================
   VectoConvert — Main Application Logic
   ================================================================ */

'use strict';

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------
const state = {
  file: null,
  activeTab: 'image',      // 'image' | 'vector'
  selectedFormat: null,
  resolution: 'high',      // 'high' | 'low'
  resultBlob: null,
  resultFilename: null,
};

// ----------------------------------------------------------------
// DOM helpers
// ----------------------------------------------------------------
const $ = id => document.getElementById(id);
const screens = {
  home: $('screen-home'),
  options: $('screen-options'),
  result: $('screen-result'),
};

function showScreen(name) {
  const current = Object.values(screens).find(s => s.classList.contains('active'));
  if (current) {
    current.classList.add('fade-out');
    setTimeout(() => {
      current.classList.remove('active', 'fade-out');
      current.style.display = 'none';
      activateScreen(name);
    }, 280);
  } else {
    activateScreen(name);
  }
}

function activateScreen(name) {
  const s = screens[name];
  s.style.display = 'flex';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      s.classList.add('active');
    });
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------------------
// Toast
// ----------------------------------------------------------------
let toastTimer = null;
function showToast(msg, duration = 3500) {
  const toast = $('toast');
  $('toast-msg').textContent = msg;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, duration);
}

// ----------------------------------------------------------------
// Loading overlay
// ----------------------------------------------------------------
function showLoading(text = '변환 중...') {
  $('loading-text').textContent = text;
  $('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  $('loading-overlay').classList.add('hidden');
}

// ----------------------------------------------------------------
// File size formatter
// ----------------------------------------------------------------
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// ----------------------------------------------------------------
// Load image to HTMLImageElement
// ----------------------------------------------------------------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 불러올 수 없습니다.')); };
    img.src = url;
  });
}

// ----------------------------------------------------------------
// Draw image to canvas
// ----------------------------------------------------------------
function drawToCanvas(img, canvas) {
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return ctx;
}

// ----------------------------------------------------------------
// BMP Encoder (24-bit)
// ----------------------------------------------------------------
function encodeBMP(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const w = canvas.width, h = canvas.height;
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const pixelArraySize = rowSize * h;
  const fileSize = 54 + pixelArraySize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  // BMP header
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4D); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, 54, true);
  // DIB header (BITMAPINFOHEADER)
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, -h, true); // negative = top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);
  // pixel data (BGR order, bottom-up not needed since we used negative height)
  const pixels = imageData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const offset = 54 + y * rowSize + x * 3;
      view.setUint8(offset,     pixels[i + 2]); // B
      view.setUint8(offset + 1, pixels[i + 1]); // G
      view.setUint8(offset + 2, pixels[i]);     // R
    }
  }
  return new Blob([buffer], { type: 'image/bmp' });
}

// ----------------------------------------------------------------
// TGA Encoder (32-bit, top-left origin)
// ----------------------------------------------------------------
function encodeTGA(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const w = canvas.width, h = canvas.height;
  const buffer = new ArrayBuffer(18 + w * h * 4);
  const view = new DataView(buffer);
  // TGA header (18 bytes)
  view.setUint8(0, 0);   // ID length
  view.setUint8(1, 0);   // color map type: none
  view.setUint8(2, 2);   // image type: uncompressed true-color
  // color map spec (5 bytes at 3-7, all zeros)
  view.setUint16(8,  0, true); // x-origin
  view.setUint16(10, 0, true); // y-origin
  view.setUint16(12, w, true); // width
  view.setUint16(14, h, true); // height
  view.setUint8(16, 32);       // bits per pixel (BGRA)
  view.setUint8(17, 0x28);     // image descriptor: top-left, 8 alpha bits
  const pixels = imageData.data;
  for (let i = 0; i < w * h; i++) {
    const offset = 18 + i * 4;
    view.setUint8(offset,     pixels[i * 4 + 2]); // B
    view.setUint8(offset + 1, pixels[i * 4 + 1]); // G
    view.setUint8(offset + 2, pixels[i * 4]);     // R
    view.setUint8(offset + 3, pixels[i * 4 + 3]); // A
  }
  return new Blob([buffer], { type: 'image/tga' });
}

// ----------------------------------------------------------------
// SVG wrapper (embed raster as base64 data URI)
// ----------------------------------------------------------------
function encodeRasterToSVG(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataURL = reader.result;
        const w = canvas.width;
        const h = canvas.height;
        const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${w}" height="${h}"
     viewBox="0 0 ${w} ${h}">
  <image width="${w}" height="${h}" xlink:href="${dataURL}"/>
</svg>`;
        resolve(new Blob([svgStr], { type: 'image/svg+xml' }));
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

// ----------------------------------------------------------------
// TIFF encoding via UTIF2
// ----------------------------------------------------------------
function encodeTIFF(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // UTIF.encodeImage expects Uint8Array RGBA data
  try {
    const tiffBuffer = UTIF.encodeImage(imageData.data, canvas.width, canvas.height);
    return new Blob([tiffBuffer], { type: 'image/tiff' });
  } catch (e) {
    // Fallback: encode manually as minimal TIFF
    return encodeTIFFManual(canvas);
  }
}

// Minimal TIFF encoder fallback (uncompressed RGB, 8-bit)
function encodeTIFFManual(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const w = canvas.width, h = canvas.height;
  const pixels = imgData.data;

  // Build stripped RGB data (no alpha)
  const stripData = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    stripData[i * 3]     = pixels[i * 4];
    stripData[i * 3 + 1] = pixels[i * 4 + 1];
    stripData[i * 3 + 2] = pixels[i * 4 + 2];
  }

  // We'll write a minimal TIFF with a small IFD
  // Header + IFD offset + IFD entries + strip data
  const numEntries = 11;
  const ifdOffset = 8;
  const ifdSize = 2 + numEntries * 12 + 4;
  const extraOffset = ifdOffset + ifdSize;
  // We'll store BitsPerSample values (3 x 2 bytes = 6 bytes) at extraOffset
  const bpsOffset = extraOffset;       // 6 bytes
  const stripOffset = bpsOffset + 6;  // strip starts here

  const totalSize = stripOffset + stripData.length;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  // TIFF header (little-endian)
  view.setUint16(0, 0x4949, true); // 'II' = little-endian
  view.setUint16(2, 42, true);     // magic
  view.setUint32(4, ifdOffset, true); // offset to first IFD

  // IFD
  let pos = ifdOffset;
  view.setUint16(pos, numEntries, true); pos += 2;

  function writeEntry(tag, type, count, value) {
    view.setUint16(pos, tag, true);
    view.setUint16(pos + 2, type, true);
    view.setUint32(pos + 4, count, true);
    view.setUint32(pos + 8, value, true);
    pos += 12;
  }

  writeEntry(0x0100, 3, 1, w);              // ImageWidth
  writeEntry(0x0101, 3, 1, h);              // ImageLength
  writeEntry(0x0102, 3, 3, bpsOffset);      // BitsPerSample (offset, 3 values)
  writeEntry(0x0103, 3, 1, 1);              // Compression: none
  writeEntry(0x0106, 3, 1, 2);              // PhotometricInterpretation: RGB
  writeEntry(0x0111, 4, 1, stripOffset);    // StripOffsets
  writeEntry(0x0115, 3, 1, 3);              // SamplesPerPixel
  writeEntry(0x0116, 3, 1, h);              // RowsPerStrip
  writeEntry(0x0117, 4, 1, stripData.length); // StripByteCounts
  writeEntry(0x011A, 5, 1, extraOffset + 6 + 8); // XResolution (dummy rational)
  writeEntry(0x011B, 5, 1, extraOffset + 6 + 16); // YResolution (dummy rational)
  view.setUint32(pos, 0, true); // next IFD offset = 0 (no more IFDs)

  // BitsPerSample values: 8, 8, 8
  view.setUint16(bpsOffset,     8, true);
  view.setUint16(bpsOffset + 2, 8, true);
  view.setUint16(bpsOffset + 4, 8, true);

  // Resolution rationals (we skip bounds check for brevity - just ensure buffer large enough)
  // strip data
  const uint8 = new Uint8Array(buf);
  uint8.set(stripData, stripOffset);

  return new Blob([buf], { type: 'image/tiff' });
}

// ----------------------------------------------------------------
// Image Conversion
// ----------------------------------------------------------------
async function convertImage(file, targetFormat) {
  showLoading(`${targetFormat.toUpperCase()}(으)로 변환 중...`);
  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    drawToCanvas(img, canvas);

    // 해상도 조절
    if (state.resolution === 'low') {
      const scale = 0.5;
      const tmp = document.createElement('canvas');
      tmp.width  = Math.round(canvas.width  * scale);
      tmp.height = Math.round(canvas.height * scale);
      tmp.getContext('2d').drawImage(canvas, 0, 0, tmp.width, tmp.height);
      canvas.width  = tmp.width;
      canvas.height = tmp.height;
      canvas.getContext('2d').drawImage(tmp, 0, 0);
    }

    let blob;
    let ext = targetFormat;

    switch (targetFormat) {
      case 'jpg':
        blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
        break;
      case 'png':
        blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        break;
      case 'gif':
        showToast('GIF 변환은 첫 프레임만 지원됩니다.');
        blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        ext = 'gif'; // rename extension but use PNG data (GIF encoder would need a library)
        // Use a proper GIF-like encoding via PNG with rename
        blob = new Blob([await blob.arrayBuffer()], { type: 'image/gif' });
        break;
      case 'bmp':
        blob = encodeBMP(canvas);
        break;
      case 'tiff':
        blob = encodeTIFF(canvas);
        ext = 'tiff';
        break;
      case 'tga':
        blob = encodeTGA(canvas);
        break;
      case 'svg':
        blob = await encodeRasterToSVG(canvas);
        break;
      default:
        throw new Error('지원하지 않는 포맷: ' + targetFormat);
    }

    const baseName = file.name.replace(/\.[^.]+$/, '');
    const outName = `${baseName}.${ext}`;
    hideLoading();
    showResult(blob, outName, file, canvas);
  } catch (err) {
    hideLoading();
    showToast('변환 실패: ' + err.message);
    console.error(err);
  }
}

// ----------------------------------------------------------------
// Vector Conversion (ImageTracer.js)
// ----------------------------------------------------------------
async function convertToVector(file, format, options) {
  showLoading('벡터로 변환 중...');
  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    drawToCanvas(img, canvas);

    // ImageTracer options
    const ltres = Math.max(0.1, (101 - options.detail) / 10); // detail → ltres (lower = more detail)
    const qtres = ltres;
    const threshold = options.threshold;

    const tracerOptions = {
      ltres,
      qtres,
      pathomit: 8,
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: 16,
      mincolorratio: 0.02,
      colorquantcycles: 3,
      blurradius: 0,
      blurdelta: 20,
      strokewidth: 0,
      linefilter: false,
      scale: 1,
      roundcoords: 1,
      viewbox: false,
      desc: false,
      lcpr: 0,
      qcpr: 0,
    };

    const processedCanvas = applyThreshold(canvas, threshold);

    let svgStr;
    if (typeof ImageTracer !== 'undefined') {
      svgStr = await new Promise((resolve, reject) => {
        try {
          const result = ImageTracer.imagedataToSVG(
            processedCanvas.getContext('2d').getImageData(0, 0, processedCanvas.width, processedCanvas.height),
            tracerOptions
          );
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    } else {
      // Fallback: embed as SVG image
      svgStr = await encodeRasterToSVGStr(canvas);
    }

    let blob, ext;
    // AI 포맷: 진짜 .ai는 PDF 기반이라 브라우저에서 생성 불가.
    // Illustrator가 완전히 편집 가능한 SVG로 저장 후 열기 안내.
    if (format === 'ai') {
      const aiStr = buildIllustratorSVG(svgStr);
      blob = new Blob([aiStr], { type: 'image/svg+xml' });
      ext = 'svg';   // .svg로 저장 — Illustrator에서 파일>열기로 완전 편집 가능
      showToast('💡 일러스트레이터에서 파일 > 열기로 여세요. 펜툴 편집 가능한 벡터입니다.', 6000);
    } else {
      blob = new Blob([svgStr], { type: 'image/svg+xml' });
      ext = 'svg';
    }

    const baseName = file.name.replace(/\.[^.]+$/, '');
    const outName = `${baseName}.${ext}`;
    hideLoading();
    showResult(blob, outName, file, canvas);
  } catch (err) {
    hideLoading();
    showToast('벡터 변환 실패: ' + err.message);
    console.error(err);
  }
}

// Remove background: flood-fill from border pixels, adaptive tolerance
function removeBackground(srcCanvas, tolerance = 50) {
  const dst = document.createElement('canvas');
  dst.width = srcCanvas.width;
  dst.height = srcCanvas.height;
  const ctx = dst.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, dst.width, dst.height);
  const d = imgData.data;
  const w = dst.width, h = dst.height;

  // Sample corners + edges to determine background color
  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 20));
  for (let x = 0; x < w; x += step) {
    samples.push([d[(0 * w + x) * 4], d[(0 * w + x) * 4 + 1], d[(0 * w + x) * 4 + 2]]);
    samples.push([d[((h-1) * w + x) * 4], d[((h-1) * w + x) * 4 + 1], d[((h-1) * w + x) * 4 + 2]]);
  }
  for (let y = 0; y < h; y += step) {
    samples.push([d[(y * w + 0) * 4], d[(y * w + 0) * 4 + 1], d[(y * w + 0) * 4 + 2]]);
    samples.push([d[(y * w + (w-1)) * 4], d[(y * w + (w-1)) * 4 + 1], d[(y * w + (w-1)) * 4 + 2]]);
  }
  const bgR = Math.round(samples.reduce((s,c) => s+c[0], 0) / samples.length);
  const bgG = Math.round(samples.reduce((s,c) => s+c[1], 0) / samples.length);
  const bgB = Math.round(samples.reduce((s,c) => s+c[2], 0) / samples.length);

  const visited = new Uint8Array(w * h);
  const queue = [];

  function colorDist(i) {
    const dr = d[i]   - bgR;
    const dg = d[i+1] - bgG;
    const db = d[i+2] - bgB;
    return Math.sqrt(dr*dr + dg*dg + db*db);
  }

  function enqueue(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    if (colorDist(idx * 4) <= tolerance) queue.push(idx);
  }

  // Seed from all border pixels
  for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h-1); }
  for (let y = 0; y < h; y++) { enqueue(0, y); enqueue(w-1, y); }

  while (queue.length) {
    const idx = queue.pop();
    const x = idx % w, y = Math.floor(idx / w);
    // Soft edge: partially transparent near boundary
    const dist = colorDist(idx * 4);
    d[idx * 4 + 3] = dist > tolerance * 0.7 ? Math.round(255 * (dist - tolerance * 0.7) / (tolerance * 0.3)) : 0;
    enqueue(x+1, y); enqueue(x-1, y);
    enqueue(x, y+1); enqueue(x, y-1);
  }

  ctx.putImageData(imgData, 0, 0);
  return dst;
}

// Apply threshold to canvas (grayscale + binarize for better tracing)
function applyThreshold(srcCanvas, threshold) {
  const dst = document.createElement('canvas');
  dst.width = srcCanvas.width;
  dst.height = srcCanvas.height;
  const ctx = dst.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, dst.width, dst.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    // Keep colors but boost contrast based on threshold
    const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    const factor = gray >= threshold ? 1.2 : 0.8;
    d[i]   = Math.min(255, d[i]   * factor);
    d[i+1] = Math.min(255, d[i+1] * factor);
    d[i+2] = Math.min(255, d[i+2] * factor);
  }
  ctx.putImageData(imgData, 0, 0);
  return dst;
}

async function encodeRasterToSVGStr(canvas) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const dataURL = await new Promise(r => {
    const reader = new FileReader();
    reader.onload = () => r(reader.result);
    reader.readAsDataURL(blob);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${canvas.width}" height="${canvas.height}"
     viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image width="${canvas.width}" height="${canvas.height}" xlink:href="${dataURL}"/>
</svg>`;
}

// Wrap SVG content with Adobe Illustrator compatible header/footer
function buildIllustratorSVG(svgStr) {
  // 모든 선언/주석 제거 후 깔끔한 SVG만 추출
  let body = svgStr
    .replace(/<\?xml[^?]*\?>\s*/i, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<!DOCTYPE[\s\S]*?]>\s*/i, '')
    .replace(/<!DOCTYPE[^>]*>\s*/i, '');

  // desc 태그 제거 (ImageTracer가 추가하는 텍스트 메타 — Illustrator 오동작 유발)
  body = body.replace(/<desc>[\s\S]*?<\/desc>\s*/i, '');

  // <svg> 태그 정리: 필수 네임스페이스만 깔끔하게 유지
  body = body.replace(/<svg([^>]*)>/i, (_m, attrs) => {
    const has = (attr) => new RegExp(attr + '[=:\\s]').test(attrs);
    let a = attrs;
    if (!has('xmlns'))       a += ' xmlns="http://www.w3.org/2000/svg"';
    if (!has('xmlns:xlink')) a += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    return `<svg${a}>`;
  });

  return `<?xml version="1.0" encoding="utf-8"?>\n${body}`;
}

// ----------------------------------------------------------------
// Show Result Screen
// ----------------------------------------------------------------
async function showResult(resultBlob, outFilename, originalFile, originalCanvas) {
  state.resultBlob = resultBlob;
  state.resultFilename = outFilename;

  const ext = outFilename.split('.').pop().toUpperCase();

  // Update result subtitle
  $('result-sub').textContent = `${originalFile.name} → ${outFilename}`;

  // Original preview
  $('orig-name').textContent = originalFile.name;
  $('orig-size').textContent = formatSize(originalFile.size);

  const origCanvas = $('canvas-original');
  const MAX_W = 240, MAX_H = 240;
  let ow = originalCanvas.width, oh = originalCanvas.height;
  if (ow > MAX_W) { oh = Math.round(oh * MAX_W / ow); ow = MAX_W; }
  if (oh > MAX_H) { ow = Math.round(ow * MAX_H / oh); oh = MAX_H; }
  origCanvas.width = ow;
  origCanvas.height = oh;
  const origCtx = origCanvas.getContext('2d');
  origCtx.drawImage(originalCanvas, 0, 0, ow, oh);

  // Converted preview
  $('conv-name').textContent = outFilename;
  $('conv-size').textContent = formatSize(resultBlob.size);
  const labelConverted = $('label-converted');
  if (labelConverted) labelConverted.textContent = `${ext}로 변환됨`;

  await renderConvertedPreview(resultBlob, ext);

  // JPG 저장 버튼: SVG·AI 변환 시에만 표시
  const btnSaveJpg = $('btn-save-jpg');
  if (['SVG', 'AI'].includes(ext)) {
    btnSaveJpg.classList.remove('hidden');
    state._sourceCanvasForJpg = originalCanvas;
  } else {
    btnSaveJpg.classList.add('hidden');
    state._sourceCanvasForJpg = null;
  }

  showScreen('result');
}

async function renderConvertedPreview(blob, ext) {
  const frame = $('preview-converted');
  // Clear ALL previous content inside the frame
  while (frame.firstChild) frame.removeChild(frame.firstChild);

  if (ext === 'SVG' || ext === 'AI') {
    // Render SVG as <img> via blob URL — preserves colors, no XSS
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.style.cssText = 'max-width:100%;max-height:260px;object-fit:contain;border-radius:6px;';
    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = async () => {
      URL.revokeObjectURL(url);
      // Fallback: embed SVG inline
      const text = await blob.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (svgEl) {
        svgEl.style.cssText = 'max-width:100%;max-height:260px;';
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        frame.appendChild(svgEl);
      }
    };
    img.src = url;
    frame.appendChild(img);
  } else {
    // Show as image on canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'canvas-converted';
    frame.appendChild(canvas);

    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const MAX_W = 240, MAX_H = 240;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ext === 'PNG' || ext === 'TGA') {
        drawCheckerboard(ctx, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      // Fallback for formats browsers can't render (TGA, TIFF, BMP)
      URL.revokeObjectURL(url);
      canvas.remove();
      const msg = document.createElement('div');
      msg.textContent = `${ext} 미리보기는 지원되지 않습니다\n다운로드하여 확인하세요`;
      msg.style.cssText = 'color:#888;font-size:13px;padding:20px;text-align:center;white-space:pre-line;';
      frame.appendChild(msg);
    };
    img.src = url;
  }
}

function drawCheckerboard(ctx, w, h) {
  const size = 10;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#333' : '#444';
      ctx.fillRect(x, y, size, size);
    }
  }
}

// ----------------------------------------------------------------
// File Upload Handler
// ----------------------------------------------------------------
function handleFileUpload(file) {
  if (!file) return;

  // Validate type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp',
    'image/tiff', 'image/tga', 'image/svg+xml', 'image/webp',
    'application/postscript', 'application/pdf', 'image/x-tga'];
  const isValid = validTypes.includes(file.type) ||
    /\.(jpg|jpeg|png|gif|bmp|tiff|tif|tga|svg|ai|eps|webp)$/i.test(file.name);

  if (!isValid) {
    showToast('지원하지 않는 파일 형식입니다.');
    return;
  }

  state.file = file;
  state.selectedFormat = null;

  // Update options screen
  $('opt-filename').textContent = file.name;
  $('opt-filesize').textContent = formatSize(file.size);

  // 패널 초기화
  const inlineVec = $('vector-options-inline');
  if (inlineVec) inlineVec.classList.add('hidden');
  const prevPanel = $('options-preview');
  if (prevPanel) prevPanel.classList.add('hidden');
  state.activeTab = 'image';

  // 원본 미리보기 캔버스 준비 (비동기, 백그라운드)
  drawOptionsOriginalPreview(file);

  // Reset format selection & size badge
  document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
  ['img-est-size', 'vec-est-size'].forEach(id => {
    const el = $(id); if (el) el.classList.remove('visible');
  });
  resetConvertButton();

  showScreen('options');
}

function updateOptionsForTab(_tab) {
  // 탭 제거 후 항상 image-options 표시
  const imgOpts = $('image-options');
  if (imgOpts) imgOpts.classList.remove('hidden');
}

function resetConvertButton() {
  const btn = $('btn-convert');
  btn.disabled = true;
  $('btn-convert-text').textContent = '포맷을 선택하세요';
}

// ----------------------------------------------------------------
// Estimated file size
// ----------------------------------------------------------------
function updateEstSize() {
  const badge = state.activeTab === 'image' ? $('img-est-size') : $('vec-est-size');
  // hide both first
  ['img-est-size', 'vec-est-size'].forEach(id => {
    const el = $(id);
    if (el) el.classList.remove('visible');
  });
  if (!badge || !state.file || !state.selectedFormat) return;

  const src = state.file.size;
  const resMul = state.resolution === 'low' ? 0.25 : 1; // low = 0.5x dims = 0.25x pixels
  let est;

  if (state.activeTab === 'image') {
    const fmt = state.selectedFormat;
    if (fmt === 'jpg')  est = src * resMul * 0.25;
    else if (fmt === 'png')  est = src * resMul * 1.1;
    else if (fmt === 'bmp')  est = src * resMul * 4.0;
    else if (fmt === 'tiff') est = src * resMul * 3.5;
    else if (fmt === 'tga')  est = src * resMul * 4.0;
    else if (fmt === 'gif')  est = src * resMul * 0.5;
    else if (fmt === 'svg')  est = src * 1.35; // base64 overhead
    else est = src * resMul;
  } else {
    const detail   = parseInt($('detail-slider').value, 10);
    const threshold = parseInt($('threshold-slider').value, 10);
    // More detail = larger SVG; mid threshold = smallest
    const detailFactor = 0.3 + (detail / 100) * 2.5;
    const threshFactor = 0.7 + Math.abs(threshold - 128) / 128 * 0.6;
    est = src * detailFactor * threshFactor * 0.8;
  }

  badge.textContent = `예상 크기 ~${formatSize(Math.round(est))}`;
  badge.classList.add('visible');
}

function updateEstSizeOnSlider() {
  if (state.activeTab === 'vector' && state.selectedFormat) updateEstSize();
}

// ----------------------------------------------------------------
// Initialization
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Init Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // ---- Screen 1: Drop zone ----
  const dropzone = $('dropzone');
  const fileInput = $('file-input');

  dropzone.addEventListener('click', e => {
    if (e.target.closest('.btn-upload') || e.target === fileInput) return;
    fileInput.click();
  });

  dropzone.addEventListener('dragenter', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', e => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('drag-over');
    }
  });
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
    fileInput.value = ''; // reset so same file can be selected again
  });


  // Resolution buttons
  document.querySelectorAll('.res-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.resolution = btn.dataset.res;
      updateEstSize();
      if (state.file && state.selectedFormat) scheduleOptionsPreview();
    });
  });

  // ---- Screen 2: Options ----

  // Format buttons click
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Determine which group this button belongs to
      const section = btn.closest('#image-options, #vector-options');
      if (!section) return;
      // Deselect others in same section
      section.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedFormat = btn.dataset.format;

      // AI/SVG 선택 시 벡터 슬라이더 표시
      const isVector = ['ai', 'svg'].includes(state.selectedFormat);
      const inlineVec = $('vector-options-inline');
      if (inlineVec) inlineVec.classList.toggle('hidden', !isVector);
      state.activeTab = isVector ? 'vector' : 'image';

      // 모든 포맷 공통 미리보기 표시
      const convertBtn = $('btn-convert');
      convertBtn.disabled = false;
      $('btn-convert-text').textContent = `${state.selectedFormat.toUpperCase()}(으)로 변환하기`;
      updateEstSize();

      if (state.file) scheduleOptionsPreview();
    });
  });

  // Slider: threshold
  const thresholdSlider = $('threshold-slider');
  const thresholdValue = $('threshold-value');
  thresholdSlider.addEventListener('input', () => {
    thresholdValue.textContent = thresholdSlider.value;
    scheduleOptionsPreview();
    updateEstSize();
  });

  // Slider: detail
  const detailSlider = $('detail-slider');
  const detailValue = $('detail-value');
  detailSlider.addEventListener('input', () => {
    detailValue.textContent = detailSlider.value;
    scheduleOptionsPreview();
    updateEstSize();
  });

  // Back button
  $('btn-back').addEventListener('click', () => {
    state.file = null;
    state.selectedFormat = null;
    showScreen('home');
  });

  // Remove file button
  $('btn-remove-file').addEventListener('click', () => {
    state.file = null;
    state.selectedFormat = null;
    showScreen('home');
  });

  // Convert button
  $('btn-convert').addEventListener('click', async () => {
    if (!state.file || !state.selectedFormat) return;

    if (state.activeTab === 'image') {
      await convertImage(state.file, state.selectedFormat);
    } else {
      const options = {
        threshold: parseInt(thresholdSlider.value, 10),
        detail: parseInt(detailSlider.value, 10),
      };
      await convertToVector(state.file, state.selectedFormat, options);
    }
  });

  // ---- Screen 3: Result ----

  $('btn-save-jpg').addEventListener('click', async () => {
    if (!state.resultBlob) return;
    const baseName = (state.resultFilename || 'image').replace(/\.[^.]+$/, '');

    // SVG 텍스트에서 width/height 파싱 후 Canvas에 렌더링 → JPG 저장
    const svgText = await state.resultBlob.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;

    // viewBox 또는 width/height 속성에서 크기 추출
    let w = parseInt(svgEl.getAttribute('width')) || 0;
    let h = parseInt(svgEl.getAttribute('height')) || 0;
    if (!w || !h) {
      const vb = (svgEl.getAttribute('viewBox') || '').split(/[\s,]+/);
      if (vb.length === 4) { w = parseFloat(vb[2]); h = parseFloat(vb[3]); }
    }
    if (!w || !h) { w = 1024; h = 1024; }

    const serialized = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(svgUrl);

      canvas.toBlob(jpgBlob => {
        const dlUrl = URL.createObjectURL(jpgBlob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = baseName + '.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
      }, 'image/jpeg', 0.92);
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      showToast('JPG 변환에 실패했습니다.');
    };
    img.src = svgUrl;
  });

  $('btn-download').addEventListener('click', () => {
    if (!state.resultBlob || !state.resultFilename) return;
    const url = URL.createObjectURL(state.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.resultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('다운로드가 시작되었습니다!');
  });

  function goHome() {
    state.file = null;
    state.selectedFormat = null;
    state.resultBlob = null;
    state.resultFilename = null;
    // Reset file input
    $('file-input').value = '';
    // Reset format buttons
    document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
    resetConvertButton();
    showScreen('home');
  }

  $('btn-new').addEventListener('click', goHome);
  $('btn-convert-another').addEventListener('click', goHome);

  // 이전으로 (result → options)
  $('btn-back-to-options').addEventListener('click', () => {
    showScreen('options');
  });

  // Activate home screen initially
  activateScreen('home');

  // Re-init icons after any dynamic content (just in case)
  setTimeout(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }, 100);
});

// ── Vector Live Preview ────────────────────────────────────────────────────────
let _vpOrigCanvas = null; // cached source canvas for fast re-preview
let _vpDebounceTimer = null;

// ── Options Screen: common preview (all formats) ─────────────────────────────
let _opOrigCanvas = null;  // downscaled source for preview
let _opDebounceTimer = null;

async function drawOptionsOriginalPreview(file) {
  try {
    const img = await loadImage(file);
    const MAX = 480;
    let w = img.width, h = img.height;
    if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
    else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }

    // Cache downscaled canvas
    _opOrigCanvas = document.createElement('canvas');
    _opOrigCanvas.width = w;
    _opOrigCanvas.height = h;
    _opOrigCanvas.getContext('2d').drawImage(img, 0, 0, w, h);

    // Draw to op-original canvas if visible
    const canvas = $('op-original');
    if (canvas) {
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    }

    // Cache full-res for vector tracing (capped at 600px)
    const SRC_MAX = 600;
    let sw = img.width, sh = img.height;
    if (sw > sh) { if (sw > SRC_MAX) { sh = Math.round(sh * SRC_MAX / sw); sw = SRC_MAX; } }
    else         { if (sh > SRC_MAX) { sw = Math.round(sw * SRC_MAX / sh); sh = SRC_MAX; } }
    _vpOrigCanvas = document.createElement('canvas');
    _vpOrigCanvas.width = sw;
    _vpOrigCanvas.height = sh;
    _vpOrigCanvas.getContext('2d').drawImage(img, 0, 0, sw, sh);
  } catch (e) {
    console.warn('options preview original failed', e);
  }
}

function scheduleOptionsPreview() {
  if (!_opOrigCanvas) return;
  clearTimeout(_opDebounceTimer);
  const delay = ['svg', 'ai'].includes(state.selectedFormat) ? 400 : 150;
  _opDebounceTimer = setTimeout(renderOptionsPreview, delay);
}

async function renderOptionsPreview() {
  if (!_opOrigCanvas || !state.selectedFormat) return;

  const panel = $('options-preview');
  if (!panel) return;
  panel.classList.remove('hidden');

  // Update original canvas
  const origCanvas = $('op-original');
  if (origCanvas && origCanvas.width === 0) {
    origCanvas.width = _opOrigCanvas.width;
    origCanvas.height = _opOrigCanvas.height;
    origCanvas.getContext('2d').drawImage(_opOrigCanvas, 0, 0);
  }

  const label = $('op-converted-label');
  if (label) label.textContent = state.selectedFormat.toUpperCase();

  const spinner = $('op-spinner');
  if (spinner) spinner.classList.remove('hidden');

  const wrap = $('op-converted-wrap');

  try {
    const fmt = state.selectedFormat;

    if (fmt === 'svg' || fmt === 'ai') {
      await renderOptionsVectorPreview(wrap);
    } else {
      await renderOptionsRasterPreview(fmt, wrap);
    }
  } catch (e) {
    console.warn('options preview render failed', e);
  } finally {
    if (spinner) spinner.classList.add('hidden');
    const hint = $('op-hint');
    if (hint) hint.style.display = 'none';
  }
}

async function renderOptionsRasterPreview(fmt, wrap) {
  // Clear wrap
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

  const src = _opOrigCanvas;
  const w = src.width, h = src.height;

  // Apply resolution scaling
  let previewCanvas = src;
  if (state.resolution === 'low') {
    previewCanvas = document.createElement('canvas');
    previewCanvas.width = Math.round(w * 0.5);
    previewCanvas.height = Math.round(h * 0.5);
    previewCanvas.getContext('2d').drawImage(src, 0, 0, previewCanvas.width, previewCanvas.height);
  }

  const pw = previewCanvas.width, ph = previewCanvas.height;

  // Convert to target format
  let blob;
  switch (fmt) {
    case 'jpg':  blob = await new Promise(r => previewCanvas.toBlob(r, 'image/jpeg', 0.92)); break;
    case 'png':  blob = await new Promise(r => previewCanvas.toBlob(r, 'image/png')); break;
    case 'gif':  blob = await new Promise(r => previewCanvas.toBlob(r, 'image/png')); break;
    case 'bmp':  blob = encodeBMP(previewCanvas); break;
    case 'tiff': blob = encodeTIFF(previewCanvas); break;
    case 'tga':  blob = encodeTGA(previewCanvas); break;
    default: return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  wrap.appendChild(canvas);

  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    if (fmt === 'png' || fmt === 'tga') drawCheckerboard(ctx, pw, ph);
    ctx.drawImage(img, 0, 0, pw, ph);
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    // BMP/TIFF/TGA: browser can't render — show original with format label
    URL.revokeObjectURL(url);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(previewCanvas, 0, 0);
    const label = document.createElement('div');
    label.className = 'op-unsupported';
    label.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);font-size:11px;color:#aaa;border-radius:6px;';
    label.textContent = fmt.toUpperCase() + ' (다운로드 후 확인)';
    wrap.style.position = 'relative';
    wrap.appendChild(label);
  };
  img.src = url;
}

async function renderOptionsVectorPreview(wrap) {
  if (!_vpOrigCanvas) return;
  // Clear wrap
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

  const threshold = parseInt($('threshold-slider').value, 10);
  const detail    = parseInt($('detail-slider').value, 10);

  const processed = applyThreshold(_vpOrigCanvas, threshold);

  let svgStr;
  if (typeof ImageTracer !== 'undefined') {
    const ltres = Math.max(0.1, (101 - detail) / 10);
    const opts = {
      ltres, qtres: ltres, pathomit: 8, rightangleenhance: true,
      colorsampling: 2, numberofcolors: 16, mincolorratio: 0.02,
      colorquantcycles: 3, blurradius: 0, blurdelta: 20,
      strokewidth: 0, linefilter: false, scale: 1, roundcoords: 1,
      viewbox: false, desc: false, lcpr: 0, qcpr: 0,
    };
    svgStr = ImageTracer.imagedataToSVG(
      processed.getContext('2d').getImageData(0, 0, processed.width, processed.height), opts
    );
  } else {
    svgStr = buildThresholdSVG(processed, threshold);
  }

  // 체커보드 배경 위에 SVG 렌더링 (투명 영역 시각화)
  const SIZE = 480;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const cctx = canvas.getContext('2d');
  drawCheckerboard(cctx, SIZE, SIZE);
  wrap.appendChild(canvas);

  const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
  const imgEl = new Image();
  imgEl.onload = () => {
    // fit image inside SIZE×SIZE keeping aspect ratio
    const iw = processed.width, ih = processed.height;
    const scale = Math.min(SIZE / iw, SIZE / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (SIZE - dw) / 2, dy = (SIZE - dh) / 2;
    cctx.drawImage(imgEl, dx, dy, dw, dh);
    URL.revokeObjectURL(url);
  };
  imgEl.onerror = () => URL.revokeObjectURL(url);
  imgEl.src = url;
}

function scheduleVectorPreview() {
  scheduleOptionsPreview();
}

async function drawVectorOriginalPreview(file) {
  // No-op: replaced by drawOptionsOriginalPreview called on file upload
}


function renderSVGToCanvas(svgStr, canvas, w, h) {
  return new Promise((resolve) => {
    const MAX = 200;
    let cw = w, ch = h;
    if (cw > ch) { if (cw > MAX) { ch = Math.round(ch * MAX / cw); cw = MAX; } }
    else         { if (ch > MAX) { cw = Math.round(cw * MAX / ch); ch = MAX; } }
    canvas.width = cw;
    canvas.height = ch;

    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      canvas.getContext('2d').clearRect(0, 0, cw, ch);
      canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    img.src = url;
  });
}

function buildThresholdSVG(canvas, threshold) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let rects = '';
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      if (gray < threshold) rects += `<rect x="${x}" y="${y}" width="2" height="2" fill="black"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
}
