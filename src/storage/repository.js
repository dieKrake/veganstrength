// The UI uses only this asynchronous interface. The underlying v2 localStorage
// adapter stays synchronous until it is replaced by an IndexedDB adapter.
export function createRepository(adapter) {
    return {
        async load() { return adapter.load(); },
        async write(candidate, options) { return adapter.write(candidate, options); },
        async previous() { return adapter.previous(); },
        async removePrevious() { return adapter.removePrevious(); },
        get raw() { return adapter.raw; },
        get problem() { return adapter.problem; },
        get loaded() { return adapter.loaded; }
    };
}
