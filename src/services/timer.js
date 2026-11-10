export function createTimer({ document, navigator, setInterval, clearInterval, now = Date.now }) {
    const display = document.getElementById('timerDisplay');
    const startButton = document.getElementById('timerStart');
    let seconds = 90, endAt = null, interval = null, changed = () => {};
    const remaining = () => endAt === null ? seconds : Math.max(0, Math.ceil((endAt - now()) / 1000));
    function render() {
        const value = remaining();
        display.textContent = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
        startButton.textContent = endAt === null ? '▶ Start' : '↻ Neustart';
        document.getElementById('workoutTimer')?.classList?.toggle('timer-running', endAt !== null);
        document.body?.classList?.toggle('has-active-rest', endAt !== null);
    }
    function stop(notify = true) {
        seconds = remaining();
        endAt = null;
        clearInterval(interval);
        interval = null;
        render();
        if (notify) changed();
    }
    function refresh() {
        render();
        if (endAt !== null && remaining() <= 0) {
            stop();
            navigator.vibrate?.([150, 100, 150]);
        }
    }
    function start(duration = remaining()) {
        stop(false);
        seconds = duration;
        endAt = now() + seconds * 1000;
        interval = setInterval(refresh, 250);
        render();
        changed();
    }
    function restore(value) {
        stop(false);
        seconds = value.seconds;
        if (value.endAt !== null && value.endAt > now()) {
            endAt = value.endAt;
            interval = setInterval(refresh, 250);
        } else if (value.endAt !== null) seconds = 0;
        render();
    }
    startButton.onclick = () => start(remaining() <= 0 ? 90 : remaining());
    document.getElementById('timerStop').onclick = () => stop();
    document.querySelectorAll('[data-seconds]').forEach(button => {
        button.onclick = () => { stop(false); seconds = +button.dataset.seconds; render(); changed(); };
    });
    return { start, stop, restore, refresh, snapshot: () => ({ seconds: remaining(), endAt }), onChange(callback) { changed = callback; } };
}
