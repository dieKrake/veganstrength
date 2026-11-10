export function initializePwa(environment, { prepareUpdate = async () => false } = {}) {
    const { document, window, navigator, location } = environment;
    const button = document.getElementById('installBtn'), status = document.getElementById('swStatus');
    const checkButton = document.getElementById('checkUpdate'), prepareButton = document.getElementById('prepareUpdate');
    const updateStatus = document.getElementById('updateStatus');
    let installPrompt = null, registration = null, probe = 0;
    const watched = new WeakSet();
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault(); installPrompt = event; button.classList.remove('hidden');
    });
    button.onclick = async () => {
        if (!installPrompt) return;
        installPrompt.prompt(); await installPrompt.userChoice;
        installPrompt = null; button.classList.add('hidden');
    };
    const updateOnline = () => { document.getElementById('offline').textContent = navigator.onLine ? '● Lokal' : '● Offline'; };
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline); updateOnline();
    function showUpdate() {
        const waiting = registration?.waiting?.state === 'installed';
        prepareButton.classList.toggle('hidden', !waiting);
        if (waiting) updateStatus.textContent = 'Eine vollständige neue App-Version ist bereit. Sichere zuerst den Trainingsentwurf; schließe danach alle App-Fenster und öffne die App neu.';
    }
    function watchWorker(worker) {
        if (!worker || watched.has(worker)) return;
        watched.add(worker);
        worker.addEventListener('statechange', () => {
            showUpdate();
            if (worker.state === 'redundant' && !registration?.active) status.textContent = 'Die Offline-Dateien konnten nicht vollständig vorbereitet werden. Bitte erneut online öffnen.';
        });
    }
    async function checkOffline() {
        const expected = ++probe, controller = navigator.serviceWorker?.controller;
        if (!controller || !environment.MessageChannel) {
            status.textContent = 'Offline-Start noch nicht bestätigt. Die App nach dem ersten vollständigen Online-Laden erneut öffnen.';
            return;
        }
        const complete = await new Promise(resolve => {
            const channel = new environment.MessageChannel();
            let done = false;
            const finish = result => {
                if (done) return;
                done = true; environment.clearTimeout(timeout); channel.port1.close(); channel.port2.close(); resolve(result);
            };
            const timeout = environment.setTimeout(() => finish(null), 2500);
            channel.port1.onmessage = event => finish(event.data?.type === 'OFFLINE_STATUS' ? event.data : null);
            channel.port1.onmessageerror = () => finish(null);
            try { controller.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]); } catch { finish(null); }
        });
        if (expected !== probe) return;
        status.textContent = complete?.complete === true
            ? `Alle Offline-Dateien der aktiven Version ${complete.version} sind vorhanden. Browser können Speicher später freigeben; regelmäßig ein JSON-Backup sichern.`
            : complete?.complete === false ? 'Offline-Dateien fehlen. Bitte online auf ein vollständiges Update prüfen und die App danach neu öffnen.'
                : 'Offline-Start noch nicht bestätigt. Bitte alle App-Fenster schließen und online erneut öffnen.';
    }
    async function checkUpdate() {
        if (!registration) return;
        checkButton.disabled = true; updateStatus.textContent = 'Updatesuche läuft …';
        try {
            await registration.update(); showUpdate();
            if (!registration.waiting) updateStatus.textContent = registration.installing ? 'Neue App-Dateien werden vollständig geladen …' : 'Keine neue Version gefunden.';
            await checkOffline();
        } catch { updateStatus.textContent = 'Updatesuche nicht möglich. Deine gespeicherten Daten bleiben erhalten; bitte später online erneut versuchen.'; }
        finally { checkButton.disabled = false; }
    }
    checkButton.disabled = true; checkButton.onclick = checkUpdate;
    prepareButton.onclick = async () => {
        if (registration?.waiting?.state !== 'installed') return;
        prepareButton.disabled = true;
        try {
            if (!await prepareUpdate()) {
                updateStatus.textContent = 'Der Trainingsentwurf ist noch nicht bestätigt gespeichert. Lass die App geöffnet, prüfe den Speicherhinweis und versuche es erneut.';
                return;
            }
            updateStatus.textContent = 'Trainingsentwurf gespeichert. Schließe jetzt alle App-Tabs und App-Fenster und öffne sie neu. Noch nicht gespeicherte Profil- oder Lebensmittelfelder vorher übernehmen.';
        } catch { updateStatus.textContent = 'Vorbereitung fehlgeschlagen. Lass die App geöffnet und prüfe den Speicherhinweis.'; }
        finally { prepareButton.disabled = false; }
    };
    const controlled = () => { void checkOffline(); };
    const ready = (async () => {
        if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
            status.textContent = 'Für Installation und Offline-Modus bitte per HTTPS oder localhost öffnen.';
            return;
        }
        navigator.serviceWorker.addEventListener('controllerchange', controlled);
        try {
            registration = await navigator.serviceWorker.register('./sw.js');
            checkButton.disabled = false;
            registration.addEventListener('updatefound', () => { watchWorker(registration.installing); showUpdate(); });
            watchWorker(registration.installing); showUpdate();
            await navigator.serviceWorker.ready;
            await checkOffline();
        } catch { status.textContent = 'Offline-Unterstützung konnte nicht aktiviert werden. Deine gespeicherten Daten bleiben erhalten.'; }
    })();
    return { ready, checkUpdate, dispose() { probe++; navigator.serviceWorker?.removeEventListener?.('controllerchange', controlled); } };
}
