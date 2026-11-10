import { isCalendarDate } from './validation.js';

export function historyOptions({ from = '', to = '', workout = null, offset = 0, limit = 20 } = {}) {
    if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to)) || typeof from !== 'string' || typeof to !== 'string'
        || (from && to && from > to)) throw Error('Bitte einen gültigen Zeitraum wählen (Von vor Bis).');
    if (workout !== null && typeof workout !== 'string') throw Error('Ungültiger Trainingsfilter.');
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw Error('Ungültige Seite der Trainingshistorie.');
    return { from, to, workout, offset, limit };
}

export const sessionMatches = (session, { from, to, workout }) => (!from || session.date >= from)
    && (!to || session.date <= to) && (workout === null || session.workout === workout);

// The indexed date cursor orders ties by ID, independently of the stored array order.
export function historyPage(sessions, options) {
    const query = historyOptions(options);
    const rows = sessions.filter(session => sessionMatches(session, query)).sort((a, b) =>
        a.date !== b.date ? (a.date > b.date ? -1 : 1) : a.id === b.id ? 0 : a.id > b.id ? -1 : 1);
    return { sessions: structuredClone(rows.slice(query.offset, query.offset + query.limit)), total: rows.length };
}
