const REPO = 'wadebryant/oven-certification-resources';

function choosePdf(paths, requested) {
  const pdfs = paths.filter(p => p.toLowerCase().endsWith('.pdf'));
  const names = pdfs.map(p => ({ path: p, n: p.toLowerCase().replace(/[^a-z0-9]+/g, ' ') }));
  if (requested === 'oven-fingers-interactive.pdf') {
    return names.find(x => x.n.includes('finger'))?.path || names.find(x => x.n.includes('interactive'))?.path;
  }
  if (requested === 'oven-certification-form.pdf') {
    return names.find(x => x.n.includes('form'))?.path;
  }
  if (requested === 'oven-certification-faqs.pdf') {
    return names.find(x => x.n.includes('faq'))?.path || names.find(x => x.n.includes('frequently asked'))?.path;
  }
  if (requested === 'oven-certification-guide.pdf') {
    return names.find(x => x.n.includes('guide') && !x.n.includes('finger'))?.path;
  }
}

module.exports = async function handler(req, res) {
  const requested = String(req.query.file || '');
  const allowed = new Set([
    'oven-fingers-interactive.pdf',
    'oven-certification-guide.pdf',
    'oven-certification-form.pdf',
    'oven-certification-faqs.pdf'
  ]);
  if (!allowed.has(requested)) return res.status(404).send('PDF not found');

  try {
    const treeResp = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, {
      headers: { 'User-Agent': 'oven-certification-resources' }
    });
    if (!treeResp.ok) throw new Error(`GitHub tree request failed: ${treeResp.status}`);
    const tree = await treeResp.json();
    const paths = (tree.tree || []).filter(x => x.type === 'blob').map(x => x.path);
    const path = choosePdf(paths, requested);
    if (!path) return res.status(404).send('PDF has not been uploaded yet');

    const raw = `https://raw.githubusercontent.com/${REPO}/main/${path.split('/').map(encodeURIComponent).join('/')}`;
    const pdfResp = await fetch(raw);
    if (!pdfResp.ok) throw new Error(`PDF fetch failed: ${pdfResp.status}`);
    const data = Buffer.from(await pdfResp.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${requested}"`);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).send(data);
  } catch (err) {
    res.status(502).send('Unable to load PDF right now');
  }
};
