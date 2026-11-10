const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { app, Storage, fixture, state, copy, KEY } = require('./app-harness.cjs');
const modules = Promise.all([import('../src/domain/nutrition.js'), import('../src/domain/statistics.js'), import('../src/domain/dates.js'), import('../src/storage/indexed-db.js'), import('../src/services/backup.js'), import('../src/domain/training-state.js'), import('../src/domain/program.js')]);
const req = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
async function setup(raw) {
    const indexedDB = new IDBFactory(), storage = new Storage(raw);
    return { indexedDB, storage, ui: await app(storage, { indexedDB }) };
}
function fill(ui, name = 'Mein Sojadrink', protein = '3.3', unit = 'ml') {
    ui.element('customName').value = name; ui.element('customP').value = protein; ui.element('customUnit').value = unit;
}
const controls = (ui, selector) => ui.element('customFoodList').querySelectorAll(selector);

test('a reusable product survives restart; catalog edits and removal preserve exact portion snapshots', async () => {
    const env = await setup(JSON.stringify(state(fixture))), { ui } = env;
    ui.navigate('protein'); fill(ui);
    await ui.element('saveCustomFood').click();
    assert.equal(ui.nutrition().foods.length, 1, ui.alerts.join('\n'));
    const product = ui.nutrition().foods[0];
    assert.equal(ui.data().entries.length, fixture.entries.length, 'Saving a product must not log a portion');
    ui.element('foodSelect').value = 'own:' + product.id;
    ui.element('foodAmount').value = '250.5'; ui.element('foodDate').value = '2026-11-09';
    await ui.element('addFood').click();
    const snapshot = copy(ui.data().entries.at(-1));
    assert.deepEqual([snapshot.name, snapshot.protein, snapshot.amount], ['Mein Sojadrink', 3.3, 250.5]);
    assert.equal(ui.nutrition().entryUnits.at(-1).unit, 'ml');
    ui.close();
    const next = await app(env.storage, { indexedDB: env.indexedDB }); next.navigate('protein');
    assert.deepEqual(next.nutrition().foods, [product]);
    controls(next, '[data-edit-food]')[0].click(); fill(next, 'Neuer Name', '8', 'g');
    await next.element('saveCustomFood').click();
    assert.deepEqual(next.data().entries.at(-1), snapshot);
    assert.equal(next.nutrition().foods[0].id, product.id);
    await controls(next, '[data-delete-food]')[0].click();
    assert.deepEqual(next.nutrition().foods, []);
    assert.deepEqual(next.data().entries.at(-1), snapshot);
    assert.equal(next.nutrition().entryUnits.at(-1).unit, 'ml');
    next.close();
});

test('same names with different protein values stay separate and historical suggestions require explicit saving', async () => {
    const data = state(fixture); data.entries = [
        { id: 'a', date: '2026-11-01', name: 'Tofu Spezial', protein: 15, amount: 100 },
        { id: 'b', date: '2026-11-02', name: 'Tofu Spezial', protein: 20, amount: 100 }
    ];
    const { ui } = await setup(JSON.stringify(data)); ui.navigate('protein');
    assert.match(ui.element('historicalFoodSelect').innerHTML, /15 g/);
    assert.match(ui.element('historicalFoodSelect').innerHTML, /20 g/);
    ui.element('historicalFoodSelect').value = '1'; ui.element('loadHistoricalFood').click();
    assert.equal(ui.element('customP').value, '20');
    assert.equal(ui.nutrition().foods.length, 0);
    await ui.element('saveCustomFood').click();
    fill(ui, 'Tofu Spezial', '15', 'g'); await ui.element('saveCustomFood').click();
    assert.equal(ui.nutrition().foods.length, 2);
    assert.deepEqual(ui.data(), data); ui.close();
});

