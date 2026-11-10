const CACHE = 'vegan-strength-v2.4.2';
const ASSETS = [
    "./",
    "./index.html",
    "./styles/app.css",
    "./manifest.webmanifest",
    "./icon-192.png",
    "./icon-512.png",
    "./src/app.js",
    "./src/data/exercises.js",
    "./src/data/foods.js",
    "./src/data/workouts.js",
    "./src/domain/dates.js",
    "./src/domain/nutrition.js",
    "./src/domain/program-validation.js",
    "./src/domain/program.js",
    "./src/domain/progression.js",
    "./src/domain/protein.js",
    "./src/domain/statistics.js",
    "./src/domain/training-state.js",
    "./src/domain/validation.js",
    "./src/features/home.js",
    "./src/features/plan.js",
    "./src/features/progress.js",
    "./src/features/protein.js",
    "./src/features/settings.js",
    "./src/features/training.js",
    "./src/main.js",
    "./src/services/backup.js",
    "./src/services/pwa.js",
    "./src/services/timer.js",
    "./src/storage/indexed-db.js",
    "./src/storage/local-storage.js",
    "./src/storage/repository.js",
    "./src/ui/format.js",
    "./src/ui/navigation.js"
];
const ROOT = new URL('./', self.location.href);

self.addEventListener('install', event => {
    // A release is usable only once its complete module graph is cached.
    // Updates wait until the previous app's tabs close; do not replace a
    // running release underneath an unfinished workout.
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
        ASSETS.map(asset => new Request(new URL(asset, ROOT), { cache: 'reload' }))
    )));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys
            .filter(key => key.startsWith('vegan-strength-') && key !== CACHE)
            .map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
    event.respondWith((async () => {
        // Look only in this worker's release, never in another release's cache.
        const cache = await caches.open(CACHE);
        const hit = await cache.match(event.request, { ignoreSearch: true });
        if (hit) return hit;
        try { return await fetch(event.request); }
        catch (error) {
            if (event.request.mode === 'navigate') {
                const shell = await cache.match('./index.html');
                if (shell) return shell;
            }
            throw error;
        }
    })());
});
