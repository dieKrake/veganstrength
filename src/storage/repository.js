import { emptyTraining } from '../domain/training-state.js';

// Features depend on this interface, not on the browser's storage APIs.
export function createRepository(adapter) {
    return {
        async load() { return adapter.load(); },
        async write(candidate, options) { return adapter.write(candidate, options); },
        async previous() { return adapter.previous(); },
        async removePrevious() { return adapter.removePrevious(); },
        async loadTraining() { return adapter.loadTraining?.() ?? emptyTraining(); },
        async saveTraining(value) { return adapter.saveTraining?.(value) ?? false; },
        async migration() { return adapter.migration?.() ?? null; },
        async conflict() { return adapter.conflict?.() ?? null; },
        close() { adapter.close?.(); },
        get raw() { return adapter.raw; },
        get problem() { return adapter.problem; },
        get loaded() { return adapter.loaded; }
    };
}
