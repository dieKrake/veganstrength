import { validateData } from '../domain/validation.js';

export function serializeBackup(data, exportedAt = new Date().toISOString()) {
    return JSON.stringify({ app: 'Vegan Strength', version: 2, exportedAt, ...validateData(data) }, null, 2);
}

export async function readBackup(file) {
    if (file.size > 15 * 1024 * 1024) throw Error('Datei zu groß (maximal 15 MiB).');
    return validateData(JSON.parse(await file.text()));
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
