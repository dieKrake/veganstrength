const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { app, Storage } = require('./app-harness.cjs');
const moduleReady = import('../src/services/pwa.js');

function events(value = {}) {
    const listeners = new Map();
    return Object.assign(value, {
        addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
        removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
        emit(type) { listeners.get(type)?.forEach(handler => handler()); }
    });
}
function browser({ complete = true, noReply = false, controlled = true, waiting = true, installing = false, updateError = false } = {}) {
    const worker = events({ state: installing ? 'installing' : 'installed' }), messages = [];
    const registration = events({ active: {state:'activated'}, waiting: waiting ? worker : null, installing: installing ? worker : null,
        async update() { if (updateError) throw Error('Offline'); } });
    const serviceWorker = events({ ready: Promise.resolve(registration), async register() { return registration; }, controller: controlled ? {
        postMessage(message, ports) {
            messages.push(message);
            if (!noReply) ports[0].postMessage({type:'OFFLINE_STATUS',complete,version:'2.5.1'});
        }
    } : null });
    class Channel {
        constructor() {
            this.port1 = {close() {}};
            this.port2 = {close() {}, postMessage: data => this.port1.onmessage?.({data})};
        }
    }
    return { registration, worker, serviceWorker, messages,
        overrides: { navigator: {onLine:true,vibrate(){},serviceWorker}, location:{protocol:'http:'}, MessageChannel:Channel } };
}
async function unit(options, prepareUpdate = async () => true) {
    const ui = await app(), mock = browser(options), timers = new Map();
    const { initializePwa } = await moduleReady;
    const env = { ...mock.overrides, document:{getElementById:ui.element},window:events(),
        setTimeout(callback) { const id=Symbol(); timers.set(id,callback); return id; },clearTimeout:id=>timers.delete(id) };
    const pwa = initializePwa(env,{prepareUpdate});
    return {ui,mock,timers,pwa,env};
}

test('offline readiness requires a complete cache response, not successful service-worker registration alone', async () => {
    for(const complete of [true,false]) {
        const {ui,pwa,mock}=await unit({complete}); await pwa.ready;
        assert.match(ui.element('swStatus').textContent,complete?/Alle Offline-Dateien/:/Offline-Dateien fehlen/);
        assert.deepEqual(mock.messages,[{type:'CHECK_OFFLINE'}]); pwa.dispose(); ui.close();
    }
});

test('an older silent worker times out without falsely confirming offline readiness', async () => {
    const {ui,pwa,timers}=await unit({noReply:true});
    await Promise.resolve(); await Promise.resolve();
    assert.equal(timers.size,1); [...timers.values()][0](); await pwa.ready;
    assert.match(ui.element('swStatus').textContent,/noch nicht bestätigt/); pwa.dispose(); ui.close();
});

test('an installed waiting update is offered; an incomplete installing worker is not', async () => {
    const {ui,pwa,mock}=await unit({waiting:false,installing:true}); await pwa.ready;
    assert.equal(ui.element('prepareUpdate').classList.contains('hidden'),true);
    mock.worker.state='installed'; mock.registration.waiting=mock.worker; mock.registration.installing=null; mock.worker.emit('statechange');
    assert.equal(ui.element('prepareUpdate').classList.contains('hidden'),false);
    assert.match(ui.element('updateStatus').textContent,/vollständige neue App-Version/);
    pwa.dispose(); ui.close();
});

test('update preparation blocks window-closing instructions after failed draft saving and never forces activation', async () => {
    let saved=false;
    const {ui,pwa,mock}=await unit({},async()=>saved); await pwa.ready;
    await ui.element('prepareUpdate').click(); assert.match(ui.element('updateStatus').textContent,/noch nicht bestätigt gespeichert/);
    saved=true; await ui.element('prepareUpdate').click(); assert.match(ui.element('updateStatus').textContent,/Schließe jetzt alle/);
    assert.deepEqual(mock.messages,[{type:'CHECK_OFFLINE'}], 'No skipWaiting message or forced reload');
    assert.equal(ui.element('prepareUpdate').disabled,false); pwa.dispose(); ui.close();
});

test('the real update action persists live workout inputs before advising a restart', async () => {
    const mock=browser(),storage=new Storage(),indexedDB=new IDBFactory();
    const ui=await app(storage,{indexedDB,environmentOverrides:mock.overrides});
    await ui.checkSet('3','2.5'); await ui.element('prepareUpdate').click();
    assert.match(ui.element('updateStatus').textContent,/Trainingsentwurf gespeichert/);
    ui.close();
    const next=await app(storage,{indexedDB}); next.navigate('training');
    assert.deepEqual(next.draft(),{reps:'3',kg:'2.5',done:true}); next.close();
});

test('a real draft transaction failure leaves the update unprepared and the editable draft intact', async () => {
    const mock=browser(),ui=await app(new Storage(),{indexedDB:new IDBFactory(),environmentOverrides:mock.overrides});
    await ui.checkSet('3','2.5');
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='drafts')throw Error('Storage full');return put.apply(this,args);};
    try{await ui.element('prepareUpdate').click();}
    finally{IDBObjectStore.prototype.put=put;}
    assert.match(ui.element('updateStatus').textContent,/noch nicht bestätigt gespeichert/);
    assert.deepEqual(ui.draft(),{reps:'3',kg:'2.5',done:true}); ui.close();
});

test('manual update lookup failure keeps the current app usable and allows retry', async () => {
    const {ui,pwa}=await unit({updateError:true}); await pwa.ready;
    await ui.element('checkUpdate').click(); assert.match(ui.element('updateStatus').textContent,/Updatesuche nicht möglich/);
    assert.equal(ui.element('checkUpdate').disabled,false); pwa.dispose(); ui.close();
});

test('uncontrolled first loads cannot claim offline readiness merely because an active registration exists', async () => {
    const {ui,pwa}=await unit({controlled:false}); await pwa.ready;
    assert.match(ui.element('swStatus').textContent,/noch nicht bestätigt/); pwa.dispose(); ui.close();
});
