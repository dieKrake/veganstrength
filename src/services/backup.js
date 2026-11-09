import { validateData } from '../domain/validation.js';
import { emptyTraining, validateTraining } from '../domain/training-state.js';

export function serializeBackup(data, exportedAt = new Date().toISOString(), training) {
    const backup = { app: 'Vegan Strength', version: training === undefined ? 2 : 3, exportedAt, ...validateData(data) };
    if (training !== undefined) backup.training = validateTraining(training);
    return JSON.stringify(backup, null, 2);
}

export async function readBackup(file) {
    if (file.size > 15 * 1024 * 1024) throw Error('Datei zu groß (maximal 15 MiB).');
    const value = JSON.parse(await file.text());
    if (value?.version === 3) {
        const { training, ...legacy } = value;
        const data = validateData({ ...legacy, version: 2 });
        return { data, training: validateTraining(training) };
    }
    return { data: validateData(value), training: emptyTraining() };
}

export function createDownloader(environment) {
    return (text, filename) => {
        const blob = new environment.Blob([text], { type: 'application/json' });
        const link = environment.document.createElement('a');
        const url = environment.URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        environment.document.body.appendChild(link);
        link.click();
        link.remove();
        environment.setTimeout(() => environment.URL.revokeObjectURL(url), 3000);
    };
}
