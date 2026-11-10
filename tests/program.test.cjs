const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { app, Storage, fixture, state, KEY } = require('./app-harness.cjs');
const modules = Promise.all([
    import('../src/domain/program.js'), import('../src/domain/program-validation.js'),
    import('../src/domain/progression.js'), import('../src/storage/indexed-db.js'),
    import('../src/services/backup.js'), import('../src/domain/training-state.js')
]);
async function sample() {
    const [domain] = await modules, program = domain.emptyProgram();
    const plan = domain.createPlan(program, '2026-11-09', 'plan-test', '2026-11-09T12:00:00.000Z');
    program.plans.push(plan); program.activePlanId = plan.id;
    return { program, plan, domain, data: { goal: 150, entries: [], sessions: [] } };
}
async function readyHistory({ rir = 2, clean = true, count = 2, week = 5, kg = 10 } = {}) {
    const env = await sample();
    const slot = env.plan.slots[(week - 1) * 4], targets = env.domain.targetsFor(env.plan, slot);
    const context = { planId: env.plan.id, slotId: slot.id, week, workoutIndex: 0, targets };
    for (let i = 0; i < count; i++) {
        const session = { id: 'session-' + i, date: '2026-11-' + (10 + i), workout: 'Upper A', exercises: targets.map(target => ({
            name: target.name, sets: Array.from({ length: target.sets }, () => ({ reps: target.max, kg: target.basis === 'none' ? 0 : kg, done: true }))
        })) };
        env.data.sessions.unshift(session);
        env.program = env.domain.completeSlot(env.program, context, session.id, targets.map(() => ({ rir, clean })));
    }
    env.plan = env.domain.activePlan(env.program);
    return { ...env, slot, targets, context };
}
async function startUI() {
    const storage = new Storage(JSON.stringify(state(fixture))), indexedDB = new IDBFactory();
    const ui = await app(storage, { indexedDB });
    ui.navigate('training'); ui.element('planStartDate').value = '2026-11-09';
    await ui.element('startPlan').click();
    assert.equal(ui.program().plans.length, 1, ui.alerts.join('\n'));
    return { ui, indexedDB, storage };
}
function openSlot(ui, index = 0) { return ui.element('planWeeks').querySelectorAll('[data-open-slot]')[index].click(); }
async function finishUI(ui) {
    for (const input of ui.element('exerciseList').querySelectorAll('[data-field]')) {
        input.value = input.dataset.field === 'kg' ? '0' : '2'; input.oninput();
    }
    for (const button of ui.element('exerciseList').querySelectorAll('[data-done]')) await button.click();
    await ui.element('saveWorkout').click();
}

