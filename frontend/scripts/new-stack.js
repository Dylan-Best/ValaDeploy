document.addEventListener('DOMContentLoaded', () => {
    // Initialisation des composants partagés (sidebar, etc.)
    if (typeof loadComponents === 'function') {
        loadComponents();
    }

    // Gestion du sélecteur de composant
    const addBtn = document.getElementById('add-component-btn');
    const picker = document.getElementById('component-picker');
    
    if (addBtn && picker) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleComponentPicker();
        });

        document.addEventListener('click', (e) => {
            if (!picker.contains(e.target) && !addBtn.contains(e.target)) {
                closeComponentPicker();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeComponentPicker();
        });

        picker.querySelectorAll('.component-picker-option').forEach(option => {
            option.addEventListener('click', () => {
                const kind = option.dataset.kind;
                closeComponentPicker();
                addComponent(kind);
            });
        });
    }

    // Délégation d'événements pour les composants et variables d'env
    document.getElementById('componentsContainer').addEventListener('click', (e) => {
        // Supprimer un composant
        if (e.target.closest('.remove-component-btn')) {
            const card = e.target.closest('.component-card');
            if (document.querySelectorAll('.component-card').length > 1) {
                card.remove();
                updateConnectors();
            } else {
                alert("Une stack doit contenir au moins un composant.");
            }
        }
        
        // Ajouter une variable d'environnement
        if (e.target.closest('.add-env-var-btn')) {
            const list = e.target.closest('.add-env-var-btn').parentElement.nextElementSibling;
            const newRow = document.createElement('div');
            newRow.className = 'flex items-center gap-sm env-var-row';
            newRow.innerHTML = `
                <input class="env-key flex-1 h-10 border border-outline-variant rounded px-md font-mono-code text-mono-code bg-surface-container-low text-on-surface focus:outline-none focus:border-on-surface transition-colors" placeholder="CLÉ" type="text"/>
                <span class="text-on-surface-variant font-mono-code">=</span>
                <div class="flex-1 relative">
                    <input class="env-value w-full h-10 border border-outline-variant rounded px-md pr-10 font-mono-code text-mono-code bg-transparent text-on-surface focus:outline-none focus:border-on-surface transition-colors" placeholder="VALEUR" type="password"/>
                    <button type="button" class="absolute right-2 top-2 text-on-surface-variant hover:text-on-surface transition-colors toggle-visibility-btn" title="Afficher/Masquer">
                        <span class="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                </div>
                <button type="button" class="w-10 h-10 flex-shrink-0 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors border border-transparent hover:border-outline-variant rounded remove-env-var-btn">
                    <span class="material-symbols-outlined text-[18px]">close</span>
                </button>
            `;
            list.appendChild(newRow);
        }

        // Supprimer une variable d'environnement
        if (e.target.closest('.remove-env-var-btn')) {
            e.target.closest('.env-var-row').remove();
        }

        // Basculer la visibilité d'une variable
        if (e.target.closest('.toggle-visibility-btn')) {
            const btn = e.target.closest('.toggle-visibility-btn');
            const input = btn.parentElement.querySelector('.env-value');
            const icon = btn.querySelector('.material-symbols-outlined');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility';
                btn.classList.remove('text-primary');
                btn.classList.add('text-on-surface-variant');
            } else {
                input.type = 'password';
                icon.textContent = 'visibility_off';
                btn.classList.remove('text-on-surface-variant');
                btn.classList.add('text-primary');
            }
        }
    });
});

function toggleComponentPicker() {
    const picker = document.getElementById('component-picker');
    picker.classList.toggle('hidden');
}

function closeComponentPicker() {
    const picker = document.getElementById('component-picker');
    if (picker) picker.classList.add('hidden');
}

function updateConnectors() {
    // Le CSS gère déjà le :last-child, cette fonction est là pour d'éventuels futurs ajustements
}

