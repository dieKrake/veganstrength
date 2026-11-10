import { workouts } from '../data/workouts.js';
import { equipmentLabels } from '../data/exercises.js';
import { today } from '../domain/dates.js';
import { activePlan, createPlan, nextSlot, planWeek, targetsFor, timeBudget, weekPhase } from '../domain/program.js';
import { isCalendarDate } from '../domain/validation.js';
import { validateProfile } from '../domain/program-validation.js';
import { escapeHtml, fmt } from '../ui/format.js';

export function createPlanFeature({ $, getData, getProgram, persist, persistProgram, runAction, refresh, go, environment }, training) {
    $('planStartDate').value = today();
    $('planCard').open = !activePlan(getProgram());
    $('profileEquipment').innerHTML = Object.entries(equipmentLabels).map(([key, label]) =>
        `<label class="check"><input type="checkbox" data-equipment="${key}"> ${label}</label>`).join('');
    function renderProfile() {
        const profile = getProgram().profile;
        for (const field of ['age', 'height', 'weight', 'pullUps', 'pushUps', 'dumbbellStep', 'kettlebellStep']) $('profile-' + field).value = profile[field];
        $('profile-goal').value = getData().goal;
        $('profile-weights').value = profile.availableDumbbells.map(fmt).join('; ');
        $('profileEquipment').querySelectorAll('[data-equipment]').forEach(input => { input.checked = profile.equipment.includes(input.dataset.equipment); });
    }
    $('saveProfile').onclick = () => {
        let profile, goal;
        try {
            profile = structuredClone(getProgram().profile);
            for (const field of ['age', 'height', 'weight', 'pullUps', 'pushUps', 'dumbbellStep', 'kettlebellStep']) {
                if ($('profile-' + field).value.trim() === '') throw Error('Bitte alle Profilwerte ausfüllen.');
                profile[field] = Number($('profile-' + field).value);
            }
            profile.equipment = [...$('profileEquipment').querySelectorAll('[data-equipment]')].filter(input => input.checked).map(input => input.dataset.equipment);
            const weights = $('profile-weights').value.trim();
            profile.availableDumbbells = weights ? weights.split(';').map(value => Number(value.trim().replace(',', '.'))).sort((a, b) => a - b) : [];
            validateProfile(profile);
            goal = Number($('profile-goal').value);
            if (!Number.isFinite(goal) || goal < 50 || goal > 250) throw Error('Proteinziel: bitte 50–250 g eintragen.');
        } catch (error) { environment.alert(error.message); return Promise.resolve(false); }
        return runAction(async () => {
            if (await persist(data => ({ ...data, goal }), { program: { ...getProgram(), profile } })) {
                $('profileSaved').textContent = 'Profil gespeichert. Die neuen Basiswerte gelten für neue Pläne.';
                refresh();
            }
        });
    };
    $('startPlan').onclick = () => runAction(async () => {
        const start = $('planStartDate').value;
        if (!isCalendarDate(start)) return environment.alert('Bitte ein gültiges Startdatum wählen.');
        const existing = activePlan(getProgram());
        if (existing && !environment.confirm('Neuen 8-Wochen-Plan starten? Der bisherige Plan und seine Trainings bleiben im Archiv erhalten.')) return;
        const plan = createPlan(getProgram(), start, environment.crypto.randomUUID());
        try {
            // Validate equipment and the budget before offering a plan.
            plan.slots.forEach(slot => {
                if (timeBudget(targetsFor(plan, slot)).total > 2700) throw Error('Das Zeitbudget wird überschritten.');
            });
        } catch (error) { return environment.alert(error.message); }
        if (await persistProgram(program => ({ ...program, activePlanId: plan.id, plans: [...program.plans, plan] }))) {
            refresh();
            $('planFeedback').textContent = '32 Einheiten angelegt. Öffne eine Planeinheit, um ihr Training zuzuordnen.';
        }
    });
    function renderPlan() {
        const program = getProgram(), plan = activePlan(program);
        $('planProfileSummary').textContent = `${program.profile.age} Jahre · ${fmt(program.profile.height)} cm · ${fmt(program.profile.weight)} kg · vegan · ${getData().goal} g Protein/Tag`;
        $('planEmpty').classList.toggle('hidden', !!plan);
        $('planActive').classList.toggle('hidden', !plan);
        $('startPlan').textContent = plan ? 'Neuen Plan starten' : '8-Wochen-Plan starten';
        if (!plan) return;
        const week = planWeek(plan), phase = weekPhase(week), next = nextSlot(plan);
        $('planTitle').textContent = `Woche ${week} / 8 · ${phase.name}`;
        $('planSummary').textContent = `${plan.slots.filter(slot => slot.status === 'done').length} / 32 abgeschlossen · ${plan.slots.filter(slot => slot.status === 'skipped').length} übersprungen`;
        $('planPhase').textContent = `${phase.note} ${phase.reserve} Wdh. in Reserve.`;
        $('planNext').textContent = next ? `Nächste offene Einheit: Woche ${next.week} · ${workouts[next.workoutIndex].name} · ${next.date}` : 'Keine offenen Planeinheiten. Du kannst eine Einheit wiederholen oder einen neuen Plan starten.';
        $('planWeeks').innerHTML = Array.from({ length: 8 }, (_, i) => `
            <details ${i + 1 === week ? 'open' : ''} class="week"><summary>Woche ${i + 1} · ${weekPhase(i + 1).name}</summary>
                ${plan.slots.slice(i * 4, i * 4 + 4).map(slot => `
                    <div class="plan-slot">
                        <strong>${escapeHtml(workouts[slot.workoutIndex].name)}</strong>
                        <span class="pill">${({ planned: 'Offen', done: 'Abgeschlossen', skipped: 'Übersprungen' })[slot.status]}</span>
                        <label>Geplant am <input class="input" type="date" data-slot-date="${escapeHtml(slot.id)}" value="${slot.date}" ${slot.status === 'done' ? 'disabled' : ''}></label>
                        <div class="row"><button class="btn primary" data-open-slot="${escapeHtml(slot.id)}">${slot.status === 'done' ? 'Wiederholen' : 'Training öffnen'}</button>
                        ${slot.status === 'done' ? '' : `<button class="btn ghost" data-skip-slot="${escapeHtml(slot.id)}">${slot.status === 'skipped' ? 'Wieder einplanen' : 'Überspringen'}</button>`}</div>
                        <p class="small">${Math.ceil(timeBudget(targetsFor(plan, slot)).total / 60)} Min. geschätzt inkl. Aufwärmen, Pausen, Seitenwechseln und Puffer.</p>
                    </div>`).join('')}
            </details>`).join('');
        $('planWeeks').querySelectorAll('[data-open-slot]').forEach(button => {
            button.onclick = () => { training.openSlot(plan.id, button.dataset.openSlot); go('training'); };
        });
        $('planWeeks').querySelectorAll('[data-skip-slot]').forEach(button => {
            button.onclick = () => runAction(async () => {
                const nextProgram = structuredClone(getProgram());
                const slot = nextProgram.plans.find(item => item.id === plan.id).slots.find(item => item.id === button.dataset.skipSlot);
                slot.status = slot.status === 'skipped' ? 'planned' : 'skipped';
                if (await persistProgram(() => nextProgram)) refresh();
            });
        });
        $('planWeeks').querySelectorAll('[data-slot-date]').forEach(input => {
            input.onchange = () => runAction(async () => {
                if (!isCalendarDate(input.value)) return environment.alert('Bitte ein gültiges Datum wählen.');
                const nextProgram = structuredClone(getProgram());
                nextProgram.plans.find(item => item.id === plan.id).slots.find(item => item.id === input.dataset.slotDate).date = input.value;
                if (await persistProgram(() => nextProgram)) refresh();
            });
        });
        $('planArchive').textContent = `${Math.max(0, program.plans.length - 1)} frühere Pläne bleiben im Backup und in den Trainingszuordnungen erhalten.`;
    }
    return { renderPlan, renderProfile };
}
