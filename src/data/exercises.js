// Stable IDs describe movement and variant. Legacy workout names stay untouched.
const body = (id, name, equipment, note, next = null) => ({ id, name, equipment, note, next, basis: 'none' });
const load = (id, name, equipment, basis = 'per-hand', note = '') => ({ id, name, equipment, basis, note, next: null });
export const equipmentLabels = {
    bar: 'Klimmzugstange', rings: 'Gymnastikringe', dumbbells: 'Kurzhanteln', kettlebell: 'Kettlebell',
    mat: 'Yogamatte', ball: 'Gymnastikball', bike: 'Hometrainer'
};
export const exerciseIds = [
    ['pullup', 'ringrow', 'inclinepush', 'press', 'curl'],
    ['squat', 'hinge', 'lunge', 'calf', 'plank'],
    ['pushup', 'negative', 'dbrow', 'lateral', 'triceps'],
    ['split', 'bridge', 'ringrow', 'floorpress', 'deadbug']
];
export const exercises = {
    pullup: { min: 1, max: 2, seconds: 5, sides: 1, variants: [
        body('pullup-strict', 'Klimmzüge', ['bar'], 'Sauber aus dem Hang; beende den Satz vor unsauberen Wiederholungen.'),
        body('pullup-assisted', 'Ring-Klimmzüge mit Fußhilfe', ['rings'], 'Fußhilfe so dosieren, dass 2–3 Wiederholungen in Reserve bleiben.', 'pullup-strict')
    ] },
    ringrow: { min: 8, max: 12, seconds: 3, sides: 1, variants: [
        body('row-upright', 'Ring Rows – aufrechter Winkel', ['rings'], 'Körper gestreckt halten; Fußposition für Vergleiche gleich lassen.', 'row-flat'),
        body('row-flat', 'Ring Rows – flacher Winkel', ['rings'], 'Flacherer Körperwinkel erhöht die Schwierigkeit.')
    ] },
    inclinepush: { min: 6, max: 10, seconds: 3, sides: 1, variants: [
        body('ring-push-high', 'Ring Push-ups – aufrechter Winkel', ['rings'], 'Ringe sicher befestigen; Höhe so wählen, dass saubere Sätze gelingen.', 'ring-push-low'),
        body('ring-push-low', 'Ring Push-ups – flacher Winkel', ['rings'], 'Rumpf stabil halten und Tiefe kontrollieren.')
    ] },
    press: { min: 8, max: 12, seconds: 3, sides: 1, variants: [load('db-press', 'Kurzhantel-Schulterdrücken', ['dumbbells'])] },
    curl: { min: 10, max: 15, seconds: 3, sides: 1, variants: [load('db-curl', 'Kurzhantel-Curls', ['dumbbells'])] },
    squat: { min: 8, max: 12, seconds: 3, sides: 1, variants: [
        load('db-goblet', 'Goblet Squats – Kurzhantel', ['dumbbells'], 'total'),
        load('kb-goblet', 'Goblet Squats – Kettlebell', ['kettlebell'], 'total')
    ] },
    hinge: { min: 8, max: 12, seconds: 3, sides: 1, variants: [load('db-rdl', 'Rumänisches Kreuzheben', ['dumbbells'])] },
    lunge: { min: 8, max: 12, seconds: 3, sides: 2, variants: [load('db-lunge', 'Reverse Lunges (je Bein)', ['dumbbells'])] },
    calf: { min: 12, max: 20, seconds: 3, sides: 1, variants: [load('db-calf', 'Wadenheben – Kurzhanteln', ['dumbbells'])] },
    plank: { min: 30, max: 45, seconds: 1, sides: 1, unit: 'seconds', variants: [body('plank', 'Plank (Sekunden)', ['mat'], 'Rumpf stabil halten; Sekunden statt Wiederholungen erfassen.')] },
    pushup: { min: 3, max: 4, seconds: 3, sides: 1, variants: [
        body('push-floor', 'Push-ups', ['mat'], 'Saubere Wiederholungen; bei Bedarf die leichtere Variante wählen.'),
        body('push-knee', 'Push-ups auf den Knien', ['mat'], 'Schwierigkeit anpassen, statt bis zum Formverlust weiterzumachen.', 'push-floor'),
        body('push-wall', 'Push-ups an der Wand', [], 'An einer stabilen Wand beginnen und den Körper gestreckt halten.', 'push-knee')
    ] },
    negative: { min: 2, max: 3, seconds: 8, sides: 1, variants: [body('pullup-negative', 'Klimmzug-Negative', ['bar'], 'Kontrolliert etwa 3–5 Sekunden ablassen; nur mit sicher erreichbarer Startposition.')] },
    dbrow: { min: 8, max: 12, seconds: 3, sides: 2, variants: [load('db-row', 'Einarmiges Kurzhantelrudern (je Seite)', ['dumbbells'], 'total', 'kg beziehen sich auf die eine verwendete Hantel.')] },
    lateral: { min: 12, max: 20, seconds: 3, sides: 1, variants: [load('db-lateral', 'Kurzhantel-Seitheben', ['dumbbells'])] },
    triceps: { min: 8, max: 12, seconds: 3, sides: 1, variants: [body('ring-triceps', 'Ring-Trizeps-Extensions', ['rings'], 'Körperwinkel passend wählen; Oberarme stabil halten.')] },
    split: { min: 8, max: 12, seconds: 3, sides: 2, variants: [load('db-split', 'Split Squats (je Bein)', ['dumbbells'], 'per-hand', 'Normaler Split Squat ohne erhöhte Ablage; bei gleicher Ausführung vergleichen.')] },
    bridge: { min: 10, max: 15, seconds: 3, sides: 2, variants: [body('single-bridge', 'Einbeinige Glute Bridges (je Bein)', ['mat'], 'Becken kontrolliert anheben.')] },
    floorpress: { min: 8, max: 12, seconds: 3, sides: 1, variants: [load('db-floor', 'Kurzhantel-Floor Press', ['dumbbells'])] },
    deadbug: { min: 8, max: 12, seconds: 3, sides: 2, variants: [body('dead-bug', 'Dead Bug (je Seite)', ['mat'], 'Langsam und mit stabilem unteren Rücken ausführen.')] }
};
export const variantFor = (id, variantId) => exercises[id]?.variants.find(variant => variant.id === variantId);
export const availableVariants = (id, profile) => exercises[id].variants.filter(variant => variant.equipment.every(item => profile.equipment.includes(item)));
export const basisLabel = basis => ({ none: 'Körpergewicht; kg = Zusatzlast', 'per-hand': 'kg pro Hantel', total: 'kg gesamt / eine Hantel' }[basis]);
export function initialRange(id, variantId, profile) {
    if (id === 'pullup') return variantId === 'pullup-assisted' ? [4, 6] : [1, Math.max(1, Math.min(5, profile.pullUps - 1))];
    if (id === 'pushup') {
        if (variantId !== 'push-floor') return [4, 8];
        const min = Math.max(1, Math.min(3, profile.pushUps - 2));
        return [min, Math.max(min, Math.min(10, profile.pushUps - 2))];
    }
    return [exercises[id].min, exercises[id].max];
}
