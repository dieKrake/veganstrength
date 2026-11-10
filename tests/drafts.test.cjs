const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { app, Storage, fixture, state, KEY } = require('./app-harness.cjs');

test('confirmed inputs, completed sets, selected workout and timer survive restart', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage(JSON.stringify(state(fixture)));
    const first = await app(storage, { indexedDB });
    await first.checkSet('3', '2.5');
    const select = first.element('workoutSelect');
    select.value = '1'; select.onchange({ target: select });
    const input = first.element('exerciseList').querySelectorAll('input')[0];
    input.value = '10'; input.oninput();
    await first.idle();
    assert.match(first.element('draftStatus').textContent, /gespeichert/);
    first.close();
    const second = await app(storage, { indexedDB });
    assert.equal(second.element('workoutSelect').value, '1');
    assert.equal(second.draft().reps, '10');
    assert.equal(second.intervals.size, 1, 'The rest timer is restored');
    const resumedSelect = second.element('workoutSelect');
    resumedSelect.value = '0'; resumedSelect.onchange({ target: resumedSelect });
    assert.deepEqual(second.draft(), { reps: '3', kg: '2.5', done: true });
    assert.deepEqual(second.data(), state(fixture));
    second.close();
});

test('rapid changes are coalesced and only the latest input is confirmed', async () => {
    const indexedDB = new IDBFactory();
    const ui = await app(new Storage(), { indexedDB });
    ui.navigate('training');
    const input = ui.element('exerciseList').querySelectorAll('input')[0];
    for (const value of ['1', '12', '123']) { input.value = value; input.oninput(); }
    await ui.idle();
    ui.close();
    const restarted = await app(ui.storage, { indexedDB });
    assert.equal(restarted.draft().reps, '123');
    restarted.close();
});

test('a failed draft save retains its inputs, shows a retry action and can be retried', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage();
    const ui = await app(storage, { indexedDB });
    await ui.checkSet('3', '0');
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'drafts') throw Error('Quota exceeded');
        return put.apply(this, args);
    };
    try { await ui.idle(); }
    finally { IDBObjectStore.prototype.put = put; }
    assert.match(ui.element('draftStatus').textContent, /nicht gespeichert/);
    assert.equal(ui.element('retryDraft').classList.contains('hidden'), false);
    assert.deepEqual(ui.draft(), { reps: '3', kg: '0', done: true });
    await ui.element('retryDraft').click();
    assert.match(ui.element('draftStatus').textContent, /gespeichert/);
    ui.close();
    const restarted = await app(storage, { indexedDB });
    assert.equal(restarted.draft().done, true);
    restarted.close();
});

test('workout completion commits history and removes the draft together', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage();
    const ui = await app(storage, { indexedDB });
    await ui.checkSet('3', '0');
    await ui.idle();
    await ui.element('saveWorkout').click();
    await ui.idle();
    assert.equal(ui.data().sessions.length, 1);
    ui.close();
    const restarted = await app(storage, { indexedDB });
    assert.equal(restarted.data().sessions.length, 1);
    restarted.navigate('training');
    assert.equal(restarted.draft().done, false);
    assert.equal(restarted.intervals.size, 0);
    restarted.close();
});

test('failed workout transaction preserves both the confirmed draft and the old history', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage();
    const ui = await app(storage, { indexedDB });
    await ui.checkSet('3', '0');
    await ui.idle();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'sessions') throw Error('Quota exceeded');
        return put.apply(this, args);
    };
    try { await ui.element('saveWorkout').click(); }
    finally { IDBObjectStore.prototype.put = put; }
    assert.equal(ui.data().sessions.length, 0);
    assert.equal(ui.draft().done, true);
    ui.close();
    const restarted = await app(storage, { indexedDB });
    assert.equal(restarted.data().sessions.length, 0);
    assert.deepEqual(restarted.draft(), { reps: '3', kg: '0', done: true });
    restarted.close();
});

test('full backups restore entries, history, drafts, selection and timer while v2 stays importable', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage(JSON.stringify(state(fixture)));
    const source = await app(storage, { indexedDB });
    await source.checkSet('3', '0');
    await source.idle();
    await source.element('exportData').click();
    const backup = JSON.parse(await source.downloads[0].blob.text());
    assert.equal(backup.version, 5);
    assert.equal(backup.training.drafts['0'].exercises[0].sets[0].reps, '3');
    assert.ok(backup.training.timer.endAt > Date.now());
    const targetDB = new IDBFactory(), targetStorage = new Storage();
    const target = await app(targetStorage, { indexedDB: targetDB });
    await target.import(backup);
    assert.deepEqual(target.data(), state(fixture));
    target.close();
    const restored = await app(targetStorage, { indexedDB: targetDB });
    assert.deepEqual(restored.draft(), { reps: '3', kg: '0', done: true });
    assert.equal(restored.intervals.size, 1);
    await restored.import(fixture);
    assert.deepEqual(restored.data(), state(fixture));
    assert.equal(restored.intervals.size, 0);
    restored.navigate('training');
    assert.equal(restored.draft().done, false);
    source.close(); restored.close();
});

