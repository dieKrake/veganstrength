import { emptyNutrition, recordGoal, validateNutrition } from '../domain/nutrition.js';
import { historyOptions, historyPage, sessionMatches } from '../domain/history.js';
import { emptyProgram } from '../domain/program.js';
import { validateProgram } from '../domain/program-validation.js';
import { emptyData, validateData } from '../domain/validation.js';
import { emptyTraining, validateTraining } from '../domain/training-state.js';
import { KEY, RECOVERY_KEY } from './local-storage.js';

export const DB_NAME = 'vegan-strength';
export const DB_VERSION = 3;
export const MARKER_KEY = 'vegan-strength-storage';
const STORES = ['settings', 'entries', 'sessions', 'drafts', 'meta', 'recovery', 'plans', 'customFoods'];
const request = value => {
    const result = new Promise((resolve, reject) => {
        value.onsuccess = () => resolve(value.result);
        value.onerror = () => reject(value.error);
    });
    result.catch(() => {});
    return result;
};
const conflict = () => Error('Die Daten wurden in einem anderen Fenster geändert. Bitte gespeicherte Daten erneut laden; deine Trainingseingaben bleiben dabei erhalten.');
const fullText = (data, training, program, nutrition) => JSON.stringify({ app: 'Vegan Strength', version: 5, ...data, training, program, nutrition });

