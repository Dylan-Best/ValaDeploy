// js/confirm-modal.js
//
// API globale pour le composant components/confirm-modal.html
//
// Utilisation :
//   const ok = await ValaModal.confirm({
//       title: "Delete Account",
//       message: "This action is permanent and cannot be undone.",
//       confirmLabel: "Delete Account",
//       cancelLabel: "Cancel",
//       variant: "danger" // ou "default"
//   });
//   if (ok) { /* action confirmée */ }
//
// Le composant doit être présent une seule fois par page :
//   <div data-component="components/confirm-modal.html"></div>

const ValaModal = (() => {
    let resolvePromise = null;

    // Injecte le CSS du modal une seule fois, sans avoir besoin d'un
    // <link> manuel dans le <head> de chaque page.
    function injectStyles() {
        if (document.getElementById("vala-modal-styles")) return;

        const style = document.createElement("style");
        style.id = "vala-modal-styles";
        style.textContent = `
            #vala-modal-overlay { display: none; }
            #vala-modal-overlay.vala-modal-open { display: flex; }
            #vala-modal-overlay.vala-modal-visible #vala-modal-card {
                opacity: 1;
                transform: scale(1);
            }
            body.vala-modal-locked { overflow: hidden; }
        `;
        document.head.appendChild(style);
    }

    injectStyles();

    const VARIANTS = {
        danger: {
            iconWrapClass: "bg-error-container/30",
            iconClass: "text-danger-red",
            icon: "warning",
            confirmClass: "bg-danger-red text-white hover:opacity-90"
        },
        default: {
            iconWrapClass: "bg-surface-container-highest",
            iconClass: "text-primary",
            icon: "help",
            confirmClass: "bg-primary-orange text-white hover:opacity-90"
        }
    };

    function getEls() {
        return {
            overlay: document.getElementById("vala-modal-overlay"),
            iconWrap: document.getElementById("vala-modal-icon-wrap"),
            icon: document.getElementById("vala-modal-icon"),
            title: document.getElementById("vala-modal-title"),
            message: document.getElementById("vala-modal-message"),
            cancelBtn: document.getElementById("vala-modal-cancel"),
            confirmBtn: document.getElementById("vala-modal-confirm")
        };
    }

    function close(result) {
        const { overlay } = getEls();
        if (!overlay) return;

        overlay.classList.remove("vala-modal-visible");
        document.body.classList.remove("vala-modal-locked");

        // Laisse la transition de fermeture se jouer avant de masquer le bloc
        setTimeout(() => {
            overlay.classList.remove("vala-modal-open");
            overlay.setAttribute("aria-hidden", "true");
        }, 150);

        document.removeEventListener("keydown", onKeydown);

        if (resolvePromise) {
            resolvePromise(result);
            resolvePromise = null;
        }
    }

    function onKeydown(e) {
        if (e.key === "Escape") close(false);
    }

    function confirm({
        title = "Confirmer l'action",
        message = "Êtes-vous sûr de vouloir continuer ?",
        confirmLabel = "Confirmer",
        cancelLabel = "Annuler",
        variant = "default"
    } = {}) {
        const els = getEls();

        if (!els.overlay) {
            console.error(
                "ValaModal : composant introuvable. Vérifiez que " +
                '<div data-component="components/confirm-modal.html"></div> ' +
                "est bien présent sur la page."
            );
            return Promise.resolve(false);
        }

        const style = VARIANTS[variant] || VARIANTS.default;

        els.title.textContent = title;
        els.message.textContent = message;
        els.confirmBtn.textContent = confirmLabel;
        els.cancelBtn.textContent = cancelLabel;

        els.iconWrap.className = "w-11 h-11 rounded-full flex items-center justify-center mb-md " + style.iconWrapClass;
        els.icon.className = "material-symbols-outlined " + style.iconClass;
        els.icon.style.fontSize = "22px";
        els.icon.textContent = style.icon;

        els.confirmBtn.className = "font-label-md text-label-md px-lg py-sm rounded-DEFAULT transition-opacity " + style.confirmClass;

        // (Ré)attache les handlers à chaque ouverture pour éviter les doublons
        const newConfirmBtn = els.confirmBtn.cloneNode(true);
        els.confirmBtn.parentNode.replaceChild(newConfirmBtn, els.confirmBtn);
        const newCancelBtn = els.cancelBtn.cloneNode(true);
        els.cancelBtn.parentNode.replaceChild(newCancelBtn, els.cancelBtn);

        newConfirmBtn.addEventListener("click", () => close(true));
        newCancelBtn.addEventListener("click", () => close(false));
        els.overlay.addEventListener(
            "click",
            (e) => {
                if (e.target === els.overlay) close(false);
            },
            { once: true }
        );

        els.overlay.classList.add("vala-modal-open");
        els.overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("vala-modal-locked");
        document.addEventListener("keydown", onKeydown);

        // requestAnimationFrame pour laisser le "display:flex" s'appliquer
        // avant de déclencher la transition d'ouverture
        requestAnimationFrame(() => {
            els.overlay.classList.add("vala-modal-visible");
        });

        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    }

    return { confirm };
})();

window.ValaModal = ValaModal;
