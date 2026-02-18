// js/menu.js
// Tabla de grupos + Sin Grupo + toggling pago + eliminación personas/grupos
// Añadí: contador reactivo de invitados visibles, botón "Desplegar todos / Contraer todos"
// y botón "..." para renombrar grupos / mover invitados.
// Requiere: groupsService.js, peopleService.js, firebase.js, dbConfig.js

import {
  createGroup,
  listGroups,
  addPersonToGroupAtomic,
} from "./groupsService.js";
import { createPerson, findPeopleByGroup } from "./peopleService.js";
import { db } from "./firebase.js";
import { COLECCION_PERSONA, COLECCION_GRUPO } from "./dbConfig.js";

import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  arrayRemove,
  arrayUnion,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* DOM refs */
const btnCreateGroup = document.getElementById("btnCreateGroup");
const btnAddGuest = document.getElementById("btnAddGuest");

const modalOverlay = document.getElementById("modalOverlay");
const modalCreate = document.getElementById("modalCreateGroup");
const modalAddGuest = document.getElementById("modalAddGuest");
const cancelButtons = document.querySelectorAll(".btn-cancel");

const filterWomenBtn = document.getElementById("filterWomen");
const filterMenBtn = document.getElementById("filterMen");
const filterPaidBtn = document.getElementById("filterPaid");
const filterUnpaidBtn = document.getElementById("filterUnpaid");

const sortSelect = document.getElementById("sortBy");

/* crear grupo refs */
const formCreateGroup = document.getElementById("formCreateGroup");
const inputGroupName = document.getElementById("groupName");
const inputGroupResponsible = document.getElementById("groupResponsible");
const inputGroupConfirmed = document.getElementById("groupConfirmed");
const submitCreateBtn = formCreateGroup.querySelector(".btn-submit");

/* add guest refs */
const formAddGuest = document.getElementById("formAddGuest");
const guestName = document.getElementById("guestName");
const guestPaid = document.getElementById("guestPaid");
const guestGenderToggle = document.getElementById("guestGenderToggle");
const guestGenderLabel = document.getElementById("guestGenderLabel");
const guestGenderList = document.getElementById("guestGenderList");
const guestGroupToggle = document.getElementById("guestGroupToggle");
const guestGroupLabel = document.getElementById("guestGroupLabel");
const guestGroupList = document.getElementById("guestGroupList");

/* table refs */
const groupsTbody = document.getElementById("groupsTbody");
const noGroups = document.getElementById("noGroups");

/* dropdown state */
let guestGenderSelected = null;
let guestGroupSelectedId = "";

/* cache: groupId -> members array */
const groupMembersCache = {};

/* map to references in DOM for in-place updates:
   groupRowMap[groupId] = { trGroup, trMembers, tdCounts, membersContainer, caret, paidIcon } */
const groupRowMap = {};

/* filters state (tri-state):
   genderState: 'all' | 'women' | 'men'
   paidState: 'all' | 'paid' | 'unpaid'
*/
let genderState = "all";
let paidState = "all";

/* -------------------------
   Guest counter UI / helpers
   ------------------------- */

/**
 * Ensure guest counter element exists and is placed above the actions row.
 * It inserts a <div id="guestCounter" class="guest-counter">Hay <span class="count">X</span> invitados</div>
 */
function ensureGuestCounter() {
  let counter = document.getElementById("guestCounter");
  if (counter) return counter;

  // Prefer inserting before the visible ".actions-row" if present
  const actionsRow = document.querySelector(".actions-row");
  counter = document.createElement("div");
  counter.id = "guestCounter";
  counter.className = "guest-counter";
  // initial content
  counter.innerHTML = `Hay <span class="count">0</span> invitados`;

  if (actionsRow && actionsRow.parentNode) {
    actionsRow.parentNode.insertBefore(counter, actionsRow);
  } else {
    // fallback: insert at top of body
    document.body.insertBefore(counter, document.body.firstChild);
  }
  return counter;
}

/**
 * Pulse animation helper when count changes
 */
let lastGuestCount = null;
function pulseGuestCounter() {
  const counter = document.getElementById("guestCounter");
  if (!counter) return;
  counter.classList.remove("pulse");
  // reflow to restart animation
  void counter.offsetWidth;
  counter.classList.add("pulse");
}

/**
 * Compute number of visible guests according to current filters.
 * Uses the cached arrays in groupMembersCache and applyFiltersToMembers().
 */
function computeVisibleGuestsCount() {
  let total = 0;
  Object.keys(groupMembersCache).forEach((gid) => {
    const arr = groupMembersCache[gid] || [];
    if (!Array.isArray(arr)) return;
    const visible = applyFiltersToMembers(arr);
    total += visible.length;
  });
  return total;
}

/**
 * Update the counter text to reflect current visible guests.
 */
function updateGuestCounterUI() {
  ensureGuestCounter();
  const counter = document.getElementById("guestCounter");
  const count = computeVisibleGuestsCount();
  const spanHTML = `<span class="count">${count}</span>`;
  counter.innerHTML = `Hay ${spanHTML} invitados`;

  // small pulse animation on change
  if (lastGuestCount === null || lastGuestCount !== count) {
    pulseGuestCounter();
    lastGuestCount = count;
  }
}

/* -------------------------
   Toggle All Groups Button (arriba de la tabla)
   ------------------------- */

function ensureToggleAllButton() {
  let wrap = document.querySelector(".toggle-all-wrap");
  if (wrap) return wrap;

  // Try to place it above the table wrapper (.table-wrap) if exists
  const tableWrap = document.querySelector(".table-wrap");
  wrap = document.createElement("div");
  wrap.className = "toggle-all-wrap";
  const btn = document.createElement("button");
  btn.id = "btnToggleAllGroups";
  btn.className = "btn-toggle-all";
  btn.type = "button";
  btn.addEventListener("click", handleToggleAllGroups);
  btn.textContent = "Desplegar todos"; // default label

  wrap.appendChild(btn);

  if (tableWrap && tableWrap.parentNode) {
    tableWrap.parentNode.insertBefore(wrap, tableWrap);
  } else {
    // fallback: before groupsTbody's table
    const tableEl = groupsTbody ? groupsTbody.closest("table") : null;
    if (tableEl && tableEl.parentNode)
      tableEl.parentNode.insertBefore(wrap, tableEl);
    else document.body.insertBefore(wrap, document.body.firstChild);
  }
  return wrap;
}