test('the individual plan has 32 dated units, starter targets and a lighter final week', async () => {
    const { program, plan, domain, data } = await sample();
    const [, { validateProgram }] = await modules;
    assert.equal(plan.slots.length, 32);
    assert.deepEqual(plan.slots.slice(0, 4).map(slot => slot.date), ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-14']);
    assert.equal(plan.slots.at(-1).date, '2027-01-02');
    const first = domain.targetsFor(plan, plan.slots[0]);
    assert.deepEqual([first[0].sets, first[0].min, first[0].max], [3, 1, 2]);
    assert.equal(domain.targetsFor(plan, plan.slots[8])[0].sets, 4);
    assert.ok(domain.targetsFor(plan, plan.slots[28]).reduce((n, target) => n + target.sets, 0) < domain.targetsFor(plan, plan.slots[24]).reduce((n, target) => n + target.sets, 0));
    assert.deepEqual(validateProgram(program, data), program);
});

test('all 32 units fit 45 minutes including unilateral work, pauses, warmup and buffer', async () => {
    const { plan, domain } = await sample();
    for (const slot of plan.slots) {
        const targets = domain.targetsFor(plan, slot), budget = domain.timeBudget(targets);
        assert.ok(budget.total <= 2700);
        assert.equal(budget.warmup, 300);
        assert.equal(budget.buffer, 180);
        assert.equal(budget.transitions, 300);
        const twoSides = targets.filter(target => target.sides === 2);
        assert.ok(budget.work >= twoSides.reduce((n, target) => n + target.sets * (target.max * target.seconds * 2 + 15), 0));
    }
});

test('week calculation and dates remain correct across daylight-saving changes', async () => {
    const { program, domain } = await sample();
    const plan = domain.createPlan(program, '2026-03-23', 'dst');
    assert.equal(plan.slots[4].date, '2026-03-30');
    assert.equal(domain.planWeek(plan, '2026-03-29'), 1);
    assert.equal(domain.planWeek(plan, '2026-03-30'), 2);
    assert.equal(domain.planWeek(plan, '2026-01-01'), 1);
    assert.equal(domain.planWeek(plan, '2027-01-01'), 8);
});

test('progression requires two full comparable performances, explicit technique and reserve', async () => {
    const [, , { progression }] = await modules;
    for (const options of [{ count: 1 }, { rir: null }, { rir: 1 }, { clean: false }]) {
        const env = await readyHistory(options);
        assert.equal(progression(env.program, env.data, env.plan, env.targets[3], 5).suggestion, null);
    }
    const env = await readyHistory();
    const advice = progression(env.program, env.data, env.plan, env.targets[3], 5);
    assert.equal(advice.suggestion.kg, 10.5);
    assert.equal(env.data.sessions[0].exercises[3].sets[0].kg, 10, 'A suggestion cannot rewrite history');
});

test('incomplete sets, changed load, or changed variant block a load increase', async () => {
    const [, , { progression }] = await modules;
    for (const mutate of [
        env => { env.data.sessions[0].exercises[3].sets[0].done = false; },
        env => { env.data.sessions[1].exercises[3].sets[0].kg = 9; },
        env => { env.program.links[0].exercises[3].variantId = 'other'; },
        env => { env.data.sessions[0].exercises[3].sets[0].reps = 8; }
    ]) {
        const env = await readyHistory(); mutate(env);
        assert.equal(progression(env.program, env.data, env.plan, env.targets[3], 5).suggestion, null);
    }
});

test('early and final weeks do not suggest heavier loads and inventory jumps are bounded', async () => {
    const [, , { progression }] = await modules;
    const env = await readyHistory();
    assert.equal(progression(env.program, env.data, env.plan, env.targets[3], 3).suggestion, null);
    assert.equal(progression(env.program, env.data, env.plan, env.targets[3], 8).suggestion, null);
    env.plan.profile.availableDumbbells = [10, 12];
    assert.equal(progression(env.program, env.data, env.plan, env.targets[3], 5).suggestion, null);
    env.plan.profile.availableDumbbells = [10, 10.75, 12];
    assert.equal(progression(env.program, env.data, env.plan, env.targets[3], 5).suggestion.kg, 10.75);
});

test('bodyweight progression uses repetitions or a specific harder variant rather than invented kg', async () => {
    const [, , { progression }] = await modules;
    const env = await readyHistory();
    assert.equal(progression(env.program, env.data, env.plan, env.targets[0], 5).suggestion.max, 3);
    assert.equal(progression(env.program, env.data, env.plan, env.targets[1], 5).suggestion.variantId, 'row-flat');
    assert.equal(progression(env.program, env.data, env.plan, env.targets[1], 5).suggestion.kg, 0);
});

test('a previously accepted target does not cause repeated automatic increases from the same old results', async () => {
    const [, , { progression }] = await modules;
    const env = await readyHistory();
    const suggestion = progression(env.program, env.data, env.plan, env.targets[3], 5).suggestion;
    env.plan.preferences.press = suggestion;
    const newTarget = env.domain.targetsFor(env.plan, env.slot)[3];
    assert.equal(progression(env.program, env.data, env.plan, newTarget, 5).suggestion, null);
});

test('unlinked legacy sessions never count as plan completions or progression evidence', async () => {
    const { program, plan, domain } = await sample();
    const [, , { progression }] = await modules;
    assert.equal(domain.nextSlot(plan).id, plan.slots[0].id);
    assert.equal(progression(program, state(fixture), plan, domain.targetsFor(plan, plan.slots[0])[0], 1).last, undefined);
});

test('plan start, rescheduling, skip and replan persist without changing old data or drafts', async () => {
    const { ui, storage, indexedDB } = await startUI();
    const original = state(fixture);
    assert.deepEqual(ui.data(), original);
    const skipped = ui.element('planWeeks').querySelectorAll('[data-skip-slot]')[0];
    await skipped.click();
    assert.equal(ui.program().plans[0].slots[0].status, 'skipped');
    ui.navigate('home'); assert.equal(ui.element('nextTitle').textContent, 'Lower A');
    ui.navigate('training');
    const date = ui.element('planWeeks').querySelectorAll('[data-slot-date]')[1];
    date.value = '2026-11-11'; await date.onchange();
    assert.equal(ui.program().plans[0].slots[1].date, '2026-11-11');
    await ui.element('planWeeks').querySelectorAll('[data-skip-slot]')[0].click();
    assert.equal(ui.program().plans[0].slots[0].status, 'planned');
    await ui.idle(); ui.close();
    const reopened = await app(storage, { indexedDB });
    assert.equal(reopened.program().plans[0].slots[1].date, '2026-11-11');
    assert.deepEqual(reopened.data(), original);
    reopened.close();
});

test('full plan completion is linked atomically; repeating does not advance a second slot', async () => {
    const { ui } = await startUI();
    await openSlot(ui); await finishUI(ui);
    assert.equal(ui.program().plans[0].slots[0].status, 'done', ui.alerts.join('\n'));
    assert.equal(ui.program().links.length, 1);
    ui.navigate('home'); assert.equal(ui.element('nextTitle').textContent, 'Lower A');
    ui.navigate('training'); await openSlot(ui); await finishUI(ui);
    assert.equal(ui.program().plans[0].slots.filter(slot => slot.status === 'done').length, 1);
    assert.equal(ui.program().plans[0].slots[0].sessions.length, 2);
    assert.equal(ui.data().sessions.length, fixture.sessions.length + 2);
    ui.close();
});

test('a partial workout retains the open plan slot and free workouts never advance it', async () => {
    const { ui } = await startUI();
    await openSlot(ui);
    await ui.checkSet('2', '0');
    await ui.element('saveWorkout').click();
    assert.equal(ui.program().plans[0].slots[0].status, 'planned');
    assert.equal(ui.program().links[0].completed, false);
    ui.navigate('training'); await ui.element('useFreeTraining').click();
    await ui.checkSet('2', '0'); await ui.element('saveWorkout').click();
    assert.equal(ui.program().links.length, 1);
    assert.equal(ui.program().plans[0].slots[0].status, 'planned');
    ui.close();
});

test('a failed plan completion rolls back history, slot status, links and saved draft together', async () => {
    const { ui, indexedDB, storage } = await startUI();
    await openSlot(ui); await ui.checkSet('2', '0'); await ui.idle();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'plans') throw Error('Storage full'); return put.apply(this, args); };
    try { await ui.element('saveWorkout').click(); }
    finally { IDBObjectStore.prototype.put = put; }
    assert.deepEqual(ui.data(), state(fixture));
    assert.equal(ui.program().links.length, 0);
    ui.close();
    const reopened = await app(storage, { indexedDB });
    assert.deepEqual(reopened.data(), state(fixture));
    assert.equal(reopened.draft().done, true);
    assert.equal(reopened.program().plans[0].slots[0].status, 'planned');
    reopened.close();
});

