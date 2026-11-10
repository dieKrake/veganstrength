import { completedSets } from '../domain/statistics.js';
import { exerciseInfo, loadUnit, valueUnit } from '../domain/strength.js';
import { escapeHtml, fmt } from '../ui/format.js';

export function createHistory({ $, getData, getProgram, querySessions }) {
    let offset = 0, ticket = 0, pending = Promise.resolve(), selected = null;
    $('historyWorkout').value = 'all';
    function closeDetail() { selected = null; $('sessionDetail').classList.add('hidden'); }
    $('closeSessionDetail').onclick = closeDetail;
    function showSession(id, focus = true) {
        const session = getData().sessions.find(session => session.id === id);
        if (!session) { closeDetail(); return; }
        selected = id;
        const link = getProgram().links.find(link => link.sessionId === id);
        $('sessionDetailTitle').textContent = `${session.workout || 'Training ohne Namen'} · ${session.date}`;
        $('sessionDetailBody').innerHTML = `<p class="small">${link ? link.completed ? 'Planeinheit vollständig abgeschlossen' : 'Teiltraining einer Planeinheit' : 'Freies / älteres Training ohne Plan-Zuordnung'}. ${completedSets(session)} abgehakte Sätze. Nicht abgehakte Werte bleiben sichtbar.</p>`
            + session.exercises.map((exercise, i) => {
                const target = link?.exercises[i], info = exerciseInfo(exercise, target);
                return `<div class="session-exercise"><h4>${escapeHtml(exercise.name || 'Übung ohne Namen')}</h4><p class="small">${escapeHtml(info.note)}</p>
                    ${target ? `<p class="small">Reserve: ${target.rir === null ? 'nicht erfasst' : target.rir + ' Wdh.'} · Saubere Ausführung: ${target.clean ? 'bestätigt' : 'nicht bestätigt'}</p>` : ''}
                    <div class="data-table"><table><thead><tr><th scope="col">Satz</th><th scope="col">${escapeHtml(valueUnit(info.unit))}</th><th scope="col">${escapeHtml(loadUnit(info.basis))}</th><th scope="col">Status</th></tr></thead><tbody>${exercise.sets.map((set, j) => `<tr><th scope="row">${j + 1}</th><td>${fmt(set.reps)}</td><td>${fmt(set.kg)}</td><td>${set.done ? 'Abgehakt' : 'Nicht abgehakt'}</td></tr>`).join('')}</tbody></table></div></div>`;
            }).join('');
        $('sessionDetail').classList.remove('hidden');
        if (focus) $('sessionDetail').focus?.();
    }
    function load() {
        const request = ++ticket;
        $('historyStatus').textContent = 'Trainingshistorie wird geladen …';
        $('historyPrevious').disabled = true; $('historyNext').disabled = true;
        const source = getData();
        pending = (async () => {
            try {
                const result = await querySessions({ from: $('historyFrom').value, to: $('historyTo').value,
                    workout: $('historyWorkout').value === 'all' ? null : $('historyWorkout').value.slice(8), offset, limit: 20 });
                if (request !== ticket) return;
                if (source !== getData()) { $('historyStatus').textContent = 'Datenstand inzwischen geändert. Bitte den Filter erneut anwenden.'; return; }
                if (offset >= result.total && result.total > 0) { offset = Math.floor((result.total - 1) / 20) * 20; return load(); }
                $('historyStatus').textContent = result.total ? `${offset + 1}–${Math.min(offset + 20, result.total)} von ${result.total} Trainings · Datum absteigend` : 'Keine Trainings für diesen Filter.';
                $('history').innerHTML = result.sessions.map(session => `<div class="foodrow"><div class="grow"><strong>${escapeHtml(session.workout || 'Training ohne Namen')}</strong><div class="small">${session.date} · ${completedSets(session)} Sätze</div></div><button class="btn ghost" data-detail="${escapeHtml(session.id)}">Details</button></div>`).join('');
                $('history').querySelectorAll('[data-detail]').forEach(button => { button.onclick = () => showSession(button.dataset.detail); });
                $('historyPrevious').disabled = offset === 0;
                $('historyNext').disabled = offset + 20 >= result.total;
            } catch (error) {
                if (request === ticket) $('historyStatus').textContent = 'Historie nicht aktualisiert: ' + error.message + ' Bereits angezeigte Einträge stammen aus dem vorherigen Stand.';
            }
        })();
        return pending;
    }
    $('applyHistoryFilter').onclick = () => { offset = 0; closeDetail(); return load(); };
    $('resetHistoryFilter').onclick = () => {
        $('historyFrom').value = ''; $('historyTo').value = ''; $('historyWorkout').value = 'all';
        offset = 0; closeDetail(); return load();
    };
    $('historyPrevious').onclick = () => { offset = Math.max(0, offset - 20); return load(); };
    $('historyNext').onclick = () => { offset += 20; return load(); };
    return {
        showSession,
        render() {
            const previous = $('historyWorkout').value, names = [...new Set(getData().sessions.map(session => session.workout))].sort();
            $('historyWorkout').innerHTML = '<option value="all">Alle Workouts</option>' + names.map(name => `<option value="workout:${escapeHtml(name)}">${escapeHtml(name || 'Ohne Namen')}</option>`).join('');
            $('historyWorkout').value = names.some(name => 'workout:' + name === previous) ? previous : 'all';
            if (selected) showSession(selected, false);
            return load();
        },
        whenIdle: () => pending
    };
}
