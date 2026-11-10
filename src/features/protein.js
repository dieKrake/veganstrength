import { foods } from '../data/foods.js';
import { today, dayShift } from '../domain/dates.js';
import { dayTotal } from '../domain/protein.js';
import { isCalendarDate } from '../domain/validation.js';
import { entryUnit, goalOn, historicalFoods } from '../domain/nutrition.js';
import { escapeHtml, fmt } from '../ui/format.js';

export function createProtein({ $, getData, getNutrition, persist, persistNutrition, runAction, refresh, environment }) {
    let editing = null, suggestions = [];
    function editorReset() {
        editing = null;
        $('libraryEditorTitle').textContent = 'Eigenes Lebensmittel';
        $('saveCustomFood').textContent = 'In meiner Bibliothek speichern';
        $('cancelFoodEdit').classList.add('hidden');
    }
    function productFromFields() {
        const name = $('customName').value.trim(), protein = Number($('customP').value), unit = $('customUnit').value;
        if (!name || name.length > 149 || $('customP').value.trim() === '' || !Number.isFinite(protein) || protein < 0 || protein > 100 || !['g', 'ml'].includes(unit)) {
            throw Error('Bitte Namen, Einheit und Protein pro 100 g/ml (0–100 g) eingeben.');
        }
        return { name, protein, unit };
    }
    async function addEntry(name, protein, amount, date, unit = null) {
        if (!isCalendarDate(date) || !Number.isFinite(amount) || !(amount > 0 && amount <= 5000)
            || !Number.isFinite(protein) || !(protein >= 0 && protein <= 100)) {
            environment.alert('Bitte gültige Werte eingeben.');
            return false;
        }
        const entry = { id: environment.crypto.randomUUID(), date, name, protein, amount };
        const nutrition = structuredClone(getNutrition());
        if (unit) nutrition.entryUnits.push({ entryId: entry.id, unit });
        if (!await persist(data => ({ ...data, entries: [...data.entries, entry] }), { nutrition })) return false;
        refresh();
        return true;
    }
    function renderLibrary() {
        const nutrition = getNutrition(), previous = $('foodSelect').value;
        $('foodSelect').innerHTML = foods.map((food, i) => `<option value="${i}">${escapeHtml(food[0])} · ${fmt(food[1])} g / 100 ${i === 5 ? 'ml' : 'g'}</option>`).join('')
            + nutrition.foods.map(food => `<option value="own:${escapeHtml(food.id)}">★ ${escapeHtml(food.name)} · ${fmt(food.protein)} g / 100 ${food.unit}</option>`).join('');
        $('foodSelect').value = previous.startsWith('own:') ? (nutrition.foods.some(food => 'own:' + food.id === previous) ? previous : '0') : previous || '0';
        $('customFoodList').innerHTML = nutrition.foods.length ? nutrition.foods.map(food => `
            <div class="library-food"><strong>${escapeHtml(food.name)}</strong><span class="small">${fmt(food.protein)} g Protein / 100 ${food.unit}</span>
                <div class="row"><button class="btn ghost" data-use-food="${escapeHtml(food.id)}">Auswählen</button><button class="btn ghost" data-edit-food="${escapeHtml(food.id)}">Bearbeiten</button><button class="btn ghost" data-delete-food="${escapeHtml(food.id)}" aria-label="${escapeHtml(food.name)} aus Bibliothek entfernen">Entfernen</button></div></div>`).join('') : '<p class="small muted">Noch keine eigenen Produkte gespeichert.</p>';
        $('customFoodList').querySelectorAll('[data-use-food]').forEach(button => {
            button.onclick = () => { $('foodSelect').value = 'own:' + button.dataset.useFood; $('libraryStatus').textContent = 'Produkt ausgewählt. Oben Menge und Datum wählen und hinzufügen.'; };
        });
        $('customFoodList').querySelectorAll('[data-edit-food]').forEach(button => {
            button.onclick = () => {
                const food = getNutrition().foods.find(item => item.id === button.dataset.editFood);
                if (!food) return;
                editing = food.id;
                $('customName').value = food.name; $('customP').value = food.protein; $('customUnit').value = food.unit;
                $('libraryEditorTitle').textContent = 'Produkt bearbeiten';
                $('saveCustomFood').textContent = 'Änderungen speichern'; $('cancelFoodEdit').classList.remove('hidden');
                $('libraryStatus').textContent = 'Produktwerte zum Bearbeiten geladen. Frühere Portionen behalten ihre Werte.';
            };
        });
        $('customFoodList').querySelectorAll('[data-delete-food]').forEach(button => {
            button.onclick = () => runAction(async () => {
                if (await persistNutrition(nutrition => ({ ...nutrition, foods: nutrition.foods.filter(food => food.id !== button.dataset.deleteFood) }))) {
                    if (editing === button.dataset.deleteFood) editorReset();
                    refresh(); $('libraryStatus').textContent = 'Produkt entfernt. Bereits erfasste Portionen bleiben erhalten.';
                }
            });
        });
        suggestions = historicalFoods(getData(), nutrition).filter(food => !foods.some(standard => standard[0] === food.name && standard[1] === food.protein));
        $('historicalFoodSelect').innerHTML = suggestions.slice(0, 100).map((food, i) => `<option value="${i}">${escapeHtml(food.name)} · ${fmt(food.protein)} g / 100 ${food.unit}</option>`).join('');
        $('historicalFoodSelect').value = '0';
        $('loadHistoricalFood').disabled = !suggestions.length;
        $('historicalFoodNote').textContent = suggestions.length ? `${suggestions.length} unterschiedliche frühere Produkte; maximal 100 angezeigt. Bei g/ml bitte die Einheit prüfen. Gleiche Namen mit unterschiedlichen Proteinwerten bleiben getrennt.` : 'Keine weiteren früheren Produkte gefunden.';
    }
    function render() {
        renderLibrary();
        const data = getData(), nutrition = getNutrition(), date = $('foodDate').value;
        const list = data.entries.filter(entry => entry.date === date), total = dayTotal(data, date);
        const goal = date === today() ? data.goal : goalOn(nutrition, date);
        $('proteinDayLabel').textContent = date === today() ? 'Heute' : date;
        $('proteinTotal').textContent = fmt(total);
        $('proteinGoalLabel').textContent = goal ?? '?';
        $('proteinPercent').textContent = goal === null ? 'Ziel unbekannt' : `${Math.round(total / goal * 100)} %`;
        $('proteinProgress').style.width = goal === null ? '0%' : `${Math.min(100, total / goal * 100)}%`;
        $('proteinRemaining').textContent = goal === null ? 'Für diesen Tag ist kein damaliges Proteinziel bekannt.' : total >= goal ? 'Ziel erreicht!' : `${fmt(goal - total)} g fehlen noch`;
        $('foodCount').textContent = list.length;
        $('foodList').innerHTML = list.length ? list.map(entry => `
            <div class="foodrow"><div class="grow"><strong>${escapeHtml(entry.name)}</strong>
                <div class="small">${fmt(entry.amount)} ${entryUnit(nutrition, entry.id)} · ${fmt(entry.protein)} g / 100</div>
                <button class="btn ghost" data-repeat-food="${escapeHtml(entry.id)}">Für heute wiederholen</button></div>
                <strong>${fmt(entry.amount * entry.protein / 100)} g</strong>
                <button class="btn ghost" data-remove="${escapeHtml(entry.id)}" aria-label="Eintrag löschen">✕</button>
            </div>`).join('') : '<p class="muted small">Noch keine Einträge an diesem Tag.</p>';
        $('foodList').querySelectorAll('[data-remove]').forEach(button => {
            button.onclick = () => runAction(async () => {
                const nutrition = getNutrition();
                if (await persist(data => ({ ...data, entries: data.entries.filter(entry => entry.id !== button.dataset.remove) }), {
                    nutrition: { ...nutrition, entryUnits: nutrition.entryUnits.filter(row => row.entryId !== button.dataset.remove) }
                })) refresh();
            });
        });
        $('foodList').querySelectorAll('[data-repeat-food]').forEach(button => {
            button.onclick = () => runAction(async () => {
                const entry = getData().entries.find(item => item.id === button.dataset.repeatFood);
                if (!entry) return;
                const unit = entryUnit(getNutrition(), entry.id);
                if (await addEntry(entry.name, entry.protein, entry.amount, today(), unit === 'g/ml' ? null : unit)) {
                    $('foodDate').value = today(); render();
                }
            });
        });
    }
    $('foodSelect').value = '0'; $('customUnit').value = 'g'; $('foodDate').value = today();
    $('addFood').onclick = () => {
        const selection = $('foodSelect').value, amount = Number($('foodAmount').value), date = $('foodDate').value;
        return runAction(() => {
            const food = selection.startsWith('own:') ? getNutrition().foods.find(item => 'own:' + item.id === selection) : null;
            if (selection.startsWith('own:') && !food) return environment.alert('Das Produkt ist nicht mehr vorhanden. Bitte erneut auswählen.');
            const standard = foods[+selection];
            if (!food && !standard) return environment.alert('Bitte ein Lebensmittel auswählen.');
            return addEntry(food?.name ?? standard[0], food?.protein ?? standard[1], amount, date, food?.unit ?? (+selection === 5 ? 'ml' : 'g'));
        });
    };
    $('addCustom').onclick = () => {
        let product;
        try { product = productFromFields(); } catch (error) { environment.alert(error.message); return Promise.resolve(false); }
        const amount = Number($('customAmount').value), date = $('foodDate').value;
        return runAction(async () => {
            if (await addEntry(product.name, product.protein, amount, date, product.unit) && $('customName').value.trim() === product.name
                && Number($('customP').value) === product.protein && Number($('customAmount').value) === amount && !editing) $('customName').value = '';
        });
    };
    $('saveCustomFood').onclick = () => {
        let product;
        try { product = productFromFields(); } catch (error) { environment.alert(error.message); return Promise.resolve(false); }
        const id = editing ?? environment.crypto.randomUUID(), wasEditing = editing !== null;
        return runAction(async () => {
            if (wasEditing && !getNutrition().foods.some(food => food.id === id)) return environment.alert('Dieses Produkt wurde inzwischen entfernt.');
            if (await persistNutrition(nutrition => ({ ...nutrition, foods: wasEditing ? nutrition.foods.map(food => food.id === id ? { id, ...product } : food) : [...nutrition.foods, { id, ...product }] }))) {
                editorReset(); refresh(); $('foodSelect').value = 'own:' + id;
                $('libraryStatus').textContent = 'Produkt gespeichert und ausgewählt. Bisherige Portionen behalten ihre Werte.';
            }
        });
    };
    $('cancelFoodEdit').onclick = () => { editorReset(); $('customName').value = ''; $('customP').value = ''; };
    $('loadHistoricalFood').onclick = () => {
        const food = suggestions[+$('historicalFoodSelect').value]; if (!food) return;
        editorReset(); $('customName').value = food.name; $('customP').value = food.protein; $('customUnit').value = food.unit === 'ml' ? 'ml' : 'g';
        $('libraryStatus').textContent = 'Vorschlag geladen. Einheit prüfen und ausdrücklich in der Bibliothek speichern.';
    };
    const changeDay = offset => {
        if (!isCalendarDate($('foodDate').value)) return environment.alert('Bitte ein gültiges Datum wählen.');
        const next = dayShift(offset, new Date($('foodDate').value + 'T12:00:00'));
        if (!isCalendarDate(next)) return;
        $('foodDate').value = next; render();
    };
    $('previousFoodDay').onclick = () => changeDay(-1);
    $('nextFoodDay').onclick = () => changeDay(1);
    $('todayFoodDay').onclick = () => { $('foodDate').value = today(); render(); };
    $('foodDate').onchange = render;
    return { render };
}
