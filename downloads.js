(() => {
  const links = document.querySelectorAll('a[data-force-download]');

  links.forEach((link) => {
    link.addEventListener('click', async (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();

      const url = link.href;
      const filename = link.dataset.filename || 'download.pdf';
      const originalText = link.textContent;

      link.setAttribute('aria-busy', 'true');
      link.textContent = 'Downloading...';

      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Download failed with status ${response.status}`);

        const bytes = await response.arrayBuffer();
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const objectUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');

        downloadLink.href = objectUrl;
        downloadLink.download = filename;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();

        window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          downloadLink.remove();
        }, 30000);
      } catch (error) {
        // Native attachment route fallback if the browser blocks Blob downloads.
        window.location.assign(url);
      } finally {
        link.removeAttribute('aria-busy');
        link.textContent = originalText;
      }
    });
  });
})();
