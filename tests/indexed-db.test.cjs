const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { Storage, fixture, state, KEY, RECOVERY } = require('./app-harness.cjs');

const modules = Promise.all([
    import('../src/storage/indexed-db.js'),
    import('../src/domain/training-state.js'),
    import('../src/services/backup.js')
]);
const req = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
async function setup(raw = JSON.stringify(state(fixture)), options = {}) {
    const [{ createIndexedDBStore }, { emptyTraining }] = await modules;
    const storage = options.storage || new Storage(raw), indexedDB = options.indexedDB || new IDBFactory();
    const create = () => createIndexedDBStore({ indexedDB, getStorage: () => storage });
    const store = create();
    return { storage, indexedDB, store, create, emptyTraining };
}
async function inspect(factory, name) {
    const [{ DB_NAME }] = await modules;
    const db = await req(factory.open(DB_NAME));
    try { return await req(db.transaction(name).objectStore(name).getAll()); }
    finally { db.close(); }
}

test('v2 migration preserves exact source, IDs, order, all values and existing recovery copy', async () => {
    const original = state(fixture), raw = '  ' + JSON.stringify(original, null, 2) + '\n';
    const env = await setup(raw);
    env.storage.values.set(RECOVERY, 'previous-original-bytes');
    assert.deepEqual(await env.store.load(), original);
    assert.equal(env.store.problem, null);
    assert.equal(await env.store.migration(), raw);
    assert.equal(await env.store.previous(), 'previous-original-bytes');
    assert.equal(env.storage.getItem(KEY), raw);
    assert.equal(env.storage.writes.filter(write => write.key === KEY).length, 0);
    assert.equal((await inspect(env.indexedDB, 'meta'))[0].phase, 'ready');
    await env.store.write({ ...original, goal: 175 });
    env.store.close();
    const reopened = env.create();
    assert.deepEqual(await reopened.load(), { ...original, goal: 175 });
    assert.equal(await reopened.migration(), raw);
    assert.equal(env.storage.getItem(KEY), raw, 'No dual writes to the old store');
    reopened.close();
});

test('concurrent first loads migrate only once and expose the same complete data', async () => {
    const env = await setup();
    const other = env.create();
    const results = await Promise.all([env.store.load(), other.load()]);
    assert.deepEqual(results, [state(fixture), state(fixture)]);
    assert.equal((await inspect(env.indexedDB, 'entries')).length, fixture.entries.length);
    env.store.close(); other.close();
});

test('a migration transaction abort rolls back partial data and can be retried', async () => {
    const env = await setup();
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'sessions') throw Error('Simulated storage failure during copy');
        return originalPut.apply(this, args);
    };
    try {
        assert.equal(await env.store.load(), null);
        assert.match(env.store.problem.message, /Simulated/);
        assert.equal(await env.store.migration(), env.storage.getItem(KEY));
        assert.equal((await inspect(env.indexedDB, 'entries')).length, 0);
        assert.equal((await inspect(env.indexedDB, 'settings')).length, 0);
        assert.equal((await inspect(env.indexedDB, 'meta'))[0].phase, 'pending');
    } finally { IDBObjectStore.prototype.put = originalPut; }
    assert.deepEqual(await env.store.load(), state(fixture));
    env.store.close();
});

test('a failure during readback never activates an unverified migration and recovers on restart', async () => {
    const env = await setup();
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
        if (this.name === 'entries') throw Error('Simulated crash before verification');
        return getAll.apply(this, args);
    };
    try {
        assert.equal(await env.store.load(), null);
        assert.equal((await inspect(env.indexedDB, 'meta'))[0].phase, 'verifying');
        assert.equal(env.storage.getItem('vegan-strength-storage'), null);
    } finally { IDBObjectStore.prototype.getAll = getAll; }
    env.store.close();
    const reopened = env.create();
    assert.deepEqual(await reopened.load(), state(fixture));
    reopened.close();
});

