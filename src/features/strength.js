import { strengthGroups, strengthSeries, loadUnit, valueUnit } from '../domain/strength.js';
import { strengthChart } from '../ui/strength-chart.js';
import { escapeHtml, fmt } from '../ui/format.js';

export function createStrength({ $, getData, getProgram }, showSession) {
    let source = null, program = null, groups = [], selectedLoad = null, page = 0;
    $('strengthRange').value = '56'; $('strengthMetric').value = 'reps';
    const reset = resetLoad => { page = 0; if (resetLoad) selectedLoad = null; render(); };
    $('strengthExercise').onchange = () => reset(true);
    $('strengthRange').onchange = () => reset(false);
    $('strengthMetric').onchange = () => reset(false);
    $('strengthLoad').onchange = () => { selectedLoad = Number($('strengthLoad').value); reset(false); };
    $('strengthTablePrevious').onclick = () => { page = Math.max(0, page - 1); render(); };
    $('strengthTableNext').onclick = () => { page++; render(); };
    function render() {
        if (source !== getData() || program !== getProgram()) {
            source = getData(); program = getProgram(); groups = strengthGroups(source.sessions, program);
        }
        const previous = $('strengthExercise').value;
        $('strengthExercise').innerHTML = groups.map(group => `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)}</option>`).join('');
        const group = groups.find(group => group.key === previous) ?? groups[0];
        $('strengthExercise').value = group?.key ?? '';
        $('strengthEmpty').classList.toggle('hidden', !!group);
        $('strengthContent').classList.toggle('hidden', !group);
        if (!group) return;
        if (group.basis === 'unknown') $('strengthMetric').value = 'reps';
        $('strengthMetric').disabled = group.basis === 'unknown';
        const range = $('strengthRange').value, metric = $('strengthMetric').value;
        const loads = strengthSeries(group, { range }).loads;
        if (!loads.includes(selectedLoad)) selectedLoad = strengthSeries(group, { range, metric: 'load' }).points.at(-1)?.kg ?? loads[0] ?? 0;
        $('strengthLoad').innerHTML = loads.map(kg => `<option value="${kg}">${fmt(kg)} ${escapeHtml(loadUnit(group.basis))}</option>`).join('');
        $('strengthLoad').value = String(selectedLoad);
        $('strengthLoad').disabled = metric === 'load' || !loads.length;
        const series = strengthSeries(group, { metric, kg: selectedLoad, range });
        $('strengthNote').textContent = group.note;
        $('strengthMethod').textContent = metric === 'load'
            ? 'Je Training die höchste Last aus abgehakten Sätzen und die Wiederholungen dieses Satzes. Eine höhere Last allein bedeutet keinen gesicherten Kraftzuwachs.'
            : `Je Training der beste abgehakte Satz bei ${fmt(selectedLoad)} ${loadUnit(group.basis)}. Angezeigt werden ${valueUnit(group.unit)}; nicht abgehakte Sätze zählen nicht. Unterschiedliche Lasten werden nicht vermischt.`;
        const plotted = series.points.slice(-120);
        $('strengthChart').innerHTML = series.canPlot ? strengthChart(plotted, series.unit, group.comparable) : '<p class="small notice">Einheit oder Gewichtsbedeutung unbekannt. Die Originalwerte stehen in der Tabelle und den Trainingsdetails.</p>';
        $('strengthSummary').textContent = series.points.length
            ? `${series.points.length} Trainingswerte · letzter Wert: ${fmt(series.points.at(-1).reps)} ${valueUnit(group.unit)} bei ${fmt(series.points.at(-1).kg)} ${loadUnit(group.basis)}.${series.points.length > 120 ? ' Diagramm: die letzten 120 Werte. Die Tabelle enthält alle Werte der Auswahl.' : ''}`
            : 'Keine abgehakten Sätze für diesen Zeitraum und diese Last. Wähle einen anderen Zeitraum oder eine andere Last.';
        page = Math.min(page, Math.max(0, Math.ceil(series.points.length / 20) - 1));
        const rows = [...series.points].reverse().slice(page * 20, page * 20 + 20);
        $('strengthTable').innerHTML = `<table><caption>Werte je Training, neueste zuerst</caption><thead><tr><th scope="col">Datum</th><th scope="col">${escapeHtml(valueUnit(group.unit))}</th><th scope="col">${escapeHtml(loadUnit(group.basis))}</th><th scope="col">Sätze bei Last</th><th scope="col">Training</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${row.date}</th><td>${fmt(row.reps)}</td><td>${fmt(row.kg)}</td><td>${row.sets}</td><td><button class="btn ghost" data-strength-session="${escapeHtml(row.sessionId)}">${escapeHtml(row.workout || 'Details')}</button></td></tr>`).join('')}</tbody></table>`;
        $('strengthTable').querySelectorAll('[data-strength-session]').forEach(button => { button.onclick = () => showSession(button.dataset.strengthSession); });
        $('strengthTableStatus').textContent = rows.length ? `${page * 20 + 1}–${page * 20 + rows.length} von ${series.points.length} Werten` : 'Keine Werte';
        $('strengthTablePrevious').disabled = page === 0;
        $('strengthTableNext').disabled = (page + 1) * 20 >= series.points.length;
    }
    return { render };
}
