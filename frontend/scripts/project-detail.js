document.addEventListener('DOMContentLoaded', () => {
  const slug = getSlugFromUrl();

  if (!slug) {
    document.getElementById('project-name').textContent = 'No project specified';
    return;
  }

  document.title = `ValaDeploy - ${slug}`;
  document.getElementById('project-name').textContent = slug;

  initUserSession(
    (user, accessToken) => {
      startLogsStream(slug, accessToken);
      setupControlButtons(slug);
    },
    (error) => {
      console.error('Session invalide :', error);
      window.location.href = 'login.html';
    }
  );
});

function getSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug');
}

// --- Logs : UI uniquement, la connexion WS vit dans scripts/api/log.js ---
function startLogsStream(slug, accessToken) {
  const terminal = document.getElementById('log-terminal');
  const indicator = document.getElementById('live-indicator');
  if (!terminal || !indicator) return;

  connectLogsWebSocket(slug, accessToken, {
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
      indicator.classList.remove('connected');
      indicator.classList.add('disconnected');
      appendLogLine(terminal, '--- Session expirée, reconnexion... ---', 'meta');
      startLogsStream(slug, newAccessToken);
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
function setupControlButtons(slug) {
  document.getElementById('btn-stop')?.addEventListener('click', () => {
    console.log(`TODO: appeler l'API pour stopper ${slug}`);
  });
  document.getElementById('btn-restart')?.addEventListener('click', () => {
    console.log(`TODO: appeler l'API pour redémarrer ${slug}`);
  });
  document.getElementById('btn-start')?.addEventListener('click', () => {
    console.log(`TODO: appeler l'API pour démarrer ${slug}`);
  });
}