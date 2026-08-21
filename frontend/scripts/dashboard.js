let currentAccessToken = null;

// apiCallFn : une fonction qui prend un access_token en argument
// et retourne une Promise d'appel à une route protégée (ex: getCurrentUser)
function fetchWithAutoRefresh(apiCallFn) {
  return apiCallFn(currentAccessToken)
    .catch(error => {
      if (error.status === 401) {
        return refreshAccessToken().then(data => {
          currentAccessToken = data.access_token;
          return apiCallFn(currentAccessToken);
        });
      }
      throw error; // pas un 401 -> on ne sait pas gérer, on relance l'erreur telle quelle
    });
}

function loadDashboard() {
  return fetchWithAutoRefresh(getCurrentUser)
    .then(user => {
      const fullnameEl = document.getElementById('user-fullname');
      if (fullnameEl) {
        fullnameEl.textContent = user.full_name;
      }
    });
}

document.addEventListener('DOMContentLoaded', () => {
  refreshAccessToken()
    .then(data => {
      currentAccessToken = data.access_token;
      return loadDashboard();
    })
    .catch(error => {
      console.log('Session invalide ou expirée :', error.message);
      window.location.href = "login.html";
    });
});