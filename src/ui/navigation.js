export function createNavigation({ document, window, render }) {
    let active = 'home';
    function go(tab) {
        document.querySelectorAll('.section').forEach(section => section.classList.toggle('active', section.id === tab));
        document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
        active = tab;
        window.scrollTo(0, 0);
        render(tab);
    }
    document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => go(button.dataset.tab); });
    document.querySelectorAll('[data-go]').forEach(button => { button.onclick = () => go(button.dataset.go); });
    return { go, refresh: () => render(active) };
}