test('legacy and planned drafts with different set counts coexist and restore independently', async () => {
    const indexedDB = new IDBFactory(), storage = new Storage(), ui = await app(storage, { indexedDB });
    await ui.checkSet('2', '0'); await ui.idle();
    ui.element('planStartDate').value = '2026-11-09'; await ui.element('startPlan').click();
    await openSlot(ui); await ui.checkSet('1', '0'); await ui.idle();
    assert.equal(ui.element('exerciseList').querySelectorAll('[data-done]').length, 13);
    await ui.element('useFreeTraining').click();
    assert.equal(ui.draft().reps, '2');
    assert.equal(ui.element('exerciseList').querySelectorAll('[data-done]').length, 14);
    await openSlot(ui); await ui.idle(); ui.close();
    const reopened = await app(storage, { indexedDB });
    assert.equal(reopened.draft().reps, '1');
    assert.match(reopened.element('workoutInfo').textContent, /Plan · Woche 1/);
    reopened.close();
});

test('a new plan preserves the old plan, historical links and a pending old-plan draft', async () => {
    const { ui } = await startUI();
    await openSlot(ui); await ui.checkSet('2', '0'); await ui.idle();
    ui.element('planStartDate').value = '2026-12-01'; await ui.element('startPlan').click();
    assert.equal(ui.program().plans.length, 2);
    assert.equal(ui.draft().reps, '2');
    assert.notEqual(ui.program().activePlanId, ui.program().plans[0].id);
    ui.close();
});