for (const raw of ['{broken', '{}', JSON.stringify({ ...fixture, customFoods: [] })]) {
    test('invalid legacy data is saved untouched and never silently migrated: ' + raw.slice(0, 15), async () => {
        const env = await setup(raw);
        assert.equal(await env.store.load(), null);
        assert.equal(env.store.loaded, false);
        assert.equal(env.store.raw, raw);
        assert.equal(await env.store.migration(), raw);
        assert.equal(env.storage.getItem(KEY), raw);
        assert.equal((await inspect(env.indexedDB, 'entries')).length, 0);
        await assert.rejects(env.store.write(state(fixture)), /nicht geladen/);
        assert.deepEqual(await env.store.write(state(fixture), { replacement: true }), state(fixture));
        assert.equal(await env.store.previous(), raw);
        env.store.close();
    });
}

test('stale tabs cannot overwrite a more recent data or draft revision', async () => {
    const env = await setup();
    await env.store.load();
    const second = env.create();
    await second.load();
    await env.store.write({ ...state(fixture), goal: 175 });
    await assert.rejects(second.write(state(fixture)), /anderen Fenster/);
    await assert.rejects(second.saveTraining(env.emptyTraining()), /anderen Fenster/);
    assert.deepEqual(await second.load(), { ...state(fixture), goal: 175 });
    await second.saveTraining({ ...env.emptyTraining(), current: 1 });
    await assert.rejects(env.store.write(state(fixture)), /anderen Fenster/);
    env.store.close(); second.close();
});

test('modification by a legacy writer is detected without losing either branch', async () => {
    const env = await setup();
    await env.store.load();
    await env.store.write({ ...state(fixture), goal: 175 });
    const external = JSON.stringify({ ...state(fixture), goal: 160 });
    env.storage.values.set(KEY, external);
    await assert.rejects(env.store.write(state(fixture)), /ältere App-Version/);
    assert.equal(env.store.raw, external);
    assert.equal((await env.store.load()).goal, 175);
    assert.equal(env.store.raw, external);
    await env.store.write({ ...state(fixture), goal: 180 }, { replacement: true });
    const prior = JSON.parse(await env.store.previous());
    assert.equal(prior.goal, 175);
    assert.equal(env.storage.getItem(KEY), external);
    env.store.close();
});

test('missing IndexedDB never falls back to overwriting the old localStorage data', async () => {
    const [{ createIndexedDBStore }] = await modules;
    const raw = JSON.stringify(state(fixture)), storage = new Storage(raw);
    const store = createIndexedDBStore({ indexedDB: undefined, getStorage: () => storage });
    assert.equal(await store.load(), null);
    assert.match(store.problem.message, /nicht verfügbar/);
    assert.equal(store.raw, raw);
    await assert.rejects(store.write(state(fixture), { replacement: true }), /nicht geladen/);
    assert.equal(storage.getItem(KEY), raw);
    assert.equal(storage.writes.length, 0);
});

test('failure to mark migration leaves data recoverable and does not rerun the import', async () => {
    const env = await setup();
    env.storage.failWrite = 'vegan-strength-storage';
    const loaded = await env.store.load();
    assert.deepEqual(loaded, state(fixture));
    assert.ok(env.store.problem);
    assert.equal((await inspect(env.indexedDB, 'entries')).length, 2);
    await assert.rejects(env.store.write({ ...state(fixture), goal: 175 }), /nicht geladen/);
    env.storage.failWrite = null;
    assert.deepEqual(await env.store.load(), state(fixture));
    assert.equal((await inspect(env.indexedDB, 'entries')).length, 2);
    env.store.close();
});

test('an absent previously migrated database does not resurrect the old localStorage snapshot', async () => {
    const env = await setup();
    await env.store.load();
    env.store.close();
    const [{ DB_NAME }] = await modules;
    await req(env.indexedDB.deleteDatabase(DB_NAME));
    const reopened = env.create();
    assert.equal(await reopened.load(), null);
    assert.match(reopened.problem.message, /nicht automatisch/);
    assert.equal((await inspect(env.indexedDB, 'entries')).length, 0);
    await reopened.write(state(fixture), { replacement: true });
    assert.equal(reopened.loaded, true);
    reopened.close();
});

