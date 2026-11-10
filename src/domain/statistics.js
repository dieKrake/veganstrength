import { dayShift } from './dates.js';
import { dayTotal } from './protein.js';
import { goalOn } from './nutrition.js';

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

export function nutritionSeries(data, nutrition, days = 7, now = new Date()) {
    if (![7, 28, 56].includes(days)) throw Error('Zeitraum muss 7, 28 oder 56 Tage sein.');
    const dates = Array.from({ length: days }, (_, i) => dayShift(i - days + 1, now));
    const totals = new Map(), recorded = new Set();
    for (const entry of data.entries) {
        totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.amount * entry.protein / 100);
        recorded.add(entry.date);
    }
    const values = dates.map(date => totals.get(date) ?? 0), goals = dates.map(date => goalOn(nutrition, date));
    const total = values.reduce((a, b) => a + b, 0), recordedDays = dates.filter(date => recorded.has(date)).length;
    return { dates, values, goals, total, recordedDays, average: total / days,
        recordedAverage: recordedDays ? total / recordedDays : null,
        knownGoals: goals.filter(goal => goal !== null).length,
        reachedGoals: values.filter((value, i) => goals[i] !== null && value >= goals[i]).length,
        max: Math.max(...values, ...goals.filter(goal => goal !== null), 1) };
}
