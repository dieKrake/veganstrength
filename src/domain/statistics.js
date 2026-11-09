import { dayShift } from './dates.js';
import { dayTotal } from './protein.js';

export function weeklySessions(sessions, now = new Date()) {
    const monday = new Date(now);
    const weekday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - weekday);
    monday.setHours(0, 0, 0, 0);
    // Preserve the existing weekly counter in this architecture-only stage.
    return sessions.filter(session => new Date(session.date + 'T12:00:00') >= monday).length;
}

export function proteinSeries(data, now = new Date()) {
    const dates = Array.from({ length: 7 }, (_, i) => dayShift(i - 6, now));
    const values = dates.map(date => dayTotal(data, date));
    return { dates, values, max: Math.max(data.goal, ...values, 1), average: values.reduce((a, b) => a + b, 0) / 7 };
}

export const completedSets = session => session.exercises.reduce((count, exercise) => count + exercise.sets.filter(set => set.done).length, 0);