test('a repeated historical portion uses its original values and receives a new ID and today date', async () => {
    const [, , { today }] = await modules;
    const { ui } = await setup(); ui.navigate('protein'); fill(ui, 'Alter Tofu', '17.5', 'g');
    ui.element('foodDate').value = '2026-01-02'; ui.element('customAmount').value = '125.5';
    await ui.element('addCustom').click();
    const original = copy(ui.data().entries[0]);
    await ui.element('foodList').querySelectorAll('[data-repeat-food]')[0].click();
    const repeated = ui.data().entries[1];
    assert.notEqual(repeated.id, original.id);
    assert.deepEqual({ ...repeated, id: original.id, date: original.date }, original);
    assert.equal(repeated.date, today()); assert.equal(ui.element('foodDate').value, today());
    await ui.element('foodList').querySelectorAll('[data-remove]')[0].click();
    assert.equal(ui.data().entries.length, 1); assert.equal(ui.nutrition().entryUnits.length, 1);
    assert.equal(ui.nutrition().entryUnits[0].entryId, original.id); ui.close();
});

test('calendar navigation crosses month, year and leap-day boundaries without UTC conversion', async () => {
    const { ui } = await setup(); ui.navigate('protein');
    for (const [date, next] of [['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-03-01'], ['2026-12-31', '2027-01-01']]) {
        ui.element('foodDate').value = date; ui.element('nextFoodDay').click(); assert.equal(ui.element('foodDate').value, next);
        ui.element('previousFoodDay').click(); assert.equal(ui.element('foodDate').value, date);
    }
    ui.close();
});

test('product and portion transaction failures retain prior catalog, data and editable inputs', async () => {
    const { ui } = await setup(); ui.navigate('protein'); fill(ui);
    await ui.element('saveCustomFood').click();
    const nutrition = ui.nutrition(), data = ui.data(), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'customFoods') throw Error('Storage full'); return put.apply(this, args); };
    try {
        controls(ui, '[data-edit-food]')[0].click(); fill(ui, 'Geändert', '9', 'g');
        await ui.element('saveCustomFood').click();
        assert.deepEqual(ui.nutrition(), nutrition); assert.equal(ui.element('customName').value, 'Geändert');
        await ui.element('addCustom').click(); assert.deepEqual(ui.data(), data);
        assert.deepEqual(ui.nutrition(), nutrition);
        assert.ok(ui.alerts.some(message => message.includes('Storage full')));
    } finally { IDBObjectStore.prototype.put = put; ui.close(); }
});

test('stale catalog writers cannot overwrite products saved by another tab', async () => {
    const env = await setup(), other = await app(env.storage, { indexedDB: env.indexedDB });
    env.ui.navigate('protein'); other.navigate('protein'); fill(env.ui, 'Erster Tofu'); fill(other, 'Zweiter Tofu');
    await env.ui.element('saveCustomFood').click(); await other.element('saveCustomFood').click();
    assert.equal(other.nutrition().foods.length, 0); assert.match(other.alerts.join('\n'), /anderen Fenster/);
    await other.element('retryStorage').click(); assert.deepEqual(other.nutrition().foods, env.ui.nutrition().foods);
    assert.equal(other.element('customName').value, 'Zweiter Tofu'); env.ui.close(); other.close();
});

test('goal changes are dated from observation onward and never fabricate previous targets', async () => {
    const [{ emptyNutrition, recordGoal, goalOn }, , { today, dayShift }] = await modules;
    const original = emptyNutrition();
    const initial = recordGoal(original, 150, '2026-11-01');
    const changed = recordGoal(initial, 175, '2026-11-05');
    const twice = recordGoal(changed, 180, '2026-11-05');
    assert.equal(goalOn(twice, '2026-10-31'), null); assert.equal(goalOn(twice, '2026-11-04'), 150);
    assert.equal(goalOn(twice, '2026-11-05'), 180); assert.equal(twice.goals.length, 2); assert.deepEqual(original, emptyNutrition());
    const { ui } = await setup(); ui.navigate('settings');
    assert.deepEqual(ui.nutrition().goals, []);
    ui.element('goalInput').value = '175'; await ui.element('saveGoal').click();
    assert.deepEqual(ui.nutrition().goals, [{ date: today(), goal: 175 }]);
    ui.navigate('protein'); ui.element('foodDate').value = dayShift(-1); ui.element('foodDate').onchange();
    assert.equal(ui.element('proteinPercent').textContent, 'Ziel unbekannt');
    ui.navigate('settings'); ui.element('goalInput').value = '180'; await ui.element('saveGoal').click();
    assert.deepEqual(ui.nutrition().goals, [{ date: today(), goal: 180 }]); ui.close();
});

