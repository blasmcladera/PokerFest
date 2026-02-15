// js/menu.js
// Control de modales para menu.html (overlay + paneles centrados)
// Formularios permanecen inactivos excepto "Crear grupo" que ahora crea en la DB.

import { createGroup, listGroups } from "./groupsService.js"; // requiere js/groupsService.js

const btnCreateGroup = document.getElementById("btnCreateGroup");
const btnAddGuest = document.getElementById("btnAddGuest");

const modalOverlay = document.getElementById("modalOverlay");
const modalCreate = document.getElementById("modalCreateGroup");
const modalAddGuest = document.getElementById("modalAddGuest");

const cancelButtons = document.querySelectorAll(".btn-cancel");

// referencias al formulario Crear Grupo
const formCreateGroup = document.getElementById("formCreateGroup");
const inputGroupName = document.getElementById("groupName");
const inputGroupResponsible = document.getElementById("groupResponsible");
const inputGroupConfirmed = document.getElementById("groupConfirmed");
const submitCreateBtn = formCreateGroup.querySelector(".btn-submit");

// referencias para el select de grupos (Agregar Invitado)
const guestGroupSelect = document.getElementById("guestGroup");

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

// llenar select de grupos (mantiene opción "Sin grupo" primero)
async function populateGroupSelect() {
  const sel = guestGroupSelect;
  if (!sel) return;
  // mantener "Sin grupo" como primera opción
  sel.innerHTML = '<option value="">Sin grupo</option>';

  try {
    const groups = await listGroups(); // [{id, nombre, ...}, ...]
    groups.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.nombre || g.name || g.id;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando grupos:", err);
    // no mostramos texto dentro del formulario según lo pedido
  }
}

// eventos de los botones grandes
btnCreateGroup.addEventListener("click", () => {
  // reset form state
  formCreateGroup.reset();
  submitCreateBtn.disabled = false;
  submitCreateBtn.textContent = "Guardar";
  openModal(modalCreate);
});

btnAddGuest.addEventListener("click", async () => {
  // antes de abrir, rellenamos el select de grupos
  await populateGroupSelect();
  openModal(modalAddGuest);
});

// manejar submit de Crear Grupo: funcional (crea en Firestore)
formCreateGroup.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = inputGroupName.value ? inputGroupName.value.trim() : "";
  const responsable = inputGroupResponsible.value
    ? inputGroupResponsible.value.trim()
    : "";
  const confirmado = !!inputGroupConfirmed.checked;

  if (!nombre) {
    alert("El nombre del grupo es obligatorio.");
    return;
  }

  try {
    submitCreateBtn.disabled = true;
    submitCreateBtn.textContent = "Creando...";

    const groupId = await createGroup({ nombre, responsable, confirmado });

    console.log(`Grupo creado: ${groupId}`);
    // refrescar lista de grupos para el select del otro modal
    await populateGroupSelect();

    // pequeño delay para que el usuario note la acción (opcional)
    setTimeout(() => {
      closeModal();
    }, 600);
  } catch (err) {
    console.error("Error al crear grupo:", err);
    alert("Error al crear grupo: " + (err.message || err));
  } finally {
    submitCreateBtn.disabled = false;
    submitCreateBtn.textContent = "Guardar";
  }
});

// evitar submit real en otros forms (por ahora)
document.querySelectorAll("form").forEach((f) => {
  if (f.id === "formCreateGroup") return; // ya manejado arriba
  f.addEventListener("submit", (e) => {
    e.preventDefault();
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