function updateToggleAllButtonLabel() {
  ensureToggleAllButton();
  const btn = document.getElementById("btnToggleAllGroups");
  if (!btn) return;
  // If at least one group is expanded -> show "Contraer todos", otherwise "Desplegar todos"
  const anyExpanded = Object.values(groupRowMap).some(
    (info) => info && info.trMembers && !info.trMembers.hidden,
  );
  btn.textContent = anyExpanded ? "Contraer todos" : "Desplegar todos";
}

/**
 * Click handler: si ninguno está desplegado -> desplegar todos.
 * si al menos uno está desplegado -> contraer todos.
 */
function handleToggleAllGroups() {
  const infos = Object.values(groupRowMap);
  if (!infos || infos.length === 0) return;

  const anyExpanded = infos.some(
    (info) => info && info.trMembers && !info.trMembers.hidden,
  );
  if (anyExpanded) {
    // collapse all
    infos.forEach((info) => {
      if (!info || !info.trMembers || !info.trGroup) return;
      if (!info.trMembers.hidden) {
        // directly collapse without triggering click handlers
        info.trMembers.hidden = true;
        info.trGroup.setAttribute("aria-expanded", "false");
        info.caret.classList.remove("open");
      }
    });
  } else {
    // expand all
    infos.forEach((info) => {
      if (!info || !info.trMembers || !info.trGroup) return;
      if (info.trMembers.hidden) {
        // render members from cache and show (reuse rendering logic)
        const groupId = info.trGroup.getAttribute("data-group-id");
        const membersLocal = groupMembersCache[groupId] || [];
        const visibleMembers = applyFiltersToMembers(membersLocal);
        const container = info.membersContainer;
        container.innerHTML = "";
        const ul = document.createElement("ul");
        ul.className = "member-list";
        visibleMembers.forEach((m) => {
          const li = document.createElement("li");
          li.className = "member-item";
          const left = document.createElement("div");
          left.className = "member-left";
          const nameSpan = document.createElement("span");
          nameSpan.className = "member-name";
          nameSpan.textContent = m.nombre || m.name || m.id;
          const genderBadge = document.createElement("span");
          genderBadge.className =
            "badge badge-gender " +
            (m.genero === "hombre"
              ? "male"
              : m.genero === "mujer"
                ? "female"
                : "");
          genderBadge.textContent = m.genero
            ? m.genero === "hombre"
              ? "Hombre"
              : "Mujer"
            : "—";
          const paidBadge = document.createElement("span");
          paidBadge.className =
            "badge badge-paid " + (m.pagado ? "paid" : "unpaid");
          paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
          paidBadge.style.cursor = "pointer";

          paidBadge.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const current = !!m.pagado;
            const allMembers = groupMembersCache[groupId] || [];
            const idx = allMembers.findIndex((x) => x.id === m.id);
            if (idx >= 0) allMembers[idx].pagado = !current;
            m.pagado = !current;
            paidBadge.classList.toggle("paid", m.pagado);
            paidBadge.classList.toggle("unpaid", !m.pagado);
            paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
            const newVisible = applyFiltersToMembers(
              groupMembersCache[groupId] || [],
            );
            info.tdCounts.textContent = `${newVisible.filter((x) => !!x.pagado).length} / ${newVisible.length}`;
            try {
              await togglePersonPayment(m.id, current, groupId, info.tdCounts);
            } catch (e) {
              console.error(e);
            }
          });

          left.appendChild(nameSpan);
          left.appendChild(genderBadge);
          left.appendChild(paidBadge);

          const right = document.createElement("div");
          right.className = "member-right";

          // three-dots move button for guest (append BEFORE delete so appears to the left)
          const btnMoreGuest = document.createElement("button");
          btnMoreGuest.className = "btn-more guest";
          btnMoreGuest.title = "Mover invitado";
          btnMoreGuest.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
          btnMoreGuest.addEventListener("click", (ev) => {
            ev.stopPropagation();
            showMoveGuestMenu(btnMoreGuest, m.id, groupId);
          });
          right.appendChild(btnMoreGuest);

          const btnDelPerson = document.createElement("button");
          btnDelPerson.className = "btn-trash";
          btnDelPerson.title = "Eliminar invitado";
          btnDelPerson.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon-path" d="M9 3h6l1 1h4v2H4V4h4l1-1zm-1 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9H8z"/></svg>`;
          btnDelPerson.addEventListener("click", (ev) => {
            ev.stopPropagation();
            deletePerson(m.id, groupId);
          });
          right.appendChild(btnDelPerson);

          li.appendChild(left);
          li.appendChild(right);
          ul.appendChild(li);
        });
        container.appendChild(ul);

        info.trMembers.hidden = false;
        info.trGroup.setAttribute("aria-expanded", "true");
        info.caret.classList.add("open");
      }
    });
  }

  // Update label after toggle
  updateToggleAllButtonLabel();
  // update guest counter and ticks if needed
  updateAllCountsAndOpenLists();
}

/* -------------------------
   Modal helpers
   ------------------------- */
function openModal(modalEl) {
  if (!modalEl) return;
  modalCreate.hidden = true;
  modalAddGuest.hidden = true;
  modalOverlay.hidden = false;
  modalOverlay.setAttribute("aria-hidden", "false");
  modalEl.hidden = false;
  document.body.classList.add("no-scroll");
  const firstInput = modalEl.querySelector("input, select, button, textarea");
  if (firstInput) firstInput.focus();
}
function closeModal() {
  modalOverlay.hidden = true;
  modalOverlay.setAttribute("aria-hidden", "true");
  modalCreate.hidden = true;
  modalAddGuest.hidden = true;
  document.body.classList.remove("no-scroll");
  closeGuestGenderList();
  closeGuestGroupList();
}

/* button success */
function showButtonSuccess(btn, originalText = "") {
  if (!btn) return;
  const prevHTML = btn.innerHTML;
  btn.classList.add("btn-success", "animate");
  btn.innerHTML = `<span class="check">✓</span>`;
  setTimeout(() => {
    btn.classList.remove("btn-success", "animate");
    btn.innerHTML = originalText || prevHTML;
  }, 800);
}

/* -------------------------
   Dropdowns Gender static
   ------------------------- */
const GENDERS = [
  { value: "mujer", label: "Mujer" },
  { value: "hombre", label: "Hombre" },
];

