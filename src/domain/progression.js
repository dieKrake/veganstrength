import { availableVariants, variantFor } from '../data/exercises.js';

export function progression(program, data, plan, target, week) {
    const sessions = new Map(data.sessions.map(session => [session.id, session]));
    const history = program.links.filter(link => link.planId === plan.id).map(link => {
        const exerciseIndex = link.exercises.findIndex(item => item.id === target.id && item.variantId === target.variantId);
        if (exerciseIndex < 0) return null;
        const session = sessions.get(link.sessionId);
        return session ? { session, details: link.exercises[exerciseIndex], exercise: session.exercises[exerciseIndex] } : null;
    }).filter(Boolean);
    const last = history[0];
    const result = { last, suggestion: null, reason: 'Für Steigerungen braucht es zwei vergleichbare Einheiten mit allen Zielsätzen, sauberer Technik und mindestens 2 Wiederholungen in Reserve.' };
    if (week === 8) return { ...result, reason: 'Auswertungswoche: Belastung beibehalten oder nach Bedarf reduzieren.' };
    const qualifying = history.slice(0, 2);
    if (qualifying.length < 2) return result;
    if (qualifying[0].session.date === qualifying[1].session.date) return { ...result, reason: 'Bestätige das obere Ziel an zwei verschiedenen Trainingstagen.' };
    const load = qualifying[0].exercise.sets[0]?.kg;
    if (!qualifying.every(({ exercise, details }) => details.clean && details.rir !== null && details.rir >= 2
        && details.min === target.min && details.max === target.max && details.sets >= target.sets
        && exercise.sets.length >= details.sets && exercise.sets.every(set => set.done && set.reps >= target.max && set.kg === load))) return result;
    if (target.kg !== null && target.kg !== load) return { ...result, reason: 'Die letzte Last entspricht nicht der aktuellen Vorgabe. Erst diese Vorgabe bestätigen.' };
    const variant = variantFor(target.id, target.variantId);
    if (variant.basis !== 'none') {
        if (week < 5) return { ...result, reason: 'Oberes Ziel erreicht. Bis Woche 4 Wiederholungen und Technik festigen; Laststeigerung ab Woche 5 prüfen.' };
        const inventory = variant.equipment.includes('dumbbells') ? plan.profile.availableDumbbells : [];
        const step = variant.equipment.includes('kettlebell') ? plan.profile.kettlebellStep : plan.profile.dumbbellStep;
        const nextKg = inventory.length ? inventory.find(kg => kg > load) : Math.round((load + step) * 100) / 100;
        if (nextKg === undefined || (load > 0 && nextKg > load * 1.1 + 0.001)) return { ...result, reason: 'Die nächste verfügbare Stufe fehlt oder ist größer als 10 %. Gewicht beibehalten; kleinere Stufe konfigurieren.' };
        return { ...result, reason: 'Zwei passende Einheiten bestätigt.', suggestion: { variantId: target.variantId, min: target.min, max: target.max, kg: nextKg }, label: `${nextKg.toLocaleString('de-DE')} kg; im unteren Wiederholungsbereich beginnen` };
    }
    if (load !== 0) return { ...result, reason: 'Zusatzlast separat vergleichen; keine automatische Empfehlung für die Körpergewichtsvariante.' };
    if (target.id === 'pullup' && target.variantId === 'pullup-strict' && target.max < 5) {
        return { ...result, suggestion: { variantId: target.variantId, min: target.min, max: target.max + 1, kg: 0 }, label: `Zielbereich bis ${target.max + 1} saubere Klimmzüge erweitern` };
    }
    if (target.id === 'pushup' && target.variantId === 'push-floor' && target.max < 10) {
        return { ...result, suggestion: { variantId: target.variantId, min: target.min, max: target.max + 1, kg: 0 }, label: `Zielbereich bis ${target.max + 1} Push-ups erweitern` };
    }
    if (target.unit === 'seconds' && target.max < 60) return { ...result, suggestion: { variantId: target.variantId, min: target.min, max: Math.min(60, target.max + 5), kg: 0 }, label: 'Haltezeit um 5 Sekunden erweitern' };
    const nextVariant = availableVariants(target.id, plan.profile).find(item => item.id === variant.next);
    if (nextVariant) return { ...result, suggestion: { variantId: nextVariant.id, min: nextVariant.id === 'pullup-strict' ? 1 : target.min, max: nextVariant.id === 'pullup-strict' ? 2 : target.max, kg: 0 }, label: `Schwierigere Variante prüfen: ${nextVariant.name}` };
    return { ...result, reason: 'Oberes Ziel bestätigt. Schwierigkeit zunächst beibehalten und die nächsten Einheiten vergleichen.' };
}
