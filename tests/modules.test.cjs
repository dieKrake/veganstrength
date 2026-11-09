const test = require('node:test');
const assert = require('node:assert/strict');
const { app, Storage, fixture, state, KEY } = require('./app-harness.cjs');

function gate() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('queued food entries keep their original amounts and dates without overwriting each other', async () => {
    const held = gate();
    const ui = await app(new Storage(), { beforeWrite: () => held.promise });
    ui.navigate('protein');
    ui.element('foodDate').value = '2026-11-08';
    ui.element('foodAmount').value = '200';
    const first = ui.element('addFood').click();
    ui.element('foodDate').value = '2026-11-09';
    ui.element('foodAmount').value = '300';
    const second = ui.element('addFood').click();
    assert.equal(ui.data().entries.length, 0);
    held.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(ui.data().entries.map(entry => [entry.date, entry.amount]), [['2026-11-08', 200], ['2026-11-09', 300]]);
    assert.equal(ui.total('2026-11-08'), 30);
    assert.equal(ui.total('2026-11-09'), 45);
});

test('a pending workout disables its inputs and cannot be saved twice', async () => {
    const held = gate();
    const ui = await app(new Storage(), { beforeWrite: () => held.promise });
    await ui.checkSet('3', '0');
    const first = ui.element('saveWorkout').click();
    assert.equal(ui.element('saveWorkout').disabled, true);
    assert.equal(ui.element('exerciseList').querySelectorAll('input')[0].disabled, true);
    const duplicate = ui.element('saveWorkout').click();
    assert.equal(ui.data().sessions.length, 0);
    held.resolve();
    await Promise.all([first, duplicate]);
    assert.equal(ui.data().sessions.length, 1);
    assert.equal(ui.element('saveWorkout').disabled, false);
});

test('failed asynchronous writes preserve the draft and unlock workout controls', async () => {
    const held = gate();
    const storage = new Storage();
    const ui = await app(storage, { beforeWrite: () => held.promise });
    await ui.checkSet('3', '0');
    const saved = ui.element('saveWorkout').click();
    storage.failWrite = true;
    held.resolve();
    await saved;
    assert.equal(ui.data().sessions.length, 0);
    assert.deepEqual(ui.draft(), { reps: '3', kg: '0', done: true });
    assert.equal(ui.element('saveWorkout').disabled, false);
    assert.equal(ui.element('exerciseList').querySelectorAll('input')[0].disabled, false);
    assert.match(ui.alerts.at(-1), /Nicht gespeichert/);
});

test('queued goal and food changes use the latest committed data', async () => {
    const held = gate();
    const ui = await app(new Storage(), { beforeWrite: () => held.promise });
    ui.element('goalInput').value = '175';
    const changed = ui.element('saveGoal').click();
    const added = ui.element('addFood').click();
    held.resolve();
    await Promise.all([changed, added]);
    assert.equal(ui.data().goal, 175);
    assert.equal(ui.data().entries.length, 1);
    assert.deepEqual(JSON.parse(ui.storage.getItem(KEY)), ui.data());
});

test('navigation and protein changes do not rebuild an existing training input', async () => {
    const ui = await app();
    await ui.checkSet('3', '2.5');
    const list = ui.element('exerciseList');
    const input = list.querySelectorAll('input')[0];
    const writes = list.innerHTMLWrites;
    ui.navigate('protein');
    await ui.element('addFood').click();
    ui.navigate('settings');
    ui.element('goalInput').value = '175';
    await ui.element('saveGoal').click();
    ui.navigate('training');
    assert.equal(list.innerHTMLWrites, writes);
    assert.equal(list.querySelectorAll('input')[0], input);
    assert.deepEqual(ui.draft(), { reps: '3', kg: '2.5', done: true });
    assert.equal(ui.intervals.size, 1);
    ui.navigate('home');
    assert.match(ui.element('homeProtein').textContent, /30 \/ 175 g/);
});

test('switching workouts retains each draft and updates the correct exercise list', async () => {
    const ui = await app();
    await ui.checkSet('3', '0');
    const select = ui.element('workoutSelect');
    select.value = '1';
    select.onchange({ target: select });
    assert.match(ui.element('exerciseList').innerHTML, /Goblet Squats/);
    select.value = '0';
    select.onchange({ target: select });
    assert.deepEqual(ui.draft(), { reps: '3', kg: '0', done: true });
});

test('data returned for inspection cannot mutate the app state without a write', async () => {
    const ui = await app(new Storage(JSON.stringify(state(fixture))));
    const snapshot = ui.data();
    snapshot.entries[0].protein = 100;
    snapshot.sessions.length = 0;
    assert.deepEqual(ui.data(), state(fixture));
    assert.equal(ui.storage.writes.length, 0);
});

test('the independent timer uses elapsed time after a delayed tick and signals completion once', async () => {
    const { createTimer } = await import('../src/services/timer.js');
    const display = {}, startButton = {}, stopButton = {};
    const elements = { timerDisplay: display, timerStart: startButton, timerStop: stopButton };
    let clock = 0, tick, stopped = 0;
    const vibrations = [];
    const timer = createTimer({
        document: { getElementById: id => elements[id], querySelectorAll: () => [] },
        navigator: { vibrate: pattern => vibrations.push(pattern) },
        now: () => clock,
        setInterval: callback => { tick = callback; return 1; },
        clearInterval: id => { if (id === 1) stopped++; }
    });
    timer.start(120);
    assert.equal(display.textContent, '02:00');
    clock = 31000;
    tick();
    assert.equal(display.textContent, '01:29');
    clock = 125000;
    tick();
    assert.equal(display.textContent, '00:00');
    assert.equal(startButton.textContent, '▶ Start');
    assert.equal(stopped, 1);
    assert.deepEqual(vibrations, [[150, 100, 150]]);
});
