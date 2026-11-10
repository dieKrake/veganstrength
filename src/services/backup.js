import { validateData } from '../domain/validation.js';
import { emptyTraining, validateTraining } from '../domain/training-state.js';
import { emptyProgram } from '../domain/program.js';
import { validateProgram } from '../domain/program-validation.js';

export function serializeBackup(data, exportedAt = new Date().toISOString(), training, program) {
    const backup = { app: 'Vegan Strength', version: program !== undefined ? 4 : training === undefined ? 2 : 3, exportedAt, ...validateData(data) };
    if (training !== undefined || program !== undefined) backup.training = validateTraining(training);
    if (program !== undefined) backup.program = validateProgram(program, data, training);
    return JSON.stringify(backup, null, 2);
}

export async function readBackup(file) {
    if (file.size > 15 * 1024 * 1024) throw Error('Datei zu groß (maximal 15 MiB).');
    const value = JSON.parse(await file.text());
    if (value?.version === 3 || value?.version === 4) {
        const { training, program, ...legacy } = value;
        if (value.version === 3 && Object.prototype.hasOwnProperty.call(value, 'program')) throw Error('Ein v3-Backup darf keinen Planbestand enthalten.');
        const data = validateData({ ...legacy, version: 2 });
        const savedTraining = validateTraining(training);
        return { data, training: savedTraining, program: validateProgram(value.version === 4 ? program : emptyProgram(), data, savedTraining) };
    }
    return { data: validateData(value), training: emptyTraining(), program: emptyProgram() };
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
