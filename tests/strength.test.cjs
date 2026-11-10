const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory, IDBIndex } = require('fake-indexeddb');
const { app, Storage, fixture, state, copy } = require('./app-harness.cjs');
const modules = Promise.all([import('../src/domain/strength.js'), import('../src/domain/program.js'), import('../src/storage/indexed-db.js'), import('../src/domain/history.js'), import('../src/services/backup.js'), import('../src/domain/training-state.js'), import('../src/domain/nutrition.js'), import('../src/ui/strength-chart.js')]);
const set = (reps, kg = 0, done = true) => ({ reps, kg, done });
const session = (id, date, name, sets, workout = 'Upper A') => ({ id, date, workout, exercises: [{ name, sets }] });
async function planned() {
    const [, domain] = await modules, program = domain.emptyProgram();
    const plan = domain.createPlan(program, '2026-11-09', 'chart-plan'); program.plans.push(plan); program.activePlanId = plan.id;
    let current = program;
    const data = { goal: 150, entries: [], sessions: [] };
    function add(id, date, slotIndex = 0, mutate = () => {}) {
        const slot = plan.slots[slotIndex], targets = domain.targetsFor(plan, slot);
        const row = { id, date, workout: ['Upper A','Lower A','Upper B','Lower B + Upper'][slot.workoutIndex], exercises: targets.map(target => ({ name: target.name, sets: Array.from({length: target.sets}, () => set(target.max, target.basis === 'none' ? 0 : 10)) })) };
        mutate(row, targets);
        data.sessions.unshift(row);
        current = domain.completeSlot(current, { planId: plan.id, slotId: slot.id, week: slot.week, workoutIndex: slot.workoutIndex, targets }, row.id, targets.map(() => ({ rir: 2, clean: true })), false);
    }
    return { data, add, program: () => current };
}

test('confirmed plan variants never merge with legacy names or another bodyweight angle', async () => {
    const [{ strengthGroups, strengthSeries }] = await modules, env = await planned();
    env.add('one', '2026-11-09'); env.add('two', '2026-11-10');
    env.data.sessions.push(session('old', '2026-11-01', 'Klimmzüge', [set(99)]));
    const program = env.program();
    const second = program.links.find(link => link.sessionId === 'two').exercises[1];
    second.variantId = 'row-flat'; second.name = 'Ring Rows – flacher Winkel'; env.data.sessions[0].exercises[1].name = second.name;
    const before = copy({ data: env.data, program }), groups = strengthGroups(env.data.sessions, program);
    const pull = groups.filter(group => group.name === 'Klimmzüge');
    assert.equal(pull.length, 2); assert.equal(pull.filter(group => group.comparable).length, 1);
    assert.equal(groups.filter(group => group.key.startsWith('plan:ringrow:')).length, 2);
    assert.equal(strengthSeries(pull.find(group => group.comparable), { range: 'all' }).points.length, 2);
    assert.equal(strengthSeries(pull.find(group => !group.comparable), { range: 'all' }).points[0].reps, 99);
    assert.deepEqual({ data: env.data, program }, before);
});

test('repetition comparisons use actual equal load and ignore unchecked sets without losing them', async () => {
    const [{ strengthGroups, strengthSeries }] = await modules;
    const rows = [session('a','2026-11-10','Push-ups',[set(5),set(7),set(50,0,false),set(3,5)])];
    const group = strengthGroups(rows, { links: [] })[0];
    const zero = strengthSeries(group, { range: 'all', kg: 0 });
    assert.equal(zero.points[0].reps, 7); assert.equal(zero.points[0].sets, 2);
    assert.equal(strengthSeries(group, { range: 'all', kg: 5 }).points[0].reps, 3);
    assert.equal(strengthSeries(group, { range: 'all', kg: 10 }).points.length, 0);
    assert.equal(rows[0].exercises[0].sets[2].done, false);
});

