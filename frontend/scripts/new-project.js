// new-project.js
// Gestion du formulaire de création de projet

document.addEventListener('DOMContentLoaded', async () => {
    // Vérifie la session avant d'afficher le formulaire.
    // Réutilise getProjects() qui passe déjà par fetchWithAutoRefresh
    // (donc essaie le refresh token avant d'abandonner).
    try {
        await getProjects();
    } catch (err) {
        console.warn('Session invalide, redirection vers login:', err);
        window.location.href = 'login.html';
        return; // stoppe l'exécution, n'initialise rien du formulaire
    }

    setupSlugPreview();
    setupEnvVarRows();
    setupFormSubmit();
});


// --- Aperçu du sous-domaine (slug -> nom.ip-serveur.sslip.io), reflète RG-05 ---
function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function setupSlugPreview() {
    const nameInput = document.getElementById('projectName');
    const preview = document.getElementById('slug-preview');
    if (!nameInput || !preview) return;

    nameInput.addEventListener('input', () => {
        const slug = slugify(nameInput.value) || 'your-project';
        preview.textContent = `${slug}.<server-ip>.sslip.io`;
    });
}

// --- Lignes de variables d'environnement dynamiques ---
function createEnvVarRow() {
    const row = document.createElement('div');
    row.className = 'flex gap-sm items-center env-var-row';
    row.innerHTML = `
        <div class="flex-1 flex rounded-lg border border-outline-variant focus-within:border-on-surface transition-colors overflow-hidden">
            <input class="env-key w-1/3 bg-surface-container-low border-0 border-r border-outline-variant px-md py-sm font-mono-code text-body-sm text-on-surface focus:ring-0" placeholder="KEY" type="text">
            <input class="env-value flex-1 bg-transparent border-0 px-md py-sm font-mono-code text-body-sm text-on-surface focus:ring-0" placeholder="VALUE" type="text">
        </div>
        <div class="flex items-center gap-xs px-sm">
            <input class="env-secret rounded border-outline-variant text-primary focus:ring-primary" type="checkbox">
            <label class="font-label-md text-label-md text-on-surface-variant">Secret</label>
        </div>
        <button class="remove-env-var p-xs text-on-surface-variant hover:text-error transition-colors" type="button">
            <span class="material-symbols-outlined text-[20px]">delete</span>
        </button>
    `;

    // Bascule le type de l'input VALUE en "password" quand "Secret" est coché
    const secretCheckbox = row.querySelector('.env-secret');
    const valueInput = row.querySelector('.env-value');
    secretCheckbox.addEventListener('change', () => {
        valueInput.type = secretCheckbox.checked ? 'password' : 'text';
    });

    row.querySelector('.remove-env-var').addEventListener('click', () => row.remove());

    return row;
}

function setupEnvVarRows() {
    const container = document.getElementById('env-vars-container');
    const addButton = document.getElementById('add-env-var');
    if (!container || !addButton) return;

    // Ajouter une ligne vide par défaut si le conteneur est vide
    if (container.children.length === 0) {
        container.appendChild(createEnvVarRow());
    }

    addButton.addEventListener('click', () => {
        container.appendChild(createEnvVarRow());
    });
}

function collectEnvVars() {
    const rows = document.querySelectorAll('.env-var-row');
    const envVars = {};
    rows.forEach((row) => {
        const key = row.querySelector('.env-key').value.trim();
        const value = row.querySelector('.env-value').value;
        if (key) envVars[key] = value;
    });
    return envVars;
}

// --- Soumission du formulaire ---
function setupFormSubmit() {
    const form = document.querySelector('form');
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (!form || !submitBtn) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        // 1. Récupérer les données du formulaire
        const projectName = document.getElementById('projectName')?.value.trim();
        const gitUrl = document.getElementById('gitUrl')?.value.trim();
        const branch = document.getElementById('branch')?.value.trim() || 'main';
        const replicas = parseInt(document.getElementById('replicas')?.value, 10) || 1;

        // 2. Validation basique
        if (!projectName) {
            alert('Le nom du projet est requis');
            return;
        }
        if (!gitUrl) {
            alert('L\'URL du dépôt Git est requise');
            return;
        }

        // 3. Construire le payload
        const payload = {
            slug: slugify(projectName),
            repo_url: gitUrl,
            branch: branch,
            replica: replicas,
            envs_var: collectEnvVars(),
        };

        console.log('Payload prêt pour /deploy :', payload);

        // 4. Sauvegarder le texte original du bouton pour le restaurer
        const originalText = submitBtn.innerHTML;

        // 5. Désactiver le bouton pendant l'appel
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            Déploiement en cours...
        `;

        try {
            // 6. Appeler l'API de création (createProject est dans projects.js)
            const result = await createProject(payload);
            console.log('Projet créé avec succès:', result);

            // 7. Rediriger vers le dashboard
            window.location.href = 'dashboard.html';

        } catch (error) {
            console.error('Erreur lors du déploiement:', error);

            // Afficher une erreur plus parlante
            let errorMessage = 'Une erreur est survenue lors du déploiement.';
            if (error.message) {
                // Si l'erreur vient du backend, elle est déjà formatée
                errorMessage = error.message;
            }
            alert(`${errorMessage}`);

            // 8. Réactiver le bouton
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}