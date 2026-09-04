let currentToken = null;
let currentSlug = null;
let currentComponentId = null;

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  currentSlug = params.get('slug');
  currentComponentId = params.get('component_id');

  if (!currentSlug) {
    const nameEl = document.getElementById('project-name');
    if (nameEl) nameEl.textContent = 'No project specified';
    return;
  }

  document.title = `ValaDeploy - ${currentSlug}`;
  const nameEl = document.getElementById('project-name');
  if (nameEl) nameEl.textContent = currentSlug;

  initUserSession(
    (user, accessToken) => {
      currentToken = accessToken;
      console.log("Session valide, chargement pour:", currentSlug, currentComponentId ? `composant ${currentComponentId}` : 'projet complet');
      
      // 1. Récupérer et afficher le vrai statut depuis la BDD
      fetchAndSetInitialStatus(currentSlug, currentComponentId);
      
      // 2. Démarrer les logs
      startLogsStream(currentSlug, currentComponentId, currentToken);
      
      // 3. Configurer les boutons
      setupControlButtons(currentSlug, currentComponentId);
    },
    (error) => {
      console.error('Erreur lors de l\'initialisation:', error);
      if (error.message && (error.message.includes('Session expirée') || error.message.includes('401'))) {
         window.location.href = 'login.html';
      }
    }
  );
});

// --- Récupération du statut réel ---
function fetchAndSetInitialStatus(slug, componentId) {
    getProjects().then(projects => {
        const project = projects.find(p => p.slug === slug);
        if (!project) return;

        // Si c'est un composant spécifique, on va chercher son statut à lui
        if (componentId && project.id) {
            getStackDetail(project.id).then(detail => {
                const comp = detail.components.find(c => c.id == componentId);
                updateStatusUI(comp ? comp.status : project.status);
            }).catch(() => updateStatusUI(project.status));
        } else {
            updateStatusUI(project.status);
        }
    }).catch(err => console.error("Échec récupération statut:", err));
}

function updateStatusUI(status) {
  const container = document.getElementById('status-badge-container');
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!container || !dot || !text) return;

  // Reset des classes de base
  container.className = 'flex items-center gap-xs px-2 py-1 rounded border font-label-sm text-label-sm uppercase tracking-wider';
  dot.className = 'w-2 h-2 rounded-full';
  
  const statusLower = (status || 'unknown').toLowerCase();

  if (statusLower === 'running') {
    container.classList.add('bg-[#12B76A]/10', 'text-[#12B76A]', 'border-[#12B76A]/20');
    dot.classList.add('bg-[#12B76A]');
    text.textContent = 'Running';
  } else if (statusLower === 'stopped') {
    container.classList.add('bg-gray-500/10', 'text-gray-500', 'border-gray-500/20');
    dot.classList.add('bg-gray-500');
    text.textContent = 'Stopped';
  } else if (statusLower === 'building') {
    container.classList.add('bg-blue-500/10', 'text-blue-500', 'border-blue-500/20');
    dot.classList.add('bg-blue-500', 'animate-pulse');
    text.textContent = 'Building';
  } else if (statusLower === 'failed') {
    container.classList.add('bg-red-500/10', 'text-red-500', 'border-red-500/20');
    dot.classList.add('bg-red-500');
    text.textContent = 'Failed';
  } else {
    container.classList.add('bg-gray-500/10', 'text-gray-500', 'border-gray-500/20');
    dot.classList.add('bg-gray-500');
    text.textContent = status || 'Unknown';
  }
}

// --- Logs ---
function startLogsStream(slug, componentId, accessToken) {
  const terminal = document.getElementById('log-terminal');
  const indicator = document.getElementById('live-indicator');
  if (!terminal || !indicator) return;

  connectLogsWebSocket(slug, componentId, accessToken, {
    onOpen: () => {
      indicator.classList.remove('disconnected');
      indicator.classList.add('connected');
      appendLogLine(terminal, `--- Connected to ${slug} ---`, 'meta');
    },
    onMessage: (data) => {
      appendLogLine(terminal, data, 'default');
    },
    onClose: () => {
      indicator.classList.remove('connected');
      indicator.classList.add('disconnected');
      appendLogLine(terminal, '--- Connection closed ---', 'meta');
    },
    onTokenExpired: (newAccessToken) => {
      currentToken = newAccessToken;
      startLogsStream(slug, componentId, currentToken);
    },
    onError: () => {
      appendLogLine(terminal, '--- Connection error ---', 'error');
    },
  });
}

function appendLogLine(terminal, text, kind) {
  const line = document.createElement('div');
  if (kind === 'meta') line.className = 'text-[#666]';
  if (kind === 'error') line.className = 'text-error';
  line.textContent = text;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

// --- Start / Stop / Restart ---
function setupControlButtons(slug, componentId) {
  const btnStop = document.getElementById('btn-stop');
  const btnRestart = document.getElementById('btn-restart');
  const btnStart = document.getElementById('btn-start');
  const terminal = document.getElementById('log-terminal');

    const callAction = async (action) => {
    // Désactiver les boutons
    [btnStop, btnRestart, btnStart].forEach(btn => { if(btn) btn.disabled = true; });
    appendLogLine(terminal, `--- Demande d'action: ${action.toUpperCase()} ---`, 'meta');

    try {
      const result = await executeProjectAction(slug, action, componentId);
      
      //Gestion robuste : si result est null ou n'a pas de message, on met un message par défaut(sinon les logs ne continueront pas à s'afficher correctement)
      const successMessage = (result && result.message) ? result.message : `Action '${action}' traitée avec succès`;
      appendLogLine(terminal, `--- SUCCÈS: ${successMessage} ---`, 'meta');
      
      const actionLabel = action === 'stop' ? 'arrêté' : (action === 'start' ? 'démarré' : 'redémarré');
      ValaToast.show({ 
          type: 'success', 
          title: 'Action réussie', 
          message: `Le conteneur a bien été ${actionLabel}.` 
      });

      // 1. Mettre à jour le badge de statut immédiatement (optimiste)
      const newStatus = (action === 'stop') ? 'stopped' : 'running';
      updateStatusUI(newStatus);

      // 2. Reconnecter les logs automatiquement après un start ou restart
      if (action === 'start' || action === 'restart') {
         appendLogLine(terminal, `--- Reconnexion aux logs en cours (délai de 2s)... ---`, 'meta');
         setTimeout(() => {
            startLogsStream(slug, componentId, currentToken);
         }, 2000); // 2 secondes pour laisser le temps au conteneur de démarrer
      }
      
    } catch (error) {
      console.error("Erreur détaillée lors de l'action:", error);
      appendLogLine(terminal, `--- ÉCHEC: ${error.message || 'Erreur inconnue du serveur'} ---`, 'error');
      ValaToast.show({ 
          type: 'error', 
          title: 'Échec de l\'action', 
          message: error.message || 'Le serveur a refusé l\'action.' 
      });
    } finally {
      // Réactiver les boutons dans tous les cas
      [btnStop, btnRestart, btnStart].forEach(btn => { if(btn) btn.disabled = false; });
    }
  };

  if (btnStop) btnStop.addEventListener('click', () => callAction('stop'));
  if (btnRestart) btnRestart.addEventListener('click', () => callAction('restart'));
  if (btnStart) btnStart.addEventListener('click', () => callAction('start'));
}