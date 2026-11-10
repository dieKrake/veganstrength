import { emptyNutrition } from '../domain/nutrition.js';
import { historyPage } from '../domain/history.js';
import { emptyTraining } from '../domain/training-state.js';
import { emptyProgram } from '../domain/program.js';

// Features depend on this interface, not on the browser's storage APIs.
export function createRepository(adapter) {
    return {
        async load() { return adapter.load(); },
        async querySessions(options, fallbackSessions) { return adapter.querySessions?.(options) ?? historyPage(fallbackSessions, options); },
        async write(candidate, options) { return adapter.write(candidate, options); },
        async previous() { return adapter.previous(); },
        async removePrevious() { return adapter.removePrevious(); },
        async loadTraining() { return adapter.loadTraining?.() ?? emptyTraining(); },
        async saveTraining(value) { return adapter.saveTraining?.(value) ?? false; },
        async loadNutrition() { return adapter.loadNutrition?.() ?? emptyNutrition(); },
        async saveNutrition(value) { return adapter.saveNutrition?.(value) ?? null; },
        async loadProgram() { return adapter.loadProgram?.() ?? emptyProgram(); },
        async saveProgram(value) { return adapter.saveProgram?.(value) ?? null; },
        async migration() { return adapter.migration?.() ?? null; },
        async conflict() { return adapter.conflict?.() ?? null; },
        close() { adapter.close?.(); },
        get raw() { return adapter.raw; },
        get problem() { return adapter.problem; },
        get loaded() { return adapter.loaded; }
    };
}
