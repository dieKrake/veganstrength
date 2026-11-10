import { escapeHtml, fmt } from './format.js';

export function strengthChart(points, unit, connect = true) {
    if (!points.length) return '<p class="small muted">Noch keine abgehakten Sätze für diese Auswahl.</p>';
    const width = 420, height = 240, left = 54, right = 20, top = 22, bottom = 48;
    const dates = points.map(point => Date.parse(point.date + 'T00:00:00Z'));
    const start = Math.min(...dates), end = Math.max(...dates), max = Math.max(1, ...points.map(point => point.value));
    const x = date => start === end ? (left + width - right) / 2 : left + (date - start) / (end - start) * (width - left - right);
    const y = value => height - bottom - value / max * (height - top - bottom);
    const coords = points.map((point, i) => `${x(dates[i]).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    const ticks = [0, max / 2, max].map(value => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="chart-grid"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${escapeHtml(fmt(value))}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" class="strength-svg" role="img" aria-labelledby="strengthPlotTitle strengthPlotDesc">
        <title id="strengthPlotTitle">Trainingsverlauf in ${escapeHtml(unit)}</title>
        <desc id="strengthPlotDesc">${points.length} Trainingswerte von ${points[0].date} bis ${points.at(-1).date}. Die genauen Werte stehen in der Tabelle unter dem Diagramm. ${connect ? 'Linien verbinden Trainingswerte und sagen nichts über die Tage dazwischen aus.' : 'Unbestätigte Vergleichbarkeit: einzelne Punkte ohne Verbindungslinien.'}</desc>
        ${ticks}${connect && points.length > 1 ? `<polyline points="${coords}" class="strength-line"/>` : ''}
        ${points.map((point, i) => `<circle cx="${x(dates[i])}" cy="${y(point.value)}" r="4" class="strength-dot"><title>${point.date}: ${escapeHtml(fmt(point.value))} ${escapeHtml(unit)} · ${escapeHtml(fmt(point.reps))} Wdh./s bei ${escapeHtml(fmt(point.kg))} kg</title></circle>`).join('')}
        <text x="${left}" y="${height - 18}" text-anchor="start">${points[0].date}</text><text x="${width - right}" y="${height - 18}" text-anchor="end">${points.at(-1).date}</text>
    </svg>`;
}
