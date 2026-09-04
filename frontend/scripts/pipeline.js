// scripts/pipeline.js

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = ['success', 'failed', 'cancelled'];

let pollTimer = null;
let ws = null;
let currentProjectId = null;
let currentSlug = null;
let userScrolledUp = false;

document.addEventListener('DOMContentLoaded', () => {
    initUserSession(
        async () => {
            const params = new URLSearchParams(window.location.search);
            currentProjectId = params.get('project_id');

            // Filet de sécurité : si l'URL a perdu son paramètre (ex: restauration
            // navigateur depuis le cache), on retombe sur le dernier projet visité.
            if (!currentProjectId) {
                currentProjectId = sessionStorage.getItem('lastPipelineProjectId');
                if (currentProjectId) {
                    const url = new URL(window.location.href);
                    url.searchParams.set('project_id', currentProjectId);
                    window.history.replaceState({}, '', url);
                }
            }

            const backLink = document.getElementById('back-link');
            if (backLink) backLink.href = params.get('back_to') || 'stacks.html';

            if (!currentProjectId) {
                showFatalError('Aucun projet spécifié (paramètre project_id manquant).');
                return;
            }

            sessionStorage.setItem('lastPipelineProjectId', currentProjectId);

            setupTerminalScrollTracking();
            setupActionButtons();
            
            // 1. Récupérer les détails initiaux (slug, status, steps)
            const data = await getPipelineStatus(currentProjectId);
            currentSlug = data.project.slug;
            renderPipeline(data);

            // 2. Ouvrir le WebSocket pour les VRAIS logs
            connectWebSocket(currentSlug);

            // 3. Lancer le polling pour mettre à jour le stepper (statuts) SEULEMENT
            pollTimer = setInterval(() => pollPipeline(), POLL_INTERVAL_MS);
        },
        (error) => {
            console.log('Session invalide ou expirée :', error.message);
            window.location.href = "login.html";
        }
    );
});

function connectWebSocket(slug) {
    ws = connectLogsWebSocket(slug, null, currentAccessToken, {
        onOpen: () => {
            const body = document.getElementById('terminal-body');
            if (body) body.innerHTML = '';
            appendLog("[SYSTÈME] Connexion aux logs en temps réel établie...\n");
        },
        onMessage: (data) => appendLog(data),
        onClose: (event) => {
            if (event.code === 1000 || event.code === 1001) {
                appendLog("\n[SYSTÈME] Stream de logs terminé.");
            } else {
                appendLog(`\n[SYSTÈME] Connexion fermée (code ${event.code}).`);
            }
        },
        onTokenExpired: (newToken) => {
            appendLog("\n[SYSTÈME] Session rafraîchie, reconnexion...");
            connectWebSocket(slug); // reconnecte avec le nouveau token, une seule fois
        },
        onError: (err) => {
            console.error("Erreur WebSocket:", err);
            appendLog("[ERREUR] Échec de la connexion au serveur de logs.");
        }
    });
}

function appendLog(text) {
    const body = document.getElementById('terminal-body');
    if (!body) return;

    const div = document.createElement('div');
    div.className = 'opacity-90 whitespace-pre-wrap break-words font-mono-code text-label-md text-[#b4c4de] leading-relaxed';
    div.textContent = text;
    body.appendChild(div);

    if (!userScrolledUp) {
        body.scrollTop = body.scrollHeight;
    }
}

function pollPipeline() {
    getPipelineStatus(currentProjectId)
        .then(data => {
            currentSlug = data.project.slug;
            renderHeader(data);
            renderSteps(data.steps || []);
            renderActions(data);
            
            if (TERMINAL_STATUSES.includes(data.status)) {
                clearInterval(pollTimer);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.close(1000, "Pipeline terminé");
                }
            }
        })
        .catch(error => {
            console.error('Erreur de récupération du pipeline:', error);
        });
}

function renderPipeline(data) {
    renderHeader(data);
    renderSteps(data.steps || []);
    renderActions(data);
    // NOTE: On NE FAIT PAS renderLogs(data.logs) ici pour éviter d'afficher les mocks !
    // Les logs viennent exclusivement du WebSocket.
}

function renderHeader(data) {
    const project = data.project || {};
    const slugEl = document.getElementById('pipeline-slug');
    if (slugEl) slugEl.textContent = project.slug || '—';

    const envEl = document.getElementById('pipeline-environment');
    if (envEl) envEl.textContent = project.environment || 'local';

    const commitEl = document.getElementById('pipeline-commit');
    if (commitEl) commitEl.textContent = project.commit_sha ? `#${project.commit_sha.substring(0, 7)}` : '—';

    const titleEl = document.getElementById('terminal-title');
    if (titleEl) titleEl.textContent = `Build Log - ${project.slug || ''}`;

    renderStatusBadge(data.status);
}

