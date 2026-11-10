const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { app, Storage, fixture, state, KEY, RECOVERY } = require('./app-harness.cjs');

test('existing v2 state loads without changing IDs, order, decimals, seconds or incomplete sets', async () => {
    const original = state(fixture);
    const storage = new Storage(JSON.stringify(original));
    const ui = await app(storage);
    assert.deepEqual(ui.data(), original);
    assert.equal(ui.total('2024-02-29'), 250.5 * 3.3 / 100);
    assert.equal(storage.writes.length, 0);
    await ui.element('exportData').click();
    const exported = JSON.parse(await ui.downloads[0].blob.text());
    assert.equal(exported.app, fixture.app);
    assert.equal(exported.version, 5);
    assert.deepEqual(state(exported), original);
    await ui.element('exportLegacyData').click();
    const legacyExport = JSON.parse(await ui.downloads[1].blob.text());
    assert.equal(legacyExport.version, 2);
    assert.deepEqual(state(legacyExport), original);
});

test('first launch does not create or overwrite storage until a successful action', async () => {
    const ui = await app();
    assert.deepEqual(ui.data(), { goal: 150, entries: [], sessions: [] });
    assert.equal(ui.storage.writes.length, 0);
    await ui.element('addFood').click();
    assert.equal(ui.data().entries[0].amount, 200);
    assert.equal(JSON.parse(ui.storage.getItem(KEY)).entries.length, 1);
});

test('confirmed import previews counts, retains raw original and survives app restart', async () => {
    const raw = '  ' + JSON.stringify({ goal: 160, entries: [], sessions: [] }, null, 2) + '\n';
    const storage = new Storage(raw);
    const ui = await app(storage);
    await ui.import(fixture);
    assert.match(ui.confirmations[0], /2 Lebensmitteleinträge/);
    assert.match(ui.confirmations[0], /2 Trainings/);
    assert.match(ui.confirmations[0], /150 g/);
    assert.equal(storage.getItem(RECOVERY), raw);
    assert.deepEqual(ui.data(), state(fixture));
    assert.equal(ui.element('importFile').value, '');
    const restarted = await app(storage);
    assert.deepEqual(restarted.data(), state(fixture));
    assert.equal(restarted.element('exportPrevious').classList.contains('hidden'), false);
    await restarted.element('exportPrevious').click();
    assert.equal(await restarted.downloads[0].blob.text(), raw);
});

test('the raw v2 data format remains importable without backup metadata', async () => {
    const ui = await app();
    await ui.import(state(fixture));
    assert.deepEqual(ui.data(), state(fixture));
});

test('cancelled import leaves storage, previous recovery copy and training input intact', async () => {
    const raw = JSON.stringify(state(fixture));
    const storage = new Storage(raw);
    storage.values.set(RECOVERY, 'previous');
    const ui = await app(storage, { confirm: false });
    await ui.checkSet('3', '1.5');
    await ui.import({ ...fixture, goal: 175 });
    assert.equal(storage.getItem(KEY), raw);
    assert.equal(storage.getItem(RECOVERY), 'previous');
    assert.equal(storage.writes.length, 0);
    assert.equal(ui.draft().reps, '3');
    assert.equal(ui.draft().done, true);
});

