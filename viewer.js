import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const docs = {
  fingers: {
    title: 'Oven Fingers Interactive Resource',
    url: 'https://raw.githubusercontent.com/wadebryant/oven-certification-resources/main/Oven%20Fingers%20Interactive%20Resource%20July%202026.pdf'
  },
  guide: {
    title: 'Oven Certification Guide',
    url: 'https://raw.githubusercontent.com/wadebryant/oven-certification-resources/main/Oven%20Certification%20Guide%20July%202026.pdf'
  },
  form: {
    title: 'Oven Certification Form',
    url: 'https://raw.githubusercontent.com/wadebryant/oven-certification-resources/main/Oven%20Certification%20Form%20July%202026.pdf'
  },
  faqs: {
    title: 'Oven Certification FAQs',
    url: 'https://raw.githubusercontent.com/wadebryant/oven-certification-resources/main/Oven%20Certification%20Visit%20FAQs.pdf'
  }
};

const params = new URLSearchParams(location.search);
const key = params.get('doc') || 'guide';
const config = docs[key];
const viewer = document.getElementById('pdfViewer');
const loading = document.getElementById('viewerLoading');
const errorBox = document.getElementById('viewerError');
const titleEl = document.getElementById('viewerTitle');
const pageSelect = document.getElementById('pageSelect');
const pageTotal = document.getElementById('pageTotal');
const prevBtn = document.getElementById('prevPage');
const nextBtn = document.getElementById('nextPage');

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let pdf = null;
let currentPage = 1;
let renderToken = 0;
let resizeTimer = null;
let currentZoom = 1;

let swipeTracking = false;
let swipeHorizontal = false;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;
const SWIPE_MIN_DISTANCE = 48;
const SWIPE_MAX_TIME = 900;

let pinchActive = false;
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let pinchPreviewZoom = 1;
let pinchFocus = null;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

if (!config) {
  loading.hidden = true;
  errorBox.hidden = false;
  pageSelect.disabled = true;
  pageTotal.textContent = 'unavailable';
  throw new Error('Unknown document');
}

titleEl.textContent = config.title;
document.title = `${config.title} | Oven Certification Resources`;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function populatePageSelector() {
  pageSelect.replaceChildren();
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const option = document.createElement('option');
    option.value = String(pageNumber);
    option.textContent = String(pageNumber);
    pageSelect.appendChild(option);
  }
  pageSelect.disabled = false;
}

function updateStatus() {
  if (pdf) {
    pageSelect.value = String(currentPage);
    pageTotal.textContent = `of ${pdf.numPages}`;
  } else {
    pageSelect.disabled = true;
    pageTotal.textContent = 'of …';
  }
  prevBtn.disabled = !pdf || currentPage <= 1;
  nextBtn.disabled = !pdf || currentPage >= pdf.numPages;
}

function showLoadError() {
  pageSelect.disabled = true;
  pageTotal.textContent = 'unavailable';
  errorBox.hidden = false;
}

async function resolveDestination(dest) {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (!explicit || !explicit[0]) return null;
    return (await pdf.getPageIndex(explicit[0])) + 1;
  } catch {
    return null;
  }
}

async function addAnnotations(page, viewport, layer) {
  const annotations = await page.getAnnotations({ intent: 'display' });
  for (const ann of annotations) {
    if (ann.subtype !== 'Link' || !ann.rect) continue;

    const rect = viewport.convertToViewportRectangle(ann.rect);
    const left = Math.min(rect[0], rect[2]);
    const top = Math.min(rect[1], rect[3]);
    const width = Math.abs(rect[0] - rect[2]);
    const height = Math.abs(rect[1] - rect[3]);
    const link = document.createElement('a');
    link.className = 'pdf-link-hitbox';
    link.style.left = `${left}px`;
    link.style.top = `${top}px`;
    link.style.width = `${width}px`;
    link.style.height = `${height}px`;
    link.setAttribute('aria-label', 'PDF link');

    if (ann.url) {
      link.href = ann.url;
      link.target = '_blank';
      link.rel = 'noopener';
    } else if (ann.dest) {
      link.href = '#';
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        const targetPage = await resolveDestination(ann.dest);
        if (targetPage) await goToPage(targetPage);
      });
    } else {
      continue;
    }

    layer.appendChild(link);
  }
}

