import { today } from '../domain/dates.js';
import { emptyData } from '../domain/validation.js';
import { readBackup, serializeBackup } from '../services/backup.js';
import { fmt } from '../ui/format.js';

export function createSettings({ $, getData, setData, repository, persist, runAction, refresh, environment, download }, training, timer) {
    let statusRevision = 0;
    async function renderStatus() {
        const revision = ++statusRevision;
        $('storageNotice').classList.toggle('hidden', !repository.problem);
        $('storageNoticeTitle').textContent = repository.loaded ? 'Änderung nicht gespeichert' : 'Deine Daten konnten nicht geladen werden';
        $('storageMessage').textContent = repository.problem
            ? (repository.loaded ? 'Dein bisheriger Datenstand und deine Eingaben bleiben erhalten. ' : 'Die angezeigten Werte sind kein geladener Datenstand. Deine Originaldaten werden nicht automatisch überschrieben. ') + repository.problem.message
            : '';
        $('exportOriginal').classList.toggle('hidden', !repository.problem || repository.raw === null);
        let previous = null;
        try { previous = await repository.previous(); } catch { /* Storage denial is already shown by the main operation. */ }
        if (revision === statusRevision) $('exportPrevious').classList.toggle('hidden', previous === null);
    }
    $('saveGoal').onclick = () => {
        const goal = Number($('goalInput').value);
        if (!Number.isFinite(goal) || goal < 50 || goal > 250) {
            environment.alert('Bitte Ziel zwischen 50 und 250 g eingeben.');
            return Promise.resolve(false);
        }
        return runAction(async () => { if (await persist(data => ({ ...data, goal }))) refresh(); });
    };
    $('exportData').onclick = () => runAction(() => {
        if (!repository.loaded) {
            environment.alert('Die Daten sind nicht geladen. Bitte lade stattdessen die Originaldaten herunter.');
            return;
        }
        download(serializeBackup(getData()), `vegan-strength-backup-${today()}.json`);
    });
    $('exportOriginal').onclick = () => {
        if (repository.raw !== null) download(repository.raw, `vegan-strength-backup-original-${today()}.json`);
    };
    $('exportPrevious').onclick = () => runAction(async () => {
        try {
            const previous = await repository.previous();
            if (previous === null) return environment.alert('Keine Sicherung vor einem Import vorhanden.');
            download(previous, `vegan-strength-backup-vor-import-${today()}.json`);
        } catch { environment.alert('Die Sicherung konnte nicht gelesen werden. Bitte den Speicherzugriff prüfen.'); }
    });
    $('retryStorage').onclick = () => runAction(async () => {
        const loaded = await repository.load();
        if (loaded) setData(loaded);
        await renderStatus();
        refresh();
    });
    $('importFile').onchange = event => {
        const input = event.target, file = input.files[0];
        if (!file) return Promise.resolve();
        return runAction(async () => {
            try {
                const incoming = await readBackup(file), data = getData();
                const existing = repository.loaded
                    ? `${data.entries.length} Lebensmitteleinträge und ${data.sessions.length} Trainings`
                    : 'der bisherige, nicht geladene Originalstand';
                const message = `Backup wiederherstellen?\n\n${incoming.entries.length} Lebensmitteleinträge\n${incoming.sessions.length} Trainings\nProteinziel: ${fmt(incoming.goal)} g\n\nErsetzt werden: ${existing}.\nVor dem Ersetzen wird der bisherige Originalstand auf diesem Gerät gesichert. Du kannst ihn anschließend unter „Mehr“ herunterladen.`;
                if (!environment.confirm(message)) return;
                if (!await persist(() => incoming, { replacement: true })) return;
                training.reset();
                timer.stop();
                refresh();
                environment.alert('Backup importiert. Eine vorhandene Sicherung vor dem Import kannst du unter „Mehr“ herunterladen.');
            } catch (error) {
                environment.alert('Import fehlgeschlagen: ' + error.message + '\nDeine bisherigen Daten bleiben unverändert.');
            } finally { input.value = ''; }
        });
    };
    $('clearData').onclick = () => runAction(async () => {
        if (!environment.confirm('Wirklich ALLE lokalen Einträge und die Sicherung vor dem letzten Import löschen? Bitte vorher ein Backup erstellen.')) return;
        if (!await persist(emptyData, { replacement: false, allowReset: true })) return;
        training.reset();
        timer.stop();
        try { await repository.removePrevious(); }
        catch { environment.alert('Die Einträge wurden geleert. Die Sicherung vor dem Import konnte nicht gelöscht werden. Bitte erneut löschen.'); }
        await renderStatus();
        refresh();
    });
    return {
        renderStatus,
        render() { $('goalInput').value = getData().goal; }
    };
}