test('highest load retains repetitions from the same actual set rather than a different warmup set', async () => {
    const [{ strengthGroups, strengthSeries }] = await modules, env = await planned();
    env.add('load', '2026-11-10', 0, row => { row.exercises[3].sets = [set(20, 5), set(6, 12.5)]; });
    const group = strengthGroups(env.data.sessions, env.program()).find(group => group.key.startsWith('plan:press:'));
    const point = strengthSeries(group, { metric: 'load', range: 'all' }).points[0];
    assert.deepEqual([point.value, point.kg, point.reps, point.setIndex], [12.5, 12.5, 6, 1]);
    assert.equal(group.basis, 'per-hand'); assert.equal(point.kg, 12.5, 'Do not double weight per hand');
});

test('seconds, unilateral reps and ambiguous imported names keep their units and original values', async () => {
    const [{ strengthGroups, strengthSeries }] = await modules, env = await planned();
    env.add('legs', '2026-11-10', 1);
    env.data.sessions.push(session('old-plank', '2026-11-01', 'Plank (Sekunden)', [set(42.5)]));
    env.data.sessions.push(session('unknown', '2026-11-02', 'Eigene Übung', [set(12, 8)]));
    const groups = strengthGroups(env.data.sessions, env.program());
    const plank = groups.find(group => group.key.startsWith('plan:plank:'));
    assert.equal(plank.unit, 'seconds'); assert.equal(strengthSeries(plank, { range:'all' }).points[0].reps, 45);
    const lunge = groups.find(group => group.key.startsWith('plan:lunge:'));
    assert.equal(strengthSeries(lunge, {range:'all',kg:10}).points[0].reps, 12, 'Per-side values must not be doubled');
    const old = groups.find(group => group.key.startsWith('legacy:Plank'));
    assert.equal(old.unit, 'seconds'); assert.equal(old.comparable, false);
    const unknown = groups.find(group => group.name === 'Eigene Übung');
    assert.equal(strengthSeries(unknown, {range:'all',kg:8}).canPlot, false);
    assert.equal(strengthSeries(unknown, {range:'all',kg:8}).points[0].reps, 12);
});

test('range filtering uses local days, preserves same-day repeats and does not invent zero-valued workouts', async () => {
    const [{ strengthGroups, strengthSeries }] = await modules;
    const rows = [session('a','2026-11-10','Push-ups',[set(3)]),session('b','2026-11-10','Push-ups',[set(4)]),session('future','2026-11-11','Push-ups',[set(5)]),session('old','2026-01-01','Push-ups',[set(6)])];
    const group = strengthGroups(rows, {links:[]})[0];
    const points = strengthSeries(group, { range:'56', now: new Date(2026,10,10,0,15) }).points;
    assert.equal(points.length, 2); assert.deepEqual(points.map(point=>point.date), ['2026-11-10','2026-11-10']);
    assert.equal(strengthSeries(group, {range:'all'}).points.length, 4);
});

test('SVG plots keep calendar spacing, distinguish legacy points and escape text', async () => {
    const [, , , , , , , { strengthChart }] = await modules;
    const points = [{ date:'2026-11-01', value:0, reps:0, kg:0 },{date:'2026-11-03',value:3,reps:3,kg:0},{date:'2026-11-10',value:4,reps:4,kg:0}];
    const chart = strengthChart(points, 'Wdh.'); assert.match(chart, /<polyline/); assert.match(chart, /aria-labelledby=/);
    const xs=[...chart.matchAll(/<circle cx="([^"]+)"/g)].map(match=>Number(match[1]));
    assert.ok(xs[1]-xs[0] < xs[2]-xs[1]);
    assert.doesNotMatch(strengthChart(points,'Wdh.',false), /<polyline/);
    assert.doesNotMatch(strengthChart(points,'<img>'), /<img>/);
    assert.doesNotMatch(strengthChart(points.slice(0,1),'Wdh.'), /NaN|Infinity/);
});