function releaseOldCanvas() {
  const oldCanvas = viewer.querySelector('canvas');
  if (oldCanvas) {
    oldCanvas.width = 1;
    oldCanvas.height = 1;
  }
}

async function renderPage(pageNumber) {
  if (!pdf) return;

  const token = ++renderToken;
  const target = Math.max(1, Math.min(pageNumber, pdf.numPages));
  currentPage = target;
  pageSelect.value = String(target);
  prevBtn.disabled = target <= 1;
  nextBtn.disabled = target >= pdf.numPages;

  try {
    const page = await pdf.getPage(target);
    if (token !== renderToken) return;

    const base = page.getViewport({ scale: 1 });
    const available = Math.max(280, Math.min(900, viewer.clientWidth - 12));
    const fitScale = available / base.width;
    const viewport = page.getViewport({ scale: fitScale * currentZoom });

    // Only one page is rendered at a time. The backing resolution is capped on
    // iPhones so pinch zoom stays useful without recreating the Safari memory crash.
    const dprCap = isIOS ? (currentZoom > 1.5 ? 1.1 : 1.25) : 1.6;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

    releaseOldCanvas();

    const shell = document.createElement('section');
    shell.className = 'pdf-page single-pdf-page';
    shell.setAttribute('aria-label', `Page ${target}`);
    shell.style.width = `${viewport.width}px`;
    shell.style.height = `${viewport.height}px`;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const annotationLayer = document.createElement('div');
    annotationLayer.className = 'pdf-annotation-layer';
    annotationLayer.style.width = `${viewport.width}px`;
    annotationLayer.style.height = `${viewport.height}px`;

    shell.append(canvas, annotationLayer);
    viewer.replaceChildren(shell);

    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({
      canvasContext: ctx,
      viewport,
      transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0]
    }).promise;

    if (token !== renderToken) return;
    await addAnnotations(page, viewport, annotationLayer);
    updateStatus();
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    viewer.replaceChildren();
    showLoadError();
  }
}