function buildGuestGenderList() {
  guestGenderList.innerHTML = "";
  GENDERS.forEach((g) => {
    const li = document.createElement("li");
    li.className = "user-item";
    li.setAttribute("role", "option");
    li.setAttribute("data-value", g.value);
    li.tabIndex = 0;
    li.innerHTML = `<span>${g.label}</span>`;
    li.addEventListener("click", () => {
      guestGenderSelected = g.value;
      guestGenderLabel.textContent = g.label;
      closeGuestGenderList();
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        guestGenderSelected = g.value;
        guestGenderLabel.textContent = g.label;
        closeGuestGenderList();
      }
    });
    guestGenderList.appendChild(li);
  });
}
function openGuestGenderList() {
  guestGenderList.hidden = false;
  guestGenderToggle.setAttribute("aria-expanded", "true");
}
function closeGuestGenderList() {
  guestGenderList.hidden = true;
  guestGenderToggle.setAttribute("aria-expanded", "false");
}
function toggleGuestGenderList() {
  if (guestGenderList.hidden) openGuestGenderList();
  else closeGuestGenderList();
}

/* -------------------------
   Dropdowns Group dynamic
   ------------------------- */
async function populateGuestGroupList() {
  guestGroupList.innerHTML = "";
  const li0 = document.createElement("li");
  li0.className = "user-item";
  li0.setAttribute("role", "option");
  li0.setAttribute("data-id", "");
  li0.tabIndex = 0;
  li0.innerHTML = `<span>Sin grupo</span>`;
  li0.addEventListener("click", () => {
    guestGroupSelectedId = "";
    guestGroupLabel.textContent = "Sin grupo";
    closeGuestGroupList();
  });
  guestGroupList.appendChild(li0);

  try {
    const groups = await listGroups();
    groups.forEach((g) => {
      const li = document.createElement("li");
      li.className = "user-item";
      li.setAttribute("role", "option");
      li.setAttribute("data-id", g.id);
      li.tabIndex = 0;
      li.innerHTML = `<span>${g.nombre || g.name || g.id}</span>`;
      li.addEventListener("click", () => {
        guestGroupSelectedId = g.id;
        guestGroupLabel.textContent = g.nombre || g.name || g.id;
        closeGuestGroupList();
      });
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          guestGroupSelectedId = g.id;
          guestGroupLabel.textContent = g.nombre || g.name || g.id;
          closeGuestGroupList();
        }
      });
      guestGroupList.appendChild(li);
    });
  } catch (err) {
    console.error("Error cargando grupos:", err);
  }
}
function openGuestGroupList() {
  guestGroupList.hidden = false;
  guestGroupToggle.setAttribute("aria-expanded", "true");
}
function closeGuestGroupList() {
  guestGroupList.hidden = true;
  guestGroupToggle.setAttribute("aria-expanded", "false");
}
function toggleGuestGroupList() {
  if (guestGroupList.hidden) openGuestGroupList();
  else closeGuestGroupList();
}

document.addEventListener("click", (e) => {
  if (
    !guestGenderList.contains(e.target) &&
    !guestGenderToggle.contains(e.target)
  )
    closeGuestGenderList();
  if (
    !guestGroupList.contains(e.target) &&
    !guestGroupToggle.contains(e.target)
  )
    closeGuestGroupList();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeGuestGenderList();
    closeGuestGroupList();
  }
});
guestGenderToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleGuestGenderList();
});
guestGroupToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleGuestGroupList();
});

/* -------------------------
   Open modals
   ------------------------- */
btnCreateGroup.addEventListener("click", () => {
  formCreateGroup.reset();
  submitCreateBtn.disabled = false;
  submitCreateBtn.textContent = "Crear";
  openModal(modalCreate);
});

btnAddGuest.addEventListener("click", async () => {
  guestName.value = "";
  guestPaid.checked = false;
  guestGenderSelected = null;
  guestGenderLabel.textContent = "-- seleccionar --";
  guestGroupSelectedId = "";
  guestGroupLabel.textContent = "Sin grupo";
  buildGuestGenderList();
  await populateGuestGroupList();
  openModal(modalAddGuest);
});

/* -------------------------
   Create Group
   ------------------------- */
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
    const originalText = submitCreateBtn.textContent || "Crear";
    submitCreateBtn.textContent = "Creando...";
    const groupId = await createGroup({ nombre, responsable, confirmado });

    showButtonSuccess(submitCreateBtn, originalText);
    await renderGroupsTable();
    await populateGuestGroupList();

    setTimeout(() => closeModal(), 700);
  } catch (err) {
    console.error("Error al crear grupo:", err);
    alert("Error al crear grupo: " + (err.message || err));
  } finally {
    submitCreateBtn.disabled = false;
    submitCreateBtn.textContent = "Crear";
  }
});

/* -------------------------
   Add Guest
   ------------------------- */
