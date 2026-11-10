import { emptyData } from './domain/validation.js';
import { createIndexedDBStore } from './storage/indexed-db.js';
import { createRepository } from './storage/repository.js';
import { createTimer } from './services/timer.js';
import { createDownloader } from './services/backup.js';
import { initializePwa } from './services/pwa.js';
import { createNavigation } from './ui/navigation.js';
import { createHome } from './features/home.js';
import { createTraining } from './features/training.js';
import { createProtein } from './features/protein.js';
import { createProgress } from './features/progress.js';
import { createSettings } from './features/settings.js';
import { createPlanFeature } from './features/plan.js';

export async function createApp({ environment = globalThis, repository } = {}) {
    const { document, window } = environment;
    let settings;
    repository ??= createRepository(createIndexedDBStore({
        indexedDB: environment.indexedDB,
        getStorage: () => environment.localStorage,
        onVersionChange: () => settings?.renderStatus()
    }));
    let data = await repository.load() || emptyData();
    let program = await repository.loadProgram();
    let nutrition = await repository.loadNutrition();
    let pending = Promise.resolve();
    // Serialize whole user actions, including file reads and confirmations.
    // Each update derives its candidate from the latest committed snapshot.
    function runAction(action) {
        pending = pending.then(action).catch(error => {
            environment.alert('Aktion fehlgeschlagen: ' + error.message);
            return false;
        });
        return pending;
    }
    async function persist(update, options) {
        try {
            data = await repository.write(update(data), options);
            nutrition = await repository.loadNutrition();
            if (options?.program) program = structuredClone(options.program);
            if (options?.allowReset) program = await repository.loadProgram();
            await settings.renderStatus();
            return true;
        } catch (error) {
            await settings.renderStatus();
            environment.alert('Nicht gespeichert: ' + error.message + '\nBitte Speicherzugriff und freien Speicherplatz prüfen.');
            return false;
        }
    }
    async function persistProgram(update) {
        try {
            const saved = await repository.saveProgram(update(program));
            if (!saved) throw Error('Der Plan konnte nicht gespeichert werden.');
            program = saved;
            nutrition = await repository.loadNutrition();
            await settings.renderStatus();
            return true;
        } catch (error) {
            await settings.renderStatus();
            environment.alert('Plan nicht gespeichert: ' + error.message);
            return false;
        }
    }
    async function persistNutrition(update) {
        try {
            const saved = await repository.saveNutrition(update(nutrition));
            if (!saved) throw Error('Die Lebensmittelbibliothek konnte nicht gespeichert werden.');
            nutrition = saved;
            await settings.renderStatus();
            return true;
        } catch (error) {
            await settings.renderStatus();
            environment.alert('Nicht gespeichert: ' + error.message);
            return false;
        }
    }
    const views = {};
    const navigation = createNavigation({ document, window, render: tab => views[tab].render() });
    const context = {
        $: id => document.getElementById(id),
        getData: () => data,
        setData: loaded => { data = loaded; },
        getProgram: () => program,
        setProgram: loaded => { program = loaded; },
        getNutrition: () => nutrition,
        setNutrition: loaded => { nutrition = loaded; },
        persist, persistProgram, persistNutrition, runAction, repository, environment,
        storageStatus: () => settings.renderStatus(),
        go: navigation.go,
        refresh: navigation.refresh,
        download: createDownloader(environment)
    };
    const timer = createTimer({
        document,
        navigator: environment.navigator,
        setInterval: (callback, delay) => environment.setInterval(callback, delay),
        clearInterval: id => environment.clearInterval(id)
    });
    const training = createTraining(context, timer);
    const restored = await repository.loadTraining();
    training.restore(restored);
    window.addEventListener('pagehide', () => { void training.flush(); });
    window.addEventListener('focus', timer.refresh);
    document.addEventListener?.('visibilitychange', () => {
        timer.refresh();
        if (document.visibilityState === 'hidden') void training.flush();
    });
    const planFeature = createPlanFeature(context, training);
    views.training = { render() { planFeature.renderPlan(); training.render(); } };
    views.home = createHome(context, training);
    views.protein = createProtein(context);
    views.progress = createProgress(context);
    settings = createSettings(context, training, timer);
    views.settings = { render() { settings.render(); planFeature.renderProfile(); } };
    initializePwa(environment);
    await settings.renderStatus();
    navigation.go(repository.loaded ? (Object.keys(restored.drafts).length ? 'training' : 'home') : 'settings');
    return {
        navigate: navigation.go,
        getData: () => structuredClone(data),
        getProgram: () => structuredClone(program),
        getNutrition: () => structuredClone(nutrition),
        async whenIdle() { await training.flush(); await pending; },
        close() { repository.close(); }
    };
}