test('indexed date paging matches the fallback, includes boundary days and never rewrites original array order', async () => {
    const [, , { createIndexedDBStore }, { historyPage }] = await modules;
    const original = { goal:150, entries:[], sessions:Array.from({length:47},(_,i)=>session('s-'+String(i).padStart(3,'0'), '2026-11-'+String(i%10+1).padStart(2,'0'), 'Push-ups',[set(i)],i%2?'Upper A':'Upper B')) };
    const indexedDB = new IDBFactory(), storage = new Storage(JSON.stringify(original));
    const store = createIndexedDBStore({indexedDB,getStorage:()=>storage}); assert.deepEqual(await store.load(),original);
    const openCursor = IDBIndex.prototype.openCursor; let indexReads=0;
    IDBIndex.prototype.openCursor = function (...args) { if (this.name==='date') indexReads++; return openCursor.apply(this,args); };
    try {
        for (const options of [{limit:20},{offset:20,limit:20},{offset:40,limit:20},{from:'2026-11-03',to:'2026-11-07',workout:'Upper A',limit:3,offset:2},{from:'2026-11-10',to:'2026-11-10'},{to:'2026-01-01'}]) {
            assert.deepEqual(await store.querySessions(options), historyPage(original.sessions,options));
        }
        assert.ok(indexReads>=6);
    } finally { IDBIndex.prototype.openCursor=openCursor; }
    assert.deepEqual(await store.load(),original); store.close();
});

test('history queries reject invalid filters and stale revisions instead of mixing different data snapshots', async () => {
    const [, , { createIndexedDBStore }] = await modules;
    const indexedDB=new IDBFactory(), storage=new Storage(JSON.stringify(state(fixture)));
    const make=()=>createIndexedDBStore({indexedDB,getStorage:()=>storage}), first=make(), other=make();
    await first.load(); await other.load();
    await assert.rejects(first.querySessions({from:'2026-02-30'}));
    await assert.rejects(first.querySessions({from:'2026-11-10',to:'2026-11-01'}));
    await other.write({...state(fixture),goal:175});
    await assert.rejects(first.querySessions({}), /anderen Fenster/); first.close(); other.close();
});

test('all history pages and date/workout filters remain accessible beyond the former twenty-entry limit', async () => {
    const data={goal:150,entries:[],sessions:Array.from({length:45},(_,i)=>session('row-'+String(i).padStart(2,'0'),'2026-11-10','Push-ups',[set(3)],i%2?'Upper A':'Upper B'))};
    const ui=await app(new Storage(JSON.stringify(data)),{indexedDB:new IDBFactory()});
    await ui.navigate('progress'); assert.match(ui.element('historyStatus').textContent,/1–20 von 45/);
    await ui.element('historyNext').click(); assert.match(ui.element('historyStatus').textContent,/21–40 von 45/);
    await ui.element('historyNext').click(); assert.match(ui.element('historyStatus').textContent,/41–45 von 45/);
    assert.equal(ui.element('historyNext').disabled,true);
    ui.element('historyWorkout').value='workout:Upper A'; await ui.element('applyHistoryFilter').click(); assert.match(ui.element('historyStatus').textContent,/von 22/);
    ui.element('historyTo').value='2026-11-09'; await ui.element('applyHistoryFilter').click(); assert.match(ui.element('historyStatus').textContent,/Keine Trainings/);
    await ui.element('resetHistoryFilter').click(); assert.match(ui.element('historyStatus').textContent,/von 45/);
    assert.deepEqual(ui.data(),data); ui.close();
});