function renderStatusBadge(status) {
    const badge = document.getElementById('pipeline-status-badge');
    if (!badge) return;

    const configs = {
        running:   { label: 'In Progress', color: '#ff5c00', bg: 'rgba(255, 92, 0, 0.1)',  border: 'rgba(255, 92, 0, 0.2)',  pulse: true },
        success:   { label: 'Success',     color: '#12b76a', bg: 'rgba(18, 183, 106, 0.1)', border: 'rgba(18, 183, 106, 0.2)', pulse: false },
        failed:    { label: 'Failed',      color: '#ba1a1a', bg: 'rgba(186, 26, 26, 0.1)',  border: 'rgba(186, 26, 26, 0.2)',  pulse: false },
        cancelled: { label: 'Cancelled',   color: '#5e5e5e', bg: 'rgba(94, 94, 94, 0.1)',   border: 'rgba(94, 94, 94, 0.2)',   pulse: false }
    };
    const config = configs[status] || configs.running;

    badge.style.backgroundColor = config.bg;
    badge.style.borderColor = config.border;

    const dot = badge.querySelector('span:first-child');
    if (dot) {
        dot.style.backgroundColor = config.color;
        dot.classList.toggle('animate-pulse-slow', config.pulse);
    }

    const label = badge.querySelector('span:last-child');
    if (label) {
        label.textContent = config.label;
        label.style.color = config.color;
    }
}

function renderSteps(steps) {
    const container = document.getElementById('pipeline-steps');
    if (!container) return;

    if (steps.length === 0) {
        container.innerHTML = `<div class="py-lg text-center text-secondary">Aucune étape à afficher.</div>`;
        return;
    }

    container.innerHTML = steps.map(step => `
        <div class="pipeline-step" data-status="${step.status}">
            <div class="step-icon">
                ${getStepIconMarkup(step.status)}
            </div>
            <div class="flex flex-col pt-xs min-w-0">
                <span class="pipeline-step-title font-label-md text-label-md text-on-surface" data-status="${step.status}">${escapeHtml(step.label)}</span>
                <span class="font-body-sm text-body-sm text-secondary mt-1">${escapeHtml(step.description || '')}</span>
                ${getStepFooterMarkup(step)}
            </div>
        </div>
    `).join('');
}

function getStepIconMarkup(status) {
    switch (status) {
        case 'completed': return `<span class="material-symbols-outlined text-[18px]">check</span>`;
        case 'active': return `<div class="step-dot"></div><div class="step-icon-glow"></div>`;
        case 'failed': return `<span class="material-symbols-outlined text-[16px]">close</span>`;
        case 'cancelled': return `<span class="material-symbols-outlined text-[16px]">block</span>`;
        default: return `<span class="material-symbols-outlined text-[16px]">pending</span>`;
    }
}

function getStepFooterMarkup(step) {
    if (step.status === 'active') {
        return `<span class="font-mono-code text-label-sm text-primary-container mt-2">Running...</span>`;
    }
    if (step.status === 'completed' && step.duration_seconds != null) {
        return `<span class="font-mono-code text-label-sm text-secondary mt-2 opacity-50">${step.duration_seconds}s</span>`;
    }
    if (step.status === 'failed') {
        return `<span class="font-mono-code text-label-sm text-error mt-2">Failed</span>`;
    }
    return '';
}

function renderActions(data) {
    const cancelBtn = document.getElementById('cancel-btn');
    const retryBtn = document.getElementById('retry-btn');
    const viewLiveBtn = document.getElementById('view-live-btn');

    if (cancelBtn) cancelBtn.style.display = data.status === 'running' ? '' : 'none';
    if (retryBtn) retryBtn.style.display = (data.status === 'failed' || data.status === 'cancelled') ? '' : 'none';

    if (viewLiveBtn) {
        const liveUrl = data.project && data.project.live_url;
        if (data.status === 'success' && liveUrl) {
            viewLiveBtn.style.display = '';
            viewLiveBtn.href = liveUrl;
        } else {
            viewLiveBtn.style.display = 'none';
        }
    }
}

function setupActionButtons() {
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (!window.confirm('Annuler ce build en cours ?')) return;
            cancelBtn.disabled = true;
            cancelBuild(currentProjectId)
                .catch(error => alert(`Erreur lors de l'annulation : ${error.message || 'Erreur inconnue'}`))
                .finally(() => { cancelBtn.disabled = false; });
        });
    }

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            retryBtn.disabled = true;
            retryBuild(currentProjectId)
                .then(() => {
                    const body = document.getElementById('terminal-body');
                    if (body) body.innerHTML = ''; // Clear logs on retry
                    if (ws) ws.close();
                    connectWebSocket(currentSlug);
                    pollPipeline();
                })
                .catch(error => alert(`Erreur lors de la relance : ${error.message || 'Erreur inconnue'}`))
                .finally(() => { retryBtn.disabled = false; });
        });
    }

    const downloadBtn = document.getElementById('download-logs-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const body = document.getElementById('terminal-body');
            const text = body ? body.innerText : '';
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `build-log-${currentSlug || currentProjectId}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const terminal = document.getElementById('pipeline-terminal');
            if (terminal) terminal.classList.toggle('is-fullscreen');
        });
    }
}

function setupTerminalScrollTracking() {
    const body = document.getElementById('terminal-body');
    if (!body) return;

    body.addEventListener('scroll', () => {
        const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
        userScrolledUp = distanceFromBottom > 40;
    });
}

function showFatalError(message) {
    const stepsContainer = document.getElementById('pipeline-steps');
    if (stepsContainer) {
        stepsContainer.innerHTML = `<div class="py-lg text-center text-error">${escapeHtml(message)}</div>`;
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}