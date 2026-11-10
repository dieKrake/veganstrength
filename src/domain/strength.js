import { exercises, exerciseIds, basisLabel } from '../data/exercises.js';
import { workouts } from '../data/workouts.js';
import { dayShift } from './dates.js';

const legacyUnits = new Map();
function addUnit(name, unit) {
    if (!legacyUnits.has(name)) legacyUnits.set(name, new Set());
    legacyUnits.get(name).add(unit);
}
workouts.forEach((workout, w) => workout.ex.forEach((exercise, i) => addUnit(exercise[0], exercises[exerciseIds[w][i]].unit ?? 'reps')));
Object.values(exercises).forEach(exercise => exercise.variants.forEach(variant => addUnit(variant.name, exercise.unit ?? 'reps')));

export function exerciseInfo(exercise, target) {
    if (target && target.name === exercise.name) {
        return { key: `plan:${target.id}:${target.variantId}:${target.unit}:${target.basis}`, name: exercise.name,
            unit: target.unit, basis: target.basis, comparable: true, label: `${exercise.name} · Planvariante`,
            note: `${basisLabel(target.basis)}. ${target.sides === 2 ? 'Werte je Seite/Bein; nicht verdoppelt. ' : ''}Gleiche Variante und Gewichtsbedeutung. Körpergewicht und Ausführungswinkel werden nicht nachträglich geschätzt.` };
    }
    const units = legacyUnits.get(exercise.name), unit = units?.size === 1 ? [...units][0] : 'unknown';
    return { key: 'legacy:' + encodeURIComponent(exercise.name), name: exercise.name, unit, basis: 'unknown', comparable: false,
        label: `${exercise.name || 'Ohne Übungsnamen'} · frei / ältere Daten`,
        note: `Variante und Gewichtsbedeutung nicht bestätigt. kg bleiben wie erfasst; keine Zuordnung zu Planvarianten. ${unit === 'unknown' ? 'Auch die Einheit des erfassten Werts ist unbekannt; nur tabellarische Anzeige.' : 'Punkte ohne Verbindungslinie: gleicher Name garantiert keine vergleichbare Ausführung.'}` };
}

export const valueUnit = unit => ({ reps: 'Wdh.', seconds: 's', unknown: 'Wdh./Sek. (unklar)' }[unit]);
export const loadUnit = basis => ({ none: 'kg Zusatzlast', 'per-hand': 'kg pro Hantel', total: 'kg gesamt / eine Hantel', unknown: 'kg wie erfasst (Bedeutung unklar)' }[basis]);

export function strengthGroups(sessions, program) {
    const links = new Map(program.links.map(link => [link.sessionId, link])), groups = new Map();
    for (const session of sessions) session.exercises.forEach((exercise, index) => {
        const target = links.get(session.id)?.exercises[index], info = exerciseInfo(exercise, target);
        if (!groups.has(info.key)) groups.set(info.key, { ...info, records: [] });
        groups.get(info.key).records.push({ session, exercise, index, target });
    });
    return [...groups.values()].sort((a, b) => Number(b.comparable) - Number(a.comparable) || a.name.localeCompare(b.name, 'de'));
}

export function strengthSeries(group, { metric = 'reps', kg = 0, range = '56', now = new Date() } = {}) {
    if (!['reps', 'load'].includes(metric) || !['56', '112', 'all'].includes(range) || !Number.isFinite(kg) || kg < 0) throw Error('Ungültige Kraftauswertung.');
    const end = todayAt(now), from = range === 'all' ? '' : dayShift(1 - Number(range), now);
    const records = group.records.filter(row => range === 'all' || (row.session.date >= from && row.session.date <= end));
    const loads = [...new Set(records.flatMap(row => row.exercise.sets.filter(set => set.done).map(set => set.kg)))].sort((a, b) => a - b);
    const points = [];
    for (const row of records) {
        const done = row.exercise.sets.map((set, index) => ({ ...set, index })).filter(set => set.done);
        const sets = metric === 'load' ? done.filter(set => set.kg === Math.max(...done.map(set => set.kg))) : done.filter(set => set.kg === kg);
        if (!sets.length) continue;
        const best = sets.reduce((a, b) => b.reps > a.reps ? b : a);
        points.push({ sessionId: row.session.id, exerciseIndex: row.index, date: row.session.date, workout: row.session.workout,
            reps: best.reps, kg: best.kg, value: metric === 'load' ? best.kg : best.reps, sets: sets.length, setIndex: best.index });
    }
    points.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId) || a.exerciseIndex - b.exerciseIndex);
    return { loads, points, unit: metric === 'load' ? loadUnit(group.basis) : valueUnit(group.unit),
        canPlot: group.unit !== 'unknown' && (metric !== 'load' || group.basis !== 'unknown') };
}

// Keep local calendar dates; this is independent of a UTC midnight boundary.
function todayAt(now) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
