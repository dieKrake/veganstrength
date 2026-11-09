export const emptyData = () => ({ goal: 150, entries: [], sessions: [] });

export function isCalendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

// Validate without filtering, truncating, coercing or inventing IDs.
// Unknown fields must not silently disappear when an older app reads newer data.
export function validateData(value) {
    function object(item, fields, path) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error(path + ': Objekt erwartet.');
        if (Object.keys(item).some(key => !fields.includes(key))) {
            throw Error(path + ': Unbekannte Felder. Bitte die passende App-Version verwenden.');
        }
    }
    function number(item, min, max, path) {
        if (typeof item !== 'number' || !Number.isFinite(item) || item < min || item > max) {
            throw Error(path + ': Zahl zwischen ' + min + ' und ' + max + ' erwartet.');
        }
    }
    function text(item, max, path) {
        if (typeof item !== 'string' || item.length > max) throw Error(path + ': Ungültiger Text.');
    }
    function array(item, max, path) {
        if (!Array.isArray(item) || item.length > max) throw Error(path + ': Ungültige Liste oder zu viele Einträge.');
    }
    function identity(item, seen, path) {
        if (typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) {
            throw Error(path + ': Fehlende oder doppelte ID.');
        }
        seen.add(item.id);
        if (!isCalendarDate(item.date)) throw Error(path + ': Ungültiges Kalenderdatum.');
    }
    object(value, ['goal', 'entries', 'sessions', 'app', 'version', 'exportedAt'], 'Daten');
    const has = key => Object.prototype.hasOwnProperty.call(value, key);
    if (has('app') || has('version') || has('exportedAt')) {
        if (value.app !== 'Vegan Strength' || value.version !== 2) {
            throw Error('Nur Vegan-Strength-Backups der Version 2 werden unterstützt.');
        }
        if (has('exportedAt') && (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)))) {
            throw Error('Ungültiges Exportdatum.');
        }
    }
    number(value.goal, 50, 250, 'Proteinziel');
    array(value.entries, 30000, 'Lebensmittel');
    array(value.sessions, 10000, 'Trainings');
    const entryIds = new Set(), sessionIds = new Set();
    value.entries.forEach((entry, i) => {
        const path = 'Lebensmittel ' + (i + 1);
        object(entry, ['id', 'date', 'name', 'amount', 'protein'], path);
        identity(entry, entryIds, path);
        text(entry.name, 149, path + ' / Name');
        number(entry.amount, Number.MIN_VALUE, 5000, path + ' / Menge');
        number(entry.protein, 0, 100, path + ' / Protein');
    });
    value.sessions.forEach((session, i) => {
        const path = 'Training ' + (i + 1);
        object(session, ['id', 'date', 'workout', 'exercises'], path);
        identity(session, sessionIds, path);
        text(session.workout, 99, path + ' / Name');
        array(session.exercises, 30, path + ' / Übungen');
        session.exercises.forEach((exercise, j) => {
            const exPath = path + ' / Übung ' + (j + 1);
            object(exercise, ['name', 'sets'], exPath);
            text(exercise.name, 150, exPath + ' / Name');
            array(exercise.sets, 12, exPath + ' / Sätze');
            exercise.sets.forEach((set, k) => {
                const setPath = exPath + ' / Satz ' + (k + 1);
                object(set, ['reps', 'kg', 'done'], setPath);
                number(set.reps, 0, 999, setPath + ' / Wiederholungen oder Sekunden');
                number(set.kg, 0, 999, setPath + ' / kg');
                if (typeof set.done !== 'boolean') throw Error(setPath + ': Satzstatus fehlt oder ist ungültig.');
            });
        });
    });
    return JSON.parse(JSON.stringify({ goal: value.goal, entries: value.entries, sessions: value.sessions }));
}
