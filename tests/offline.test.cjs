const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const workerUrl = 'https://example.test/vegan-strength/sw.js';
const base = new URL('./', workerUrl);
const urlOf = value => new URL(typeof value === 'string' ? value : value.url, base).href;

function worker({ unavailable } = {}) {
    const handlers = new Map(), buckets = new Map(), networkRequests = [];
    let online = true, skipped = 0;
    async function fetchAsset(request) {
        const url = urlOf(request);
        networkRequests.push({ url, cache: request.cache });
        if (!online || url === urlOf(unavailable || './missing-file')) throw Error('Network unavailable');
        const filename = new URL(url).pathname.slice(base.pathname.length) || 'index.html';
        return new Response(fs.readFileSync(path.join(root, filename)));
    }
    const caches = {
        async open(name) {
            if (!buckets.has(name)) buckets.set(name, new Map());
            const entries = buckets.get(name);
            return {
                async addAll(requests) {
                    const responses = await Promise.all(requests.map(fetchAsset));
                    requests.forEach((request, i) => entries.set(urlOf(request), responses[i]));
                },
                async match(request, { ignoreSearch = false } = {}) {
                    const url = new URL(urlOf(request));
                    if (ignoreSearch) url.search = '';
                    return entries.get(url.href)?.clone();
                }
            };
        },
        async keys() { return [...buckets.keys()]; },
        async delete(name) { return buckets.delete(name); }
    };
    const context = vm.createContext({
        URL, Request,
        self: {
            location: { href: workerUrl },
            addEventListener: (type, handler) => handlers.set(type, handler),
            skipWaiting() { skipped++; },
            clients: { claim: async () => {} }
        },
        caches,
        fetch: fetchAsset
    });
    vm.runInContext(workerSource, context);
    const release = vm.runInContext('CACHE', context);
    const assets = [...vm.runInContext('ASSETS', context)];
    return {
        assets, release, buckets, networkRequests,
        get skipped() { return skipped; },
        offline() { online = false; networkRequests.length = 0; },
        async install() {
            let promise;
            handlers.get('install')({ waitUntil: value => { promise = value; } });
            await promise;
        },
        fetch(asset, { method = 'GET', mode = 'cors' } = {}) {
            let response;
            handlers.get('fetch')({
                request: { url: urlOf(asset), method, mode },
                respondWith: value => { response = value; }
            });
            return response;
        }
    };
}

function moduleGraph(filename, found = new Set()) {
    const relative = path.relative(root, filename).split(path.sep).join('/');
    if (found.has('./' + relative)) return found;
    found.add('./' + relative);
    const source = fs.readFileSync(filename, 'utf8');
    for (const match of source.matchAll(/^import .*?from ['"]([^'"]+)['"]/gm)) {
        assert.ok(match[1].startsWith('.'), 'Runtime import must be local: ' + match[1]);
        moduleGraph(path.resolve(path.dirname(filename), match[1]), found);
    }
    return found;
}

test('the HTML entry point, CSS, manifest, icons and complete module graph are precached', async () => {
    const sw = worker();
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="\.\/styles\/app\.css">/);
    assert.doesNotMatch(html, /<style>|<script>/);
    const assets = new Set(sw.assets);
    for (const asset of ['./', './index.html', './styles/app.css', './manifest.webmanifest', './icon-192.png', './icon-512.png', ...moduleGraph(path.join(root, 'src/main.js'))]) {
        assert.ok(assets.has(asset), 'Missing offline asset: ' + asset);
    }
    await sw.install();
    assert.ok(sw.networkRequests.every(request => request.cache === 'reload'));
    assert.equal(sw.skipped, 0, 'Do not force an update over a running workout');
});

test('every release asset loads offline, including installations in a subdirectory', async () => {
    const sw = worker();
    await sw.install();
    sw.offline();
    for (const asset of sw.assets) {
        const response = await sw.fetch(asset + '?offline-test=1');
        assert.equal(response.status, 200);
        const filename = asset === './' ? 'index.html' : asset.slice(2);
        assert.equal(await response.text(), fs.readFileSync(path.join(root, filename), 'utf8'));
    }
    assert.equal(sw.networkRequests.length, 0);
});

test('an incomplete module release cannot finish installation or force activation', async () => {
    const sw = worker({ unavailable: './src/features/training.js' });
    const old = new Map([['old', new Response('old app')]]);
    sw.buckets.set('vegan-strength-v2.0.1', old);
    await assert.rejects(sw.install(), /Network unavailable/);
    assert.equal(sw.skipped, 0);
    assert.equal(sw.buckets.get('vegan-strength-v2.0.1'), old);
    assert.equal(sw.buckets.get(sw.release).size, 0);
});

test('a missing module never falls back to HTML or another release cache', async () => {
    const sw = worker();
    await sw.install();
    const module = './src/features/training.js';
    sw.buckets.get(sw.release).delete(urlOf(module));
    sw.buckets.set('vegan-strength-old-release', new Map([[urlOf(module), new Response('old module')]]));
    sw.offline();
    await assert.rejects(sw.fetch(module), /Network unavailable/);
    const navigation = await sw.fetch('./unknown-route', { mode: 'navigate' });
    assert.equal(await navigation.text(), fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
});

test('unrelated origins, paths and mutating requests are not intercepted', async () => {
    const sw = worker();
    assert.equal(sw.fetch('https://other.test/index.html'), undefined);
    assert.equal(sw.fetch('https://example.test/another-app/index.html'), undefined);
    assert.equal(sw.fetch('./index.html', { method: 'POST' }), undefined);
});
