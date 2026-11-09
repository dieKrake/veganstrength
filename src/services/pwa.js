export function initializePwa(environment) {
    const { document, window, navigator, location } = environment;
    const button = document.getElementById('installBtn');
    const status = document.getElementById('swStatus');
    let installPrompt = null;
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
        button.classList.remove('hidden');
    });
    button.onclick = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        button.classList.add('hidden');
    };
    const updateOnline = () => { document.getElementById('offline').textContent = navigator.onLine ? '● Lokal' : '● Offline'; };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    updateOnline();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js')
            .then(() => navigator.serviceWorker.ready)
            .then(() => { status.textContent = 'Offline-Unterstützung aktiviert (nach erstem vollständigen Laden).'; })
            .catch(() => { status.textContent = 'Offline-Unterstützung konnte nicht aktiviert werden.'; });
    } else status.textContent = 'Für Installation und Offline-Modus bitte per HTTPS öffnen.';
}