test('training details preserve unchecked sets, seconds and ambiguous legacy weights without an alert', async () => {
    const data={goal:150,entries:[],sessions:[session('plank','2026-11-10','Plank (Sekunden)',[set(45.5),set(30,0,false)])]};
    const ui=await app(new Storage(JSON.stringify(data))); await ui.navigate('progress');
    ui.element('history').querySelectorAll('[data-detail]')[0].click();
    assert.equal(ui.element('sessionDetail').classList.contains('hidden'),false);
    assert.match(ui.element('sessionDetailBody').innerHTML,/45,5/); assert.match(ui.element('sessionDetailBody').innerHTML,/<th scope="col">s<\/th>/);
    assert.match(ui.element('sessionDetailBody').innerHTML,/Nicht abgehakt/); assert.match(ui.element('sessionDetailBody').innerHTML,/Bedeutung unklar/);
    assert.deepEqual(ui.alerts,[]); ui.close();
});

test('the strength table shows paired load and repetitions and opens the original session', async () => {
    const [, , , , {serializeBackup}, {emptyTraining}, {emptyNutrition}] = await modules, env=await planned();
    env.add('paired','2026-11-10');
    const ui=await app(new Storage(),{indexedDB:new IDBFactory()}); await ui.import(JSON.parse(serializeBackup(env.data,undefined,emptyTraining(),env.program(),emptyNutrition())));
    await ui.navigate('progress'); const key='plan:press:db-press:reps:per-hand'; ui.element('strengthExercise').value=key; ui.element('strengthExercise').onchange();
    assert.match(ui.element('strengthTable').innerHTML,/kg pro Hantel/); assert.match(ui.element('strengthTable').innerHTML,/>12<\/td>/); assert.match(ui.element('strengthTable').innerHTML,/>10<\/td>/);
    ui.element('strengthTable').querySelectorAll('[data-strength-session]')[0].click(); assert.match(ui.element('sessionDetailTitle').textContent,/Upper A/);
    assert.match(ui.element('sessionDetailBody').innerHTML,/Saubere Ausführung: bestätigt/); ui.close();
});

test('history and strength pagination do not discard older values or mutate backups', async () => {
    const data={goal:150,entries:[],sessions:Array.from({length:145},(_,i)=>session('point-'+i,'2026-11-10','Push-ups',[set(i%20)]))};
    const ui=await app(new Storage(JSON.stringify(data))); await ui.navigate('progress');
    assert.match(ui.element('strengthSummary').textContent,/145 Trainingswerte/); assert.match(ui.element('strengthSummary').textContent,/letzten 120/);
    assert.equal((ui.element('strengthChart').innerHTML.match(/<circle/g)||[]).length,120);
    for(let i=0;i<7;i++)ui.element('strengthTableNext').click();
    assert.match(ui.element('strengthTableStatus').textContent,/141–145 von 145/);
    ui.navigate('settings'); await ui.element('exportLegacyData').click(); const backup=JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.deepEqual(state(backup),data); ui.close();
});

test('late history responses cannot replace a more recent filter and failed reads retain previous rows', async () => {
    const {createHistory}=await import('../src/features/history.js');
    const ui=await app(), pending=[];
    const history=createHistory({$:ui.element,getData:()=>data,getProgram:()=>({links:[]}),querySessions:options=>new Promise((resolve,reject)=>pending.push({options,resolve,reject}))});
    const data={goal:150,entries:[],sessions:[]};
    const first=history.render(); ui.element('historyTo').value='2026-11-09'; const second=ui.element('applyHistoryFilter').click();
    pending[1].resolve({total:1,sessions:[session('new','2026-11-09','Push-ups',[set(3)],'Neuer Filter')]}); await second;
    pending[0].resolve({total:2,sessions:[session('old','2026-11-10','Push-ups',[set(3)],'Alter Filter')]}); await first;
    assert.match(ui.element('history').innerHTML,/Neuer Filter/); assert.doesNotMatch(ui.element('history').innerHTML,/Alter Filter/);
    const failure=ui.element('applyHistoryFilter').click(); pending[2].reject(Error('Read failed')); await failure;
    assert.match(ui.element('historyStatus').textContent,/nicht aktualisiert/); assert.match(ui.element('history').innerHTML,/Neuer Filter/); ui.close();
});
