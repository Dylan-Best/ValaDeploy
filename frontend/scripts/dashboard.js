// dashboard.js
// Chargement des projets et affichage dans le tableau

document.addEventListener('DOMContentLoaded', () => {
    initUserSession(
        async (user) => {
            // 1. Afficher le nom de l'utilisateur
            const fullnameEl = document.getElementById('user-fullname');
            if (fullnameEl) fullnameEl.textContent = user.full_name;

            // 2. Charger les projets
            try {
                const projects = await getProjects();
                renderProjects(projects);
            } catch (error) {
                console.error('Erreur chargement projets:', error);
                // Afficher une erreur dans le tableau
                const tbody = document.getElementById('projects-table-body');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" class="py-lg text-center text-error">
                                ❌ Erreur de chargement des projets: ${error.message || 'Erreur inconnue'}
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

function renderProjects(projects) {
    const tbody = document.getElementById('projects-table-body');
    if (!tbody) return;

    // Supprimer la ligne de chargement et la ligne vide
    const loadingRow = document.getElementById('loading-row');
    const emptyRow = document.getElementById('empty-row');

    // Vider le tableau
    tbody.innerHTML = '';

    // Si pas de projets, afficher le message vide
    if (projects.length === 0) {
        if (emptyRow) {
            tbody.appendChild(emptyRow);
            emptyRow.style.display = '';
        }
        return;
    }

    // Pour chaque projet, créer une ligne
    projects.forEach(project => {
        const row = createProjectRow(project);
        tbody.appendChild(row);
    });

    // Mettre à jour les statistiques
    updateStats(projects);
}

function createProjectRow(project) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-surface-container transition-colors group';
    row.dataset.projectId = project.id;

    // Déterminer le statut et la couleur
    const statusConfig = getStatusConfig(project.status);

    // Formater la date
    const createdDate = project.created_at ? new Date(project.created_at) : null;
    const dateStr = createdDate ? createdDate.toLocaleDateString('fr-FR') : 'Date inconnue';

    // URL du service (si running)
    const url = project.status === 'running' 
        ? `${project.slug}.sslip.io` 
        : 'not yet deployed';

    row.innerHTML = `
        <td class="py-md px-lg">
            <div class="font-mono-code text-mono-code font-medium">${project.slug}</div>
            <div class="font-body-sm text-body-sm text-secondary">${url}</div>
        </td>
        <td class="py-md px-lg">
            <div class="status-badge ${statusConfig.class}">
                <div class="status-dot"></div>
                <span class="font-label-sm text-label-sm">${statusConfig.label}</span>
            </div>
        </td>
        <td class="py-md px-lg font-mono-code text-mono-code text-secondary">${project.commit_hash ? project.commit_hash.substring(0, 7) : '—'}</td>
        <td class="py-md px-lg text-secondary">${project.replica || 1}</td>
        <td class="py-md px-lg text-right">
            <a href="project-detail.html?id=${project.id}" 
               class="text-secondary hover:text-on-surface transition-colors opacity-0 group-hover:opacity-100 inline-flex items-center gap-xs">
                <span class="font-label-sm text-label-sm">Voir</span>
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

    // Conteneurs en cours d'exécution (projets avec status 'running')
    const runningEl = document.getElementById('running-containers');
    if (runningEl) {
        const runningCount = projects.filter(p => p.status === 'running').length;
        runningEl.textContent = runningCount;
    }

    // Vulnérabilités critiques (TODO: à implémenter quand on aura les scans)
    // Pour l'instant, on met 0
    const vulnsEl = document.getElementById('critical-vulns');
    if (vulnsEl) vulnsEl.textContent = '0';
}