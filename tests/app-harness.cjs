// Executes the real inline application and its event handlers with synthetic
// browser storage. This small DOM substitute is not an Android/browser test.
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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
    return [...markup.matchAll(/<(input|button|section)\b([^>]*)>/g)].map(match => {
        const element = new Element(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
            element.attributes[attr[1]] = attr[2];
            if (attr[1].startsWith('data-')) element.dataset[attr[1].slice(5)] = attr[2];
        }
        element.id = element.attributes.id;
        element.value = element.attributes.value || '';
        element.classList = classes(element.attributes.class);
        return element;
    }).filter(element => {
        if (selector.startsWith('[')) return selector.slice(1, -1) in element.attributes;
        if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
        return element.tag === selector;
    });
}
function classes(value = '') {
    const names = new Set(value.split(/\s+/).filter(Boolean));
    return {
        add: name => names.add(name),
        contains: name => names.has(name),
        toggle(name, force = !names.has(name)) { if (force) names.add(name); else names.delete(name); }
    };
}
class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.value = '';
        this.textContent = '';
        this.dataset = {};
        this.attributes = {};
        this.style = {};
        this.classList = classes();
        this.files = [];
        this.innerHTML = '';
        this.childrenBySelector = new Map();
    }
    querySelectorAll(selector) {
        const old = this.childrenBySelector.get(selector);
        if (old?.markup === this.innerHTML) return old.children;
        const children = elements(this.innerHTML, selector);
        this.childrenBySelector.set(selector, { markup: this.innerHTML, children });
        return children;
    }
    click() { this.onclick?.(); }
    remove() {}
}

function app(storage = new Storage(), { confirm = true } = {}) {
    const ids = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
    for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        ids.get(match[1]).classList = classes(match[0].match(/class="([^"]*)"/)?.[1]);
        ids.get(match[1]).value = match[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
    }
    const selectors = new Map();
    const alerts = [], confirmations = [], downloads = [], intervals = new Map();
    const context = vm.createContext({
        document: {
            getElementById: id => {
                if (!ids.has(id)) throw Error('Missing element: ' + id);
                return ids.get(id);
            },
            querySelectorAll(selector) {
                if (!selectors.has(selector)) selectors.set(selector, elements(html, selector));
                return selectors.get(selector);
            },
            createElement: tag => new Element(tag),
            body: { appendChild(link) { downloads[downloads.length - 1].filename = link.download; } }
        },
        localStorage: storage,
        navigator: { onLine: true, vibrate() {} },
        location: { protocol: 'file:' },
        window: { addEventListener() {}, scrollTo() {} },
        crypto: webcrypto,
        alert: message => alerts.push(message),
        confirm: message => { confirmations.push(message); return confirm; },
        setInterval: callback => { const id = Symbol(); intervals.set(id, callback); return id; },
        clearInterval: id => intervals.delete(id),
        setTimeout() {},
        Blob,
        URL: { createObjectURL(blob) { downloads.push({ blob }); return 'blob:test'; }, revokeObjectURL() {} }
    });
    vm.runInContext(source, context, { filename: 'index.html' });
    return {
        storage, alerts, confirmations, downloads, intervals,
        element: id => ids.get(id),
        run: script => vm.runInContext(script, context),
        data: () => JSON.parse(vm.runInContext('JSON.stringify(data)', context)),
        async import(value, { size, raw } = {}) {
            const input = ids.get('importFile');
            const text = raw ?? JSON.stringify(value);
            input.files = [{ size: size ?? Buffer.byteLength(text), text: async () => text }];
            input.value = 'selected.json';
            await input.onchange({ target: input });
        },
        checkSet(reps = '2', kg = '0') {
            const list = ids.get('exerciseList');
            const inputs = list.querySelectorAll('input');
            inputs[0].value = reps;
            inputs[0].oninput();
            inputs[1].value = kg;
            inputs[1].oninput();
            list.querySelectorAll('[data-done]')[0].click();
        }
    };
}

module.exports = { app, Storage, fixture, state, copy, KEY, RECOVERY };
