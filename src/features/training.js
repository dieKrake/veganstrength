import { workouts } from '../data/workouts.js';
import { availableVariants, basisLabel, initialRange } from '../data/exercises.js';
import { today } from '../domain/dates.js';
import { completeSlot, targetsFor, timeBudget, weekPhase } from '../domain/program.js';
import { progression } from '../domain/progression.js';
import { escapeHtml, fmt } from '../ui/format.js';
import { emptyTraining, validateTraining } from '../domain/training-state.js';

export function createTraining({ $, getData, getProgram, persist, persistProgram, runAction, go, environment, repository, storageStatus }, timer) {
    let current = 0, drafts = {}, contexts = {}, activeDraft = null, renderedWorkout = null, saving = false;
    let renderedPlanAvailable = false;
    let generation = 0, changes = 0, timeout = null, dirty = false;
    const key = () => activeDraft ?? String(current);
    const context = () => contexts[key()] ?? null;
    function snapshot(finished = null) {
        const result = { current, drafts: {}, timer: finished === null ? timer.snapshot() : emptyTraining().timer };
        for (const [id, sets] of Object.entries(drafts)) {
            if (id === finished) continue;
            const savedContext = contexts[id];
            const index = savedContext?.workoutIndex ?? +id;
            const names = savedContext ? savedContext.targets.map(target => target.name) : workouts[index].ex.map(exercise => exercise[0]);
            result.drafts[id] = { workout: workouts[index].name, exercises: names.map((name, i) => ({ name, sets: structuredClone(sets[i]) })) };
            if (savedContext) result.drafts[id].context = structuredClone(savedContext);
        }
        if (activeDraft !== null && activeDraft !== finished) result.activeDraft = activeDraft;
        return result;
    }
    function cancelPending() {
        if (timeout !== null) environment.clearTimeout(timeout);
        timeout = null;
    }
    function flush() {
        cancelPending();
        if (!dirty) return Promise.resolve();
        const expectedGeneration = generation;
        return runAction(async () => {
            if (expectedGeneration !== generation || !dirty) return;
            const expectedChanges = changes;
            try {
                const stored = await repository.saveTraining(snapshot());
                if (!stored) return;
                if (generation === expectedGeneration && changes === expectedChanges) {
                    dirty = false;
                    $('draftStatus').textContent = 'Trainingsentwurf auf diesem Gerät gespeichert';
                    $('retryDraft').classList.add('hidden');
                }
            } catch {
                $('draftStatus').textContent = 'Entwurf nicht gespeichert. Deine Eingaben bleiben geöffnet.';
                $('retryDraft').classList.remove('hidden');
            }
            await storageStatus();
        });
    }
    function changed() {
        dirty = true; changes++;
        $('draftStatus').textContent = 'Trainingsentwurf wird gespeichert …';
        cancelPending();
        timeout = environment.setTimeout(flush, 250);
    }
    function restore(value) {
        const saved = validateTraining(value);
        cancelPending(); generation++; dirty = false;
        current = saved.current; activeDraft = saved.activeDraft ?? null;
        drafts = Object.fromEntries(Object.entries(saved.drafts).map(([id, draft]) => [id, draft.exercises.map(exercise => exercise.sets)]));
        contexts = Object.fromEntries(Object.entries(saved.drafts).filter(([, draft]) => draft.context).map(([id, draft]) => [id, draft.context]));
        renderedWorkout = null;
        timer.restore(saved.timer);
        $('draftStatus').textContent = Object.keys(drafts).length ? 'Gespeicherter Trainingsentwurf wiederhergestellt' : 'Deine Eingaben werden automatisch auf diesem Gerät gespeichert.';
        $('retryDraft').classList.add('hidden');
    }
    timer.onChange(changed);
    $('retryDraft').onclick = flush;

    function initDraft() {
        if (drafts[key()]) return;
        const linked = new Set(getProgram().links.map(link => link.sessionId));
        const history = getData().sessions.filter(session => session.workout === workouts[current].name && !linked.has(session.id));
        drafts[key()] = workouts[current].ex.map(exercise => {
            const last = history.flatMap(session => session.exercises).find(item => item.name === exercise[0]);
            return Array.from({ length: exercise[1] }, (_, j) => ({ reps: last?.sets[j]?.reps ?? '', kg: last?.sets[j]?.kg ?? '', done: false }));
        });
    }
    function openSlot(planId, slotId) {
        if (saving) return;
        const plan = getProgram().plans.find(item => item.id === planId), slot = plan?.slots.find(item => item.id === slotId);
        if (!slot) return environment.alert('Diese Planeinheit ist nicht verfügbar.');
        current = slot.workoutIndex; activeDraft = 'plan:' + slot.id;
        $('planCard').open = false;
        if (!drafts[key()]) {
            const targets = targetsFor(plan, slot);
            contexts[key()] = { planId, slotId, week: slot.week, workoutIndex: current, targets, assessments: targets.map(() => ({ rir: null, clean: false })) };
            drafts[key()] = targets.map(target => {
                const last = progression(getProgram(), getData(), plan, target, slot.week).last;
                return Array.from({ length: target.sets }, (_, i) => {
                    const previous = last?.exercise.sets[i];
                    const raised = target.kg !== null && previous && target.kg > previous.kg;
                    return { reps: raised ? target.min : previous?.reps ?? '', kg: target.kg ?? previous?.kg ?? '', done: false };
                });
            });
        }
        renderedWorkout = null;
        changed();
    }
    function setSaving(value) {
        saving = value;
        for (const id of ['saveWorkout', 'workoutSelect', 'resetWorkout', 'useFreeTraining']) $(id).disabled = value;
        for (const selector of ['input', 'select', '[data-done]', '[data-accept]', '[data-apply-variant]']) {
            $('exerciseList').querySelectorAll(selector).forEach(element => { element.disabled = value; });
        }
    }
    function updateCount() { $('sessionStatus').textContent = `${drafts[key()].flat().filter(set => set.done).length} Sätze abgehakt`; }
    function adviceMarkup(target, index, planned) {
        const plan = getProgram().plans.find(item => item.id === planned.planId);
        if (!plan) return '<p class="notice small">Der frühere Plan ist nicht mehr geladen. Deine Eingaben bleiben erhalten und können als freies Training gespeichert werden.</p>';
        const advice = progression(getProgram(), getData(), plan, target, planned.week);
        const last = advice.last;
        const previous = last ? `${last.session.date}: ${last.exercise.sets.filter(set => set.done).map(set => `${set.reps} ${target.unit === 'seconds' ? 's' : 'Wdh.'} / ${fmt(set.kg)} kg`).join(' · ')}` : 'Noch keine vergleichbare Planeinheit. Ältere Trainings werden nicht automatisch einer Variante zugeordnet.';
        const variants = availableVariants(target.id, plan.profile);
        return `<details class="advice"><summary>Letzte Werte & nächste Steigerung</summary>
            <p class="small">${escapeHtml(previous)}</p><p class="small">${escapeHtml(advice.reason)}</p>
            ${advice.suggestion ? `<p>${escapeHtml(advice.label)}</p><button class="btn ghost wide" data-accept="${index}">Vorschlag für neue Plantrainings übernehmen</button>` : ''}
            ${variants.length > 1 ? `<label for="variant-${index}">Variante für neue Plantrainings</label><select class="input" id="variant-${index}" data-variant="${index}">${variants.map(variant => `<option value="${variant.id}" ${variant.id === target.variantId ? 'selected' : ''}>${escapeHtml(variant.name)}</option>`).join('')}</select><button class="btn ghost wide spaced" data-apply-variant="${index}">Variante vormerken</button>` : ''}
            <p class="small">Offene Entwürfe behalten ihre Vorgaben. Änderungen gelten für neu geöffnete Plantrainings dieser Bewegung.</p>
        </details>`;
    }
    function render(force = false) {
        initDraft();
        const workout = workouts[current], planned = context();
        const targets = planned?.targets;
        const linked = !!planned && getProgram().plans.some(plan => plan.id === planned.planId);
        $('workoutSelect').value = String(current);
        $('useFreeTraining').classList.toggle('hidden', !planned);
        $('trainingReserve').textContent = `${planned ? weekPhase(planned.week).reserve : '1–3'} Wdh. in Reserve`;
        $('workoutInfo').textContent = planned ? `${linked ? 'Plan' : 'Früherer Planentwurf'} · Woche ${planned.week} · ${workout.name}` : `${workout.day} · ${workout.focus} · 40–45 Minuten`;
        $('trainingMode').textContent = planned && !linked ? 'Der frühere Plan ist nicht mehr geladen. Deine Eingaben bleiben erhalten; vor dem Speichern als freies Training wird nachgefragt.' : planned
            ? `${weekPhase(planned.week).reserve} Wdh. in Reserve · ca. ${Math.ceil(timeBudget(targets).total / 60)} Min. inkl. 5 Min. Aufwärmen, Pausen, Wechseln und Puffer. Innerhalb von 45 Min. planen.`
            : 'Freies Training mit den bisherigen Vorlagen. Es verändert deinen 8-Wochen-Plan nicht.';
        updateCount();
        if (!force && renderedWorkout === key() && linked === renderedPlanAvailable) return;
        renderedWorkout = key();
        renderedPlanAvailable = linked;
        $('exerciseList').innerHTML = workout.ex.map((legacy, i) => {
            const target = targets?.[i], name = target?.name ?? legacy[0];
            const range = target ? `${target.sets} × ${target.min}–${target.max} ${target.unit === 'seconds' ? 's' : 'Wdh.'} · ${target.rest} s Pause` : `${legacy[1]} × ${legacy[2]} · ${legacy[3]} s Pause`;
            const assessment = planned?.assessments[i];
            return `<div class="exercise"><strong>${escapeHtml(name)}</strong><div class="small">${range}</div>
                ${target ? `<p class="small">${escapeHtml(basisLabel(target.basis))}${target.sides === 2 ? ' · Wiederholungen je Seite' : ''}. ${escapeHtml(target.note)}</p>` : ''}
                <div class="sets">${drafts[key()][i].map((set, j) => `
                    <div class="setrow ${set.done ? 'done' : ''}"><span class="small">S${j + 1}</span>
                        <div><label for="reps-${i}-${j}">${target?.unit === 'seconds' ? 'Sekunden' : target ? 'Wdh.' : 'Wdh. / Sek.'}</label><input class="input" id="reps-${i}-${j}" inputmode="numeric" type="number" min="0" max="999" data-e="${i}" data-s="${j}" data-field="reps" value="${escapeHtml(set.reps)}"></div>
                        <div><label for="kg-${i}-${j}">kg</label><input class="input" id="kg-${i}-${j}" inputmode="decimal" type="number" min="0" max="999" step="0.5" data-e="${i}" data-s="${j}" data-field="kg" value="${escapeHtml(set.kg)}"></div>
                        <button class="btn ${set.done ? 'primary' : 'ghost'}" data-done="${i}:${j}" aria-label="Satz ${j + 1} abhaken" aria-pressed="${set.done}">${set.done ? '✓' : '○'}</button>
                    </div>`).join('')}</div>
                ${target ? `<div class="assessment"><label for="rir-${i}">Wdh. in Reserve im letzten Satz<select class="input" id="rir-${i}" data-rir="${i}"><option value="">Nicht erfasst</option>${[0, 1, 2, 3, 4, 5].map(value => `<option value="${value}" ${assessment.rir === value ? 'selected' : ''}>${value}${value === 5 ? '+' : ''}</option>`).join('')}</select></label>
                    <label class="check"><input type="checkbox" data-clean="${i}" ${assessment.clean ? 'checked' : ''}> Alle Sätze sauber ausgeführt</label></div>${adviceMarkup(target, i, planned)}` : ''}
            </div>`;
        }).join('');
        $('exerciseList').querySelectorAll('[data-field]').forEach(input => {
            input.oninput = () => { drafts[key()][+input.dataset.e][+input.dataset.s][input.dataset.field] = input.value; changed(); };
        });
        $('exerciseList').querySelectorAll('[data-done]').forEach(button => {
            button.onclick = () => {
                if (saving) return;
                const [i, j] = button.dataset.done.split(':').map(Number), set = drafts[key()][i][j];
                set.done = !set.done;
                if (set.done) timer.start(targets?.[i].rest ?? workout.ex[i][3]);
                button.textContent = set.done ? '✓' : '○';
                button.classList.toggle('primary', set.done); button.classList.toggle('ghost', !set.done);
                button.setAttribute?.('aria-pressed', String(set.done));
                button.closest?.('.setrow')?.classList.toggle('done', set.done);
                changed(); updateCount();
            };
        });
        $('exerciseList').querySelectorAll('[data-rir]').forEach(select => {
            select.value = planned.assessments[+select.dataset.rir].rir === null ? '' : String(planned.assessments[+select.dataset.rir].rir);
            select.onchange = () => { planned.assessments[+select.dataset.rir].rir = select.value === '' ? null : Number(select.value); changed(); };
        });
        $('exerciseList').querySelectorAll('[data-clean]').forEach(input => {
            input.checked = planned.assessments[+input.dataset.clean].clean;
            input.onchange = () => { planned.assessments[+input.dataset.clean].clean = input.checked; changed(); };
        });
        const applyPreference = (index, preference) => runAction(async () => {
            if (await persistProgram(program => {
                const next = structuredClone(program), plan = next.plans.find(item => item.id === planned.planId);
                plan.preferences[targets[index].id] = preference;
                return next;
            })) $('trainingAdviceStatus').textContent = 'Für neue Plantrainings gespeichert. Dieser offene Entwurf bleibt unverändert.';
        });
        $('exerciseList').querySelectorAll('[data-accept]').forEach(button => {
            button.onclick = () => {
                const i = +button.dataset.accept, plan = getProgram().plans.find(item => item.id === planned.planId);
                const advice = progression(getProgram(), getData(), plan, targets[i], planned.week);
                if (advice.suggestion) return applyPreference(i, advice.suggestion);
            };
        });
        $('exerciseList').querySelectorAll('[data-apply-variant]').forEach(button => {
            button.onclick = () => {
                const i = +button.dataset.applyVariant, id = targets[i].id;
                const variantId = $('variant-' + i).value;
                const variant = availableVariants(id, getProgram().plans.find(item => item.id === planned.planId).profile).find(item => item.id === variantId);
                const range = initialRange(id, variantId, getProgram().plans.find(item => item.id === planned.planId).profile);
                return applyPreference(i, { variantId, min: range[0], max: range[1], kg: variant.basis === 'none' ? 0 : null });
            };
        });
        setSaving(saving);
    }
    function select(index) {
        if (!saving && (current !== index || activeDraft !== null)) { current = index; activeDraft = null; changed(); }
    }
    $('workoutSelect').innerHTML = workouts.map((workout, i) => `<option value="${i}">${workout.day} – ${workout.name}</option>`).join('');
    $('workoutSelect').onchange = event => { select(+event.target.value); render(); };
    $('useFreeTraining').onclick = () => { select(current); $('planCard').open = false; render(); };
    $('resetWorkout').onclick = () => {
        if (saving || !environment.confirm('Aktuelle Eingaben dieses Workouts leeren? Der bestätigte Entwurf wird beim Speichern ersetzt.')) return;
        if (activeDraft) {
            const savedContext = structuredClone(context()), id = activeDraft;
            delete drafts[id]; delete contexts[id];
            openSlot(savedContext.planId, savedContext.slotId);
        } else { delete drafts[key()]; changed(); }
        render(true);
    };
    $('saveWorkout').onclick = () => {
        if (saving) return Promise.resolve(false);
        setSaving(true);
        return runAction(async () => {
            initDraft();
            const id = key(), planned = context(), value = input => input === '' ? 0 : Number(input);
            const linked = !!planned && getProgram().plans.some(plan => plan.id === planned.planId);
            const exercises = workouts[current].ex.map((exercise, i) => ({ name: planned?.targets[i].name ?? exercise[0],
                sets: drafts[id][i].map(set => ({ reps: value(set.reps), kg: value(set.kg), done: set.done })) }));
            if (!exercises.some(exercise => exercise.sets.some(set => set.done))) return environment.alert('Bitte hake mindestens einen abgeschlossenen Satz ab.');
            if (planned && drafts[id].some((sets, i) => planned.targets[i].basis !== 'none' && sets.some(set => set.done && set.kg === ''))) {
                return environment.alert('Bitte das Gewicht für abgehakte Hantelsätze eintragen. 0 kg ist ein gültiger, ausdrücklich eingetragener Wert.');
            }
            const completed = exercises.every(exercise => exercise.sets.every(set => set.done && set.reps > 0));
            if (linked && !completed && !environment.confirm('Es sind noch Zielsätze offen. Als Teiltraining speichern? Die Planeinheit bleibt offen.')) return;
            const session = { id: environment.crypto.randomUUID(), date: today(), workout: workouts[current].name, exercises };
            const options = { training: snapshot(id) };
            if (planned) {
                if (linked) options.program = completeSlot(getProgram(), planned, session.id, planned.assessments, completed);
                else if (!environment.confirm('Der frühere Plan ist nicht mehr geladen. Dieses Workout ohne Plan-Zuordnung speichern?')) return;
            }
            if (!await persist(data => ({ ...data, sessions: [session, ...data.sessions] }), options)) return;
            cancelPending(); generation++; dirty = false;
            delete drafts[id]; delete contexts[id]; activeDraft = null; renderedWorkout = null;
            timer.stop(false);
            $('draftStatus').textContent = 'Workout und Trainingsstand gespeichert';
            environment.alert(linked && !completed ? 'Teiltraining gespeichert. Die Planeinheit bleibt offen.' : 'Training gespeichert!');
            go('progress');
        }).finally(() => setSaving(false));
    };
    return {
        render, select, openSlot, snapshot, restore, flush,
        pauseAutosave() {
            cancelPending(); generation++;
            if (dirty) {
                $('draftStatus').textContent = 'Deine offenen Eingaben bleiben erhalten. Bitte prüfen und erneut speichern.';
                $('retryDraft').classList.remove('hidden');
            }
        },
        reset() { restore(emptyTraining()); }
    };
}
