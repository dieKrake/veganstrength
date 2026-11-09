import { foods } from '../data/foods.js';
import { today } from '../domain/dates.js';
import { dayTotal } from '../domain/protein.js';
import { isCalendarDate } from '../domain/validation.js';
import { escapeHtml, fmt } from '../ui/format.js';

export function createProtein({ $, getData, persist, runAction, refresh, environment }) {
    async function addEntry(name, protein, amount, date) {
        if (!isCalendarDate(date) || !Number.isFinite(amount) || !(amount > 0 && amount <= 5000)
            || !Number.isFinite(protein) || !(protein >= 0 && protein <= 100)) {
            environment.alert('Bitte gültige Werte eingeben.');
            return false;
        }
        const entry = { id: environment.crypto.randomUUID(), date, name, protein, amount };
        if (!await persist(data => ({ ...data, entries: [...data.entries, entry] }))) return false;
        refresh();
        return true;
    }
    function render() {
        const data = getData(), date = $('foodDate').value;
        const list = data.entries.filter(entry => entry.date === date);
        const total = dayTotal(data, date);
        $('proteinTotal').textContent = fmt(total);
        $('proteinGoalLabel').textContent = data.goal;
        $('proteinPercent').textContent = `${Math.round(total / data.goal * 100)} %`;
        $('proteinProgress').style.width = `${Math.min(100, total / data.goal * 100)}%`;
        $('proteinRemaining').textContent = total >= data.goal ? 'Ziel erreicht!' : `${fmt(data.goal - total)} g fehlen noch`;
        $('foodCount').textContent = list.length;
        $('foodList').innerHTML = list.length ? list.map(entry => `
            <div class="foodrow"><div class="grow"><strong>${escapeHtml(entry.name)}</strong>
                <div class="small">${fmt(entry.amount)} g/ml · ${fmt(entry.protein)} g / 100</div></div>
                <strong>${fmt(entry.amount * entry.protein / 100)} g</strong>
                <button class="btn ghost" data-remove="${escapeHtml(entry.id)}" aria-label="Eintrag löschen">✕</button>
            </div>`).join('') : '<p class="muted small">Noch keine Einträge an diesem Tag.</p>';
        $('foodList').querySelectorAll('[data-remove]').forEach(button => {
            button.onclick = () => runAction(async () => {
                if (await persist(data => ({ ...data, entries: data.entries.filter(entry => entry.id !== button.dataset.remove) }))) refresh();
            });
        });
    }
    $('foodSelect').innerHTML = foods.map((food, i) => `<option value="${i}">${food[0]} · ${fmt(food[1])} g / 100 g</option>`).join('');
    $('foodSelect').value = '0';
    $('foodDate').value = today();
    $('addFood').onclick = () => {
        const food = foods[+$('foodSelect').value];
        const amount = Number($('foodAmount').value);
        const date = $('foodDate').value;
        return runAction(() => addEntry(food[0], food[1], amount, date));
    };
    $('addCustom').onclick = () => {
        const name = $('customName').value.trim(), protein = Number($('customP').value);
        const amount = Number($('customAmount').value);
        const date = $('foodDate').value;
        if (!name || name.length > 149 || $('customP').value === '' || !Number.isFinite(protein)) {
            environment.alert('Bitte Namen und Proteingehalt eingeben.');
            return Promise.resolve(false);
        }
        return runAction(async () => {
            if (await addEntry(name, protein, amount, date) && $('customName').value.trim() === name
                && Number($('customP').value) === protein && Number($('customAmount').value) === amount) $('customName').value = '';
        });
    };
    $('foodDate').onchange = render;
    return { render };
}