export function createIndexedDBStore({ indexedDB, getStorage, onVersionChange = () => {} }) {
    let db = null, current = null, training = emptyTraining(), program = emptyProgram(), nutrition = emptyNutrition(), revision = null, raw = null, problem = null;
    let legacy = null, readable = false, active = false, databaseRaw = null;

    async function open() {
        if (db) return;
        if (!indexedDB) throw Error('Der Gerätespeicher ist nicht verfügbar. Bitte Speicherzugriff erlauben oder ein Backup auf einem unterstützten Browser wiederherstellen.');
        db = await new Promise((resolve, reject) => {
            let rejected = false, upgradeFailure = null;
            const opening = indexedDB.open(DB_NAME, DB_VERSION);
            opening.onupgradeneeded = () => {
                const database = opening.result;
                for (const name of STORES) {
                    if (!database.objectStoreNames.contains(name)) {
                        const store = database.createObjectStore(name, { keyPath: 'id' });
                        if (name === 'entries' || name === 'sessions') store.createIndex('date', 'date');
                        if (name === 'sessions') store.createIndex('workout', 'workout');
                    }
                }
                const tx = opening.transaction;
                const previous = tx.objectStore('meta').get('state');
                previous.onsuccess = () => {
                    try {
                        const state = previous.result;
                        if (!state) return;
                        if (![1, 2].includes(state.schema)) throw Error('Unbekanntes Schema; Speicheraktualisierung abgebrochen.');
                        // The upgrade transaction preserves all old rows and drafts.
                        if (state.schema === 1) tx.objectStore('plans').put({ id: 'active', value: emptyProgram() });
                        tx.objectStore('settings').put({ id: 'nutrition', value: { entryUnits: [], goals: [] } });
                        tx.objectStore('meta').put({ ...state, schema: 3, revision: state.revision + 1 });
                    } catch (error) { upgradeFailure = error; tx.abort(); }
                };
            };
            opening.onblocked = () => { rejected = true; reject(Error('Ein anderes App-Fenster blockiert die Speicheraktualisierung. Bitte andere Fenster schließen und erneut laden.')); };
            opening.onerror = () => reject(upgradeFailure || opening.error);
            opening.onsuccess = () => {
                if (rejected) { opening.result.close(); return; }
                resolve(opening.result);
            };
        });
        db.onversionchange = () => {
            db.close();
            db = null;
            problem = Error('Der Gerätespeicher wurde in einem anderen Fenster aktualisiert. Bitte diese App neu öffnen.');
            onVersionChange();
        };
    }
    async function transaction(names, mode, action) {
        if (!db) throw Error('Der Gerätespeicher ist nicht geöffnet. Bitte erneut laden.');
        const tx = db.transaction(names, mode);
        const done = new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onabort = () => reject(tx.error || Error('Speichervorgang abgebrochen.'));
        });
        // Attach a rejection handler immediately, including while an IDB request is pending.
        done.catch(() => {});
        try {
            const result = await action(tx);
            await done;
            return result;
        } catch (error) {
            try { tx.abort(); } catch { /* It may already have completed or aborted. */ }
            await done.catch(() => {});
            throw error;
        }
    }
    const meta = () => transaction(['meta'], 'readonly', tx => request(tx.objectStore('meta').get('state')));
    function marker(status) { getStorage().setItem(MARKER_KEY, JSON.stringify({ engine: 'indexeddb', version: 3, status })); }
    function legacyNow() { return getStorage().getItem(KEY); }
    function checkLegacy(expected, allowReplacement = false) {
        const latest = legacyNow();
        if (latest !== expected && !allowReplacement) {
            raw = latest;
            throw Error('Eine ältere App-Version hat den bisherigen Speicherstand geändert. Bitte alle anderen App-Fenster schließen und beide Datenstände als Backup sichern. Zum Zusammenführen ein geprüftes Backup importieren.');
        }
        return latest;
    }
    function ordered(rows) {
        const sorted = rows.sort((a, b) => a.order - b.order);
        if (sorted.some((row, i) => row.order !== i)) throw Error('Die gespeicherte Reihenfolge ist beschädigt. Bitte Originaldaten sichern.');
        return sorted.map(({ order, ...item }) => item);
    }
    async function readAll() {
        return transaction(STORES, 'readonly', async tx => {
            const [state, profile, entries, sessions, draft, planRecord, foods, nutritionRecord] = await Promise.all([
                request(tx.objectStore('meta').get('state')),
                request(tx.objectStore('settings').get('profile')),
                request(tx.objectStore('entries').getAll()),
                request(tx.objectStore('sessions').getAll()),
                request(tx.objectStore('drafts').get('active')),
                request(tx.objectStore('plans').get('active')),
                request(tx.objectStore('customFoods').getAll()),
                request(tx.objectStore('settings').get('nutrition'))
            ]);
            // Keep a downloadable dump even if validation or ordering fails.
            raw = fullText({ goal: profile?.goal, entries, sessions }, draft?.value, planRecord?.value, { ...nutritionRecord?.value, foods });
            const data = validateData({ goal: profile?.goal, entries: ordered(entries), sessions: ordered(sessions) });
            const draftState = validateTraining(draft?.value);
            const planState = validateProgram(planRecord?.value, data, draftState);
            const nutritionState = validateNutrition({ ...nutritionRecord?.value, foods: ordered(foods) }, data);
            return { state, data, training: draftState, program: planState, nutrition: nutritionState };
        });
    }
    function putData(tx, data, draftState, planState = emptyProgram(), nutritionState = emptyNutrition()) {
        for (const name of ['settings', 'entries', 'sessions', 'drafts', 'customFoods']) tx.objectStore(name).clear();
        tx.objectStore('settings').put({ id: 'profile', goal: data.goal });
        tx.objectStore('settings').put({ id: 'nutrition', value: { entryUnits: nutritionState.entryUnits, goals: nutritionState.goals } });
        nutritionState.foods.forEach((food, order) => tx.objectStore('customFoods').put({ ...food, order }));
        data.entries.forEach((entry, order) => tx.objectStore('entries').put({ ...entry, order }));
        data.sessions.forEach((session, order) => tx.objectStore('sessions').put({ ...session, order }));
        tx.objectStore('drafts').put({ id: 'active', value: draftState });
        tx.objectStore('plans').put({ id: 'active', value: planState });
    }
    async function finishClear() {
        const storage = getStorage();
        storage.removeItem(KEY);
        storage.removeItem(RECOVERY_KEY);
        marker('cleared');
        await transaction(['meta'], 'readwrite', async tx => {
            const store = tx.objectStore('meta'), state = await request(store.get('state'));
            if (state.phase === 'clearing') store.put({ ...state, phase: 'ready' });
        });
    }
    async function migrate() {
        let state = await meta();
        if (state?.phase === 'clearing') { await finishClear(); state = await meta(); }
        if (!state) {
            const priorMarker = getStorage().getItem(MARKER_KEY);
            if (priorMarker !== null) throw Error('Der bisher aktive Gerätespeicher fehlt. Ein alter Speicherstand wird nicht automatisch erneut eingespielt. Bitte ein Backup wiederherstellen.');
            const source = legacyNow(), previous = getStorage().getItem(RECOVERY_KEY);
            // Persist untouched source bytes before parsing or transforming anything.
            await transaction(['meta', 'recovery'], 'readwrite', async tx => {
                const store = tx.objectStore('meta');
                if (await request(store.get('state'))) return;
                tx.objectStore('recovery').put({ id: 'migration', raw: source, previous });
                if (previous !== null) tx.objectStore('recovery').put({ id: 'before-import', raw: previous });
                store.put({ id: 'state', schema: 3, phase: 'pending', revision: 0, legacyRaw: source });
            });
            state = await meta();
        }
        if (state.schema !== 3 || !Number.isSafeInteger(state.revision) || state.revision < 0
            || !(state.legacyRaw === null || typeof state.legacyRaw === 'string')) throw Error('Unbekanntes oder beschädigtes Speicherformat. Bitte Originaldaten sichern.');
        revision = state.revision;
        if (state.phase === 'ready') return;
        if (!['pending', 'verifying'].includes(state.phase)) throw Error('Unbekannter Migrationszustand. Bitte Originaldaten sichern.');
        checkLegacy(state.legacyRaw);
        const source = state.legacyRaw === null ? emptyData() : validateData(JSON.parse(state.legacyRaw));
        if (state.phase === 'pending') {
            await transaction(STORES, 'readwrite', async tx => {
                const store = tx.objectStore('meta'), latest = await request(store.get('state'));
                if (latest.phase !== 'pending' || latest.revision !== state.revision) return;
                checkLegacy(latest.legacyRaw);
                putData(tx, source, emptyTraining());
                store.put({ ...latest, phase: 'verifying', revision: latest.revision + 1 });
            });
        }
        const verified = await readAll();
        if (verified.state.phase === 'ready') return;
        if (JSON.stringify(verified.data) !== JSON.stringify(source)
            || JSON.stringify(verified.training) !== JSON.stringify(emptyTraining())
            || JSON.stringify(verified.program) !== JSON.stringify(emptyProgram())
            || JSON.stringify(verified.nutrition) !== JSON.stringify(emptyNutrition())) throw Error('Die Übernahme konnte nicht vollständig geprüft werden. Der Originalstand bleibt erhalten.');
        checkLegacy(state.legacyRaw);
        await transaction(['meta'], 'readwrite', async tx => {
            const store = tx.objectStore('meta'), latest = await request(store.get('state'));
            if (latest.phase === 'verifying' && latest.revision === verified.state.revision) store.put({ ...latest, phase: 'ready' });
        });
    }
    async function load() {
        current = null;
        revision = null;
        readable = false;
        active = false;
        try {
            legacy = legacyNow();
            readable = true;
            raw = databaseRaw ?? legacy;
            const savedMarker = getStorage().getItem(MARKER_KEY);
            if (savedMarker !== null) {
                const value = JSON.parse(savedMarker);
                if (value?.engine !== 'indexeddb' || ![1, 2, 3].includes(value.version) || !['active', 'cleared'].includes(value.status)) {
                    throw Error('Unbekannte Speicherversion. Bitte die passende App-Version verwenden.');
                }
            }
            await open();
            await migrate();
            const result = await readAll();
            revision = result.state.revision;
            if (result.state.phase !== 'ready') throw Error('Die Datenübernahme ist noch nicht abgeschlossen. Bitte erneut laden.');
            legacy = result.state.legacyRaw;
            current = result.data;
            training = result.training;
            program = result.program;
            nutrition = result.nutrition;
            checkLegacy(result.state.legacyRaw);
            marker('active');
            active = true;
            raw = fullText(current, training, program, nutrition);
            databaseRaw = raw;
            problem = null;
            return structuredClone(current);
        } catch (error) { problem = error; return current ? structuredClone(current) : null; }
    }
    async function write(candidate, { replacement = false, training: draftState, previousTraining, program: planState, previousProgram, nutrition: nutritionState, previousNutrition, allowReset = false } = {}) {
        if (allowReset) return clear();
        try {
            if (!db || !readable || (!active && !replacement)) throw Error('Der Gerätespeicher ist nicht geladen. Bitte Originaldaten sichern und erneut laden oder ein Backup wiederherstellen.');
            const next = validateData(candidate), nextTraining = validateTraining(draftState ?? training);
            const nextNutrition = validateNutrition(replacement ? (nutritionState ?? emptyNutrition()) : recordGoal(nutritionState ?? nutrition, next.goal), next);
            const priorNutrition = replacement && current ? validateNutrition(previousNutrition ?? nutrition, current ?? next) : null;
            const nextProgram = validateProgram(planState ?? program, next, nextTraining);
            const priorProgram = replacement && current ? validateProgram(previousProgram ?? program, current ?? next, previousTraining ?? training) : null;
            const priorTraining = replacement && current ? validateTraining(previousTraining ?? training) : null;
            const latestLegacy = checkLegacy(legacy, replacement);
            const expectedRevision = revision;
            const nextRevision = await transaction(STORES, 'readwrite', async tx => {
                const store = tx.objectStore('meta'), latest = await request(store.get('state'));
                if ((latest?.revision ?? null) !== expectedRevision) throw conflict();
                if (replacement) {
                    tx.objectStore('recovery').put({ id: 'before-import', raw: current ? fullText(current, priorTraining, priorProgram, priorNutrition) : raw });
                    if (latestLegacy !== legacy) tx.objectStore('recovery').put({ id: 'legacy-conflict', raw: latestLegacy });
                } else if (latest.phase !== 'ready') throw Error('Die Datenübernahme ist noch nicht abgeschlossen.');
                putData(tx, next, nextTraining, nextProgram, nextNutrition);
                const updated = { id: 'state', schema: 3, phase: 'ready', revision: (latest?.revision ?? 0) + 1, legacyRaw: latestLegacy };
                store.put(updated);
                return updated.revision;
            });
            // During explicit recovery, verify the newly activated database too.
            if (!active) {
                const verified = await readAll();
                if (JSON.stringify(verified.data) !== JSON.stringify(next)
                    || JSON.stringify(verified.training) !== JSON.stringify(nextTraining)
                    || JSON.stringify(verified.program) !== JSON.stringify(nextProgram)
                    || JSON.stringify(verified.nutrition) !== JSON.stringify(nextNutrition)) throw Error('Wiederherstellung konnte nicht geprüft werden. Bitte erneut laden.');
                marker('active');
            }
            revision = nextRevision;
            legacy = latestLegacy;
            current = next;
            training = nextTraining;
            program = nextProgram;
            nutrition = nextNutrition;
            active = true;
            raw = fullText(current, training, program, nutrition);
            databaseRaw = raw;
            problem = null;
            return structuredClone(current);
        } catch (error) { problem = error; throw error; }
    }
    async function saveTraining(candidate) {
        try {
            if (!db || !active) throw Error('Der Gerätespeicher ist nicht geladen.');
            const next = validateTraining(candidate);
            validateProgram(program, current, next);
            checkLegacy(legacy);
            const expectedRevision = revision;
            const nextRevision = await transaction(['meta', 'drafts'], 'readwrite', async tx => {
                const store = tx.objectStore('meta'), latest = await request(store.get('state'));
                if (latest.phase !== 'ready' || latest.revision !== expectedRevision) throw conflict();
                tx.objectStore('drafts').put({ id: 'active', value: next });
                store.put({ ...latest, revision: latest.revision + 1 });
                return latest.revision + 1;
            });
            revision = nextRevision;
            training = next;
            raw = fullText(current, training, program, nutrition);
            databaseRaw = raw;
            problem = null;
            return true;
        } catch (error) { problem = error; throw error; }
    }
    async function recovery(id) {
        if (!db) return null;
        return transaction(['recovery'], 'readonly', async tx => (await request(tx.objectStore('recovery').get(id)))?.raw ?? null);
    }
    async function clear() {
        let committed = false;
        try {
            if (!db || !readable) throw Error('Der Gerätespeicher ist nicht geöffnet. Bitte erneut laden.');
            const expectedRevision = revision;
            const nextRevision = await transaction(STORES, 'readwrite', async tx => {
                const latest = await request(tx.objectStore('meta').get('state'));
                if ((latest?.revision ?? null) !== expectedRevision) throw conflict();
                putData(tx, emptyData(), emptyTraining());
                tx.objectStore('recovery').clear();
                tx.objectStore('meta').put({ id: 'state', schema: 3, phase: 'clearing', revision: (latest?.revision ?? 0) + 1, legacyRaw: null });
                return (latest?.revision ?? 0) + 1;
            });
            revision = nextRevision;
            committed = true;
            await finishClear();
            legacy = null;
            current = emptyData();
            training = emptyTraining();
            program = emptyProgram();
            nutrition = emptyNutrition();
            active = true;
            raw = fullText(current, training, program, nutrition);
            databaseRaw = raw;
            problem = null;
            return structuredClone(current);
        } catch (error) {
            if (committed) {
                error = Error('Die Einträge im Gerätespeicher sind gelöscht. Alte Sicherungen konnten noch nicht vollständig entfernt werden. Bitte erneut laden, um das Löschen abzuschließen. Noch angezeigte Werte stammen aus dem vorherigen Stand dieses Fensters.');
                error.code = 'CLEAR_PENDING';
            }
            problem = error;
            throw error;
        }
    }
    async function querySessions(options) {
        const query = historyOptions(options);
        if (!db || !active) throw Error('Die Trainingshistorie ist nicht geladen. Bitte gespeicherte Daten erneut laden.');
        return transaction(['meta', 'sessions'], 'readonly', async tx => {
            const state = await request(tx.objectStore('meta').get('state'));
            if (state.phase !== 'ready' || state.revision !== revision) throw conflict();
            const store = tx.objectStore('sessions');
            // Old imported test databases may not have an index. Do not alter their schema here.
            if (!store.indexNames.contains('date')) {
                const rows = await request(store.getAll());
                return historyPage(rows.map(({ order, ...session }) => session), query);
            }
            return new Promise((resolve, reject) => {
                const sessions = [];
                let total = 0;
                const cursor = store.index('date').openCursor(null, 'prev');
                cursor.onerror = () => reject(cursor.error);
                cursor.onsuccess = () => {
                    const row = cursor.result;
                    if (!row || (query.from && row.key < query.from)) return resolve({ sessions, total });
                    if (query.to && row.key > query.to) { row.continue(query.to); return; }
                    if (sessionMatches(row.value, query)) {
                        if (total >= query.offset && sessions.length < query.limit) {
                            const { order, ...session } = row.value;
                            sessions.push(session);
                        }
                        total++;
                    }
                    row.continue();
                };
            });
        });
    }
    return {
        load, write, saveTraining, clear, querySessions,
        async loadNutrition() { return structuredClone(nutrition); },
        async saveNutrition(candidate) { await write(current, { nutrition: candidate }); return structuredClone(nutrition); },
        async loadProgram() { return structuredClone(program); },
        async saveProgram(candidate) { await write(current, { program: candidate }); return structuredClone(program); },
        async loadTraining() { if (!current) return emptyTraining(); return structuredClone(training); },
        previous: () => recovery('before-import'),
        migration: () => recovery('migration'),
        conflict: () => recovery('legacy-conflict'),
        async removePrevious() { await transaction(['recovery'], 'readwrite', tx => request(tx.objectStore('recovery').delete('before-import'))); },
        get raw() { return raw; },
        get problem() { return problem; },
        get loaded() { return current !== null; },
        close() { db?.close(); db = null; }
    };
}