async function goToPage(pageNumber) {
  viewer.scrollLeft = 0;
  await renderPage(pageNumber);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function resetSwipe() {
  swipeTracking = false;
  swipeHorizontal = false;
}

function touchDistance(touches) {
  const dx = touches[1].clientX - touches[0].clientX;
  const dy = touches[1].clientY - touches[0].clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function beginPinch(event) {
  const shell = viewer.querySelector('.single-pdf-page');
  if (!pdf || !shell || event.touches.length !== 2) return;

  resetSwipe();
  pinchActive = true;
  pinchStartDistance = Math.max(1, touchDistance(event.touches));
  pinchStartZoom = currentZoom;
  pinchPreviewZoom = currentZoom;

  const midpoint = touchMidpoint(event.touches);
  const rect = shell.getBoundingClientRect();
  pinchFocus = {
    ratioX: clamp((midpoint.x - rect.left) / Math.max(1, rect.width), 0, 1),
    ratioY: clamp((midpoint.y - rect.top) / Math.max(1, rect.height), 0, 1),
    clientX: midpoint.x,
    clientY: midpoint.y
  };

  shell.style.transformOrigin = `${pinchFocus.ratioX * shell.offsetWidth}px ${pinchFocus.ratioY * shell.offsetHeight}px`;
  if (event.cancelable) event.preventDefault();
}

function previewPinch(event) {
  if (!pinchActive || event.touches.length !== 2) return;
  if (event.cancelable) event.preventDefault();

  const shell = viewer.querySelector('.single-pdf-page');
  if (!shell) return;

  const ratio = touchDistance(event.touches) / pinchStartDistance;
  pinchPreviewZoom = clamp(pinchStartZoom * ratio, MIN_ZOOM, MAX_ZOOM);
  const visualScale = pinchPreviewZoom / pinchStartZoom;
  shell.style.transform = `scale(${visualScale})`;
}

async function finishPinch() {
  if (!pinchActive) return;

  const focus = pinchFocus;
  const shell = viewer.querySelector('.single-pdf-page');
  if (shell) {
    shell.style.transform = '';
    shell.style.transformOrigin = '';
  }

  pinchActive = false;
  currentZoom = clamp(pinchPreviewZoom, MIN_ZOOM, MAX_ZOOM);
  pinchFocus = null;

  await renderPage(currentPage);

  if (!focus) return;
  requestAnimationFrame(() => {
    const newShell = viewer.querySelector('.single-pdf-page');
    if (!newShell) return;

    const viewerRect = viewer.getBoundingClientRect();
    const desiredLeft = focus.ratioX * newShell.offsetWidth - (focus.clientX - viewerRect.left);
    viewer.scrollLeft = clamp(desiredLeft, 0, Math.max(0, viewer.scrollWidth - viewer.clientWidth));

    const pageTop = newShell.getBoundingClientRect().top + window.scrollY;
    const desiredTop = pageTop + focus.ratioY * newShell.offsetHeight - focus.clientY;
    window.scrollTo({ top: Math.max(0, desiredTop), behavior: 'instant' });
  });
}

viewer.addEventListener('touchstart', (event) => {
  if (event.touches.length === 2) {
    beginPinch(event);
    return;
  }

  if (!pdf || event.touches.length !== 1 || pinchActive) {
    resetSwipe();
    return;
  }

  // When zoomed in, a one-finger drag pans the document instead of changing pages.
  if (currentZoom > 1.02) {
    resetSwipe();
    return;
  }

  // Keep taps on the interactive PDF's own links working normally.
  if (event.target.closest('.pdf-link-hitbox')) {
    resetSwipe();
    return;
  }

  const touch = event.touches[0];
  swipeTracking = true;
  swipeHorizontal = false;
  swipeStartX = touch.clientX;
  swipeStartY = touch.clientY;
  swipeStartTime = performance.now();
}, { passive: false });

viewer.addEventListener('touchmove', (event) => {
  if (pinchActive && event.touches.length === 2) {
    previewPinch(event);
    return;
  }

  if (!swipeTracking || event.touches.length !== 1 || currentZoom > 1.02) return;

  const touch = event.touches[0];
  const dx = touch.clientX - swipeStartX;
  const dy = touch.clientY - swipeStartY;

  if (!swipeHorizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.15) {
    swipeHorizontal = true;
  }

  if (swipeHorizontal && event.cancelable) event.preventDefault();
}, { passive: false });

viewer.addEventListener('touchend', (event) => {
  if (pinchActive) {
    if (event.touches.length < 2) finishPinch();
    resetSwipe();
    return;
  }

  if (!swipeTracking || event.changedTouches.length !== 1 || currentZoom > 1.02) {
    resetSwipe();
    return;
  }

  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStartX;
  const dy = touch.clientY - swipeStartY;
  const elapsed = performance.now() - swipeStartTime;
  const horizontalEnough = Math.abs(dx) >= SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.2;

  resetSwipe();
  if (!horizontalEnough || elapsed > SWIPE_MAX_TIME) return;

  if (dx < 0 && currentPage < pdf.numPages) {
    goToPage(currentPage + 1);
  } else if (dx > 0 && currentPage > 1) {
    goToPage(currentPage - 1);
  }
}, { passive: true });

viewer.addEventListener('touchcancel', () => {
  resetSwipe();
  if (pinchActive) finishPinch();
}, { passive: true });

// iOS Safari also exposes proprietary gesture events. Blocking its native gesture
// inside the document keeps the sticky toolbar fixed while our PDF-only pinch runs.
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  viewer.addEventListener(eventName, (event) => {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
}

async function start() {
  try {
    const task = pdfjsLib.getDocument({
      url: config.url,
      cMapPacked: true,
      disableAutoFetch: true
    });
    pdf = await task.promise;
    populatePageSelector();
    if (loading?.isConnected) loading.remove();
    updateStatus();
    await renderPage(1);
  } catch (err) {
    console.error(err);
    if (loading) loading.hidden = true;
    showLoadError();
  }
}

prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextBtn.addEventListener('click', () => goToPage(currentPage + 1));
pageSelect.addEventListener('change', () => {
  if (!pdf) return;
  const target = Number.parseInt(pageSelect.value, 10);
  if (Number.isInteger(target) && target >= 1 && target <= pdf.numPages && target !== currentPage) {
    goToPage(target);
  }
});

window.addEventListener('resize', () => {
  if (!pdf || pinchActive) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderPage(currentPage), 250);
});

start();
