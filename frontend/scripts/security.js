// scripts/security.js
// Liste globale des projets avec leur statut de sécurité

document.addEventListener('DOMContentLoaded', () => {
    initUserSession(
        async () => {
            try {
                const reports = await getSecurityList();
                renderSecurityTable(reports);
            } catch (error) {
                console.error('Erreur chargement rapports de sécurité:', error);
                
                // Notification d'erreur
                ValaToast.show({ type: 'error', title: 'Erreur de chargement', message: 'Impossible de récupérer les rapports de sécurité.' });
                
                document.getElementById('security-table-body').innerHTML = `
                    <tr><td colspan="6" class="py-lg text-center text-on-surface-variant">
                        Impossible d'afficher les données de sécurité pour le moment.
                    </td></tr>`;
            }
        },
        (error) => {
            console.log('Session invalide ou expirée :', error.message);
            window.location.href = "login.html";
        }
    );
});

function renderSecurityTable(reports) {
    const tbody = document.getElementById('security-table-body');
    tbody.innerHTML = '';

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-lg text-center text-secondary">No projects yet.</td></tr>`;
        return;
    }

    reports.forEach(report => {
        tbody.appendChild(createSecurityRow(report));
    });
}

function createSecurityRow(report) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-surface-container transition-colors group border-b border-outline-variant';

    const blocked = report.fail_reason === 'VULNERABILITY' || report.fail_reason === 'SECRET_LEAK';
    const scanBadge = blocked
        ? `<span class="inline-flex items-center gap-2 px-3 py-1 border border-error text-error rounded-full font-label-sm text-label-sm">Blocked</span>`
        : `<span class="inline-flex items-center gap-2 px-3 py-1 border border-[#12B76A] text-[#12B76A] rounded-full font-label-sm text-label-sm">Passed</span>`;

    const deployStatus = getStatusConfig(report.status);

    row.innerHTML = `
        <td class="py-md px-lg font-mono-code text-mono-code font-medium">${report.slug}</td>
        <td class="py-md px-lg">
            <div class="status-badge ${deployStatus.class}">
                <div class="status-dot"></div>
                <span class="font-label-sm text-label-sm">${deployStatus.label}</span>
            </div>
        </td>
        <td class="py-md px-lg ${report.critical_vuln_count > 0 ? 'text-error' : 'text-secondary'}">${report.critical_vuln_count}</td>
        <td class="py-md px-lg ${report.secret_count > 0 ? 'text-error' : 'text-secondary'}">${report.secret_count}</td>
        <td class="py-md px-lg">${scanBadge}</td>
        <td class="py-md px-lg text-right">
            <a href="security-details.html?slug=${report.slug}"
               class="text-secondary hover:text-on-surface transition-colors opacity-0 group-hover:opacity-100 inline-flex items-center gap-xs">
                <span class="font-label-sm text-label-sm">Report</span>
                <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </a>
        </td>
    `;
    return row;
}

// Réutilise le même mapping que dashboard.js (dupliqué ici volontairement,
// les deux fichiers sont chargés sur des pages différentes)
function getStatusConfig(status) {
    const configs = {
        'running': { label: 'Running', class: 'status-running' },
        'stopped': { label: 'Stopped', class: 'status-stopped' },
        'building': { label: 'Building', class: 'status-building' },
        'failed': { label: 'Failed', class: 'status-error' }
    };
    return configs[status] || { label: status || 'Unknown', class: 'status-created' };
}