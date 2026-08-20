document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  const username = document.getElementById('full-name');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirm-password');
  const errorMessage = document.getElementById('password-mismatch-error');

  if (!form || !password || !confirmPassword || !errorMessage) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault(); // on bloque TOUJOURS le rechargement natif, dès le départ

    if (password.value !== confirmPassword.value) {
      errorMessage.classList.add('visible');
      confirmPassword.focus();
    } else {
      errorMessage.classList.remove('visible');

      registerUser(username.value, email.value, password.value, confirmPassword.value)
        .then(data => {
          console.log('Registration successful:', data);
          window.location.href = "login.html";
        })
        .catch(error => {
          alert(error.message);
          // TODO: afficher un message d'erreur à l'utilisateur
        });
    }
  });

  confirmPassword.addEventListener('input', () => {
    if (errorMessage.classList.contains('visible') && password.value === confirmPassword.value) {
      errorMessage.classList.remove('visible');
    }
  });
});



