export function createTimer({ document, navigator, setInterval, clearInterval, now = Date.now }) {
    const display = document.getElementById('timerDisplay');
    const startButton = document.getElementById('timerStart');
    let seconds = 90, interval = null;

    function render() {
        const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
        display.textContent = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }
    function stop() {
        clearInterval(interval);
        interval = null;
        startButton.textContent = '▶ Start';
    }
    function start(duration = seconds) {
        stop();
        seconds = duration;
        render();
        const end = now() + seconds * 1000;
        interval = setInterval(() => {
            seconds = Math.max(0, Math.ceil((end - now()) / 1000));
            render();
            if (seconds <= 0) {
                stop();
                navigator.vibrate?.([150, 100, 150]);
            }
        }, 250);
        startButton.textContent = '↻ Neustart';
    }
    startButton.onclick = () => start(seconds <= 0 ? 90 : seconds);
    document.getElementById('timerStop').onclick = stop;
    document.querySelectorAll('[data-seconds]').forEach(button => {
        button.onclick = () => { stop(); seconds = +button.dataset.seconds; render(); };
    });
    return { start, stop };
}
