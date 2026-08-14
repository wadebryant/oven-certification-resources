let deferredInstallPrompt = null;
const installButton = document.getElementById('installApp');
const modal = document.getElementById('installHelp');
const closeButton = document.getElementById('closeInstallHelp');
const iosInstructions = document.getElementById('iosInstructions');
const genericInstructions = document.getElementById('genericInstructions');

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

async function handleInstall() {
  if (isStandalone) {
    alert('This page is already added to your Home Screen.');
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }

  iosInstructions.hidden = !isIOS;
  genericInstructions.hidden = isIOS;
  modal.hidden = false;
}

function closeInstallHelp() {
  modal.hidden = true;
}

installButton.addEventListener('click', handleInstall);
closeButton.addEventListener('click', closeInstallHelp);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeInstallHelp();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
