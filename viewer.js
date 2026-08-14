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
const statusEl = document.getElementById('pageStatus');
const prevBtn = document.getElementById('prevPage');
const nextBtn = document.getElementById('nextPage');

let pdf = null;
let currentPage = 1;
const pageEls = new Map();
const rendered = new Set();

if (!config) {
  loading.hidden = true;
  errorBox.hidden = false;
  throw new Error('Unknown document');
}

titleEl.textContent = config.title;
document.title = `${config.title} | Oven Certification Resources`;

function updateStatus(page = currentPage) {
  currentPage = Math.max(1, Math.min(page, pdf?.numPages || 1));
  statusEl.textContent = pdf ? `Page ${currentPage} of ${pdf.numPages}` : 'Loading…';
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = !pdf || currentPage >= pdf.numPages;
}

async function goToPage(pageNumber) {
  const target = Math.max(1, Math.min(pageNumber, pdf.numPages));
  const el = pageEls.get(target);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateStatus(target);
    await renderPage(target);
  }
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

async function addAnnotations(page, viewport, layer, pageNumber) {
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
        if (targetPage) goToPage(targetPage);
      });
    } else {
      continue;
    }
    layer.appendChild(link);
  }
}

async function renderPage(pageNumber) {
  if (rendered.has(pageNumber)) return;
  rendered.add(pageNumber);
  const shell = pageEls.get(pageNumber);
  if (!shell) return;

  try {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const available = Math.max(280, Math.min(1000, viewer.clientWidth - 24));
    const scale = available / base.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    shell.style.width = `${viewport.width}px`;
    shell.style.height = `${viewport.height}px`;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d');
    const annotationLayer = document.createElement('div');
    annotationLayer.className = 'pdf-annotation-layer';
    annotationLayer.style.width = `${viewport.width}px`;
    annotationLayer.style.height = `${viewport.height}px`;
    shell.replaceChildren(canvas, annotationLayer);

    await page.render({ canvasContext: ctx, viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] }).promise;
    await addAnnotations(page, viewport, annotationLayer, pageNumber);
  } catch (err) {
    rendered.delete(pageNumber);
    shell.textContent = `Unable to render page ${pageNumber}.`;
  }
}

function observePages() {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const pageNumber = Number(entry.target.dataset.page);
        renderPage(pageNumber);
        updateStatus(pageNumber);
      }
    }
  }, { rootMargin: '900px 0px', threshold: 0.08 });

  for (const el of pageEls.values()) observer.observe(el);
}

async function start() {
  try {
    const task = pdfjsLib.getDocument({ url: config.url, cMapPacked: true });
    pdf = await task.promise;
    loading.remove();
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const available = Math.max(280, Math.min(1000, viewer.clientWidth - 24));
      const scale = available / base.width;
      const shell = document.createElement('section');
      shell.className = 'pdf-page';
      shell.dataset.page = String(i);
      shell.setAttribute('aria-label', `Page ${i}`);
      shell.style.width = `${base.width * scale}px`;
      shell.style.height = `${base.height * scale}px`;
      shell.innerHTML = '<div class="page-placeholder">Loading page…</div>';
      viewer.appendChild(shell);
      pageEls.set(i, shell);
    }
    updateStatus(1);
    observePages();
    renderPage(1);
  } catch (err) {
    console.error(err);
    loading.hidden = true;
    errorBox.hidden = false;
    statusEl.textContent = 'Unable to load';
  }
}

prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

start();