test('7/28/56-day summaries distinguish calendar averages, recorded-day averages and unknown goals', async () => {
    const [{ emptyNutrition }, { nutritionSeries }] = await modules;
    const data = { goal: 150, sessions: [], entries: [
        { id: '1', date: '2026-11-09', name: 'a', amount: 125.5, protein: 17.5 },
        { id: '2', date: '2026-11-10', name: 'b', amount: 100, protein: 0 },
        { id: '3', date: '2026-09-01', name: 'c', amount: 5000, protein: 100 },
        { id: '4', date: '2026-11-11', name: 'd', amount: 5000, protein: 100 }
    ] };
    const nutrition = { ...emptyNutrition(), goals: [{ date: '2026-11-09', goal: 150 }] };
    for (const days of [7, 28, 56]) {
        const series = nutritionSeries(data, nutrition, days, new Date('2026-11-10T00:15:00+01:00'));
        assert.equal(series.dates.length, days); assert.equal(series.dates.at(-1), '2026-11-10');
        assert.equal(series.total, 21.9625); assert.equal(series.average, 21.9625 / days);
        assert.equal(series.recordedDays, 2); assert.equal(series.recordedAverage, 21.9625 / 2);
        assert.equal(series.knownGoals, 2); assert.equal(series.goals[0], null);
    }
    assert.equal(nutritionSeries({ ...data, entries: [] }, emptyNutrition()).recordedAverage, null);
    assert.throws(() => nutritionSeries(data, nutrition, 8));
});

test('nutrition periods use local calendar days across daylight-saving changes', async () => {
    const [, { nutritionSeries }] = await modules;
    const priorZone = process.env.TZ;
    try {
        process.env.TZ = 'Europe/Berlin';
        const series = nutritionSeries({ goal: 150, entries: [] }, { goals: [] }, 7, new Date('2026-03-30T00:15:00+02:00'));
        assert.deepEqual(series.dates, ['2026-03-24','2026-03-25','2026-03-26','2026-03-27','2026-03-28','2026-03-29','2026-03-30']);
    } finally { if (priorZone === undefined) delete process.env.TZ; else process.env.TZ = priorZone; }
});

test('v5 roundtrip includes products, units, goal history and pre-import recovery while v2/v3/v4 remain readable', async () => {
    const [ , , , , { readBackup, serializeBackup }, { emptyTraining }, { emptyProgram }] = await modules;
    const env = await setup(), { ui } = env; ui.navigate('protein'); fill(ui);
    await ui.element('saveCustomFood').click(); await ui.element('addFood').click();
    ui.navigate('settings'); await ui.element('exportData').click();
    const text = await ui.downloads.at(-1).blob.text(), backup = JSON.parse(text);
    assert.equal(backup.version, 5); const parsed = await readBackup({ size: text.length, text: async () => text });
    assert.deepEqual(parsed.nutrition, ui.nutrition()); assert.deepEqual(parsed.data, ui.data());
    const priorData = ui.data(), priorNutrition = ui.nutrition();
    const incoming = copy(backup); incoming.nutrition.foods[0].name = 'Importiert';
    await ui.import(incoming); assert.equal(ui.nutrition().foods[0].name, 'Importiert');
    await ui.element('exportPrevious').click();
    const previous = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.deepEqual(previous.nutrition, priorNutrition); assert.equal(previous.version, 5);
    assert.deepEqual({ goal: previous.goal, entries: previous.entries, sessions: previous.sessions }, priorData);
    ui.close(); const reopened = await app(env.storage, { indexedDB: env.indexedDB });
    assert.deepEqual(reopened.nutrition(), incoming.nutrition);
    for (const args of [[], [emptyTraining()], [emptyTraining(), emptyProgram()]]) {
        const text = serializeBackup(state(fixture), undefined, ...args);
        const old = await readBackup({ size: text.length, text: async () => text });
        assert.deepEqual(old.nutrition, { foods: [], entryUnits: [], goals: [] });
        assert.deepEqual(old.data, state(fixture));
    }
    await reopened.import(fixture); assert.deepEqual(reopened.nutrition(), { foods: [], entryUnits: [], goals: [] }); reopened.close();
});