test('clear removes all personal stores and legacy snapshots and survives a cleanup interruption', async () => {
    const env = await setup();
    await env.store.load();
    await env.store.write({ ...state(fixture), goal: 175 }, { replacement: true });
    await env.store.saveTraining({ ...env.emptyTraining(), current: 1 });
    env.storage.failRemove = true;
    await assert.rejects(env.store.clear(), /Löschen abzuschließen/);
    assert.equal((await inspect(env.indexedDB, 'meta'))[0].phase, 'clearing');
    env.store.close();
    env.storage.failRemove = false;
    const reopened = env.create();
    assert.deepEqual(await reopened.load(), { goal: 150, entries: [], sessions: [] });
    assert.deepEqual(await reopened.loadTraining(), env.emptyTraining());
    assert.equal(await reopened.migration(), null);
    assert.equal(await reopened.previous(), null);
    assert.equal(env.storage.getItem(KEY), null);
    assert.equal(env.storage.getItem(RECOVERY), null);
    assert.equal((await inspect(env.indexedDB, 'recovery')).length, 0);
    reopened.close();
});

test('a version change closes old connections and protects their last readable snapshot', async () => {
    const env = await setup();
    await env.store.load();
    const [{ DB_NAME, DB_VERSION }] = await modules;
    const upgrade = await req(env.indexedDB.open(DB_NAME, DB_VERSION + 1));
    assert.match(env.store.problem.message, /anderen Fenster aktualisiert/);
    await assert.rejects(env.store.write(state(fixture)), /nicht geladen/);
    assert.equal(JSON.parse(env.store.raw).entries.length, 2);
    upgrade.close(); env.store.close();
});

test('readback comparison detects changed values even when record counts are correct', async () => {
    const env = await setup();
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
        const result = original.apply(this, args);
        if (this.name === 'entries') result.addEventListener('success', () => {
            const changed = structuredClone(result.result);
            changed[0].protein += 1;
            Object.defineProperty(result, 'result', { value: changed });
        });
        return result;
    };
    try {
        assert.equal(await env.store.load(), null);
        assert.match(env.store.problem.message, /nicht vollständig geprüft/);
        assert.equal((await inspect(env.indexedDB, 'meta'))[0].phase, 'verifying');
    } finally { IDBObjectStore.prototype.getAll = original; }
    assert.deepEqual(await env.store.load(), state(fixture));
    env.store.close();
});

test('a blocked database opening gives a recovery message without any fallback writes', async () => {
    const [{ createIndexedDBStore }] = await modules;
    const storage = new Storage(JSON.stringify(state(fixture)));
    const store = createIndexedDBStore({
        indexedDB: { open() { const opening = {}; queueMicrotask(() => opening.onblocked()); return opening; } },
        getStorage: () => storage
    });
    assert.equal(await store.load(), null);
    assert.match(store.problem.message, /blockiert/);
    assert.equal(storage.writes.length, 0);
    assert.equal(store.raw, storage.getItem(KEY));
});

test('an unknown future storage marker is never overwritten', async () => {
    const env = await setup();
    const marker = JSON.stringify({ engine: 'indexeddb', version: 2, status: 'active' });
    env.storage.values.set('vegan-strength-storage', marker);
    assert.equal(await env.store.load(), null);
    assert.match(env.store.problem.message, /Unbekannte Speicherversion/);
    assert.equal(env.storage.getItem('vegan-strength-storage'), marker);
    assert.equal(env.storage.writes.length, 0);
    env.store.close();
});

test('the same open app can recover a missing database and retains its last readable full backup', async () => {
    const env = await setup();
    await env.store.load();
    await env.store.write({ ...state(fixture), goal: 175 });
    const [{ DB_NAME }] = await modules;
    await req(env.indexedDB.deleteDatabase(DB_NAME));
    assert.equal(await env.store.load(), null);
    assert.equal(JSON.parse(env.store.raw).goal, 175, 'Retain the most recent DB snapshot, not stale localStorage');
    await env.store.write({ ...state(fixture), goal: 180 }, { replacement: true });
    assert.equal((await env.store.load()).goal, 180);
    env.store.close();
});
