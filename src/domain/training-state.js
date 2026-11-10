import { workouts } from '../data/workouts.js';
import { exerciseIds } from '../data/exercises.js';
import { record, validateAssessment, validateTarget } from './program-validation.js';

export const emptyTraining = () => ({ current: 0, drafts: {}, timer: { seconds: 90, endAt: null } });

export function validateTraining(value) {
    const object = (item, keys) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).some(key => !keys.includes(key))) throw Error('Ungültiger Trainingsentwurf.');
    };
    object(value, ['current', 'drafts', 'timer', 'activeDraft']);
    if (!Number.isInteger(value.current) || !workouts[value.current]) throw Error('Unbekannte Workout-Auswahl im Entwurf.');
    const keys = Object.keys(value.drafts ?? {});
    if (keys.length > 3200 || keys.some(key => !workouts.map((_, i) => String(i)).includes(key) && !key.startsWith('plan:'))) throw Error('Ungültiger Entwurfsschlüssel.');
    object(value.drafts, keys);
    if (value.activeDraft !== undefined && value.activeDraft !== null && (!keys.includes(value.activeDraft) || !value.activeDraft.startsWith('plan:'))) throw Error('Der aktive Planentwurf fehlt.');
    for (const [index, draft] of Object.entries(value.drafts)) {
        object(draft, ['workout', 'exercises', 'context']);
        let template = workouts[+index];
        if (draft.context) {
            const context = draft.context;
            record(context, ['planId', 'slotId', 'week', 'workoutIndex', 'targets', 'assessments']);
            if (typeof context.planId !== 'string' || typeof context.slotId !== 'string' || index !== 'plan:' + context.slotId
                || !Number.isInteger(context.week) || context.week < 1 || context.week > 8 || !Number.isInteger(context.workoutIndex)
                || !workouts[context.workoutIndex] || !Array.isArray(context.targets) || context.targets.length !== 5
                || !Array.isArray(context.assessments) || context.assessments.length !== 5) throw Error('Ungültiger Planentwurf.');
            context.targets.forEach((target, i) => {
                validateTarget(target); validateAssessment(context.assessments[i]);
                if (target.id !== exerciseIds[context.workoutIndex][i]) throw Error('Übung passt nicht zur Planeinheit.');
            });
            template = { name: workouts[context.workoutIndex].name, ex: context.targets.map(target => [target.name, target.sets]) };
        }
        if (!template) throw Error('Übungsvorlage zum Entwurf fehlt.');
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
    if (value.activeDraft && value.drafts[value.activeDraft].context?.workoutIndex !== value.current) throw Error('Aktive Workout-Auswahl passt nicht zum Planentwurf.');
    object(value.timer, ['seconds', 'endAt']);
    if (!Number.isFinite(value.timer.seconds) || value.timer.seconds < 0 || value.timer.seconds > 86400
        || !(value.timer.endAt === null || (Number.isSafeInteger(value.timer.endAt) && value.timer.endAt > 0))) {
        throw Error('Ungültiger Pausentimer im Entwurf.');
    }
    return structuredClone(value);
}
