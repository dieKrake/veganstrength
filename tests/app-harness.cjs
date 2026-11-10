// Executes the real application modules and their event handlers with synthetic
// browser storage. This small DOM substitute is not an Android/browser test.
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v2.json'), 'utf8'));
const KEY = 'vegan-strength-v2';
const RECOVERY = KEY + '-before-import';
const copy = value => JSON.parse(JSON.stringify(value));
const state = value => ({ goal: value.goal, entries: copy(value.entries), sessions: copy(value.sessions) });

class Storage {
    constructor(raw) {
        this.values = new Map(raw === undefined ? [] : [[KEY, raw]]);
        this.writes = [];
        this.failRead = false;
        this.failWrite = null;
        this.failRemove = false;
    }
    getItem(key) {
        if (this.failRead) throw Error('Speicherzugriff verweigert');
        return this.values.get(key) ?? null;
    }
    setItem(key, value) {
        if (this.failWrite === true || this.failWrite === key) throw Error('Speicher ist voll');
        this.writes.push({ key, value });
        this.values.set(key, value);
    }
    removeItem(key) {
        if (this.failRemove) throw Error('Löschen verweigert');
        this.values.delete(key);
    }
}

function elements(markup, selector) {
    return [...markup.matchAll(/<(input|button|section|select)\b([^>]*)>/g)].map(match => {
        const element = new Element(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
            element.attributes[attr[1]] = attr[2];
            if (attr[1].startsWith('data-')) element.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = attr[2];
        }
        element.id = element.attributes.id;
        element.disabled = /\bdisabled\b/.test(match[2]);
        element.checked = /\bchecked\b/.test(match[2]);
        element.value = element.attributes.value || '';
        element.classList = classes(element.attributes.class);
        return element;
    }).filter(element => {
        if (selector === '*') return true;
        if (selector.startsWith('[')) return selector.slice(1, -1) in element.attributes;
        if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
        return element.tag === selector;
    });
}
function classes(value = '') {
    const names = new Set(value.split(/\s+/).filter(Boolean));
    return {
        add: name => names.add(name),
        remove: name => names.delete(name),
        contains: name => names.has(name),
        toggle(name, force = !names.has(name)) { if (force) names.add(name); else names.delete(name); }
    };
}
class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this._value = '';
        this.textContent = '';
        this.dataset = {};
        this.attributes = {};
        this.style = {};
        this.classList = classes();
        this.files = [];
        this._markup = '';
        this.innerHTMLWrites = 0;
        this.childrenBySelector = new Map();
    }
    get value() { return this._value; }
    set value(value) { this._value = String(value); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    get innerHTML() { return this._markup; }
    set innerHTML(value) { this._markup = value; this.innerHTMLWrites++; this.childrenBySelector.clear(); }
    querySelectorAll(selector) {
        if (!this.childrenBySelector.has('*')) this.childrenBySelector.set('*', elements(this.innerHTML, '*'));
        return this.childrenBySelector.get('*').filter(element => {
            if (selector === '*') return true;
            if (selector.startsWith('[')) return selector.slice(1, -1) in element.attributes;
            return element.tag === selector;
        });
    }

    click() { if (!this.disabled) return this.onclick?.(); }
    remove() {}
}

async function app(storage = new Storage(), { confirm = true, beforeWrite, indexedDB, useDefaultStorage = false } = {}) {
    const ids = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
    for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        ids.get(match[1]).classList = classes(match[0].match(/class="([^"]*)"/)?.[1]);
        ids.get(match[1]).value = match[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
    }
    const selectors = new Map();
    const alerts = [], confirmations = [], downloads = [], intervals = new Map(), timeouts = new Map();
    const environment = {
        document: {
            getElementById: id => {
                if (ids.has(id)) return ids.get(id);
                for (const element of ids.values()) {
                    const child = element.querySelectorAll('*').find(item => item.id === id);
                    if (child) return child;
                }
                throw Error('Missing element: ' + id);
            },
            querySelectorAll(selector) {
                if (!selectors.has(selector)) selectors.set(selector, elements(html, selector));
                return selectors.get(selector);
            },
            createElement: tag => new Element(tag),
            body: { appendChild(link) { downloads[downloads.length - 1].filename = link.download; } }
        },
        localStorage: storage,
        indexedDB,
        navigator: { onLine: true, vibrate() {} },
        location: { protocol: 'file:' },
        window: { addEventListener() {}, scrollTo() {} },
        crypto: webcrypto,
        alert: message => alerts.push(message),
        confirm: message => { confirmations.push(message); return confirm; },
        setInterval: callback => { const id = Symbol(); intervals.set(id, callback); return id; },
        clearInterval: id => intervals.delete(id),
        setTimeout(callback, delay) { const id = Symbol(); timeouts.set(id, { callback, delay }); return id; },
        clearTimeout: id => timeouts.delete(id),
        Blob,
        URL: { createObjectURL(blob) { downloads.push({ blob }); return 'blob:test'; }, revokeObjectURL() {} }
    };
    const { createApp } = await import('../src/app.js');
    const { createRepository } = await import('../src/storage/repository.js');
    const { createLocalStorageStore } = await import('../src/storage/local-storage.js');
    const { dayTotal } = await import('../src/domain/protein.js');
    const repository = indexedDB || useDefaultStorage ? undefined : createRepository(createLocalStorageStore(() => storage));
    if (beforeWrite) {
        const write = repository.write;
        repository.write = async (...args) => { await beforeWrite(); return write(...args); };
    }
    const application = await createApp({ environment, repository });
    return {
        storage, alerts, confirmations, downloads, intervals,
        element: id => ids.get(id),
        navigate: application.navigate,
        idle: application.whenIdle,
        close: application.close,
        total: date => dayTotal(application.getData(), date),
        data: application.getData,
        program: application.getProgram,
        draft() {
            const list = ids.get('exerciseList');
            const inputs = list.querySelectorAll('input');
            return { reps: inputs[0]?.value, kg: inputs[1]?.value,
                done: list.querySelectorAll('[data-done]')[0]?.classList.contains('primary') };
        },
        async import(value, { size, raw } = {}) {
            const input = ids.get('importFile');
            const text = raw ?? JSON.stringify(value);
            input.files = [{ size: size ?? Buffer.byteLength(text), text: async () => text }];
            input.value = 'selected.json';
            await input.onchange({ target: input });
        },
        async checkSet(reps = '2', kg = '0') {
            application.navigate('training');
            const list = ids.get('exerciseList');
            const inputs = list.querySelectorAll('input');
            inputs[0].value = reps;
            inputs[0].oninput();
            inputs[1].value = kg;
            inputs[1].oninput();
            await list.querySelectorAll('[data-done]')[0].click();
        }
    };
}

module.exports = { app, Storage, fixture, state, copy, KEY, RECOVERY };
