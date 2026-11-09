import { workouts } from '../data/workouts.js';
import { today } from '../domain/dates.js';
import { dayTotal } from '../domain/protein.js';
import { weeklySessions } from '../domain/statistics.js';
import { fmt } from '../ui/format.js';

export function createHome({ $, getData, go }, training) {
    $('startNext').onclick = () => {
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
            const next = workouts[data.sessions.length % workouts.length];
            $('nextTitle').textContent = next.name;
            $('nextSub').textContent = `${next.day} · ${next.focus} · ca. 45 Minuten`;
        }
    };
}
