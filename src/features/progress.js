import { completedSets, proteinSeries } from '../domain/statistics.js';
import { escapeHtml, fmt } from '../ui/format.js';

export function createProgress({ $, getData, environment }) {
    return {
        render() {
            const data = getData(), { dates, values, max, average } = proteinSeries(data);
            $('proteinChart').innerHTML = dates.map((date, i) => `
                <div style="flex:1;min-width:0;text-align:center;align-self:stretch;display:flex;flex-direction:column;justify-content:end">
                    <div class="small" style="font-size:10px">${Math.round(values[i])}</div>
                    <div class="bar" title="${date}: ${fmt(values[i])} g" style="height:${Math.max(2, values[i] / max * 80)}px"></div>
                    <div class="small" style="font-size:10px">${date.slice(8)}</div>
                </div>`).join('');
            $('avgProtein').textContent = `${fmt(average)} g`;
            $('allSessions').textContent = data.sessions.length;
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
    };
}