formAddGuest.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombreFull = guestName.value ? guestName.value.trim() : "";
  const nombre = nombreFull;
  const apellido = nombreFull || "";
  const genero = guestGenderSelected || null;
  const pagado = !!guestPaid.checked;
  const grupoId = guestGroupSelectedId || null;
  if (!nombreFull) {
    alert("El nombre es obligatorio.");
    return;
  }

  const submitBtn = formAddGuest.querySelector(".btn-submit");
  const originalText = submitBtn.textContent || "Agregar";

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const personId = await createPerson({
      nombre,
      apellido,
      genero,
      pagado,
      grupoId: null,
    });

    if (grupoId) {
      await addPersonToGroupAtomic(grupoId, personId);
    }

    showButtonSuccess(submitBtn, originalText);

    await renderGroupsTable();
    await populateGuestGroupList();

    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      closeModal();
    }, 700);
  } catch (err) {
    console.error("Error agregando invitado:", err);
    alert("Error al agregar invitado: " + (err.message || err));
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

/* -------------------------
   Helpers: fetch ungrouped people
*/
async function fetchUngroupedPeople() {
  const people = [];
  try {
    const col = collection(db, COLECCION_PERSONA);
    const q1 = query(col, where("grupoId", "==", null));
    const snap1 = await getDocs(q1);
    snap1.forEach((d) => people.push({ id: d.id, ...d.data() }));
  } catch (err) {
    /* ignore */
  }
  try {
    const col = collection(db, COLECCION_PERSONA);
    const q2 = query(col, where("groupId", "==", null));
    const snap2 = await getDocs(q2);
    snap2.forEach((d) => {
      if (!people.some((p) => p.id === d.id))
        people.push({ id: d.id, ...d.data() });
    });
  } catch (err) {
    /* ignore */
  }
  return people;
}

/* -------------------------
   FILTER LOGIC & UTIL
*/
function applyFiltersToMembers(members) {
  return members.filter((m) => {
    const g = (m.genero || "").toString().toLowerCase();
    let genderOk = true;
    if (genderState === "women")
      genderOk = g === "mujer" || g === "female" || g === "woman";
    else if (genderState === "men")
      genderOk = g === "hombre" || g === "male" || g === "man";

    const paid = !!m.pagado;
    let paidOk = true;
    if (paidState === "paid") paidOk = paid;
    else if (paidState === "unpaid") paidOk = !paid;

    return genderOk && paidOk;
  });
}

function updateFilterButtonsUI() {
  filterWomenBtn.classList.toggle("active", genderState === "women");
  filterMenBtn.classList.toggle("active", genderState === "men");
  filterPaidBtn.classList.toggle("active", paidState === "paid");
  filterUnpaidBtn.classList.toggle("active", paidState === "unpaid");
}

/* gender tri-state handlers (exclusive between men/women) */
filterWomenBtn.addEventListener("click", async () => {
  if (genderState === "women") genderState = "all";
  else genderState = "women";
  updateFilterButtonsUI();
  updateAllCountsAndOpenLists();
});
filterMenBtn.addEventListener("click", async () => {
  if (genderState === "men") genderState = "all";
  else genderState = "men";
  updateFilterButtonsUI();
  updateAllCountsAndOpenLists();
});

/* paid tri-state handlers (exclusive between paid/unpaid) */
filterPaidBtn.addEventListener("click", async () => {
  if (paidState === "paid") paidState = "all";
  else paidState = "paid";
  updateFilterButtonsUI();
  updateAllCountsAndOpenLists();
});
filterUnpaidBtn.addEventListener("click", async () => {
  if (paidState === "unpaid") paidState = "all";
  else paidState = "unpaid";
  updateFilterButtonsUI();
  updateAllCountsAndOpenLists();
});

/* -------------------------
   Toggle payment (optimistic)
*/
async function togglePersonPayment(personId, currentValue, groupId, tdCounts) {
  try {
    const members = groupMembersCache[groupId] || [];
    const idx = members.findIndex((p) => p.id === personId);
    if (idx >= 0) members[idx].pagado = !currentValue;

    const visible = applyFiltersToMembers(groupMembersCache[groupId] || []);
    const paidCount = visible.filter((x) => !!x.pagado).length;
    const total = visible.length;
    if (tdCounts) tdCounts.textContent = `${paidCount} / ${total}`;

    // Update group-level tick state after optimistic update
    updateAllCountsAndOpenLists();

    const pRef = doc(db, COLECCION_PERSONA, personId);
    await updateDoc(pRef, { pagado: !currentValue });
  } catch (err) {
    console.error("Error actualizando pago:", err);
    alert("No se pudo actualizar el estado de pago: " + (err.message || err));
    await renderGroupsTable();
  }
}

/* -------------------------
   Delete person / group
*/
async function deletePerson(personId, groupId) {
  if (!confirm("¿Eliminar invitado? Esta acción no se puede deshacer.")) return;
  try {
    await deleteDoc(doc(db, COLECCION_PERSONA, personId));
    if (groupId && groupId !== "sin-grupo") {
      const groupRef = doc(db, COLECCION_GRUPO, groupId);
      await updateDoc(groupRef, {
        miembros: arrayRemove(personId),
        cantidadMiembros: increment(-1),
      });
    }
    if (groupMembersCache[groupId])
      groupMembersCache[groupId] = groupMembersCache[groupId].filter(
        (p) => p.id !== personId,
      );
    await renderGroupsTable();
  } catch (err) {
    console.error("Error eliminando persona:", err);
    alert("No se pudo eliminar la persona: " + (err.message || err));
  }
}

async function deleteGroup(groupId) {
  if (
    !confirm(
      "¿Eliminar grupo? Los miembros pasarán a 'Sin Grupo'. Esta acción borra el grupo.",
    )
  )
    return;
  try {
    if (groupId === "sin-grupo") {
      alert("No se puede eliminar el grupo 'Sin Grupo'.");
      return;
    }
    const members = groupMembersCache[groupId] || [];
    const updates = members.map((m) => {
      const pRef = doc(db, COLECCION_PERSONA, m.id);
      return updateDoc(pRef, { grupoId: null, groupId: null }).catch((err) =>
        console.error(
          "No se pudo actualizar miembro al borrar grupo",
          m.id,
          err,
        ),
      );
    });
    await Promise.all(updates);
    await deleteDoc(doc(db, COLECCION_GRUPO, groupId));
    await renderGroupsTable();
    await populateGuestGroupList();
  } catch (err) {
    console.error("Error eliminando grupo:", err);
    alert("No se pudo eliminar el grupo: " + (err.message || err));
  }
}

/* -------------------------
   Group rename & Move guest helpers
   ------------------------- */

/**
 * Prompt to rename a group (updates DB and re-renders)
 */
async function promptRenameGroup(groupId, currentName) {
  const nuevo = prompt("Nuevo nombre para el grupo:", currentName || "");
  if (nuevo === null) return; // cancel
  const clean = (nuevo || "").trim();
  if (!clean) {
    alert("El nombre no puede quedar vacío.");
    return;
  }
  try {
    const gRef = doc(db, COLECCION_GRUPO, groupId);
    await updateDoc(gRef, { nombre: clean });
    await renderGroupsTable();
    await populateGuestGroupList();
  } catch (err) {
    console.error("Error renombrando grupo:", err);
    alert("No se pudo renombrar el grupo: " + (err.message || err));
  }
}

/**
 * Remove any existing floating move menu / modal
 */
function removeExistingMoveMenu() {
  const existingMenu = document.getElementById("moveMenu");
  if (existingMenu) existingMenu.remove();
  const existingOverlay = document.getElementById("moveModalOverlay");
  if (existingOverlay) existingOverlay.remove();
  // restore scroll if we had disabled it
  document.body.classList.remove("no-scroll");
}

/**
 * Show a centered modal to move a guest to another group.
 * The background becomes semi-opaque and the modal is centered.
 */
async function showMoveGuestMenu(buttonEl, personId, currentGroupId) {
  // remove any existing menu/modal
  removeExistingMoveMenu();

  // create overlay
  const overlay = document.createElement("div");
  overlay.id = "moveModalOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.6)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = 12000;
  overlay.style.padding = "20px";

  // create panel
  const panel = document.createElement("div");
  panel.id = "moveMenu";
  panel.className = "move-menu-panel";
  panel.style.minWidth = "320px";
  panel.style.maxWidth = "720px";
  panel.style.width = "min(680px, 96%)";
  panel.style.background = "var(--surface, #111214)";
  panel.style.color = "var(--text, #e6e6e6)";
  panel.style.borderRadius = "12px";
  panel.style.boxShadow = "0 30px 80px rgba(0,0,0,0.6)";
  panel.style.padding = "18px";
  panel.style.boxSizing = "border-box";
  panel.style.maxHeight = "80vh";
  panel.style.overflow = "auto";
  panel.style.position = "relative";

  // header
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.marginBottom = "12px";

  const title = document.createElement("div");
  title.textContent = "Mover invitado";
  title.style.fontWeight = "700";
  title.style.fontSize = "18px";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-close-move";
  closeBtn.innerHTML = "✕";
  closeBtn.style.background = "transparent";
  closeBtn.style.border = "none";
  closeBtn.style.color = "var(--muted, #a3a3a3)";
  closeBtn.style.fontSize = "18px";
  closeBtn.style.cursor = "pointer";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeExistingMoveMenu();
  });
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // description / current location
  const desc = document.createElement("div");
  desc.textContent = "Seleccioná el grupo destino:";
  desc.style.marginBottom = "12px";
  desc.style.color = "var(--muted, #a3a3a3)";
  panel.appendChild(desc);

  // list container
  const list = document.createElement("div");
  list.className = "move-list";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "8px";

  // helper to build an option button
  function buildOption(label, targetGroupId) {
    const b = document.createElement("button");
    b.className = "move-option-button";
    b.textContent = label;
    b.style.textAlign = "left";
    b.style.padding = "10px 12px";
    b.style.borderRadius = "10px";
    b.style.border = "1px solid rgba(255,255,255,0.03)";
    b.style.background = "rgba(255,255,255,0.02)";
    b.style.color = "var(--text, #e6e6e6)";
    b.style.cursor = "pointer";
    b.style.fontWeight = "600";
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      // perform move
      try {
        await moveGuestToGroup(personId, currentGroupId, targetGroupId);
      } catch (err) {
        console.error("Error moviendo invitado desde modal:", err);
        alert("No se pudo mover el invitado: " + (err.message || err));
      } finally {
        removeExistingMoveMenu();
      }
    });
    return b;
  }

  // add "Sin grupo" option first
  list.appendChild(buildOption("Sin grupo", null));

  // loading indicator while fetching groups
  const loading = document.createElement("div");
  loading.textContent = "Cargando grupos...";
  loading.style.color = "var(--muted, #a3a3a3)";
  loading.style.padding = "6px 12px";
  list.appendChild(loading);

  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // prevent background scroll while modal open
  document.body.classList.add("no-scroll");

  // focus management
  setTimeout(() => {
    // after appended, focus close button
    closeBtn.focus();
  }, 0);

  // fetch groups and populate options (replace loading)
  try {
    const groups = await listGroups();
    // remove loading node
    if (loading && loading.parentNode) loading.parentNode.removeChild(loading);

    if (!groups || groups.length === 0) {
      const none = document.createElement("div");
      none.textContent = "No hay grupos disponibles";
      none.style.color = "var(--muted, #a3a3a3)";
      list.appendChild(none);
    } else {
      groups.forEach((g) => {
        const label = g.nombre || g.name || g.id;
        const btn = buildOption(label, g.id);
        // highlight current group by disabling its button
        if ((currentGroupId || "") === g.id) {
          btn.style.opacity = "0.7";
          btn.disabled = false; // still allow reassigning if needed
        }
        list.appendChild(btn);
      });
    }
  } catch (err) {
    console.error("Error cargando grupos para modal mover:", err);
    if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
    const errDiv = document.createElement("div");
    errDiv.textContent = "Error cargando grupos";
    errDiv.style.color = "var(--muted, #a3a3a3)";
    list.appendChild(errDiv);
  }

  // close when clicking outside the panel
  overlay.addEventListener("click", (ev) => {
    if (!panel.contains(ev.target)) {
      removeExistingMoveMenu();
    }
  });

  // close on ESC
  function onEsc(ev) {
    if (ev.key === "Escape") {
      removeExistingMoveMenu();
      document.removeEventListener("keydown", onEsc);
    }
  }
  document.addEventListener("keydown", onEsc);
}

