// js/menu.js
// Tabla de grupos + Sin Grupo + toggling pago + eliminación personas/grupos
// Similar a la versión anterior, con la papelera ahora en la columna de acciones
// Requiere: groupsService.js (createGroup, listGroups, addPersonToGroupAtomic)
//           peopleService.js (createPerson, findPeopleByGroup)
//           dbConfig.js (COLECCION_PERSONA, COLECCION_GRUPO), firebase.js (db)

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
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* -----------------------
   DOM refs
   ----------------------- */
const btnCreateGroup = document.getElementById("btnCreateGroup");
const btnAddGuest = document.getElementById("btnAddGuest");

const modalOverlay = document.getElementById("modalOverlay");
const modalCreate = document.getElementById("modalCreateGroup");
const modalAddGuest = document.getElementById("modalAddGuest");
const cancelButtons = document.querySelectorAll(".btn-cancel");

/* Crear grupo refs */
const formCreateGroup = document.getElementById("formCreateGroup");
const inputGroupName = document.getElementById("groupName");
const inputGroupResponsible = document.getElementById("groupResponsible");
const inputGroupConfirmed = document.getElementById("groupConfirmed");
const submitCreateBtn = formCreateGroup.querySelector(".btn-submit");

/* Agregar invitado refs */
const formAddGuest = document.getElementById("formAddGuest");
const guestName = document.getElementById("guestName");
const guestPaid = document.getElementById("guestPaid");
const guestGenderToggle = document.getElementById("guestGenderToggle");
const guestGenderLabel = document.getElementById("guestGenderLabel");
const guestGenderList = document.getElementById("guestGenderList");
const guestGroupToggle = document.getElementById("guestGroupToggle");
const guestGroupLabel = document.getElementById("guestGroupLabel");
const guestGroupList = document.getElementById("guestGroupList");

/* Table refs */
const groupsTbody = document.getElementById("groupsTbody");
const noGroups = document.getElementById("noGroups");

/* Dropdown state */
let guestGenderSelected = null; // 'mujer' | 'hombre' | null
let guestGroupSelectedId = ""; // '' == Sin grupo

/* Cache members by groupId */
const groupMembersCache = {};

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

/* small UI success */
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
   Dropdowns - Gender
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
   Dropdowns - Groups (dynamic)
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

/* outside click / ESC */
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
   Helper: toggle payment (optimistic) - update using COLECCION_PERSONA
   ------------------------- */
async function togglePersonPayment(personId, currentValue, groupId, tdCounts) {
  try {
    const members = groupMembersCache[groupId] || [];
    const idx = members.findIndex((p) => p.id === personId);
    if (idx >= 0) members[idx].pagado = !currentValue;

    const newPaidCount = (groupMembersCache[groupId] || []).filter(
      (m) => !!m.pagado,
    ).length;
    const total = (groupMembersCache[groupId] || []).length;
    if (tdCounts) tdCounts.textContent = `${newPaidCount} / ${total}`;

    const pRef = doc(db, COLECCION_PERSONA, personId);
    await updateDoc(pRef, { pagado: !currentValue });
  } catch (err) {
    console.error("Error actualizando pago:", err);
    alert("No se pudo actualizar el estado de pago: " + (err.message || err));
    await renderGroupsTable();
  }
}

/* -------------------------
   Helper: delete person
   ------------------------- */
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

    if (groupMembersCache[groupId]) {
      groupMembersCache[groupId] = groupMembersCache[groupId].filter(
        (p) => p.id !== personId,
      );
    }
    await renderGroupsTable();
  } catch (err) {
    console.error("Error eliminando persona:", err);
    alert("No se pudo eliminar la persona: " + (err.message || err));
  }
}

/* -------------------------
   Helper: delete group
   ------------------------- */
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
      return updateDoc(pRef, { grupoId: null, groupId: null }).catch((err) => {
        console.error(
          "No se pudo actualizar miembro al borrar grupo",
          m.id,
          err,
        );
      });
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
   Utility: fetch ungrouped people (checks grupoId==null and groupId==null)
   ------------------------- */
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
   RENDER TABLE: prefetch members for counts + Sin Grupo
   ------------------------- */
