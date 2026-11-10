import { completedSets, proteinSeries, nutritionSeries } from '../domain/statistics.js';
import { escapeHtml, fmt } from '../ui/format.js';
import { activePlan } from '../domain/program.js';

export function createProgress({ $, getData, getProgram, getNutrition, environment }) {
    $('nutritionRange').value = '7';
    $('nutritionRange').onchange = render;
    function render() {
        const data = getData(), { average } = proteinSeries(data);
        const days = Number($('nutritionRange').value), series = nutritionSeries(data, getNutrition(), days);
        $('nutritionChartTitle').textContent = `Protein – letzte ${days} Tage`;
        $('nutritionSummary').textContent = `Ø ${fmt(series.average)} g über alle ${days} Kalendertage (Tage ohne Eintrag zählen als 0). ${series.recordedDays} Tage mit Einträgen${series.recordedAverage === null ? '.' : `: Ø ${fmt(series.recordedAverage)} g.`}`;
        $('nutritionGoalSummary').textContent = `${series.reachedGoals} von ${series.knownGoals} Tagen mit bekanntem Ziel erreicht. Für ${days - series.knownGoals} Tage ist das damalige Ziel unbekannt. Zieländerungen gelten ab dem Änderungstag; frühere Ziele werden nicht rückwirkend erfunden.`;
        $('proteinChart').innerHTML = series.dates.map((date, i) => `
            <div class="nutrition-bar-column">
                <div class="small">${Math.round(series.values[i])}</div>
                <div class="nutrition-bar-area"><div class="bar" title="${date}: ${fmt(series.values[i])} g" style="height:${series.values[i] / series.max * 100}%"></div>
                ${series.goals[i] === null ? '' : `<span class="nutrition-goal-mark" title="Ziel: ${fmt(series.goals[i])} g" style="bottom:${series.goals[i] / series.max * 100}%"></span>`}</div>
                <div class="small">${date.slice(8)}.${date.slice(5, 7)}</div>
            </div>`).join('');
        const viewport = $('nutritionChartViewport');
        viewport.scrollLeft = viewport.scrollWidth;
        $('nutritionTable').innerHTML = `<table><caption>Proteinwerte der letzten ${days} Kalendertage</caption><thead><tr><th scope="col">Datum</th><th scope="col">Protein</th><th scope="col">Damals gültiges Ziel</th></tr></thead><tbody>${series.dates.map((date, i) => `<tr><th scope="row">${date}</th><td>${fmt(series.values[i])} g</td><td>${series.goals[i] === null ? 'Unbekannt' : fmt(series.goals[i]) + ' g'}</td></tr>`).join('')}</tbody></table>`;
        $('avgProtein').textContent = `${fmt(average)} g`;
        $('allSessions').textContent = data.sessions.length;
        const plan = activePlan(getProgram());
        $('planProgress').textContent = plan ? Array.from({ length: 8 }, (_, i) => {
            const slots = plan.slots.slice(i * 4, i * 4 + 4);
            return `Woche ${i + 1}: ${slots.filter(slot => slot.status === 'done').length}/4 abgeschlossen, ${slots.filter(slot => slot.status === 'skipped').length} übersprungen`;
        }).join(' · ') : 'Noch kein aktiver Plan. Du kannst unter Training einen 8-Wochen-Plan starten.';
        $('history').innerHTML = data.sessions.length ? data.sessions.slice(0, 20).map(session => `
            <div class="foodrow"><div class="grow"><strong>${escapeHtml(session.workout)}</strong>
                <div class="small">${escapeHtml(session.date)} · ${completedSets(session)} Sätze</div></div>
                <button class="btn ghost" data-detail="${escapeHtml(session.id)}">Details</button>
            </div>`).join('') : '<p class="small muted">Noch kein Workout gespeichert.</p>';
        $('history').querySelectorAll('[data-detail]').forEach(button => {
            button.onclick = () => {
                const session = getData().sessions.find(item => item.id === button.dataset.detail);
                if (session) environment.alert(`${session.workout} · ${session.date}\n\n` + session.exercises.map(exercise =>
                    exercise.name + ': ' + exercise.sets.filter(set => set.done).map(set => set.reps + ' Wdh., ' + set.kg + ' kg').join(' / ')).join('\n'));
            };
        });
    }
    return { render };
}
