// Comportement de la page Project Detail.
// Le slug du projet est lu depuis l'URL (?slug=mon-projet), ce qui rend
// cette page générique — pas propre à un seul projet en dur.

document.addEventListener('DOMContentLoaded', () => {
    const slug = getSlugFromUrl();

    if (!slug) {
        document.getElementById('project-name').textContent = 'No project specified';
        return;
    }

    document.title = `ValaDeploy - ${slug}`;
    document.getElementById('project-name').textContent = slug;

    connectLogsWebSocket(slug);
    setupControlButtons(slug);
});

function getSlugFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('slug');
}

// --- Connexion WebSocket réelle vers /logs/{slug} ---
function connectLogsWebSocket(slug) {
    const terminal = document.getElementById('log-terminal');
    const indicator = document.getElementById('live-indicator');
    if (!terminal || !indicator) return;

    const ws = new WebSocket(`${WS_BASE_URL}/logs/${slug}`);

    ws.onopen = () => {
        indicator.classList.remove('disconnected');
        indicator.classList.add('connected');
        appendLogLine(terminal, `--- Connected to ${slug} ---`, 'meta');
    };

    ws.onmessage = (event) => {
        appendLogLine(terminal, event.data, 'default');
    };

    ws.onclose = () => {
        indicator.classList.remove('connected');
        indicator.classList.add('disconnected');
        appendLogLine(terminal, '--- Connection closed ---', 'meta');
    };

    ws.onerror = () => {
        appendLogLine(terminal, '--- Connection error ---', 'error');
    };
}

function appendLogLine(terminal, text, kind) {
    const line = document.createElement('div');
    if (kind === 'meta') line.className = 'text-[#666]';
    if (kind === 'error') line.className = 'text-error';
    line.textContent = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// --- Start / Stop / Restart ---
// TODO (intégration backend) : aucun endpoint dédié n'existe encore pour
// stop/start/restart d'un projet individuellement (seul /clone existe à ce
// stade, qui recrée/relance via scale_project). À brancher une fois ces
// routes ajoutées côté API (probablement POST /projects/{slug}/stop, etc.).
function setupControlButtons(slug) {
    document.getElementById('btn-stop')?.addEventListener('click', () => {
        console.log(`TODO: appeler l'API pour stopper ${slug}`);
    });
    document.getElementById('btn-restart')?.addEventListener('click', () => {
        console.log(`TODO: appeler l'API pour redémarrer ${slug}`);
    });
    document.getElementById('btn-start')?.addEventListener('click', () => {
        console.log(`TODO: appeler l'API pour démarrer ${slug}`);
    });
}
