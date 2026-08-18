// Comportement de la page Security Report.
//
// IMPORTANT (limitation backend actuelle, voir échange avec l'équipe backend) :
// - Il n'existe aucun endpoint pour récupérer les résultats de scan d'un projet
//   (ni pendant, ni après le déploiement). scan_image()/detect_secret() sont
//   appelés en interne dans /clone mais leurs résultats ne sont renvoyés que
//   dans le message d'erreur en cas de blocage.
// - scan_image() ne retourne que des COMPTEURS par sévérité, pas la liste
//   détaillée de chaque CVE (package, description, version corrigée...).
// - detect_secret() ne retourne le détail que du PREMIER secret trouvé.
//
// TODO (backend) pour égaler cette page à terme :
//   1. GET /projects/{slug}/security -> dernier résultat de scan persisté
//   2. Étendre scan_image() pour retourner la liste des vulnérabilités
//      (pas seulement severity_count), similaire à la structure Trivy brute :
//      { id, package, severity, installed_version, fixed_version, title }
//   3. Étendre detect_secret() pour retourner TOUS les secrets, pas juste le 1er
//
// En attendant, cette page affiche des données d'exemple respectant la forme
// RÉELLE actuelle du backend (severity_count + un seul secret détaillé).

document.addEventListener('DOMContentLoaded', () => {
    const slug = new URLSearchParams(window.location.search).get('slug') || 'unknown-project';
    document.getElementById('project-slug').textContent = slug;

    // Exemple respectant exactement la forme retournée par scan_image()
    const trivyResult = {
        severity_count: { CRITICAL: 3, HIGH: 5, MEDIUM: 12, LOW: 20, UNKNOWN: 2 },
        blocking: true,
    };

    // Exemple respectant exactement la forme retournée par detect_secret()
    const gitleaksResult = {
        blocking: false,
        secret_count: 0,
        secret_found: null,
    };

    renderSummary(trivyResult, gitleaksResult);
    renderTrivyCounts(trivyResult);
    renderGitleaksResult(gitleaksResult);
});

function renderSummary(trivyResult, gitleaksResult) {
    const badge = document.getElementById('scan-status-badge');
    const blocked = trivyResult.blocking || gitleaksResult.blocking;

    badge.textContent = blocked ? 'Deployment Blocked' : 'Passed';
    badge.className = blocked
        ? 'flex items-center gap-2 px-4 py-2 border border-error text-error rounded-full font-label-md text-label-md bg-white'
        : 'flex items-center gap-2 px-4 py-2 border border-[#12B76A] text-[#12B76A] rounded-full font-label-md text-label-md bg-white';
}

function renderTrivyCounts(trivyResult) {
    const counts = trivyResult.severity_count;
    document.getElementById('count-critical').textContent = counts.CRITICAL || 0;
    document.getElementById('count-high').textContent = counts.HIGH || 0;
    document.getElementById('count-medium').textContent = counts.MEDIUM || 0;
    document.getElementById('count-low').textContent = counts.LOW || 0;
}

function renderGitleaksResult(gitleaksResult) {
    const container = document.getElementById('gitleaks-section');

    if (gitleaksResult.secret_count === 0) {
        container.innerHTML = `
            <div class="flex items-center gap-2 text-[#12B76A] font-body-sm text-body-sm">
                <span class="material-symbols-outlined text-[18px]">check_circle</span>
                No secrets detected in the repository history.
            </div>`;
        return;
    }

    const secret = gitleaksResult.secret_found;
    const extraNote = gitleaksResult.secret_count > 1
        ? `<p class="font-body-sm text-body-sm text-secondary mt-sm italic">${gitleaksResult.secret_count} secrets detected in total — only the first is shown (backend limitation, see TODO).</p>`
        : '';

    container.innerHTML = `
        <div class="py-md flex flex-col md:flex-row gap-md md:items-center justify-between">
            <div class="flex-1">
                <div class="flex items-center gap-sm mb-xs">
                    <span class="font-mono-code text-mono-code text-on-surface font-medium">${secret.rule_id}</span>
                    <span class="px-2 py-0.5 border border-outline rounded text-xs font-mono-code text-secondary">${secret.file}</span>
                </div>
                <div class="text-secondary text-sm">${secret.description}</div>
            </div>
            <div class="font-body-sm text-body-sm text-secondary md:text-right">
                <div>Line ${secret.line}</div>
            </div>
        </div>
        ${extraNote}`;
}
