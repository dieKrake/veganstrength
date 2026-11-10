import { isCalendarDate } from './validation.js';
import { today } from './dates.js';

export const emptyNutrition = () => ({ foods: [], entryUnits: [], goals: [] });

export function validateNutrition(value, data) {
    const object = (item, fields) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).some(key => !fields.includes(key))
            || fields.some(key => !Object.hasOwn(item, key))) throw Error('Ungültiger Ernährungsbestand oder unbekannte Felder.');
    };
    const list = (value, max) => { if (!Array.isArray(value) || value.length > max) throw Error('Ungültige Ernährungsliste.'); };
    const protein = value => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw Error('Protein muss zwischen 0 und 100 g liegen.'); };
    const unit = value => { if (!['g', 'ml'].includes(value)) throw Error('Einheit muss g oder ml sein.'); };
    object(value, ['foods', 'entryUnits', 'goals']);
    list(value.foods, 2000); list(value.entryUnits, 30000); list(value.goals, 10000);
    const ids = new Set();
    for (const food of value.foods) {
        object(food, ['id', 'name', 'unit', 'protein']);
        if (typeof food.id !== 'string' || !food.id.trim() || ids.has(food.id)) throw Error('Fehlende oder doppelte Produkt-ID.');
        ids.add(food.id);
        if (typeof food.name !== 'string' || !food.name.trim() || food.name.length > 149) throw Error('Bitte einen Produktnamen mit maximal 149 Zeichen angeben.');
        unit(food.unit); protein(food.protein);
    }
    const entries = new Set(data.entries.map(entry => entry.id)), annotated = new Set();
    for (const row of value.entryUnits) {
        object(row, ['entryId', 'unit']);
        if (!entries.has(row.entryId) || annotated.has(row.entryId)) throw Error('Fehlender oder doppelt zugeordneter Lebensmitteleintrag.');
        annotated.add(row.entryId); unit(row.unit);
    }
    let previous = '';
    for (const row of value.goals) {
        object(row, ['date', 'goal']);
        if (!isCalendarDate(row.date) || row.date <= previous) throw Error('Zielhistorie: Daten müssen eindeutig und aufsteigend sein.');
        if (typeof row.goal !== 'number' || !Number.isFinite(row.goal) || row.goal < 50 || row.goal > 250) throw Error('Ungültiges historisches Proteinziel.');
        previous = row.date;
    }
    return structuredClone({ foods: value.foods, entryUnits: value.entryUnits, goals: value.goals });
}

export function goalOn(nutrition, date) {
    return nutrition.goals.findLast(row => row.date <= date)?.goal ?? null;
}

// The first observation starts today. Earlier targets remain unknown.
export function recordGoal(nutrition, goal, date = today()) {
    const next = structuredClone(nutrition);
    if (goalOn(next, date) !== goal) {
        next.goals = next.goals.filter(row => row.date !== date);
        next.goals.push({ date, goal });
        next.goals.sort((a, b) => a.date.localeCompare(b.date));
    }
    return next;
}

export const entryUnit = (nutrition, id) => nutrition.entryUnits.find(row => row.entryId === id)?.unit ?? 'g/ml';

export function historicalFoods(data, nutrition) {
    const known = new Set(nutrition.foods.map(food => JSON.stringify([food.name, food.protein, food.unit])));
    const result = [];
    for (const entry of data.entries) {
        const unit = entryUnit(nutrition, entry.id), key = JSON.stringify([entry.name, entry.protein, unit]);
        if (!known.has(key)) {
            known.add(key);
            result.push({ name: entry.name, protein: entry.protein, unit });
        }
    }
    return result;
}
