import { workouts } from '../data/workouts.js';

export const emptyTraining = () => ({ current: 0, drafts: {}, timer: { seconds: 90, endAt: null } });

export function validateTraining(value) {
    const object = (item, keys) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).some(key => !keys.includes(key))) throw Error('Ungültiger Trainingsentwurf.');
    };
    object(value, ['current', 'drafts', 'timer']);
    if (!Number.isInteger(value.current) || !workouts[value.current]) throw Error('Unbekannte Workout-Auswahl im Entwurf.');
    object(value.drafts, workouts.map((_, i) => String(i)));
    for (const [index, draft] of Object.entries(value.drafts)) {
        const template = workouts[+index];
        object(draft, ['workout', 'exercises']);
        if (draft.workout !== template.name || !Array.isArray(draft.exercises)
            || draft.exercises.length !== template.ex.length) throw Error('Der Trainingsentwurf passt nicht zu den Übungsvorlagen.');
        draft.exercises.forEach((exercise, i) => {
            object(exercise, ['name', 'sets']);
            if (exercise.name !== template.ex[i][0] || !Array.isArray(exercise.sets)
                || exercise.sets.length !== template.ex[i][1]) throw Error('Die Sätze im Trainingsentwurf passen nicht zur Übung.');
            exercise.sets.forEach(set => {
                object(set, ['reps', 'kg', 'done']);
                for (const field of ['reps', 'kg']) {
                    const input = set[field];
                    if (!(typeof input === 'string' && input.length <= 128)
                        && !(typeof input === 'number' && Number.isFinite(input))) throw Error('Ungültiger Eingabewert im Entwurf.');
                }
                if (typeof set.done !== 'boolean') throw Error('Ungültiger Satzstatus im Entwurf.');
            });
        });
    }
    object(value.timer, ['seconds', 'endAt']);
    if (!Number.isFinite(value.timer.seconds) || value.timer.seconds < 0 || value.timer.seconds > 86400
        || !(value.timer.endAt === null || (Number.isSafeInteger(value.timer.endAt) && value.timer.endAt > 0))) {
        throw Error('Ungültiger Pausentimer im Entwurf.');
    }
    return structuredClone(value);
}