test('full backups restore profile, program, sessions, frozen targets, assessments and drafts', async () => {
    const { ui } = await startUI(); await openSlot(ui); await ui.checkSet('2', '0');
    const reserve = ui.element('exerciseList').querySelectorAll('[data-rir]')[0]; reserve.value = '2'; reserve.onchange();
    const clean = ui.element('exerciseList').querySelectorAll('[data-clean]')[0]; clean.checked = true; clean.onchange();
    await ui.element('exportData').click();
    const backup = JSON.parse(await ui.downloads[0].blob.text());
    assert.equal(backup.version, 5);
    const copy = await app(new Storage(), { indexedDB: new IDBFactory() });
    await copy.import(backup); copy.navigate('training');
    assert.deepEqual(copy.program(), ui.program());
    assert.deepEqual(copy.data(), ui.data());
    assert.equal(copy.draft().done, true);
    assert.equal(copy.element('exerciseList').querySelectorAll('[data-rir]')[0].value, '2');
    assert.equal(copy.element('exerciseList').querySelectorAll('[data-clean]')[0].checked, true);
    ui.close(); copy.close();
});

test('v3 backups remain readable and never silently acquire a plan association', async () => {
    const [, , , , { serializeBackup, readBackup }, { emptyTraining }] = await modules;
    const text = serializeBackup(state(fixture), undefined, emptyTraining());
    assert.equal(JSON.parse(text).version, 3);
    const restored = await readBackup({ size: text.length, text: async () => text });
    assert.deepEqual(restored.data, state(fixture));
    assert.deepEqual(restored.program.plans, []);
    assert.equal(restored.program.activePlanId, null);
});

test('full backup import rejects dangling links or altered exercise targets before replacing data', async () => {
    const { ui } = await startUI(); await openSlot(ui); await ui.checkSet('2', '0');
    await ui.element('exportData').click();
    const backup = JSON.parse(await ui.downloads[0].blob.text());
    const prior = ui.program(), data = ui.data();
    backup.program.links.push({ sessionId: 'missing', planId: prior.activePlanId, slotId: prior.plans[0].slots[0].id, completed: true, exercises: [] });
    await ui.import(backup);
    assert.deepEqual(ui.program(), prior); assert.deepEqual(ui.data(), data);
    assert.match(ui.alerts.at(-1), /Import fehlgeschlagen/);
    ui.close();
});

test('profile edits persist and update protein goal without changing a running plan snapshot', async () => {
    const { ui, indexedDB, storage } = await startUI();
    ui.navigate('settings');
    assert.equal(ui.element('profile-age').value, '34');
    ui.element('profile-weight').value = '85.5'; ui.element('profile-goal').value = '160';
    ui.element('profile-weights').value = '10; 2,5; 5; 7,5';
    await ui.element('saveProfile').click();
    assert.equal(ui.program().profile.weight, 85.5, ui.alerts.join('\n'));
    assert.deepEqual(ui.program().profile.availableDumbbells, [2.5, 5, 7.5, 10]);
    assert.equal(ui.program().plans[0].profile.weight, 84);
    assert.equal(ui.data().goal, 160);
    ui.close();
    const restored = await app(storage, { indexedDB });
    assert.equal(restored.program().profile.weight, 85.5);
    assert.equal(restored.data().goal, 160);
    restored.close();
});