/**
 * Move guest between groups (updates person doc and group member arrays)
 */
async function moveGuestToGroup(personId, fromGroupId, toGroupId) {
  try {
    const pRef = doc(db, COLECCION_PERSONA, personId);
    await updateDoc(pRef, { grupoId: toGroupId || null });

    // update old group counts/members
    if (fromGroupId && fromGroupId !== "sin-grupo") {
      try {
        const gFrom = doc(db, COLECCION_GRUPO, fromGroupId);
        await updateDoc(gFrom, {
          miembros: arrayRemove(personId),
          cantidadMiembros: increment(-1),
        });
      } catch (e) {
        console.warn("No se pudo actualizar grupo origen en move:", e);
      }
    }
    // update new group
    if (toGroupId && toGroupId !== "sin-grupo") {
      try {
        const gTo = doc(db, COLECCION_GRUPO, toGroupId);
        await updateDoc(gTo, {
          miembros: arrayUnion(personId),
          cantidadMiembros: increment(1),
        });
      } catch (e) {
        console.warn("No se pudo actualizar grupo destino en move:", e);
      }
    }

    // update caches locally
    if (fromGroupId && groupMembersCache[fromGroupId]) {
      groupMembersCache[fromGroupId] = groupMembersCache[fromGroupId].filter(
        (p) => p.id !== personId,
      );
    }
    // best-effort refresh sin-grupo cache
    if (!toGroupId) {
      try {
        const col = collection(db, COLECCION_PERSONA);
        const q = query(col, where("grupoId", "==", null));
        const snap = await getDocs(q);
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        groupMembersCache["sin-grupo"] = arr;
      } catch (e) {
        // ignore
      }
    }

    await renderGroupsTable();
    await populateGuestGroupList();
  } catch (err) {
    console.error("Error moviendo invitado:", err);
    throw err;
  }
}

