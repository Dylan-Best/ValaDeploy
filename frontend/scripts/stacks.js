// scripts/stacks.js
// Chargement des stacks et affichage en accordéon (cartes) avec composants dépliables.

// Etat local : la liste des stacks chargées, pour recalculer les stats après suppression
// sans devoir refetch le serveur.
let loadedStacks = [];

// Cache des détails déjà chargés, pour ne pas re-fetch à chaque toggle
const componentDetailCache = {};

document.addEventListener('DOMContentLoaded', () => {
    initUserSession(
        async (user) => {
            const fullnameEl = document.getElementById('user-fullname');
            if (fullnameEl) fullnameEl.textContent = user.full_name;

            try {
                const stacks = await getStacks();
                loadedStacks = stacks;
                renderStacks(stacks);
            } catch (error) {
                console.error('Erreur chargement stacks:', error);
                const loadingState = document.getElementById('loading-state');
                if (loadingState) {
                    loadingState.innerHTML = `
                        <div class="py-lg text-center text-error">
                            Erreur de chargement des stacks: ${error.message || 'Erreur inconnue'}
                        </div>
                    `;
                }
            }
        },
        (error) => {
            console.log('Session invalide ou expirée :', error.message);
            window.location.href = "login.html";
        }
    );
});

function renderStacks(stacks) {
    const container = document.getElementById('stacks-list');
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    if (!container) return;

    // Nettoyage : on retire uniquement les cartes déjà rendues (pas les states)
    container.querySelectorAll('.stack-card').forEach(el => el.remove());
    if (loadingState) loadingState.style.display = 'none';

    if (stacks.length === 0) {
        if (emptyState) emptyState.style.display = '';
        updateStackStats(stacks);
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    stacks.forEach(stack => {
        const card = createStackCard(stack);
        container.appendChild(card);
    });

    updateStackStats(stacks);
}

function createStackCard(stack) {
    const statusConfig = getStatusConfig(stack.status);
    const createdDate = stack.created_at ? new Date(stack.created_at) : null;
    const dateStr = createdDate ? createdDate.toLocaleDateString('fr-FR') : 'Date inconnue';

    const article = document.createElement('article');
    article.className = 'stack-card bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden';
    article.dataset.projectId = stack.project_id;
    article.dataset.slug = stack.slug;
    article.dataset.expanded = 'false';

    article.innerHTML = `
        <div class="stack-card-header px-lg py-md flex items-center justify-between cursor-pointer bg-surface hover:bg-surface-container-low transition-colors">
            <div class="flex items-center gap-lg min-w-0">
                <span class="material-symbols-outlined stack-toggle-icon text-secondary text-[20px]">chevron_right</span>
                <div class="min-w-0">
                    <h3 class="stack-name font-mono-code text-mono-code font-medium truncate">${escapeHtml(stack.slug)}</h3>
                    <p class="font-body-sm text-body-sm text-secondary">Créée le ${dateStr}</p>
                </div>
            </div>
            <div class="flex items-center gap-xl shrink-0">
                <div class="status-badge ${statusConfig.class}">
                    <div class="status-dot"></div>
                    <span class="font-label-sm text-label-sm">${statusConfig.label}</span>
                </div>
                <div class="font-body-sm text-body-sm text-secondary w-28 text-right hidden sm:block">
                    ${stack.component_count} composant${stack.component_count > 1 ? 's' : ''}
                </div>
                <button class="stack-delete-btn text-secondary hover:text-error p-xs rounded hover:bg-error-container/30" title="Supprimer la stack" aria-label="Supprimer ${escapeHtml(stack.slug)}">
                    <span class="material-symbols-outlined text-[20px]">delete</span>
                </button>
            </div>
        </div>
        <div class="stack-card-body border-t border-outline-variant bg-surface-container-low" id="components-${stack.project_id}" hidden>
            <div class="py-md px-lg text-center text-secondary text-body-sm">
                <span class="material-symbols-outlined text-[18px] animate-spin align-middle">progress_activity</span>
                Chargement des composants...
            </div>
        </div>
    `;

    const header = article.querySelector('.stack-card-header');
    header.addEventListener('click', () => toggleStackDetail(stack.project_id));

    attachDeleteHandler(article, stack);

    return article;
}

async function toggleStackDetail(projectId) {
    const article = document.querySelector(`.stack-card[data-project-id="${projectId}"]`);
    if (!article) return;

    const body = article.querySelector('.stack-card-body');
    const stackSlug = article.dataset.slug;
    const isOpen = article.dataset.expanded === 'true';

    if (isOpen) {
        article.dataset.expanded = 'false';
        body.hidden = true;
        return;
    }

    article.dataset.expanded = 'true';
    body.hidden = false;

    // Chargement paresseux : on ne fetch le détail qu'au premier dépliage
    if (!componentDetailCache[projectId]) {
        try {
            const detail = await getStackDetail(projectId);
            componentDetailCache[projectId] = detail;
        } catch (error) {
            body.innerHTML = `
                <div class="py-md px-lg text-center text-error text-body-sm">
                    Erreur de chargement: ${error.message || 'Erreur inconnue'}
                </div>
            `;
            return;
        }
    }

    renderComponents(projectId, componentDetailCache[projectId], stackSlug);
}

function renderComponents(projectId, detail, stackSlug) {
    const container = document.getElementById(`components-${projectId}`);
    if (!container) return;

    const components = detail.components || [];
    if (components.length === 0) {
        container.innerHTML = `<div class="py-md px-lg text-center text-secondary text-body-sm">Aucun composant.</div>`;
        return;
    }

    const rows = components.map(c => {
        const statusConfig = getStatusConfig(c.status);
        const kindLabel = (c.kind || '').replace('ComponentKind.', '').toLowerCase();
        const componentSlug = c.slug || `${stackSlug}-${kindLabel}`;
        const isFailed = c.status === 'failed';
        const componentId = c.id; // L'ID unique du composant en base
        const projectSlug = stackSlug; // Le slug du projet parent (stack) pour construire l'URL de détail      

        return `
            <div class="component-row group flex items-center justify-between bg-surface-container-lowest border border-outline-variant rounded p-sm">
                <div class="flex items-center gap-md min-w-0">
                    <span class="material-symbols-outlined text-secondary text-[18px]">${getComponentIcon(kindLabel)}</span>
                    <span class="font-mono-code text-mono-code truncate">${escapeHtml(c.name)}</span>
                    <span class="component-kind-pill">${escapeHtml(kindLabel)}</span>
                </div>
                <div class="flex items-center gap-md shrink-0">
                    ${c.error_message ? `<span class="text-body-sm text-error truncate max-w-[220px]" title="${escapeHtml(c.error_message)}">${escapeHtml(c.error_message)}</span>` : ''}
                    <div class="status-badge ${statusConfig.class}">
                        <div class="status-dot"></div>
                        <span class="font-label-sm text-label-sm">${statusConfig.label}</span>
                    </div>
                    <a href="project-detail.html?slug=${encodeURIComponent(projectSlug)}&component_id=${componentId}"
                    class="component-view-link text-secondary hover:text-on-surface inline-flex items-center gap-xs">
                        <span class="font-label-sm text-label-sm">Voir</span>
                        <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </a>
                </div>
            </div>
            ${isFailed ? `
            <div class="pl-sm">
                <a href="project-detail.html?slug=${encodeURIComponent(componentSlug)}#logs"
                   class="view-logs-link inline-flex items-center gap-xs text-primary font-label-sm text-label-sm hover:underline">
                    <span class="material-symbols-outlined text-[16px]">terminal</span>
                    View Build Logs
                </a>
            </div>` : ''}
        `;
    }).join('');

    container.innerHTML = `<div class="px-lg py-md space-y-sm">${rows}</div>`;
}

function attachDeleteHandler(article, stack) {
    const btn = article.querySelector('.stack-delete-btn');
    if (!btn) return;

    btn.addEventListener('click', async (event) => {
        event.stopPropagation();

        const confirmed = window.confirm(`Supprimer la stack "${stack.slug}" ? Cette action est irréversible.`);
        if (!confirmed) return;

        btn.disabled = true;
        btn.classList.add('opacity-50');

        try {
            await deleteStack(stack.project_id);

            article.remove();
            delete componentDetailCache[stack.project_id];
            loadedStacks = loadedStacks.filter(s => s.project_id !== stack.project_id);

            updateStackStats(loadedStacks);

            const emptyState = document.getElementById('empty-state');
            if (loadedStacks.length === 0 && emptyState) {
                emptyState.style.display = '';
            }
        } catch (error) {
            alert(`Erreur lors de la suppression : ${error.message || 'Erreur inconnue'}`);
            btn.disabled = false;
            btn.classList.remove('opacity-50');
        }
    });
}

function getComponentIcon(kindLabel) {
    const icons = {
        'database': 'database',
        'postgres': 'database',
        'db': 'database',
        'backend': 'api',
        'api': 'api',
        'frontend': 'web',
        'web': 'web'
    };
    return icons[kindLabel] || 'deployed_code';
}

function getStatusConfig(status) {
    const configs = {
        'running': { label: 'Running', class: 'status-running' },
        'stopped': { label: 'Stopped', class: 'status-stopped' },
        'building': { label: 'Building', class: 'status-building' },
        'failed': { label: 'Failed', class: 'status-error' }
    };
    return configs[status] || { label: status || 'Unknown', class: 'status-created' };
}

function updateStackStats(stacks) {
    const totalEl = document.getElementById('total-stacks');
    if (totalEl) totalEl.textContent = stacks.length;

    const runningEl = document.getElementById('running-stacks');
    if (runningEl) runningEl.textContent = stacks.filter(s => s.status === 'running').length;

    const failedEl = document.getElementById('failed-stacks');
    if (failedEl) failedEl.textContent = stacks.filter(s => s.status === 'failed').length;
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