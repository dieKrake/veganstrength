import { emptyData, validateData } from '../domain/validation.js';

export const KEY = 'vegan-strength-v2';
export const RECOVERY_KEY = KEY + '-before-import';

export function createLocalStorageStore(getStorage) {
    let raw = null, readable = false, current = null, problem = null;
    function load() {
        readable = false;
        current = null;
        try {
            raw = getStorage().getItem(KEY);
            readable = true;
            current = raw === null ? emptyData() : validateData(JSON.parse(raw));
            problem = null;
        } catch (error) { problem = error; }
        return current;
    }
    function write(candidate, { replacement = false, allowReset = false } = {}) {
        try {
            if (!readable || (!current && !replacement && !allowReset)) {
                throw Error('Die gespeicherten Daten sind nicht geladen. Bitte zuerst Originaldaten sichern und ein gültiges Backup importieren oder erneut laden.');
            }
            const next = validateData(candidate);
            const serialized = JSON.stringify(next);
            const storage = getStorage();
            if (storage.getItem(KEY) !== raw) {
                throw Error('Die Daten wurden in einem anderen Fenster geändert. Bitte gespeicherte Daten erneut laden; deine Trainingseingaben bleiben dabei erhalten.');
            }
            if (replacement && raw !== null) storage.setItem(RECOVERY_KEY, raw);
            // localStorage.setItem either replaces this one key or throws.
            // Never publish in-memory changes before this write succeeds.
            storage.setItem(KEY, serialized);
            raw = serialized;
            current = next;
            problem = null;
            return next;
        } catch (error) { problem = error; throw error; }
    }
    return {
        load, write,
        get raw() { return raw; },
        get problem() { return problem; },
        get loaded() { return current !== null; },
        previous() { return getStorage().getItem(RECOVERY_KEY); },
        removePrevious() { getStorage().removeItem(RECOVERY_KEY); }
    };
}