/* -------------------------
   updateAllCountsAndOpenLists (in-place update without full rerender)
   — also updates the "all paid" tick icon visibility
   — ahora también actualiza el contador global de invitados visibles
   — y actualiza label del botón toggle-all
*/
function updateAllCountsAndOpenLists() {
  Object.keys(groupRowMap).forEach((groupId) => {
    const info = groupRowMap[groupId];
    if (!info) return;
    const members = groupMembersCache[groupId] || [];
    const visible = applyFiltersToMembers(members);
    info.tdCounts.textContent = `${visible.filter((m) => !!m.pagado).length} / ${visible.length}`;

    // Update the paid-tick icon: show only if group has at least one member and ALL members are pagado
    const allPaid = members.length > 0 && members.every((m) => !!m.pagado);
    if (info.paidIcon) {
      info.paidIcon.style.display = allPaid ? "inline-flex" : "none";
    }

    if (!info.trMembers.hidden) {
      const container = info.membersContainer;
      container.innerHTML = "";
      const ul = document.createElement("ul");
      ul.className = "member-list";
      visible.forEach((m) => {
        const li = document.createElement("li");
        li.className = "member-item";
        const left = document.createElement("div");
        left.className = "member-left";
        const nameSpan = document.createElement("span");
        nameSpan.className = "member-name";
        nameSpan.textContent = m.nombre || m.name || m.id;
        const genderBadge = document.createElement("span");
        genderBadge.className =
          "badge badge-gender " +
          (m.genero === "hombre"
            ? "male"
            : m.genero === "mujer"
              ? "female"
              : "");
        genderBadge.textContent = m.genero
          ? m.genero === "hombre"
            ? "Hombre"
            : "Mujer"
          : "—";
        const paidBadge = document.createElement("span");
        paidBadge.className =
          "badge badge-paid " + (m.pagado ? "paid" : "unpaid");
        paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
        paidBadge.style.cursor = "pointer";
        paidBadge.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const current = !!m.pagado;
          const allMembers = groupMembersCache[groupId] || [];
          const idx = allMembers.findIndex((x) => x.id === m.id);
          if (idx >= 0) allMembers[idx].pagado = !current;
          m.pagado = !current;
          paidBadge.classList.toggle("paid", m.pagado);
          paidBadge.classList.toggle("unpaid", !m.pagado);
          paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
          const newVisible = applyFiltersToMembers(
            groupMembersCache[groupId] || [],
          );
          info.tdCounts.textContent = `${newVisible.filter((x) => !!x.pagado).length} / ${newVisible.length}`;
          try {
            await togglePersonPayment(m.id, current, groupId, info.tdCounts);
          } catch (e) {
            console.error(e);
          }
        });

        left.appendChild(nameSpan);
        left.appendChild(genderBadge);
        left.appendChild(paidBadge);

        const right = document.createElement("div");
        right.className = "member-right";

        // three-dots move button for guest (append BEFORE delete)
        const btnMoreGuest = document.createElement("button");
        btnMoreGuest.className = "btn-more guest";
        btnMoreGuest.title = "Mover invitado";
        btnMoreGuest.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
        btnMoreGuest.addEventListener("click", (ev) => {
          ev.stopPropagation();
          showMoveGuestMenu(btnMoreGuest, m.id, groupId);
        });
        right.appendChild(btnMoreGuest);

        const btnDelPerson = document.createElement("button");
        btnDelPerson.className = "btn-trash";
        btnDelPerson.title = "Eliminar invitado";
        btnDelPerson.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon-path" d="M9 3h6l1 1h4v2H4V4h4l1-1zm-1 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9H8z"/></svg>`;
        btnDelPerson.addEventListener("click", (ev) => {
          ev.stopPropagation();
          deletePerson(m.id, groupId);
        });
        right.appendChild(btnDelPerson);

        li.appendChild(left);
        li.appendChild(right);
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }
  });

  // Update global guest counter (visible count)
  updateGuestCounterUI();

  // Update toggle-all button label
  updateToggleAllButtonLabel();
}

/* -------------------------
   Sorting helper: compute visible counts (used for ordering)
   sortBy: 'name'|'members'|'paid'
   NOW: groups where ALL members are pagado go to top.
   Within "all-paid" and "not-all-paid" groups, apply the selected sort.
*/
function sortGroupsList(groups) {
  const sortBy = sortSelect && sortSelect.value ? sortSelect.value : "name";
  // compute helper values
  const enriched = groups.map((g) => {
    const members = groupMembersCache[g.id] || [];
    const visible = applyFiltersToMembers(members);
    const paidCount = visible.filter((m) => !!m.pagado).length;
    const allPaid = members.length > 0 && members.every((m) => !!m.pagado);
    return {
      group: g,
      visibleCount: visible.length,
      paidCount,
      nameLower: (g.nombre || g.name || "").toString().toLowerCase(),
      allPaid,
    };
  });

  // primary sort: allPaid groups first
  enriched.sort((a, b) => {
    if (a.allPaid && !b.allPaid) return -1;
    if (!a.allPaid && b.allPaid) return 1;
    // if both have same allPaid value, fallback to selected sort
    if (sortBy === "name") {
      return a.nameLower.localeCompare(b.nameLower);
    } else if (sortBy === "members") {
      const diff = b.visibleCount - a.visibleCount;
      if (diff !== 0) return diff;
      return a.nameLower.localeCompare(b.nameLower);
    } else if (sortBy === "paid") {
      const diff = b.paidCount - a.paidCount;
      if (diff !== 0) return diff;
      return a.nameLower.localeCompare(b.nameLower);
    }
    // default fallback
    return a.nameLower.localeCompare(b.nameLower);
  });

  return enriched.map((e) => e.group);
}

