import { workouts } from '../data/workouts.js';
import { today } from '../domain/dates.js';
import { dayTotal } from '../domain/protein.js';
import { weeklySessions } from '../domain/statistics.js';
import { fmt } from '../ui/format.js';
import { activePlan, nextSlot, targetsFor, timeBudget } from '../domain/program.js';

export function createHome({ $, getData, getProgram, go }, training) {
    $('startNext').onclick = () => {
        const plan = activePlan(getProgram()), slot = nextSlot(plan);
        if (plan) {
            if (slot) training.openSlot(plan.id, slot.id);
            else $('planCard').open = true;
            return go('training');
        }
        training.select(getData().sessions.length % workouts.length);
        go('training');
    };
    return {
        render() {
            const data = getData(), total = dayTotal(data, today());
            $('homeProtein').textContent = `${fmt(total)} / ${data.goal} g`;
            $('homeProgress').style.width = `${Math.min(100, total / data.goal * 100)}%`;
            $('homeRemaining').textContent = total >= data.goal ? 'Tagesziel erreicht!' : `${fmt(data.goal - total)} g bis zum Tagesziel`;
            $('homeSessions').textContent = `${weeklySessions(data.sessions)} / 4`;
            $('homePullUps').textContent = getProgram().profile.pullUps;
            $('homePushUps').textContent = getProgram().profile.pushUps;
            $('homeBaselineNote').textContent = `8-Wochen-Orientierung: ${getProgram().profile.pullUps + 2} Klimmzüge und ${getProgram().profile.pushUps + 4} Push-ups – keine Garantie.`;
            const plan = activePlan(getProgram()), slot = nextSlot(plan);
            if (plan) {
                $('nextTitle').textContent = slot ? workouts[slot.workoutIndex].name : 'Keine offenen Planeinheiten';
                $('nextSub').textContent = slot ? `Woche ${slot.week} · geplant ${slot.date} · ca. ${Math.ceil(timeBudget(targetsFor(plan, slot)).total / 60)} Minuten` : `${plan.slots.filter(item => item.status === 'done').length} / 32 abgeschlossen. Planübersicht öffnen oder Einheiten wiederholen.`;
                return;
            }
            const next = workouts[data.sessions.length % workouts.length];
            $('nextTitle').textContent = next.name;
            $('nextSub').textContent = `${next.day} · ${next.focus} · ca. 45 Minuten`;
        }
    };
}
