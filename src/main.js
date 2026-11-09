import { createApp } from './app.js';

createApp().catch(error => {
    const notice = document.getElementById('storageNotice');
    notice.classList.remove('hidden');
    document.getElementById('storageNoticeTitle').textContent = 'Die App konnte nicht gestartet werden';
    document.getElementById('storageMessage').textContent = 'Bitte öffne die App erneut. Deine gespeicherten Daten wurden nicht zurückgesetzt.';
    console.error(error);
});