/* -------------------------
   Render whole table (initial / structural changes)
   Captura grupos abiertos antes de rerender para preservarlos.
*/
async function renderGroupsTable() {
  // capture open groups to restore after full rebuild
  const openGroupEls = document.querySelectorAll(
    'tr.group-row[aria-expanded="true"]',
  );
  const openGroups = new Set(
    Array.from(openGroupEls).map((el) => el.getAttribute("data-group-id")),
  );

  groupsTbody.innerHTML = "";
  // clear map
  Object.keys(groupRowMap).forEach((k) => delete groupRowMap[k]);

  try {
    const groups = await listGroups();
    if (!groups) {
      noGroups.style.display = "block";
      return;
    }

    // load members for each group in parallel
    const memberPromises = groups.map((g) =>
      findPeopleByGroup(g.id).catch(() => []),
    );
    const membersArrays = await Promise.all(memberPromises);

    const ungrouped = await fetchUngroupedPeople();

    groups.forEach(
      (g, i) => (groupMembersCache[g.id] = membersArrays[i] || []),
    );
    if (ungrouped.length > 0) groupMembersCache["sin-grupo"] = ungrouped;
    else delete groupMembersCache["sin-grupo"];

    // prepare groups to render and sort them using current sortSelect and visible counts
    const groupsToRenderRaw = groups.slice();
    if (ungrouped.length > 0)
      groupsToRenderRaw.push({
        id: "sin-grupo",
        nombre: "Sin Grupo",
        responsable: "",
      });

    const groupsToRender = sortGroupsList(groupsToRenderRaw);

    if (groupsToRender.length === 0) {
      noGroups.style.display = "block";
      return;
    }
    noGroups.style.display = "none";

    for (const g of groupsToRender) {
      const members = groupMembersCache[g.id] || [];

      // group row
      const trGroup = document.createElement("tr");
      trGroup.className = "group-row";
      trGroup.setAttribute("data-group-id", g.id);
      trGroup.setAttribute("role", "button");
      const isOpen = openGroups.has(g.id);
      trGroup.setAttribute("aria-expanded", isOpen ? "true" : "false");

      const tdGroup = document.createElement("td");
      const caret = document.createElement("span");
      caret.className = "caret" + (isOpen ? " open" : "");
      caret.textContent = "▶";
      tdGroup.appendChild(caret);
      const nameSpan = document.createElement("span");
      nameSpan.textContent = " " + (g.nombre || g.name || g.id);
      tdGroup.appendChild(nameSpan);

      // compute "all paid" for the full group's members (not filtered)
      const allPaid = members.length > 0 && members.every((m) => !!m.pagado);
      const paidIcon = document.createElement("span");
      paidIcon.className = "group-paid";
      paidIcon.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M4 12l4 4L20 6"/></svg>`;
      paidIcon.style.display = allPaid ? "inline-flex" : "none";
      tdGroup.appendChild(paidIcon);

      trGroup.appendChild(tdGroup);

      const tdResp = document.createElement("td");
      tdResp.textContent = g.responsable || "";
      trGroup.appendChild(tdResp);

      const visible = applyFiltersToMembers(members);
      const tdCounts = document.createElement("td");
      tdCounts.textContent = `${visible.filter((m) => !!m.pagado).length} / ${visible.length}`;
      trGroup.appendChild(tdCounts);

      const tdActions = document.createElement("td");
      tdActions.className = "actions-col";
      tdActions.style.textAlign = "right";

      // three-dots button for group (rename) -> append BEFORE delete so it's left of delete
      if (g.id !== "sin-grupo") {
        const btnMoreGroup = document.createElement("button");
        btnMoreGroup.className = "btn-more group";
        btnMoreGroup.title = "Configuración";
        btnMoreGroup.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
        btnMoreGroup.addEventListener("click", (ev) => {
          ev.stopPropagation(); // prevent row toggle
          promptRenameGroup(g.id, g.nombre || g.name || "");
        });
        tdActions.appendChild(btnMoreGroup);
      }

      // Delete button for group (if not sin-grupo)
      if (g.id !== "sin-grupo") {
        const btnDelGroup = document.createElement("button");
        btnDelGroup.className = "btn-trash";
        btnDelGroup.title = "Eliminar grupo";
        btnDelGroup.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon-path" d="M9 3h6l1 1h4v2H4V4h4l1-1zm-1 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9H8z"/></svg>`;
        btnDelGroup.addEventListener("click", (ev) => {
          ev.stopPropagation();
          deleteGroup(g.id);
        });
        tdActions.appendChild(btnDelGroup);
      }

      trGroup.appendChild(tdActions);

      groupsTbody.appendChild(trGroup);

      // members row
      const trMembers = document.createElement("tr");
      trMembers.className = "members-row";
      trMembers.hidden = !isOpen;
      const tdMembersWrap = document.createElement("td");
      tdMembersWrap.colSpan = 4;
      tdMembersWrap.innerHTML = `<div class="member-placeholder" data-group-id="${g.id}"></div>`;
      trMembers.appendChild(tdMembersWrap);
      groupsTbody.appendChild(trMembers);

      const membersContainer = tdMembersWrap.querySelector(
        ".member-placeholder",
      );
      groupRowMap[g.id] = {
        trGroup,
        trMembers,
        tdCounts,
        membersContainer,
        caret,
        paidIcon,
      };

      // if group should be open, render members synchronously (no flicker)
      if (isOpen) {
        const visibleMembers = applyFiltersToMembers(members);
        membersContainer.innerHTML = "";
        const ul = document.createElement("ul");
        ul.className = "member-list";
        visibleMembers.forEach((m) => {
          const li = document.createElement("li");
          li.className = "member-item";
          const left = document.createElement("div");
          left.className = "member-left";
          const nameSpan = document.createElement("span");
          nameSpan.className = "member-name";
          nameSpan.textContent = m.nombre || m.name || m.id;
          const genderBadge = document.createElement("span");
          genderBadge.className =
            "badge badge-gender " +
            (m.genero === "hombre"
              ? "male"
              : m.genero === "mujer"
                ? "female"
                : "");
          genderBadge.textContent = m.genero
            ? m.genero === "hombre"
              ? "Hombre"
              : "Mujer"
            : "—";
          const paidBadge = document.createElement("span");
          paidBadge.className =
            "badge badge-paid " + (m.pagado ? "paid" : "unpaid");
          paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
          paidBadge.style.cursor = "pointer";

          paidBadge.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const current = !!m.pagado;
            const allMembers = groupMembersCache[g.id] || [];
            const idx = allMembers.findIndex((x) => x.id === m.id);
            if (idx >= 0) allMembers[idx].pagado = !current;
            m.pagado = !current;
            paidBadge.classList.toggle("paid", m.pagado);
            paidBadge.classList.toggle("unpaid", !m.pagado);
            paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
            const newVisible = applyFiltersToMembers(
              groupMembersCache[g.id] || [],
            );
            tdCounts.textContent = `${newVisible.filter((x) => !!x.pagado).length} / ${newVisible.length}`;
            try {
              await togglePersonPayment(m.id, current, g.id, tdCounts);
            } catch (e) {
              console.error(e);
            }
          });

          left.appendChild(nameSpan);
          left.appendChild(genderBadge);
          left.appendChild(paidBadge);

          const right = document.createElement("div");
          right.className = "member-right";

          // three-dots move button for guest (append BEFORE delete)
          const btnMoreGuest = document.createElement("button");
          btnMoreGuest.className = "btn-more guest";
          btnMoreGuest.title = "Mover invitado";
          btnMoreGuest.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
          btnMoreGuest.addEventListener("click", (ev) => {
            ev.stopPropagation();
            showMoveGuestMenu(btnMoreGuest, m.id, g.id);
          });
          right.appendChild(btnMoreGuest);

          const btnDelPerson = document.createElement("button");
          btnDelPerson.className = "btn-trash";
          btnDelPerson.title = "Eliminar invitado";
          btnDelPerson.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon-path" d="M9 3h6l1 1h4v2H4V4h4l1-1zm-1 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9H8z"/></svg>`;
          btnDelPerson.addEventListener("click", (ev) => {
            ev.stopPropagation();
            deletePerson(m.id, g.id);
          });
          right.appendChild(btnDelPerson);

          li.appendChild(left);
          li.appendChild(right);
          ul.appendChild(li);
        });
        membersContainer.appendChild(ul);
      }

      // click to expand/collapse (in-place)
      trGroup.addEventListener("click", (e) => {
        const isNowOpen = trMembers.hidden === false;
        if (isNowOpen) {
          trGroup.setAttribute("aria-expanded", "false");
          groupRowMap[g.id].caret.classList.remove("open");
          trMembers.hidden = true;
        } else {
          trGroup.setAttribute("aria-expanded", "true");
          groupRowMap[g.id].caret.classList.add("open");
          // render members synchronously from cache
          const membersLocal = groupMembersCache[g.id] || [];
          const visibleMembers = applyFiltersToMembers(membersLocal);
          membersContainer.innerHTML = "";
          const ul = document.createElement("ul");
          ul.className = "member-list";
          visibleMembers.forEach((m) => {
            const li = document.createElement("li");
            li.className = "member-item";
            const left = document.createElement("div");
            left.className = "member-left";
            const nameSpan = document.createElement("span");
            nameSpan.className = "member-name";
            nameSpan.textContent = m.nombre || m.name || m.id;
            const genderBadge = document.createElement("span");
            genderBadge.className =
              "badge badge-gender " +
              (m.genero === "hombre"
                ? "male"
                : m.genero === "mujer"
                  ? "female"
                  : "");
            genderBadge.textContent = m.genero
              ? m.genero === "hombre"
                ? "Hombre"
                : "Mujer"
              : "—";
            const paidBadge = document.createElement("span");
            paidBadge.className =
              "badge badge-paid " + (m.pagado ? "paid" : "unpaid");
            paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
            paidBadge.style.cursor = "pointer";

            paidBadge.addEventListener("click", async (ev) => {
              ev.stopPropagation();
              const current = !!m.pagado;
              const allMembers = groupMembersCache[g.id] || [];
              const idx = allMembers.findIndex((x) => x.id === m.id);
              if (idx >= 0) allMembers[idx].pagado = !current;
              m.pagado = !current;
              paidBadge.classList.toggle("paid", m.pagado);
              paidBadge.classList.toggle("unpaid", !m.pagado);
              paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";
              const newVisible = applyFiltersToMembers(
                groupMembersCache[g.id] || [],
              );
              tdCounts.textContent = `${newVisible.filter((x) => !!x.pagado).length} / ${newVisible.length}`;
              try {
                await togglePersonPayment(m.id, current, g.id, tdCounts);
              } catch (e) {
                console.error(e);
              }
            });

            left.appendChild(nameSpan);
            left.appendChild(genderBadge);
            left.appendChild(paidBadge);

            const right = document.createElement("div");
            right.className = "member-right";

            // three-dots move button for guest (append BEFORE delete)
            const btnMoreGuest = document.createElement("button");
            btnMoreGuest.className = "btn-more guest";
            btnMoreGuest.title = "Mover invitado";
            btnMoreGuest.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
            btnMoreGuest.addEventListener("click", (ev) => {
              ev.stopPropagation();
              showMoveGuestMenu(btnMoreGuest, m.id, g.id);
            });
            right.appendChild(btnMoreGuest);

            const btnDelPerson = document.createElement("button");
            btnDelPerson.className = "btn-trash";
            btnDelPerson.title = "Eliminar invitado";
            btnDelPerson.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon-path" d="M9 3h6l1 1h4v2H4V4h4l1-1zm-1 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9H8z"/></svg>`;
            btnDelPerson.addEventListener("click", (ev) => {
              ev.stopPropagation();
              deletePerson(m.id, g.id);
            });
            right.appendChild(btnDelPerson);

            li.appendChild(left);
            li.appendChild(right);
            ul.appendChild(li);
          });

          membersContainer.appendChild(ul);
          trMembers.hidden = false;
          trMembers.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        // update toggle-all button label whenever a single row toggles
        updateToggleAllButtonLabel();
      });
    } // end for
  } catch (err) {
    console.error("Error cargando tabla de grupos:", err);
    groupsTbody.innerHTML = `<tr><td colspan="4">Error cargando datos</td></tr>`;
  }

  // Update guest counter after we populate/refresh caches
  updateGuestCounterUI();

  // Ensure toggle-all button exists and has correct label
  ensureToggleAllButton();
  updateToggleAllButtonLabel();
}

/* -------------------------
   Prevent default for forms not used
*/
document.querySelectorAll("form").forEach((f) => {
  if (f.id === "formCreateGroup" || f.id === "formAddGuest") return;
  f.addEventListener("submit", (e) => e.preventDefault());
});

/* Cancel buttons + overlay close */
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
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* -------------------------
   Sort change handler
*/
sortSelect.addEventListener("change", async () => {
  await renderGroupsTable();
});

/* Init */
(async function init() {
  buildGuestGenderList();
  updateFilterButtonsUI();
  await populateGuestGroupList();
  await renderGroupsTable();
  ensureGuestCounter(); // ensure counter exists on init
  ensureToggleAllButton(); // ensure toggle all button exists on init
})();
