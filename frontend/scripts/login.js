document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.textContent;

  if (!form || !password) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";

    loginUser(email.value, password.value)
      .then(data => {
        console.log('Login successful:', data);
        window.location.href = "dashboard.html";
      })
      .catch(error => {
        alert(error.message);
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      });
  });
});