document.addEventListener('DOMContentLoaded', () => {
  initUserSession(
    (user) => {
      const fullnameEl = document.getElementById('user-fullname');
      if (fullnameEl) {
        fullnameEl.textContent = user.full_name;
      }
    },
    (error) => {
      console.log('Session invalide ou expirée :', error.message);
      window.location.href = "login.html";
    }
  );
});