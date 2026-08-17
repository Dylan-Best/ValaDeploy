// Comportement de la page New Project.

document.addEventListener('DOMContentLoaded', () => {
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
    if (!form) return;

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const payload = {
            slug: slugify(document.getElementById('projectName').value),
            repo_url: document.getElementById('gitUrl').value.trim(),
            branch: document.getElementById('branch').value.trim() || 'main',
            replica: parseInt(document.getElementById('replicas').value, 10) || 1,
            envs_var: collectEnvVars(),
        };

        // TODO (intégration backend) :
        // - envs_var contient actuellement des valeurs EN CLAIR.
        //   Le backend attend des valeurs déjà chiffrées (Fernet) dans /clone.
        //   Le chiffrement ne doit jamais se faire côté client (la clé Fernet
        //   ne doit pas être exposée au navigateur) : soit le backend accepte
        //   du clair et chiffre lui-même à la création, soit prévoir un
        //   endpoint dédié. À trancher avec le backend avant de brancher ce fetch.
        //
        // - Appel réel à prévoir ici, ex:
        //   const res = await fetch(`${API_BASE_URL}/clone`, {
        //       method: 'POST',
        //       headers: { 'Content-Type': 'application/json' },
        //       body: JSON.stringify(payload),
        //   });

        console.log('Payload prêt pour /clone (envs_var non chiffrés, voir TODO) :', payload);
    });
}
