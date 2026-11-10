import { dayShift } from './dates.js';
import { dayTotal } from './protein.js';

export function weeklySessions(sessions, now = new Date()) {
    const monday = new Date(now);
    const weekday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - weekday);
    monday.setHours(0, 0, 0, 0);
    const end = new Date(monday);
    end.setDate(end.getDate() + 7);
    return sessions.filter(session => { const date = new Date(session.date + 'T12:00:00'); return date >= monday && date < end; }).length;
}

export function proteinSeries(data, now = new Date()) {
    const dates = Array.from({ length: 7 }, (_, i) => dayShift(i - 6, now));
    const values = dates.map(date => dayTotal(data, date));
    return { dates, values, max: Math.max(data.goal, ...values, 1), average: values.reduce((a, b) => a + b, 0) / 7 };
}

export const completedSets = session => session.exercises.reduce((count, exercise) => count + exercise.sets.filter(set => set.done).length, 0);
