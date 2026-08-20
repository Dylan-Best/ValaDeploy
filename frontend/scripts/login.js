document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  const email = document.getElementById('email');
  const password = document.getElementById('password');

  if (!form || !password ) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault(); 

      loginUser(email.value, password.value)
        .then(data => {
          console.log('Login successful:', data);
          window.location.href = "dashboard.html";
        })
        .catch(error => {
          alert(error.message)
          // TODO: afficher un message d'erreur à l'utilisateur
        });
  });

});