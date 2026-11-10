import { workouts } from '../data/workouts.js';
import { exercises, exerciseIds, availableVariants, initialRange } from '../data/exercises.js';
import { dayShift, today } from './dates.js';

export const defaultProfile = () => ({
    age: 34, height: 189, weight: 84, pullUps: 3, pushUps: 6, minutes: 45,
    focus: 'upper', vegan: true,
    equipment: ['bar', 'rings', 'dumbbells', 'kettlebell', 'mat', 'ball', 'bike'],
    dumbbellStep: 0.5, kettlebellStep: 2, availableDumbbells: []
});
export const emptyProgram = () => ({ profile: defaultProfile(), activePlanId: null, plans: [], links: [] });
export const activePlan = program => program.plans.find(plan => plan.id === program.activePlanId) ?? null;
export function createPlan(program, startDate, id, createdAt = new Date().toISOString()) {
    return {
        id, startDate, createdAt, profile: structuredClone(program.profile), preferences: {},
        slots: Array.from({ length: 32 }, (_, i) => {
            const week = Math.floor(i / 4) + 1, workoutIndex = i % 4;
            return { id: `${id}:${week}:${workoutIndex}`, week, workoutIndex,
                date: dayShift((week - 1) * 7 + [0, 1, 3, 5][workoutIndex], new Date(startDate + 'T12:00:00')),
                status: 'planned', sessions: [] };
        })
    };
}
export function planWeek(plan, date = today()) {
    return Math.min(8, Math.max(1, Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(plan.startDate + 'T00:00:00Z')) / 604800000) + 1));
}
export const nextSlot = plan => plan?.slots.find(slot => slot.status === 'planned') ?? null;
export function weekPhase(week) {
    if (week <= 2) return { name: 'Technik & Ausgangswerte', reserve: '2–3', note: 'Wähle eine Schwierigkeit, mit der die Zielbereiche sauber gelingen.' };
    if (week <= 4) return { name: 'Wiederholungen aufbauen', reserve: '2–3', note: 'Erst einzelne Wiederholungen steigern; das Gewicht bleibt zunächst gleich.' };
    if (week <= 6) return { name: 'Belastung nach Leistung', reserve: '1–3', note: 'Gewicht oder Variante nur nach bestätigter Bereitschaft erhöhen.' };
    if (week === 7) return { name: 'Fortschritt festigen', reserve: '1–3', note: 'Saubere Ausführung und vergleichbare Bedingungen beibehalten.' };
    return { name: 'Leichter trainieren & auswerten', reserve: '3–4', note: 'Weniger Sätze; mit Woche 1 vergleichen. Kein verpflichtender Maximaltest.' };
}
export function targetsFor(plan, slot) {
    return workouts[slot.workoutIndex].ex.map((legacy, i) => {
        const id = exerciseIds[slot.workoutIndex][i], exercise = exercises[id];
        const options = availableVariants(id, plan.profile);
        if (!options.length) throw Error(`Für ${legacy[0]} fehlt Ausrüstung. Bitte die Profilangaben prüfen.`);
        const preference = plan.preferences[id];
        let variant = options.find(item => item.id === preference?.variantId) ?? options[0];
        if (!preference && id === 'pullup' && plan.profile.pullUps < 2) variant = options.find(item => item.id === 'pullup-assisted') ?? variant;
        if (!preference && id === 'pushup' && plan.profile.pushUps < 4) variant = options.find(item => item.id === 'push-knee') ?? variant;
        if (!preference && id === 'pushup' && plan.profile.pushUps < 2) variant = options.find(item => item.id === 'push-wall') ?? variant;
        const range = initialRange(id, variant.id, plan.profile);
        const min = preference?.min ?? range[0], max = preference?.max ?? range[1];
        let sets = legacy[1];
        if (slot.week <= 2 && sets === 4) sets = 3;
        if (slot.week <= 2 && id === 'negative') sets = 2;
        if (slot.week === 8) sets = Math.max(1, Math.ceil(sets * 0.6));
        return { id, variantId: variant.id, name: variant.name, unit: exercise.unit ?? 'reps', basis: variant.basis,
            sets, min, max, rest: legacy[3], seconds: exercise.seconds, sides: exercise.sides,
            kg: preference?.kg ?? (variant.basis === 'none' ? 0 : null), note: variant.note };
    });
}
export function timeBudget(targets) {
    const warmup = 300, transitions = targets.length * 60, buffer = 180;
    const work = targets.reduce((total, target) => total + target.sets * (target.max * target.seconds * target.sides + (target.sides === 2 ? 15 : 0)), 0);
    const rests = targets.reduce((total, target) => total + (target.sets - 1) * target.rest, 0);
    return { warmup, work, rests, transitions, buffer, total: warmup + work + rests + transitions + buffer };
}
export function completeSlot(program, context, sessionId, assessments, completed = true) {
    const next = structuredClone(program), plan = next.plans.find(item => item.id === context.planId);
    const slot = plan?.slots.find(item => item.id === context.slotId);
    if (!slot || slot.week !== context.week || slot.workoutIndex !== context.workoutIndex) throw Error('Die Plan-Zuordnung ist nicht mehr verfügbar. Der Entwurf bleibt erhalten.');
    slot.status = completed || slot.status === 'done' ? 'done' : 'planned';
    slot.sessions.push(sessionId);
    next.links.unshift({ sessionId, planId: plan.id, slotId: slot.id, completed,
        exercises: context.targets.map((target, i) => ({ ...target, ...assessments[i] })) });
    return next;
}