test('profile write failure retains both the prior profile and goal and the editable inputs', async () => {
    const { ui } = await startUI(); ui.navigate('settings');
    ui.element('profile-weight').value = '88'; ui.element('profile-goal').value = '175';
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'plans') throw Error('Storage full'); return put.apply(this, args); };
    try { await ui.element('saveProfile').click(); }
    finally { IDBObjectStore.prototype.put = put; }
    assert.equal(ui.program().profile.weight, 84);
    assert.equal(ui.data().goal, 150);
    assert.equal(ui.element('profile-weight').value, '88');
    assert.equal(ui.element('profile-goal').value, '175');
    ui.close();
});

test('accepting a suggestion changes only future targets and starts a heavier load at the lower rep bound', async () => {
    const env = await readyHistory();
    const [, , , , { serializeBackup }, { emptyTraining }] = await modules;
    const ui = await app(new Storage(), { indexedDB: new IDBFactory() });
    await ui.import(JSON.parse(serializeBackup(env.data, undefined, emptyTraining(), env.program)));
    ui.navigate('training'); await openSlot(ui, 16);
    const button = ui.element('exerciseList').querySelectorAll('[data-accept]').find(item => item.dataset.accept === '3');
    assert.ok(button);
    await button.click();
    assert.equal(ui.program().plans[0].preferences.press.kg, 10.5);
    await ui.element('exportData').click();
    const backup = JSON.parse(await ui.downloads[0].blob.text());
    assert.equal(backup.training.drafts[backup.training.activeDraft].context.targets[3].kg, null);
    await openSlot(ui, 20);
    const weight = ui.element('exerciseList').querySelectorAll('[data-field]').find(input => input.dataset.e === '3' && input.dataset.s === '0' && input.dataset.field === 'kg');
    const reps = ui.element('exerciseList').querySelectorAll('[data-field]').find(input => input.dataset.e === '3' && input.dataset.s === '0' && input.dataset.field === 'reps');
    assert.equal(weight.value, '10.5'); assert.equal(reps.value, '8');
    ui.close();
});

test('variant selection is explicit and does not rewrite a frozen draft or historical exercises', async () => {
    const { ui } = await startUI(); await openSlot(ui);
    const select = ui.element('exerciseList').querySelectorAll('[data-variant]')[0];
    select.value = 'pullup-assisted';
    const button = ui.element('exerciseList').querySelectorAll('[data-apply-variant]').find(item => item.dataset.applyVariant === '0');
    await button.click();
    assert.equal(ui.program().plans[0].preferences.pullup.variantId, 'pullup-assisted');
    assert.match(ui.element('exerciseList').innerHTML, /<strong>Klimmzüge<\/strong>/);
    await openSlot(ui, 4);
    assert.match(ui.element('exerciseList').innerHTML, /Ring-Klimmzüge mit Fußhilfe/);
    assert.deepEqual(ui.data(), state(fixture));
    ui.close();
});

test('schema-1 database upgrade preserves exact v2 data, legacy drafts and recovery bytes', async () => {
    const [, , , { createIndexedDBStore, DB_NAME }, , { emptyTraining }] = await modules;
    const indexedDB = new IDBFactory(), original = state(fixture), raw = JSON.stringify(original), storage = new Storage(raw);
    const db = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(DB_NAME, 1);
        opening.onupgradeneeded = () => { for (const name of ['settings', 'entries', 'sessions', 'drafts', 'meta', 'recovery']) opening.result.createObjectStore(name, { keyPath: 'id' }); };
        opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
    });
    const oldTraining = emptyTraining(); oldTraining.current = 1;
    await new Promise((resolve, reject) => {
        const tx = db.transaction(['settings', 'entries', 'sessions', 'drafts', 'meta', 'recovery'], 'readwrite');
        tx.objectStore('settings').put({ id: 'profile', goal: 175 });
        original.entries.forEach((entry, order) => tx.objectStore('entries').put({ ...entry, order }));
        original.sessions.forEach((session, order) => tx.objectStore('sessions').put({ ...session, order }));
        tx.objectStore('drafts').put({ id: 'active', value: oldTraining });
        tx.objectStore('meta').put({ id: 'state', phase: 'ready', schema: 1, revision: 5, legacyRaw: raw });
        tx.objectStore('recovery').put({ id: 'migration', raw });
        tx.objectStore('recovery').put({ id: 'before-import', raw: 'unaltered recovery bytes' });
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    let closed = false; db.onversionchange = () => { closed = true; db.close(); };
    storage.values.set('vegan-strength-storage', JSON.stringify({ engine: 'indexeddb', version: 1, status: 'active' }));
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'plans') throw Error('Upgrade interrupted'); return put.apply(this, args); };
    const interrupted = createIndexedDBStore({ indexedDB, getStorage: () => storage });
    try {
        assert.equal(await interrupted.load(), null);
        assert.match(interrupted.problem.message, /Upgrade interrupted/);
    } finally { IDBObjectStore.prototype.put = put; interrupted.close(); }
    const preserved = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(DB_NAME, 1);
        opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
    });
    assert.equal(preserved.version, 1, 'An aborted upgrade must not advance the database version');
    assert.equal(preserved.objectStoreNames.contains('plans'), false);
    preserved.close();
    const store = createIndexedDBStore({ indexedDB, getStorage: () => storage });
    assert.deepEqual(await store.load(), { ...original, goal: 175 }, store.problem?.message);
    assert.equal(closed, true);
    assert.deepEqual(await store.loadTraining(), oldTraining);
    assert.equal(await store.migration(), raw);
    assert.equal(await store.previous(), 'unaltered recovery bytes');
    assert.equal((await store.loadProgram()).activePlanId, null);
    await store.saveProgram((await sample()).program);
    assert.equal((await store.load()).goal, 175);
    assert.equal(storage.getItem(KEY), raw);
    store.close();
});

