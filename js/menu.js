// js/menu.js
// Control de modales para menu.html (overlay + paneles centrados)
// Formularios permanecen inactivos (preventDefault en submit).

const btnCreateGroup = document.getElementById("btnCreateGroup");
const btnAddGuest = document.getElementById("btnAddGuest");

const modalOverlay = document.getElementById("modalOverlay");
const modalCreate = document.getElementById("modalCreateGroup");
const modalAddGuest = document.getElementById("modalAddGuest");

const cancelButtons = document.querySelectorAll(".btn-cancel");

// Helper: abrir modal específico
function openModal(modalEl) {
  if (!modalEl) return;
  // hide others
  modalCreate.hidden = true;
  modalAddGuest.hidden = true;

  // show overlay and the requested modal panel
  modalOverlay.hidden = false;
  modalOverlay.setAttribute("aria-hidden", "false");
  modalEl.hidden = false;

  // prevent body scroll
  document.body.classList.add("no-scroll");

  // focus first input inside modal (a11y nicety)
  const firstInput = modalEl.querySelector("input, select, button, textarea");
  if (firstInput) firstInput.focus();
}

// Helper: close all modals
function closeModal() {
  modalOverlay.hidden = true;
  modalOverlay.setAttribute("aria-hidden", "true");
  modalCreate.hidden = true;
  modalAddGuest.hidden = true;
  document.body.classList.remove("no-scroll");
}

// eventos de los botones grandes
btnCreateGroup.addEventListener("click", () => openModal(modalCreate));
btnAddGuest.addEventListener("click", () => openModal(modalAddGuest));

// evitar submit real (por ahora)
document.querySelectorAll("form").forEach((f) => {
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    // por ahora NO hacemos CRUD
  });
});

// botones de cerrar dentro de cada modal
cancelButtons.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const targetId = btn.dataset.target;
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) el.hidden = true;
    }
    closeModal();
  });
});

// cerrar modal al clickear en overlay (pero no cuando clickeás dentro del panel)
modalOverlay.addEventListener("click", (e) => {
  // si el click fue sobre el overlay (no sobre un hijo modal-panel), cerramos
  if (e.target === modalOverlay) {
    closeModal();
  }
});

// cerrar con ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