const invalidBackups = [
    ['unrelated JSON', { unrelated: true }],
    ['incomplete object', { goal: 150 }],
    ['foreign app', { ...fixture, app: 'Other App' }],
    ['future version', { ...fixture, version: 6 }],
    ['missing app marker', { ...fixture, app: undefined }],
    ['unknown field', { ...fixture, customFoods: [] }],
    ['invalid goal', { ...fixture, goal: 251 }],
    ['numeric string', { ...fixture, goal: '150' }],
    ['null entry', { ...fixture, entries: [null] }],
    ['invalid calendar day', { ...fixture, entries: [{ ...fixture.entries[0], date: '2026-02-29' }] }],
    ['invalid calendar month', { ...fixture, entries: [{ ...fixture.entries[0], date: '2026-99-99' }] }],
    ['zero amount', { ...fixture, entries: [{ ...fixture.entries[0], amount: 0 }] }],
    ['duplicate food IDs', { ...fixture, entries: [fixture.entries[0], fixture.entries[0]] }],
    ['missing ID', { ...fixture, entries: [{ ...fixture.entries[0], id: undefined }] }],
    ['duplicate session IDs', { ...fixture, sessions: [fixture.sessions[0], fixture.sessions[0]] }],
    ['null exercise', { ...fixture, sessions: [{ ...fixture.sessions[0], exercises: [null] }] }],
    ['null set', { ...fixture, sessions: [{ ...fixture.sessions[0], exercises: [{ name: 'Test', sets: [null] }] }] }],
    ['out of range set', { ...fixture, sessions: [{ ...fixture.sessions[0], exercises: [{ name: 'Test', sets: [{ reps: 2, kg: -1, done: true }] }] }] }],
    ['invalid done flag', { ...fixture, sessions: [{ ...fixture.sessions[0], exercises: [{ name: 'Test', sets: [{ reps: 2, kg: 0, done: 'false' }] }] }] }],
    ['unknown nested field', { ...fixture, entries: [{ ...fixture.entries[0], unit: 'g' }] }],
    ['too many sets', { ...fixture, sessions: [{ ...fixture.sessions[0], exercises: [{ name: 'Test', sets: Array(13).fill({ reps: 2, kg: 0, done: true }) }] }] }]
];
for (const [name, backup] of invalidBackups) {
    test('invalid import is rejected without data loss: ' + name, async () => {
        const raw = JSON.stringify(state(fixture));
        const storage = new Storage(raw);
        const ui = await app(storage);
        await ui.import(backup);
        assert.equal(storage.getItem(KEY), raw);
        assert.equal(storage.writes.length, 0);
        assert.deepEqual(ui.data(), state(fixture));
        assert.equal(ui.confirmations.length, 0);
        assert.match(ui.alerts.at(-1), /Import fehlgeschlagen/);
        assert.equal(ui.element('importFile').value, '');
    });
}

for (const raw of ['{broken', '{}', JSON.stringify({ ...fixture, sessions: [{ ...fixture.sessions[0], exercises: [null] }] })]) {
    test('damaged local data remains byte-for-byte recoverable: ' + raw.slice(0, 20), async () => {
        const storage = new Storage(raw);
        const ui = await app(storage);
        assert.equal(ui.element('storageNotice').classList.contains('hidden'), false);
        ui.element('foodAmount').value = '200';
        await ui.element('addFood').click();
        assert.equal(storage.getItem(KEY), raw);
        assert.equal(storage.writes.length, 0);
        await ui.element('exportOriginal').click();
        assert.equal(await ui.downloads[0].blob.text(), raw);
        await ui.import(fixture);
        assert.equal(storage.getItem(RECOVERY), raw);
        assert.deepEqual(ui.data(), state(fixture));
        assert.equal(ui.element('storageNotice').classList.contains('hidden'), true);
    });
}

test('denied storage access never pretends to save or clear data', async () => {
    const storage = new Storage(JSON.stringify(state(fixture)));
    storage.failRead = true;
    const ui = await app(storage);
    await ui.import(fixture);
    await ui.element('clearData').click();
    assert.equal(storage.writes.length, 0);
    assert.equal(ui.alerts.some(message => /Backup importiert/.test(message)), false);
    storage.failRead = false;
    await ui.element('retryStorage').click();
    assert.deepEqual(ui.data(), state(fixture));
    assert.equal(ui.element('storageNotice').classList.contains('hidden'), true);
});

test('a failed reload retains the last readable original for download and keeps the draft', async () => {
    const raw = JSON.stringify(state(fixture));
    const storage = new Storage(raw);
    const ui = await app(storage);
    await ui.checkSet('3');
    storage.failRead = true;
    await ui.element('retryStorage').click();
    assert.equal(ui.element('exportOriginal').classList.contains('hidden'), false);
    await ui.element('exportOriginal').click();
    assert.equal(await ui.downloads[0].blob.text(), raw);
    assert.equal(ui.draft().reps, '3');
    assert.equal(storage.writes.length, 0);
});

for (const failKey of [RECOVERY, KEY]) {
    test('import write failure leaves active data and draft unchanged: ' + failKey, async () => {
        const original = state(fixture);
        const raw = JSON.stringify(original);
        const storage = new Storage(raw);
        storage.failWrite = failKey;
        const ui = await app(storage);
        await ui.checkSet('3');
        await ui.import({ ...fixture, goal: 175 });
        assert.deepEqual(ui.data(), original);
        assert.equal(storage.getItem(KEY), raw);
        assert.equal(ui.draft().done, true);
        assert.equal(ui.alerts.some(message => /Backup importiert/.test(message)), false);
    });
}