test('draft corruption is rejected before confirmation without changing the active database', async () => {
    const indexedDB = new IDBFactory(), ui = await app(new Storage(), { indexedDB });
    await ui.checkSet('3', '0');
    await ui.element('exportData').click();
    const backup = JSON.parse(await ui.downloads[0].blob.text());
    backup.training.drafts['0'].exercises[0].name = 'Unrelated exercise';
    await ui.import(backup);
    assert.equal(ui.confirmations.length, 0);
    assert.match(ui.alerts.at(-1), /Import fehlgeschlagen/);
    assert.equal(ui.draft().done, true);
    ui.close();
});

test('an import transaction failure preserves data, draft and the existing pre-import backup', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage(JSON.stringify(state(fixture)));
    const ui = await app(storage, { indexedDB });
    await ui.checkSet('3', '0');
    await ui.idle();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'sessions') throw Error('Quota exceeded');
        return put.apply(this, args);
    };
    try { await ui.import({ ...fixture, goal: 180 }); }
    finally { IDBObjectStore.prototype.put = put; }
    assert.deepEqual(ui.data(), state(fixture));
    assert.equal(ui.draft().done, true);
    ui.close();
    const restarted = await app(storage, { indexedDB });
    assert.deepEqual(restarted.data(), state(fixture));
    assert.equal(restarted.draft().done, true);
    assert.equal(restarted.element('exportPrevious').classList.contains('hidden'), true);
    restarted.close();
});

test('a stale tab cannot silently replace a more recently confirmed draft', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage();
    const first = await app(storage, { indexedDB });
    const second = await app(storage, { indexedDB });
    await first.checkSet('2', '0'); await first.idle();
    await second.checkSet('3', '0'); await second.idle();
    assert.match(second.element('draftStatus').textContent, /nicht gespeichert/);
    assert.equal(second.draft().reps, '3');
    first.close(); second.close();
    const restarted = await app(storage, { indexedDB });
    assert.equal(restarted.draft().reps, '2');
    restarted.close();
});

test('no IndexedDB in the production setup means no silent fallback and no changes to old data', async () => {
    const raw = JSON.stringify(state(fixture)), storage = new Storage(raw);
    const ui = await app(storage, { useDefaultStorage: true });
    assert.equal(ui.element('storageNotice').classList.contains('hidden'), false);
    await ui.element('addFood').click();
    assert.equal(storage.getItem(KEY), raw);
    assert.equal(storage.writes.length, 0);
    assert.equal(ui.data().entries.length, 0);
    ui.close();
});

test('clear removes confirmed drafts and migration snapshots without reimporting old sessions', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage(JSON.stringify(state(fixture)));
    const ui = await app(storage, { indexedDB });
    await ui.checkSet('3', '0'); await ui.idle();
    await ui.element('clearData').click();
    await ui.idle();
    ui.close();
    const restarted = await app(storage, { indexedDB });
    assert.deepEqual(restarted.data(), { goal: 150, entries: [], sessions: [] });
    assert.equal(restarted.element('exportMigration').classList.contains('hidden'), true);
    restarted.navigate('training');
    assert.equal(restarted.draft().done, false);
    assert.equal(storage.getItem(KEY), null);
    restarted.close();
});

test('timer restoration uses its absolute deadline and expires without restarting the rest', async () => {
    const { createTimer } = await import('../src/services/timer.js');
    const elements = { timerDisplay: {}, timerStart: {}, timerStop: {} };
    let clock = 5000, callback;
    const timer = createTimer({
        document: { getElementById: id => elements[id], querySelectorAll: () => [] },
        navigator: {}, now: () => clock,
        setInterval: handler => { callback = handler; return 1; }, clearInterval() {}
    });
    timer.restore({ seconds: 120, endAt: 35000 });
    assert.equal(elements.timerDisplay.textContent, '00:30');
    clock = 40000; callback();
    assert.equal(elements.timerDisplay.textContent, '00:00');
    assert.deepEqual(timer.snapshot(), { seconds: 0, endAt: null });
    timer.restore({ seconds: 120, endAt: 35000 });
    assert.equal(elements.timerDisplay.textContent, '00:00');
    assert.equal(elements.timerStart.textContent, '▶ Start');
});

test('the pre-import backup includes live inputs even before the autosave debounce completes', async () => {
    const indexedDB = new IDBFactory(), ui = await app(new Storage(), { indexedDB });
    await ui.checkSet('3', '0');
    await ui.import(fixture);
    await ui.element('exportPrevious').click();
    const previous = JSON.parse(await ui.downloads[0].blob.text());
    assert.equal(previous.version, 5);
    assert.equal(previous.training.drafts['0'].exercises[0].sets[0].reps, '3');
    assert.equal(previous.training.drafts['0'].exercises[0].sets[0].done, true);
    await ui.idle();
    ui.close();
});