async function renderGroupsTable() {
  groupsTbody.innerHTML = "";
  try {
    const groups = await listGroups();
    if (!groups) {
      noGroups.style.display = "block";
      return;
    }

    const memberPromises = groups.map((g) =>
      findPeopleByGroup(g.id).catch(() => []),
    );
    const membersArrays = await Promise.all(memberPromises);

    const ungrouped = await fetchUngroupedPeople();

    groups.forEach(
      (g, i) => (groupMembersCache[g.id] = membersArrays[i] || []),
    );
    if (ungrouped.length > 0) groupMembersCache["sin-grupo"] = ungrouped;

    const groupsToRender = groups.slice();
    if (ungrouped.length > 0)
      groupsToRender.push({
        id: "sin-grupo",
        nombre: "Sin Grupo",
        responsable: "",
      });

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
      trGroup.setAttribute("aria-expanded", "false");

      // Grupo cell (caret + name)
      const tdGroup = document.createElement("td");
      const caret = document.createElement("span");
      caret.className = "caret";
      caret.textContent = "▶";
      tdGroup.appendChild(caret);
      const nameSpan = document.createElement("span");
      nameSpan.textContent = " " + (g.nombre || g.name || g.id);
      tdGroup.appendChild(nameSpan);
      trGroup.appendChild(tdGroup);

      // Responsable
      const tdResp = document.createElement("td");
      tdResp.textContent = g.responsable || "";
      trGroup.appendChild(tdResp);

      // Counts (paid/total)
      const paidCount = members.filter((m) => !!m.pagado).length;
      const totalCount = members.length;
      const tdCounts = document.createElement("td");
      tdCounts.textContent = `${paidCount} / ${totalCount}`;
      trGroup.appendChild(tdCounts);

      // Actions column (trash for group)
      const tdActions = document.createElement("td");
      tdActions.className = "actions-col";
      tdActions.style.textAlign = "right";
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

      // members row hidden
      const trMembers = document.createElement("tr");
      trMembers.className = "members-row";
      trMembers.hidden = true;
      const tdMembersWrap = document.createElement("td");
      tdMembersWrap.colSpan = 4;
      tdMembersWrap.innerHTML = `<div class="member-placeholder" data-group-id="${g.id}"></div>`;
      trMembers.appendChild(tdMembersWrap);
      groupsTbody.appendChild(trMembers);

      // click toggles expand/collapse
      trGroup.addEventListener("click", async () => {
        const isOpen = trGroup.getAttribute("aria-expanded") === "true";
        if (isOpen) {
          trGroup.setAttribute("aria-expanded", "false");
          caret.classList.remove("open");
          trMembers.hidden = true;
        } else {
          trGroup.setAttribute("aria-expanded", "true");
          caret.classList.add("open");

          const membersLocal = groupMembersCache[g.id] || [];
          const container = tdMembersWrap.querySelector(".member-placeholder");
          container.innerHTML = "";
          const ul = document.createElement("ul");
          ul.className = "member-list";

          membersLocal.forEach((m) => {
            const li = document.createElement("li");
            li.className = "member-item";

            // left part: name + badges
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
            paidBadge.setAttribute("data-person-id", m.id);

            left.appendChild(nameSpan);
            left.appendChild(genderBadge);
            left.appendChild(paidBadge);

            // right part: trash button (aligned to right)
            const right = document.createElement("div");
            right.className = "member-right";

            const btnDelPerson = document.createElement("button");
            btnDelPerson.className = "btn-trash";
            btnDelPerson.title = "Eliminar invitado";
            btnDelPerson.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon-path" d="M9 3h6l1 1h4v2H4V4h4l1-1zm-1 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9H8z"/></svg>`;
            btnDelPerson.addEventListener("click", (ev) => {
              ev.stopPropagation();
              deletePerson(m.id, g.id);
            });

            right.appendChild(btnDelPerson);

            // attach toggle payment on the paidBadge (optimistic)
            paidBadge.addEventListener("click", async (ev) => {
              ev.stopPropagation();
              const personId = m.id;
              const current = !!m.pagado;

              // optimistic UI
              m.pagado = !current;
              paidBadge.classList.toggle("paid", m.pagado);
              paidBadge.classList.toggle("unpaid", !m.pagado);
              paidBadge.textContent = m.pagado ? "Pagó" : "No pagó";

              // update counts
              const newPaidCount = (groupMembersCache[g.id] || []).filter(
                (x) => !!x.pagado,
              ).length;
              tdCounts.textContent = `${newPaidCount} / ${groupMembersCache[g.id].length}`;

              // persist
              try {
                await togglePersonPayment(personId, current, g.id, tdCounts);
              } catch (err) {
                console.error(err);
              }
            });

            li.appendChild(left);
            li.appendChild(right);
            ul.appendChild(li);
          });

          container.appendChild(ul);
          trMembers.hidden = false;
          trMembers.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  } catch (err) {
    console.error("Error cargando tabla de grupos:", err);
    groupsTbody.innerHTML = `<tr><td colspan="4">Error cargando datos</td></tr>`;
  }
}

/* Prevent default for other forms */
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

/* Init */
(async function init() {
  buildGuestGenderList();
  await populateGuestGroupList();
  await renderGroupsTable();
})();
