// scripts/stacks.js
// Chargement des stacks et affichage en table avec accordéon pour les composants

document.addEventListener('DOMContentLoaded', () => {
    initUserSession(
        async (user) => {
            const fullnameEl = document.getElementById('user-fullname');
            if (fullnameEl) fullnameEl.textContent = user.full_name;

            try {
                const stacks = await getStacks();
                renderStacks(stacks);
            } catch (error) {
                console.error('Erreur chargement stacks:', error);
                const tbody = document.getElementById('stacks-table-body');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" class="py-lg text-center text-error">
                                Erreur de chargement des stacks: ${error.message || 'Erreur inconnue'}
                            </td>
                        </tr>
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

// Cache des détails déjà chargés, pour ne pas re-fetch à chaque toggle de la flèche
const componentDetailCache = {};

function renderStacks(stacks) {
    const tbody = document.getElementById('stacks-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (stacks.length === 0) {
        const emptyRow = document.getElementById('empty-row');
        if (emptyRow) {
            tbody.appendChild(emptyRow);
            emptyRow.style.display = '';
        }
        updateStackStats([]);
        return;
    }

    stacks.forEach(stack => {
        const mainRow = createStackRow(stack);
        const detailRow = createDetailRow(stack);
        tbody.appendChild(mainRow);
        tbody.appendChild(detailRow);
    });

    updateStackStats(stacks);
}

function createStackRow(stack) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-surface-container transition-colors group border-b border-outline-variant';
    row.dataset.projectId = stack.project_id;

    const statusConfig = getStatusConfig(stack.status);
    const createdDate = stack.created_at ? new Date(stack.created_at) : null;
    const dateStr = createdDate ? createdDate.toLocaleDateString('fr-FR') : 'Date inconnue';

    row.innerHTML = `
        <td class="py-md px-lg">
            <div class="flex items-center gap-sm">
                <button class="stack-toggle text-secondary hover:text-on-surface transition-colors" aria-expanded="false" aria-label="Voir les composants">
                    <span class="material-symbols-outlined text-[20px] toggle-icon">chevron_right</span>
                </button>
                <div class="font-mono-code text-mono-code font-medium">${stack.slug}</div>
            </div>
        </td>
        <td class="py-md px-lg">
            <div class="status-badge ${statusConfig.class}">
                <div class="status-dot"></div>
                <span class="font-label-sm text-label-sm">${statusConfig.label}</span>
            </div>
        </td>
        <td class="py-md px-lg text-secondary">${stack.component_count} composant${stack.component_count > 1 ? 's' : ''}</td>
        <td class="py-md px-lg text-secondary">${dateStr}</td>
        <td class="py-md px-lg text-right">
            <a href="project-detail.html?slug=${stack.slug}"
               class="text-secondary hover:text-on-surface transition-colors opacity-0 group-hover:opacity-100 inline-flex items-center gap-xs">
                <span class="font-label-sm text-label-sm">Voir</span>
                <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </a>
        </td>
    `;

    const toggleBtn = row.querySelector('.stack-toggle');
    toggleBtn.addEventListener('click', () => toggleStackDetail(stack.project_id));

    return row;
}

function createDetailRow(stack) {
    const row = document.createElement('tr');
    row.className = 'stack-detail-row';
    row.dataset.detailFor = stack.project_id;
    row.style.display = 'none';

    row.innerHTML = `
        <td colspan="5" class="px-lg pb-md pt-0">
            <div class="bg-surface-container-low border border-outline-variant rounded-lg overflow-hidden ml-xl" id="components-${stack.project_id}">
                <div class="py-md px-lg text-center text-secondary text-body-sm">
                    <span class="material-symbols-outlined text-[18px] animate-spin align-middle">progress_activity</span>
                    Chargement des composants...
                </div>
            </div>
        </td>
    `;

    return row;
}

async function toggleStackDetail(projectId) {
    const detailRow = document.querySelector(`tr[data-detail-for="${projectId}"]`);
    const mainRow = document.querySelector(`tr[data-project-id="${projectId}"]`);
    if (!detailRow || !mainRow) return;

    const toggleBtn = mainRow.querySelector('.stack-toggle');
    const icon = toggleBtn.querySelector('.toggle-icon');
    const isOpen = detailRow.style.display !== 'none';

    if (isOpen) {
        detailRow.style.display = 'none';
        toggleBtn.setAttribute('aria-expanded', 'false');
        icon.textContent = 'chevron_right';
        return;
    }

    detailRow.style.display = '';
    toggleBtn.setAttribute('aria-expanded', 'true');
    icon.textContent = 'expand_more';

    // Chargement paresseux : on ne fetch le détail qu'au premier dépliage
    if (!componentDetailCache[projectId]) {
        try {
            const detail = await getStackDetail(projectId);
            componentDetailCache[projectId] = detail;
        } catch (error) {
            const container = document.getElementById(`components-${projectId}`);
            if (container) {
                container.innerHTML = `
                    <div class="py-md px-lg text-center text-error text-body-sm">
                        Erreur de chargement: ${error.message || 'Erreur inconnue'}
                    </div>
                `;
            }
            return;
        }
    }

    renderComponents(projectId, componentDetailCache[projectId]);
}

function renderComponents(projectId, detail) {
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
        return `
            <div class="flex items-center justify-between py-sm px-lg border-b border-outline-variant last:border-b-0">
                <div class="flex items-center gap-md">
                    <span class="font-mono-code text-mono-code text-on-surface">${c.name}</span>
                    <span class="font-label-sm text-label-sm text-secondary uppercase tracking-wider">${kindLabel}</span>
                </div>
                <div class="flex items-center gap-lg">
                    ${c.error_message ? `<span class="text-body-sm text-error">${c.error_message}</span>` : ''}
                    <div class="status-badge ${statusConfig.class}">
                        <div class="status-dot"></div>
                        <span class="font-label-sm text-label-sm">${statusConfig.label}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = rows;
}

function getStatusConfig(status) {
    // Même logique que dashboard.js — dupliquée ici pour garder stacks.js autonome
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