test('invalid or future nutrition fields, duplicate IDs and dangling annotations are rejected before import confirmation', async () => {
    const { ui } = await setup(); ui.navigate('settings'); await ui.element('exportData').click();
    const valid = JSON.parse(await ui.downloads.at(-1).blob.text());
    const food = { id: 'f', name: 'Tofu', protein: 15, unit: 'g' };
    for (const change of [
        b => { b.nutrition.extra = 1; }, b => { b.nutrition.foods = [food, food]; },
        b => { b.nutrition.foods = [{ ...food, unit: 'kg' }]; }, b => { b.nutrition.foods = [{ ...food, protein: '15' }]; },
        b => { b.nutrition.foods = [{ ...food, name: ' ' }]; }, b => { b.nutrition.entryUnits = [{ entryId: 'missing', unit: 'g' }]; },
        b => { b.nutrition.goals = [{ date: '2026-02-30', goal: 150 }]; },
        b => { b.nutrition.goals = [{ date: '2026-11-10', goal: 150 }, { date: '2026-11-09', goal: 175 }]; },
        b => { b.version = 4; }, b => { delete b.nutrition; }, b => { b.version = 6; }
    ]) {
        const invalid = copy(valid); change(invalid); const confirmations = ui.confirmations.length;
        await ui.import(invalid); assert.equal(ui.confirmations.length, confirmations); assert.deepEqual(ui.data().entries, []); assert.deepEqual(ui.nutrition().foods, []);
    }
    ui.close();
});

test('schema-2 upgrade preserves plan, drafts, exact ordered core rows and recovery; failed upgrade rolls back', async () => {
    const [ , , , { createIndexedDBStore, DB_NAME }, , { emptyTraining }, { emptyProgram, createPlan }] = await modules;
    const indexedDB = new IDBFactory(), storage = new Storage(JSON.stringify(state(fixture)));
    const opening = indexedDB.open(DB_NAME, 2);
    opening.onupgradeneeded = () => { for (const name of ['settings','entries','sessions','drafts','plans','meta','recovery']) opening.result.createObjectStore(name, { keyPath: 'id' }); };
    const db = await req(opening), original = state(fixture), program = emptyProgram();
    const plan = createPlan(program, '2026-11-09', 'retained-plan'); program.plans.push(plan); program.activePlanId = plan.id;
    const draft = emptyTraining();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(['settings','entries','sessions','drafts','plans','meta','recovery'], 'readwrite');
        tx.objectStore('settings').put({ id: 'profile', goal: original.goal });
        original.entries.forEach((entry, order) => tx.objectStore('entries').put({ ...entry, order }));
        original.sessions.forEach((entry, order) => tx.objectStore('sessions').put({ ...entry, order }));
        tx.objectStore('drafts').put({ id: 'active', value: draft }); tx.objectStore('plans').put({ id: 'active', value: program });
        tx.objectStore('meta').put({ id: 'state', schema: 2, phase: 'ready', revision: 7, legacyRaw: storage.getItem(KEY) });
        tx.objectStore('recovery').put({ id: 'before-import', raw: 'original bytes' }); tx.oncomplete = resolve; tx.onabort = reject;
    }); db.close();
    storage.values.set('vegan-strength-storage', JSON.stringify({ engine: 'indexeddb', version: 2, status: 'active' }));
    const create = () => createIndexedDBStore({ indexedDB, getStorage: () => storage }), store = create(), put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (row, ...args) { if (this.name === 'settings' && row.id === 'nutrition') throw Error('Upgrade failed'); return put.call(this, row, ...args); };
    try { assert.equal(await store.load(), null); assert.match(store.problem.message, /Upgrade failed/); }
    finally { IDBObjectStore.prototype.put = put; }
    const unchanged = await req(indexedDB.open(DB_NAME)); assert.equal(unchanged.version, 2); assert.equal(unchanged.objectStoreNames.contains('customFoods'), false); unchanged.close();
    assert.deepEqual(await store.load(), original); assert.deepEqual(await store.loadProgram(), program); assert.deepEqual(await store.loadTraining(), draft);
    assert.equal(await store.previous(), 'original bytes'); assert.deepEqual(await store.loadNutrition(), { foods: [], entryUnits: [], goals: [] }); store.close();
});

