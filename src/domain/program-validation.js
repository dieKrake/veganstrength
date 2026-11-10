import { equipmentLabels, exercises, exerciseIds, variantFor } from '../data/exercises.js';
import { isCalendarDate } from './validation.js';
import { targetsFor, timeBudget } from './program.js';

const fail = message => { throw Error(message); };
export function record(value, keys, name = 'Plan') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(name + ': Unbekannte Felder oder ungültiges Objekt.');
}
const number = (value, min, max) => { if (!Number.isFinite(value) || value < min || value > max) fail('Ungültiger Zahlenwert im Trainingsplan.'); };
const text = (value, max = 150) => { if (typeof value !== 'string' || !value.length || value.length > max) fail('Ungültiger Text im Trainingsplan.'); };
export function validateProfile(profile) {
    record(profile, ['age', 'height', 'weight', 'pullUps', 'pushUps', 'minutes', 'focus', 'vegan', 'equipment', 'dumbbellStep', 'kettlebellStep', 'availableDumbbells'], 'Profil');
    number(profile.age, 18, 100); number(profile.height, 100, 250); number(profile.weight, 30, 250);
    number(profile.pullUps, 0, 50); number(profile.pushUps, 0, 100);
    if (![profile.age, profile.pullUps, profile.pushUps].every(Number.isInteger) || profile.minutes !== 45 || profile.focus !== 'upper' || profile.vegan !== true) fail('Ungültige Profilvorgaben.');
    if (!Array.isArray(profile.equipment) || new Set(profile.equipment).size !== profile.equipment.length
        || profile.equipment.some(item => !Object.hasOwn(equipmentLabels, item))) fail('Ungültige Ausrüstung.');
    number(profile.dumbbellStep, 0.1, 20); number(profile.kettlebellStep, 0.1, 40);
    if (!Array.isArray(profile.availableDumbbells) || profile.availableDumbbells.length > 100
        || profile.availableDumbbells.some((kg, i) => !Number.isFinite(kg) || kg <= 0 || kg > 200 || (i > 0 && kg <= profile.availableDumbbells[i - 1]))) fail('Hantelgewichte müssen aufsteigend und eindeutig sein.');
    return structuredClone(profile);
}
export function validateTarget(target) {
    record(target, ['id', 'variantId', 'name', 'unit', 'basis', 'sets', 'min', 'max', 'rest', 'seconds', 'sides', 'kg', 'note'], 'Übungsvorgabe');
    const exercise = exercises[target.id], variant = variantFor(target.id, target.variantId);
    if (!variant || variant.name !== target.name || variant.basis !== target.basis || (exercise.unit ?? 'reps') !== target.unit
        || target.sides !== exercise.sides || target.seconds !== exercise.seconds || target.note !== variant.note) fail('Unbekannte oder veränderte Übungsvariante.');
    number(target.sets, 1, 12); number(target.min, 1, 999); number(target.max, target.min, 999); number(target.rest, 15, 300);
    if (![target.sets, target.min, target.max, target.rest].every(Number.isInteger)) fail('Ungültige Satzvorgabe.');
    if (target.kg !== null) number(target.kg, 0, 999);
}
export function validateAssessment(value) {
    record(value, ['rir', 'clean'], 'Ausführungsbewertung');
    if (typeof value.clean !== 'boolean' || !(value.rir === null || (Number.isInteger(value.rir) && value.rir >= 0 && value.rir <= 5))) fail('Ungültige Ausführungsbewertung.');
}
export function validateProgram(program, data, training) {
    record(program, ['profile', 'activePlanId', 'plans', 'links']);
    validateProfile(program.profile);
    if (!Array.isArray(program.plans) || program.plans.length > 100 || !Array.isArray(program.links) || program.links.length > 10000) fail('Planbestand zu groß oder ungültig.');
    const plans = new Map(), slots = new Map(), sessions = new Map(data.sessions.map(session => [session.id, session])), links = new Map();
    for (const plan of program.plans) {
        record(plan, ['id', 'startDate', 'createdAt', 'profile', 'preferences', 'slots']);
        text(plan.id);
        if (plans.has(plan.id) || !isCalendarDate(plan.startDate) || typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt))) fail('Ungültiger Planstart oder doppelte Plan-ID.');
        plans.set(plan.id, plan);
        validateProfile(plan.profile);
        record(plan.preferences, Object.keys(exercises), 'Progressionsvorgaben');
        for (const [id, pref] of Object.entries(plan.preferences)) {
            record(pref, ['variantId', 'min', 'max', 'kg']);
            const variant = variantFor(id, pref.variantId);
            if (!variant || !variant.equipment.every(item => plan.profile.equipment.includes(item))) fail('Variante nicht verfügbar.');
            number(pref.min, 1, 999); number(pref.max, pref.min, 999);
            if (!Number.isInteger(pref.min) || !Number.isInteger(pref.max)) fail('Ungültiger Wiederholungsbereich.');
            if (pref.kg !== null) number(pref.kg, 0, 999);
            if (variant.basis === 'none' && pref.kg !== 0) fail('Ungültige Vorgabe für Körpergewicht.');
        }
        if (!Array.isArray(plan.slots) || plan.slots.length !== 32) fail('Ein Plan benötigt acht Wochen mit je vier Einheiten.');
        plan.slots.forEach((slot, i) => {
            record(slot, ['id', 'week', 'workoutIndex', 'date', 'status', 'sessions']);
            text(slot.id);
            if (slots.has(slot.id) || slot.week !== Math.floor(i / 4) + 1 || slot.workoutIndex !== i % 4
                || !isCalendarDate(slot.date) || !['planned', 'done', 'skipped'].includes(slot.status)
                || !Array.isArray(slot.sessions) || new Set(slot.sessions).size !== slot.sessions.length
                || slot.sessions.some(id => !sessions.has(id))) fail('Ungültige Plan-Zuordnung.');
            slots.set(slot.id, { plan, slot });
            if (timeBudget(targetsFor(plan, slot)).total > plan.profile.minutes * 60) fail('Die Vorgaben überschreiten das 45-Minuten-Zeitbudget.');
        });
    }
    if (program.activePlanId !== null && !plans.has(program.activePlanId)) fail('Aktiver Plan fehlt.');
    for (const link of program.links) {
        record(link, ['sessionId', 'planId', 'slotId', 'exercises', 'completed']);
        const entry = slots.get(link.slotId), session = sessions.get(link.sessionId);
        if (!entry || entry.plan.id !== link.planId || !session || !entry.slot.sessions.includes(link.sessionId) || links.has(link.sessionId)
            || typeof link.completed !== 'boolean' || (link.completed && !session.exercises.every(exercise => exercise.sets.every(set => set.done && set.reps > 0)))
            || !Array.isArray(link.exercises) || link.exercises.length !== session.exercises.length) fail('Ungültige Trainingszuordnung.');
        links.set(link.sessionId, link);
        link.exercises.forEach((exercise, i) => {
            const { rir, clean, ...target } = exercise;
            validateTarget(target); validateAssessment({ rir, clean });
            if (target.id !== exerciseIds[entry.slot.workoutIndex][i] || target.name !== session.exercises[i].name || target.sets !== session.exercises[i].sets.length) fail('Trainingswerte und Plan-Zuordnung passen nicht zusammen.');
        });
    }
    for (const { slot } of slots.values()) {
        if (slot.sessions.some(id => links.get(id)?.slotId !== slot.id)
            || (slot.status === 'done') !== slot.sessions.some(id => links.get(id)?.completed)) fail('Verknüpftes Training fehlt oder der Abschlussstatus ist ungültig.');
    }
    for (const draft of Object.values(training?.drafts ?? {})) {
        if (!draft.context) continue;
        const entry = slots.get(draft.context.slotId);
        // A frozen draft can outlive a plan replaced in another window. Keep its
        // inputs; the UI requires an explicit choice before saving it unassigned.
        if (entry && (entry.plan.id !== draft.context.planId || entry.slot.week !== draft.context.week || entry.slot.workoutIndex !== draft.context.workoutIndex)) fail('Der Plan zum Trainingsentwurf passt nicht.');
    }
    return structuredClone(program);
}
