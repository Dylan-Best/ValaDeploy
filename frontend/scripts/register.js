// Comportement de la page register.
// Pour l'instant : validation côté client que les 2 mots de passe correspondent.
// À compléter plus tard : soumission du formulaire vers l'API de création de compte.

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form');
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirm-password');
    const errorMessage = document.getElementById('password-mismatch-error');

    if (!form || !password || !confirmPassword || !errorMessage) return;

    form.addEventListener('submit', (event) => {
        if (password.value !== confirmPassword.value) {
            event.preventDefault();
            errorMessage.classList.add('visible');
            confirmPassword.focus();
        } else {
            errorMessage.classList.remove('visible');
            // TODO: appel API register (voir scripts/api/auth.js à venir)
        }
    });

    confirmPassword.addEventListener('input', () => {
        if (errorMessage.classList.contains('visible') && password.value === confirmPassword.value) {
            errorMessage.classList.remove('visible');
        }
    });
});
