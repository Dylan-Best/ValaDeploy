// api/dashboard.js
// Chargement des projets et affichage dans le tableau

document.addEventListener('DOMContentLoaded', () => {
    initUserSession(
        async (user) => {
            const fullnameEl = document.getElementById('user-fullname');
            if (fullnameEl) fullnameEl.textContent = user.full_name;

            try {
                const projects = await getProjects();
                renderProjects(projects);
            } catch (error) {
                console.error('Erreur chargement projets:', error);
                    
                if (typeof ValaToast !== 'undefined') {
                    ValaToast.show({
                        type: 'error',
                        title: 'Erreur de chargement',
                        message: error.message || 'Impossible de récupérer la liste des projets.',
                        duration: 6000
                    });
                }
                const tbody = document.getElementById('projects-table-body');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" class="py-lg text-center text-on-surface-variant">
                                Impossible d'afficher les projets pour le moment.
                            </td>
                        </tr>
                    `;
                }
            }

            // Charge les stats dashboard séparément (ne bloque pas l'affichage des projets)
            try {
                const stats = await getDashboardStats();
                renderDashboardStats(stats);
            } catch (error) {
                console.error('Erreur chargement stats dashboard:', error);
            }
        },
        (error) => {
            console.log('Session invalide ou expirée :', error.message);
            window.location.href = "login.html";
        }
    );
});

// Liste complète des projets chargés, gardée en mémoire pour le filtrage côté client
let allProjects = [];

// Palette de badges avatar (douce, pas de gris "excel") — choisie cycliquement selon le nom du projet
const AVATAR_PALETTE = [
    { bg: 'bg-primary-container/15', text: 'text-primary' },
    { bg: 'bg-tertiary-container/15', text: 'text-tertiary' },
    { bg: 'bg-[#12B76A]/15', text: 'text-[#12B76A]' },
    { bg: 'bg-surface-container-high', text: 'text-on-surface' },
];

function getAvatarStyle(slug) {
    const str = slug || '?';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function renderProjects(projects) {
    allProjects = projects;
    renderTable(projects);
    updateShowingCount(projects.length, projects.length);
    updateStats(projects);
    setupProjectFilter();
}

function renderTable(projects) {
    const tbody = document.getElementById('projects-table-body');
    if (!tbody) return;

    const emptyRow = document.getElementById('empty-row');

    tbody.innerHTML = '';

    if (projects.length === 0) {
        if (emptyRow) {
            tbody.appendChild(emptyRow);
            emptyRow.style.display = '';
        }
        return;
    }

    projects.forEach(project => {
        const row = createProjectRow(project);
        tbody.appendChild(row);
    });
}

function setupProjectFilter() {
    const input = document.getElementById('project-filter');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = 'true';

    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        const filtered = query
            ? allProjects.filter(p => (p.slug || '').toLowerCase().includes(query))
            : allProjects;

        renderTable(filtered);
        updateShowingCount(filtered.length, allProjects.length);
    });
}

function createProjectRow(project) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-surface-container-low transition-colors group';
    row.dataset.projectId = project.id;

    // Déterminer le statut et la couleur
    const statusConfig = getStatusConfig(project.status);

    // URL du service (si running)
    const url = project.status === 'running'
        ? `${project.slug}.sslip.io`
        : 'not yet deployed';

    const initial = (project.slug || '?').charAt(0).toUpperCase();
    const avatar = getAvatarStyle(project.slug);
    const commitShort = project.commit_hash ? project.commit_hash.substring(0, 7) : '—';

    row.innerHTML = `
        <td class="py-md px-lg">
            <div class="flex items-center gap-md">
                <div class="w-9 h-9 rounded-lg ${avatar.bg} ${avatar.text} flex items-center justify-center font-label-md text-label-md font-semibold shrink-0">
                    ${initial}
                </div>
                <div>
                    <div class="font-label-md text-label-md text-on-surface font-semibold">${project.slug}</div>
                    <div class="font-body-sm text-body-sm text-secondary">${url}</div>
                </div>
            </div>
        </td>
        <td class="py-md px-lg">
            <div class="status-badge ${statusConfig.class}">
                <div class="status-dot"></div>
                <span class="font-label-sm text-label-sm">${statusConfig.label}</span>
            </div>
        </td>
        <td class="py-md px-lg font-mono-code text-mono-code text-secondary">${commitShort}</td>
        <td class="py-md px-lg text-secondary">
            <span class="inline-flex items-center gap-xs">
                <span class="w-[6px] h-[6px] rounded-full bg-secondary inline-block"></span>
                ${project.replica || 1}
            </span>
        </td>
        <td class="py-md px-lg text-right">
            <a href="project-detail.html?slug=${project.slug}"
               class="text-on-surface hover:text-primary transition-colors inline-flex items-center gap-xs">
                <span class="font-label-md text-label-md">Voir</span>
                <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </a>
        </td>
    `;

    return row;
}

function getStatusConfig(status) {
    const configs = {
        'running': {
            label: 'Running',
            class: 'status-running'
        },
        'stopped': {
            label: 'Stopped',
            class: 'status-stopped'
        },
        'building': {
            label: 'Building',
            class: 'status-building'
        },
        'failed': {
            label: 'Failed',
            class: 'status-error'
        }
    };
    return configs[status] || {
        label: status || 'Unknown',
        class: 'status-created'
    };
}

function updateStats(projects) {
    // Total projets
    const totalEl = document.getElementById('total-projects');
    if (totalEl) totalEl.textContent = projects.length;

    // Badge count dans l'onglet "Projects"
    const totalBadgeEl = document.getElementById('total-projects-badge');
    if (totalBadgeEl) totalBadgeEl.textContent = projects.length;

    // Conteneurs en cours d'exécution (projets avec status 'running')
    const runningEl = document.getElementById('running-containers');
    if (runningEl) {
        const runningCount = projects.filter(p => p.status === 'running').length;
        runningEl.textContent = runningCount;
    }
}

function updateShowingCount(shown, total) {
    const el = document.getElementById('showing-count');
    if (el) el.textContent = `Showing ${shown} of ${total} projects`;
}

function renderDashboardStats(stats) {
    // Pourcentage d'échecs dus à des vulnérabilités critiques
    const vulnsEl = document.getElementById('critical-vulns');
    if (vulnsEl) vulnsEl.textContent = stats.critical_vuln_percentage + '%';
}