function addComponent(kind) {
    if (!kind || !['database', 'back', 'front'].includes(kind)) return;

    const container = document.getElementById('componentsContainer');
    const div = document.createElement('div');
    div.className = 'stack-item relative pb-lg component-card';
    div.dataset.kind = kind;

    let innerHTML = '';
    
    if (kind === 'database') {
        innerHTML = `
            <div class="stack-connector"></div>
            <div class="bg-surface-container-lowest border border-outline-variant rounded-lg p-lg md:p-xl relative z-10 hover:border-outline transition-colors">
                <div class="flex items-center gap-md mb-lg border-b border-outline-variant pb-md">
                    <div class="w-8 h-8 rounded bg-surface-variant flex items-center justify-center text-tertiary border border-outline-variant">
                        <span class="material-symbols-outlined text-[18px]">database</span>
                    </div>
                    <input class="component-name font-label-md text-label-md font-bold text-on-surface bg-transparent border-none p-0 focus:ring-0 focus:outline-none w-auto" placeholder="Nom (ex: db)" type="text" value="database" required/>
                    <input type="hidden" class="component-kind" value="database">
                    <button class="ml-auto text-on-surface-variant hover:text-error transition-colors remove-component-btn" type="button"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
                    <div>
                        <label class="block font-label-md text-label-md text-on-surface mb-xs">Image Docker</label>
                        <input class="component-db-image w-full h-10 border border-outline-variant rounded px-md font-mono-code text-body-sm bg-transparent text-on-surface focus:outline-none focus:border-on-surface transition-colors" placeholder="postgres:15-alpine" type="text" required/>
                    </div>
                    <div>
                        <label class="block font-label-md text-label-md text-on-surface mb-xs">Nom du Volume</label>
                        <input class="component-volume-name w-full h-10 border border-outline-variant rounded px-md font-mono-code text-body-sm bg-transparent text-on-surface focus:outline-none focus:border-on-surface transition-colors" placeholder="slug-pgdata" type="text" required/>
                    </div>
                </div>
            </div>`;
    } else {
        innerHTML = `
            <div class="stack-connector"></div>
            <div class="bg-surface-container-lowest border border-outline-variant rounded-lg p-lg md:p-xl relative z-10 hover:border-outline transition-colors">
                <div class="flex items-center gap-md mb-lg border-b border-outline-variant pb-md">
                    <div class="w-8 h-8 rounded bg-surface-variant flex items-center justify-center text-primary border border-outline-variant">
                        <span class="material-symbols-outlined text-[18px]">${kind === 'front' ? 'web' : 'dns'}</span>
                    </div>
                    <input class="component-name font-label-md text-label-md font-bold text-on-surface bg-transparent border-none p-0 focus:ring-0 focus:outline-none w-auto" placeholder="Nom (ex: back)" type="text" value="${kind}" required/>
                    <input type="hidden" class="component-kind" value="${kind}">
                    <button class="ml-auto text-on-surface-variant hover:text-error transition-colors remove-component-btn" type="button"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-lg mb-xl">
                    <div class="md:col-span-2">
                        <label class="block font-label-md text-label-md text-on-surface mb-xs">URL du dépôt Git</label>
                        <div class="flex relative">
                            <span class="absolute left-3 top-2.5 text-on-surface-variant"><span class="material-symbols-outlined text-[18px]">link</span></span>
                            <input class="component-repo-url w-full h-10 border border-outline-variant rounded pl-10 pr-md font-body-sm text-body-sm bg-transparent text-on-surface focus:outline-none focus:border-on-surface transition-colors" placeholder="https://github.com/org/repo.git" type="url" required/>
                        </div>
                    </div>
                    <div>
                        <label class="block font-label-md text-label-md text-on-surface mb-xs">Branche</label>
                        <input class="component-branch w-full h-10 border border-outline-variant rounded px-md font-mono-code text-body-sm bg-transparent text-on-surface focus:outline-none focus:border-on-surface transition-colors" placeholder="main" type="text" value="main" required/>
                    </div>
                    <div>
                        <label class="block font-label-md text-label-md text-on-surface mb-xs">Port d'écoute</label>
                        <input class="component-port w-full h-10 border border-outline-variant rounded px-md font-mono-code text-body-sm bg-transparent text-on-surface focus:outline-none focus:border-on-surface transition-colors" placeholder="8080" type="number" required/>
                    </div>
                    <div class="md:col-span-2 flex items-center gap-2 mt-2">
                        <input type="checkbox" class="component-expose-publicly w-4 h-4 text-primary border-outline-variant rounded focus:ring-0" checked>
                        <label class="font-body-sm text-body-sm text-on-surface cursor-pointer select-none">Exposer publiquement via Traefik</label>
                    </div>
                </div>
                
                <div class="mt-lg pt-lg border-t border-outline-variant">
                    <div class="flex items-center justify-between mb-md">
                        <h4 class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Variables d'environnement</h4>
                        <button type="button" class="text-label-md font-label-md text-on-surface-variant hover:text-on-surface flex items-center gap-1 transition-colors add-env-var-btn">
                            <span class="material-symbols-outlined text-[16px]">add</span> Ajouter
                        </button>
                    </div>
                    <div class="max-h-64 overflow-y-auto pr-2 space-y-sm env-vars-list"></div>
                </div>
            </div>`;
    }

    div.innerHTML = innerHTML;
    const addButton = container.lastElementChild;
    container.insertBefore(div, addButton);
    div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Gère la soumission du formulaire et construit le payload pour l'API
 */
async function handleStackSubmit(event) {
    event.preventDefault();
    
    const slug = document.getElementById('stack_slug').value.trim();
    const componentCards = document.querySelectorAll('.component-card');
    const components = [];

    componentCards.forEach(card => {
        const kind = card.querySelector('.component-kind').value;
        const name = card.querySelector('.component-name').value.trim();
        
        const componentData = {
            name: name,
            kind: kind,
            replica: 1 // Valeur par défaut, à adapter si tu ajoutes un champ replica plus tard
        };

        if (kind === 'database') {
            componentData.db_image = card.querySelector('.component-db-image').value.trim();
            componentData.volume_name = card.querySelector('.component-volume-name').value.trim();
        } else {
            componentData.repo_url = card.querySelector('.component-repo-url').value.trim();
            componentData.branch = card.querySelector('.component-branch').value.trim();
            componentData.port = parseInt(card.querySelector('.component-port').value, 10);
            componentData.expose_publicly = card.querySelector('.component-expose-publicly').checked;
            
            // ⚠️ CONVERSION : Le backend attend un dictionnaire {"CLÉ": "VALEUR"}, pas un tableau
            const envsVarDict = {};
            card.querySelectorAll('.env-var-row').forEach(row => {
                const key = row.querySelector('.env-key').value.trim();
                const value = row.querySelector('.env-value').value;
                if (key) {
                    envsVarDict[key] = value;
                }
            });
            componentData.envs_var = envsVarDict; // Nom exact attendu par le backend
        }

        components.push(componentData);
    });

    const payload = {
        slug: slug,
        components: components
    };

    console.log("Payload à envoyer:", JSON.stringify(payload, null, 2));

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> Déploiement en cours...`;

    try {
        // Appel à la fonction API que nous venons de créer
        const response = await createStack(payload);
        
        console.log("Réponse du serveur:", response);
        alert(`Stack "${slug}" enregistrée et déploiement lancé !`);
        
        // Redirection vers la page de pipeline en utilisant le project_id retourné par le backend

        window.location.href = `pipeline.html?project_id=${response.project_id}`;

    } catch (error) {
        console.error("Erreur de déploiement:", error);
        alert(`Échec du déploiement : ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}