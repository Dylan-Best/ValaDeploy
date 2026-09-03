// scripts/pipeline.js
// Suivi en direct d'un pipeline de déploiement : stepper + terminal de logs.
// La page est atteinte via redirection après déploiement d'une stack ou d'un
// mono-projet, avec l'id du projet en query string : pipeline.html?project_id=123

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = ['success', 'failed', 'cancelled'];

let pollTimer = null;
let currentProjectId = null;
let renderedLogCount = 0;
let userScrolledUp = false;

document.addEventListener('DOMContentLoaded', () => {
    initUserSession(
        () => {
            const params = new URLSearchParams(window.location.search);
            currentProjectId = params.get('project_id');

            // Lien retour : personnalisable via ?back_to=stacks.html par exemple
            const backLink = document.getElementById('back-link');
            if (backLink) backLink.href = params.get('back_to') || 'dashboard.html';

            if (!currentProjectId) {
                showFatalError('Aucun projet spécifié (paramètre project_id manquant).');
                return;
            }

            setupTerminalScrollTracking();
            setupActionButtons();
            pollPipeline();
        },
        (error) => {
            console.log('Session invalide ou expirée :', error.message);
            window.location.href = "login.html";
        }
    );
});

function pollPipeline() {
    getPipelineStatus(currentProjectId)
        .then(data => {
            renderPipeline(data);

            if (!TERMINAL_STATUSES.includes(data.status)) {
                pollTimer = setTimeout(pollPipeline, POLL_INTERVAL_MS);
            }
        })
        .catch(error => {
            console.error('Erreur de récupération du pipeline:', error);
            // On retente quand même après un délai, la panne peut être transitoire
            pollTimer = setTimeout(pollPipeline, POLL_INTERVAL_MS);
        });
}

function renderPipeline(data) {
    renderHeader(data);
    renderSteps(data.steps || []);
    renderLogs(data.logs || []);
    renderActions(data);
}

function renderHeader(data) {
    const project = data.project || {};

    const slugEl = document.getElementById('pipeline-slug');
    if (slugEl) slugEl.textContent = project.slug || '—';

    const envEl = document.getElementById('pipeline-environment');
    if (envEl) envEl.textContent = project.environment || '—';

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
        case 'completed':
            return `<span class="material-symbols-outlined text-[18px]">check</span>`;
        case 'active':
            return `<div class="step-dot"></div><div class="step-icon-glow"></div>`;
        case 'failed':
            return `<span class="material-symbols-outlined text-[16px]">close</span>`;
        case 'cancelled':
            return `<span class="material-symbols-outlined text-[16px]">block</span>`;
        default: // pending
            return `<span class="material-symbols-outlined text-[16px]">pending</span>`;
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

function renderLogs(logs) {
    const body = document.getElementById('terminal-body');
    if (!body) return;

    // On ne rend que les nouvelles lignes reçues depuis le dernier poll
    if (renderedLogCount === 0 && logs.length === 0) return;

    if (renderedLogCount === 0) {
        body.innerHTML = '';
    }

    const newLines = logs.slice(renderedLogCount);
    if (newLines.length === 0) return;

    const fragment = document.createDocumentFragment();
    newLines.forEach(line => {
        const div = document.createElement('div');
        div.className = 'opacity-90';
        div.textContent = line;
        fragment.appendChild(div);
    });
    body.appendChild(fragment);
    renderedLogCount = logs.length;

    if (!userScrolledUp) {
        body.scrollTop = body.scrollHeight;
    }
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
                    renderedLogCount = 0;
                    clearTimeout(pollTimer);
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
            a.download = `build-log-${currentProjectId}.txt`;
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