test('clear removes library, annotation and target history; a fresh start does not resurrect them', async () => {
    const env = await setup(); env.ui.navigate('protein'); fill(env.ui); await env.ui.element('saveCustomFood').click(); await env.ui.element('addFood').click();
    assert.ok(env.ui.nutrition().goals.length); env.ui.navigate('settings'); await env.ui.element('clearData').click();
    assert.deepEqual(env.ui.nutrition(), { foods: [], entryUnits: [], goals: [] }); env.ui.close();
    const next = await app(env.storage, { indexedDB: env.indexedDB }); assert.deepEqual(next.nutrition(), { foods: [], entryUnits: [], goals: [] }); next.close();
});

test('period switching keeps the legacy seven-day mean and exposes complete accessible daily values', async () => {
    const { ui } = await setup(JSON.stringify(state(fixture))); ui.navigate('progress'); const oldMean = ui.element('avgProtein').textContent;
    ui.element('nutritionRange').value = '56'; ui.element('nutritionRange').onchange();
    assert.equal(ui.element('avgProtein').textContent, oldMean);
    assert.match(ui.element('nutritionSummary').textContent, /56 Kalendertage/);
    assert.equal((ui.element('nutritionTable').innerHTML.match(/scope="row"/g) ?? []).length, 56);
    assert.match(ui.element('nutritionTable').innerHTML, /Unbekannt/); ui.close();
});

test('failed import rolls back products, portion units, goal history and the pre-import recovery together', async () => {
    const { ui } = await setup(); ui.navigate('protein'); fill(ui); await ui.element('saveCustomFood').click(); await ui.element('addFood').click();
    ui.navigate('settings'); await ui.element('exportData').click();
    const backup = JSON.parse(await ui.downloads.at(-1).blob.text());
    await ui.import(backup); await ui.element('exportPrevious').click(); const previous = await ui.downloads.at(-1).blob.text();
    const before = ui.nutrition(), data = ui.data(), put = IDBObjectStore.prototype.put;
    const changed = copy(backup); changed.nutrition.foods[0].protein = 99;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'customFoods') throw Error('Import interrupted'); return put.apply(this, args); };
    try { await ui.import(changed); }
    finally { IDBObjectStore.prototype.put = put; }
    assert.deepEqual(ui.nutrition(), before); assert.deepEqual(ui.data(), data);
    await ui.element('exportPrevious').click(); assert.equal(await ui.downloads.at(-1).blob.text(), previous); ui.close();
});

