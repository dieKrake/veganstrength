import { workouts } from '../data/workouts.js';
import { today } from '../domain/dates.js';
import { escapeHtml } from '../ui/format.js';

export function createTraining({ $, getData, persist, runAction, go, environment }, timer) {
    let current = 0, drafts = {}, renderedWorkout = null, saving = false;

    function initDraft() {
        if (drafts[current]) return;
        const last = getData().sessions.find(session => session.workout === workouts[current].name);
        drafts[current] = workouts[current].ex.map((exercise, i) => Array.from({ length: exercise[1] }, (_, j) => ({
            reps: last?.exercises?.[i]?.sets?.[j]?.reps ?? '',
            kg: last?.exercises?.[i]?.sets?.[j]?.kg ?? '',
            done: false
        })));
    }
    function setSaving(value) {
        saving = value;
        for (const id of ['saveWorkout', 'workoutSelect', 'resetWorkout']) $(id).disabled = value;
        for (const selector of ['input', '[data-done]']) {
            $('exerciseList').querySelectorAll(selector).forEach(element => { element.disabled = value; });
        }
    }
    function render(force = false) {
        initDraft();
        const workout = workouts[current];
        $('workoutSelect').value = String(current);
        $('workoutInfo').textContent = `${workout.day} · ${workout.focus} · 40–45 Minuten`;
        $('sessionStatus').textContent = `${drafts[current].flat().filter(set => set.done).length} Sätze abgehakt`;
        if (!force && renderedWorkout === current) return;
        renderedWorkout = current;
        $('exerciseList').innerHTML = workout.ex.map((exercise, i) => `
            <div class="exercise">
                <div class="row"><div><strong>${escapeHtml(exercise[0])}</strong>
                    <div class="small">${exercise[1]} × ${exercise[2]} · ${exercise[3]} s Pause</div>
                </div></div>
                <div class="sets">${drafts[current][i].map((set, j) => `
                    <div class="setrow ${set.done ? 'done' : ''}">
                        <span class="small">S${j + 1}</span>
                        <div><label>Wdh. / Sek.</label><input class="input" inputmode="numeric" type="number" min="0" max="999"
                            data-e="${i}" data-s="${j}" data-field="reps" value="${set.reps}"></div>
                        <div><label>kg</label><input class="input" inputmode="decimal" type="number" min="0" max="999" step="0.5"
                            data-e="${i}" data-s="${j}" data-field="kg" value="${set.kg}"></div>
                        <button class="btn ${set.done ? 'primary' : 'ghost'}" data-done="${i}:${j}" aria-label="Satz ${j + 1} abhaken">${set.done ? '✓' : '○'}</button>
                    </div>`).join('')}
                </div>
            </div>`).join('');
        $('exerciseList').querySelectorAll('input').forEach(input => {
            input.oninput = () => { drafts[current][+input.dataset.e][+input.dataset.s][input.dataset.field] = input.value; };
        });
        $('exerciseList').querySelectorAll('[data-done]').forEach(button => {
            button.onclick = () => {
                if (saving) return;
                const [i, j] = button.dataset.done.split(':').map(Number);
                const set = drafts[current][i][j];
                set.done = !set.done;
                if (set.done) timer.start(workout.ex[i][3]);
                render(true);
            };
        });
        setSaving(saving);
    }
    function select(index) { if (!saving) current = index; }

    $('workoutSelect').innerHTML = workouts.map((workout, i) => `<option value="${i}">${workout.day} – ${workout.name}</option>`).join('');
    $('workoutSelect').onchange = event => { select(+event.target.value); render(); };
    $('resetWorkout').onclick = () => {
        if (saving) return;
        if (environment.confirm('Aktuelle, noch nicht gespeicherte Eingaben leeren?')) {
            delete drafts[current];
            render(true);
        }
    };
    $('saveWorkout').onclick = () => {
        if (saving) return Promise.resolve(false);
        setSaving(true);
        return runAction(async () => {
            initDraft();
            const value = input => input === '' ? 0 : Number(input);
            const exercises = workouts[current].ex.map((exercise, i) => ({
                name: exercise[0],
                sets: drafts[current][i].map(set => ({ reps: value(set.reps), kg: value(set.kg), done: set.done }))
            }));
            if (!exercises.some(exercise => exercise.sets.some(set => set.done))) {
                environment.alert('Bitte hake mindestens einen abgeschlossenen Satz ab.');
                return;
            }
            const session = { id: environment.crypto.randomUUID(), date: today(), workout: workouts[current].name, exercises };
            if (!await persist(data => ({ ...data, sessions: [session, ...data.sessions] }))) return;
            delete drafts[current];
            renderedWorkout = null;
            timer.stop();
            environment.alert('Training gespeichert!');
            go('progress');
        }).finally(() => setSaving(false));
    };
    return {
        render, select,
        reset() { drafts = {}; renderedWorkout = null; }
    };
}