test('failed workout save retains draft and timer; a retry saves exactly once', async () => {
    const ui = await app();
    await ui.checkSet('3', '2.5');
    ui.storage.failWrite = true;
    await ui.element('saveWorkout').click();
    assert.equal(ui.data().sessions.length, 0);
    assert.equal(ui.draft().reps, '3');
    assert.equal(ui.draft().done, true);
    assert.equal(ui.intervals.size, 1);
    assert.equal(ui.alerts.includes('Training gespeichert!'), false);
    ui.storage.failWrite = null;
    await ui.element('saveWorkout').click();
    assert.equal(ui.data().sessions.length, 1);
    assert.deepEqual(ui.data().sessions[0].exercises[0].sets[0], { reps: 3, kg: 2.5, done: true });
    assert.equal(ui.intervals.size, 0);
});

test('invalid live set values cannot be silently clamped or saved', async () => {
    const ui = await app();
    await ui.checkSet('2', '-5');
    await ui.element('saveWorkout').click();
    assert.equal(ui.data().sessions.length, 0);
    assert.equal(ui.draft().kg, '-5');
});

test('failed custom food save, deletion and goal change preserve active data and input', async () => {
    const original = state(fixture);
    const ui = await app(new Storage(JSON.stringify(original)));
    ui.storage.failWrite = true;
    ui.element('customName').value = 'Mein Tofu';
    ui.element('customP').value = '18';
    ui.element('customAmount').value = '200';
    await ui.element('addCustom').click();
    assert.equal(ui.element('customName').value, 'Mein Tofu');
    ui.element('foodDate').value = '2026-11-09';
    await ui.element('foodDate').onchange();
    await ui.element('foodList').querySelectorAll('[data-remove]')[0].click();
    ui.element('goalInput').value = '175';
    await ui.element('saveGoal').click();
    assert.equal(ui.element('goalInput').value, '175');
    assert.deepEqual(ui.data(), original);
});

test('another tab cannot be overwritten; reload preserves draft before retry', async () => {
    const storage = new Storage(JSON.stringify(state(fixture)));
    const first = await app(storage);
    const second = await app(storage);
    await first.checkSet('3');
    second.element('goalInput').value = '175';
    await second.element('saveGoal').click();
    await first.element('saveWorkout').click();
    assert.equal(JSON.parse(storage.getItem(KEY)).goal, 175);
    assert.equal(JSON.parse(storage.getItem(KEY)).sessions.length, 2);
    assert.match(first.alerts.at(-1), /anderen Fenster/);
    await first.element('retryStorage').click();
    assert.equal(first.draft().reps, '3');
    await first.element('saveWorkout').click();
    assert.equal(first.data().goal, 175);
    assert.equal(first.data().sessions.length, 3);
});

test('oversized or malformed JSON imports reset file input and do not prompt or write', async () => {
    const ui = await app();
    await ui.import(fixture, { size: 15 * 1024 * 1024 + 1 });
    assert.equal(ui.element('importFile').value, '');
    await ui.import(null, { raw: '{broken' });
    assert.equal(ui.element('importFile').value, '');
    assert.equal(ui.storage.writes.length, 0);
    assert.equal(ui.confirmations.length, 0);
});

test('confirmed clear removes data and recovery copy, while failed clear preserves both', async () => {
    const raw = JSON.stringify(state(fixture));
    const storage = new Storage(raw);
    storage.values.set(RECOVERY, raw);
    const ui = await app(storage);
    storage.failWrite = true;
    await ui.element('clearData').click();
    assert.equal(storage.getItem(KEY), raw);
    assert.equal(storage.getItem(RECOVERY), raw);
    storage.failWrite = null;
    await ui.element('clearData').click();
    assert.deepEqual(ui.data(), { goal: 150, entries: [], sessions: [] });
    assert.equal(storage.getItem(RECOVERY), null);
});

test('service worker activation preserves caches belonging to other applications', async () => {
    const handlers = new Map(), deleted = [];
    const context = vm.createContext({
        URL,
        self: { location: { href: 'https://example.test/app/sw.js' }, addEventListener: (type, handler) => handlers.set(type, handler), clients: { claim: async () => {} } },
        caches: {
            keys: async () => ['other-app-v1', 'vegan-strength-v2.0.0', 'vegan-strength-v2.5.1'],
            delete: async key => deleted.push(key)
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
    let activation;
    handlers.get('activate')({ waitUntil: promise => { activation = promise; } });
    await activation;
    assert.deepEqual(deleted, ['vegan-strength-v2.0.0']);
});