test('persisted nutrition corruption is recoverable and never accepted as an empty library', async () => {
    const [, , , { DB_NAME }] = await modules;
    const env = await setup(); env.ui.navigate('protein'); fill(env.ui); await env.ui.element('saveCustomFood').click(); env.ui.close();
    const db = await req(env.indexedDB.open(DB_NAME));
    await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ id: 'nutrition', value: { entryUnits: [{ entryId: 'dangling', unit: 'ml' }], goals: [] } }); tx.oncomplete = resolve; tx.onabort = reject;
    }); db.close();
    const ui = await app(env.storage, { indexedDB: env.indexedDB });
    assert.equal(ui.element('storageNotice').classList.contains('hidden'), false);
    assert.match(ui.element('storageMessage').textContent, /Lebensmitteleintrag/);
    await ui.element('exportOriginal').click();
    const recovery = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.equal(recovery.nutrition.foods[0].name, 'Mein Sojadrink');
    assert.equal(recovery.nutrition.entryUnits[0].entryId, 'dangling');
    ui.navigate('protein'); fill(ui, 'Nicht überschreiben'); await ui.element('saveCustomFood').click();
    assert.deepEqual(ui.nutrition().foods, []);
    ui.close();
});

test('product names are rendered as text and independent unit annotations reject duplicates', async () => {
    const [{ validateNutrition }] = await modules;
    const { ui } = await setup(); ui.navigate('protein'); fill(ui, '<img src=x onerror=alert(1)>', '0', 'g'); await ui.element('saveCustomFood').click();
    assert.doesNotMatch(ui.element('customFoodList').innerHTML, /<img/); assert.match(ui.element('customFoodList').innerHTML, /&lt;img/);
    await ui.element('addFood').click();
    assert.equal(ui.data().entries[0].protein, 0);
    const invalid = ui.nutrition(); invalid.entryUnits.push(copy(invalid.entryUnits[0])); assert.throws(() => validateNutrition(invalid, ui.data())); ui.close();
});

test('populated v4 plans and legacy portions import without losing values or fabricating historical units and targets', async () => {
    const [, , , , { serializeBackup, readBackup }, { emptyTraining }, { emptyProgram, createPlan }] = await modules;
    const program = emptyProgram(), plan = createPlan(program, '2026-11-09', 'old-v4'); program.plans.push(plan); program.activePlanId = plan.id;
    const text = serializeBackup(state(fixture), undefined, emptyTraining(), program);
    assert.equal(JSON.parse(text).version, 4);
    const parsed = await readBackup({ size: text.length, text: async () => text });
    assert.deepEqual(parsed.program, program); assert.deepEqual(parsed.data, state(fixture));
    assert.deepEqual(parsed.nutrition, { foods: [], entryUnits: [], goals: [] });
    const { ui } = await setup(); await ui.import(JSON.parse(text));
    assert.deepEqual(ui.program(), program); assert.deepEqual(ui.data(), state(fixture));
    assert.deepEqual(ui.nutrition(), parsed.nutrition); ui.close();
});

test('a failed reload can restore another backup even when cached units reference the previous entries', async () => {
    const [, , , { DB_NAME }] = await modules;
    const env = await setup(); env.ui.navigate('protein'); fill(env.ui); await env.ui.element('saveCustomFood').click(); await env.ui.element('addFood').click();
    const db = await req(env.indexedDB.open(DB_NAME));
    await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ id: 'nutrition', value: { entryUnits: [{ entryId: 'missing', unit: 'ml' }], goals: [] } }); tx.oncomplete = resolve; tx.onabort = reject;
    }); db.close();
    env.ui.navigate('settings'); await env.ui.element('retryStorage').click();
    assert.equal(env.ui.element('storageNotice').classList.contains('hidden'), false);
    await env.ui.element('exportOriginal').click(); const raw = await env.ui.downloads.at(-1).blob.text();
    await env.ui.import(fixture); assert.deepEqual(env.ui.data(), state(fixture), env.ui.alerts.join('\n'));
    assert.deepEqual(env.ui.nutrition(), { foods: [], entryUnits: [], goals: [] });
    await env.ui.element('exportPrevious').click(); assert.equal(await env.ui.downloads.at(-1).blob.text(), raw);
    env.ui.close();
});
