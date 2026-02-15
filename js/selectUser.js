// js/selectUser.js
import { USERS } from "./ui_constants.js";

const KEY_SELECTED = "selectedUser";
const PLACEHOLDER = "Seleccionar usuario"; // texto por defecto cuando no hay selección

const userToggle = document.getElementById("userToggle");
const userLabel = document.getElementById("userLabel");
const userList = document.getElementById("userList");
const btnContinue = document.getElementById("btnContinue");

let isOpen = false;

function buildList() {
  userList.innerHTML = "";
  const current = getSelectedUser(); // null la mayoría de las veces con este comportamiento
  USERS.forEach((name) => {
    const li = document.createElement("li");
    li.className = "user-item";
    li.setAttribute("role", "option");
    li.setAttribute("data-name", name);
    // aria-selected sólo si es el seleccionado real
    li.setAttribute("aria-selected", current === name ? "true" : "false");
    // No ponemos foco automático aquí
    li.tabIndex = 0;
    li.innerHTML = `<span>${name}</span>`;

    if (current === name) {
      const badge = document.createElement("span");
      badge.className = "badge-selected";
      badge.textContent = "Seleccionado";
      li.appendChild(badge);
    }

    li.addEventListener("click", () => chooseName(name));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        chooseName(name);
      }
    });
    userList.appendChild(li);
  });
}

function openList() {
  isOpen = true;
  userList.hidden = false;
  userToggle.setAttribute("aria-expanded", "true");
}

function closeList() {
  isOpen = false;
  userList.hidden = true;
  userToggle.setAttribute("aria-expanded", "false");
}

function toggleList() {
  if (isOpen) closeList();
  else openList();
}

function chooseName(name) {
  // guardar y actualizar UI
  localStorage.setItem(KEY_SELECTED, name);
  userLabel.textContent = name;
  closeList();
  buildList(); // para actualizar badge y aria-selected
  updateContinueButton(); // habilitar botón
  // dispatch evento personalizado por si otras partes lo necesitan
  window.dispatchEvent(new CustomEvent("userSelected", { detail: { name } }));
}

export function getSelectedUser() {
  // devolvemos null si no hay selección válida.
  const v = localStorage.getItem(KEY_SELECTED);
  // adicional: validamos que el valor sea uno de los users válidos
  if (!v) return null;
  return USERS.includes(v) ? v : null;
}

function updateContinueButton() {
  const sel = getSelectedUser();
  if (sel) {
    btnContinue.removeAttribute("disabled");
    btnContinue.setAttribute("aria-disabled", "false");
  } else {
    btnContinue.setAttribute("disabled", "");
    btnContinue.setAttribute("aria-disabled", "true");
  }
}

// init
(function init() {
  // --------- FIX PRINCIPAL ----------
  // Forzamos que no haya selección por defecto al cargar:
  // - eliminamos la clave guardada (si existe) para evitar preselecciones no deseadas.
  // Si preferís mantener persistencia entre recargas, sacá/comment esta línea.
  localStorage.removeItem(KEY_SELECTED);
  // ----------------------------------

  buildList();

  // Mostrar placeholder (siempre al iniciar, hasta que el usuario elija)
  userLabel.textContent = PLACEHOLDER;

  updateContinueButton();

  // Quitamos foco inicial del toggle para evitar comportamiento extraño en algunos navegadores
  if (document.activeElement === userToggle) userToggle.blur();

  userToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleList();
  });

  // cerrar al click fuera
  document.addEventListener("click", (e) => {
    if (!userList.contains(e.target) && !userToggle.contains(e.target)) {
      closeList();
    }
  });

  // cerrar con ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeList();
  });

  // manejar click en continuar (solo si está habilitado)
  btnContinue.addEventListener("click", () => {
    const selUser = getSelectedUser();
    if (!selUser) return; // botón normalmente deshabilitado; seguridad extra
    // redirigir a menu.html
    window.location.href = "menu.html";
  });
})();
