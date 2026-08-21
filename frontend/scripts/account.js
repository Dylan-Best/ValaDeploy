// js/account.js
// Logique spécifique à la page account.html

document.addEventListener("DOMContentLoaded", () => {
    const logoutBtn = document.getElementById("btn-logout-everywhere");
    const deleteBtn = document.getElementById("btn-delete-account");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            const confirmed = await ValaModal.confirm({
                title: "Logout Everywhere",
                message: "This will end all active sessions on every device, including this one. Continue?",
                confirmLabel: "Logout Everywhere",
                cancelLabel: "Cancel",
                variant: "default"
            });
            if (confirmed) {
                // TODO: appel API réel de déconnexion globale
                console.log("Logout everywhere confirmé");
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
                // TODO: appel API réel de suppression de compte
                console.log("Suppression de compte confirmée");
            }
        });
    }
});