test('future-dated sessions do not leak into the current weekly workout counter', async () => {
    const { weeklySessions } = await import('../src/domain/statistics.js');
    const sessions = ['2026-11-08', '2026-11-09', '2026-11-15', '2026-11-16'].map(date => ({ date }));
    assert.equal(weeklySessions(sessions, new Date('2026-11-09T12:00:00')), 2);
});

test('two repeats on the same day are not sufficient evidence for a load increase', async () => {
    const env = await readyHistory();
    const [, , { progression }] = await modules;
    env.data.sessions[1].date = env.data.sessions[0].date;
    assert.equal(progression(env.program, env.data, env.plan, env.targets[3], 5).suggestion, null);
});

test('missing load values in checked planned dumbbell sets are not invented as zero', async () => {
    const { ui } = await startUI(); await openSlot(ui);
    const input = ui.element('exerciseList').querySelectorAll('[data-field]').find(item => item.dataset.e === '3' && item.dataset.s === '0' && item.dataset.field === 'reps');
    input.value = '8'; input.oninput();
    await ui.element('exerciseList').querySelectorAll('[data-done]').find(item => item.dataset.done === '3:0').click();
    await ui.element('saveWorkout').click();
    assert.match(ui.alerts.at(-1), /Gewicht/);
    assert.deepEqual(ui.data(), state(fixture));
    assert.equal(ui.program().links.length, 0);
    ui.close();
});

test('a draft whose plan was replaced in another tab remains editable and can be saved unassigned', async () => {
    const { ui, indexedDB, storage } = await startUI();
    await openSlot(ui); await ui.checkSet('2', '0'); await ui.idle();
    const second = await app(storage, { indexedDB });
    await second.import(fixture);
    await ui.element('retryStorage').click();
    assert.equal(ui.program().plans.length, 0);
    assert.equal(ui.draft().done, true);
    assert.match(ui.element('trainingMode').textContent, /frühere Plan/);
    await ui.element('saveWorkout').click();
    assert.equal(ui.data().sessions.length, fixture.sessions.length + 1);
    assert.equal(ui.program().links.length, 0);
    assert.match(ui.confirmations.at(-1), /ohne Plan-Zuordnung/);
    ui.close(); second.close();
});

test('free templates do not silently inherit values from a different planned exercise variant', async () => {
    const env = await readyHistory();
    const [, , , , { serializeBackup }, { emptyTraining }] = await modules;
    const ui = await app(new Storage(), { indexedDB: new IDBFactory() });
    await ui.import(JSON.parse(serializeBackup(env.data, undefined, emptyTraining(), env.program)));
    ui.navigate('training');
    assert.deepEqual(ui.draft(), { reps: '', kg: '', done: false });
    ui.close();
});
