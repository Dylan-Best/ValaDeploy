document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("btn-logout-everywhere");
  const deleteBtn = document.getElementById("btn-delete-account");

  // Remplit les infos du compte + calcule le temps restant de la session
  initUserSession(
    (user, accessToken) => {
      const fullnameEl = document.getElementById('profile-fullname');
      const emailEl = document.getElementById('profile-email');
      const roleEl = document.getElementById('profile-role');
      const expiryEl = document.getElementById('session-expiry-text');

      if (fullnameEl) fullnameEl.textContent = user.full_name;
      if (emailEl) emailEl.textContent = user.email;
      if (roleEl) roleEl.textContent = user.role;

      if (expiryEl) {
        const payload = decodeJwt(accessToken);
        expiryEl.textContent = formatTimeRemaining(payload.exp);
      }
    },
    (error) => {
      console.log('Session invalide ou expirée :', error.message);
      window.location.href = "login.html";
    }
  );

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const confirmed = await ValaModal.confirm({
        title: "Logout",
        message: "This will end your current session. Continue?",
        confirmLabel: "Logout",
        cancelLabel: "Cancel",
        variant: "default"
      });
      if (confirmed) {
        logoutUser()
          .then(() => {
            window.location.href = "login.html";
          })
          .catch(error => {
            alert(error.message);
          });
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await ValaModal.confirm({
        title: "Delete Account",
        message: "This action is permanent and cannot be undone. All your data will be permanently deleted.",
        confirmLabel: "Delete Account",
        cancelLabel: "Cancel",
        variant: "danger"
      });
      if (confirmed) {
        // TODO: appel API réel de suppression de compte (pas encore implémenté côté backend)
        console.log("Suppression de compte confirmée");
      }
    });
  }
});

// Transforme un "exp" (timestamp Unix, en secondes) en texte lisible du style "Expires in 42 min"
function formatTimeRemaining(expTimestamp) {
  const nowInSeconds = Math.floor(Date.now() / 1000); // Date.now() donne des millisecondes, on convertit en secondes
  const secondsRemaining = expTimestamp - nowInSeconds;

  if (secondsRemaining <= 0) {
    return "Expired";
  }

  const minutesRemaining = Math.floor(secondsRemaining / 60);

  if (minutesRemaining < 60) {
    return `Expires in ${minutesRemaining} min`;
  }

  const hoursRemaining = Math.floor(minutesRemaining / 60);
  return `Expires in ${hoursRemaining}h`;
}