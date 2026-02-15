// js/groupsService.js
// Servicio para trabajar con la colección "grupos" (incluye operación atómica para añadir persona a grupo)

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  doc,
  runTransaction,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { COLECCION_GRUPO, COLECCION_PERSONA } from "./dbConfig.js"; // usa dbConfig.js

const groupsCol = () => collection(db, COLECCION_GRUPO);

export async function createGroup(groupData = {}) {
  if (!groupData || !groupData.nombre || !groupData.nombre.trim()) {
    throw new Error("El nombre del grupo es obligatorio.");
  }
  const payload = {
    nombre: groupData.nombre.trim(),
    responsable: groupData.responsable
      ? String(groupData.responsable).trim()
      : "",
    confirmado: !!groupData.confirmado,
    miembros: [],
    cantidadMiembros: 0,
    fechaCreacion: serverTimestamp(),
  };
  const ref = await addDoc(groupsCol(), payload);
  return ref.id;
}

export async function listGroups() {
  const q = query(groupsCol(), orderBy("nombre", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function onGroupsSnapshot(callback) {
  const q = query(groupsCol(), orderBy("nombre", "asc"));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(data);
    },
    (err) => {
      console.error("onGroupsSnapshot error:", err);
    },
  );
  return unsubscribe;
}

/**
 * addPersonToGroupAtomic
 * Ejecuta una transacción que:
 * - añade personId a groups/{groupId}.miembros (arrayUnion)
 * - incrementa cantidadMiembros
 * - actualiza people/{personId}.grupoId = groupId
 *
 * Lanza error si el grupo o la persona no existen.
 */
export async function addPersonToGroupAtomic(groupId, personId) {
  if (!groupId) throw new Error("groupId requerido");
  if (!personId) throw new Error("personId requerido");

  const groupRef = doc(db, COLECCION_GRUPO, groupId);
  const personRef = doc(db, COLECCION_PERSONA, personId);

  await runTransaction(db, async (t) => {
    const gSnap = await t.get(groupRef);
    if (!gSnap.exists()) throw new Error("Grupo no encontrado");

    const pSnap = await t.get(personRef);
    if (!pSnap.exists()) throw new Error("Persona no encontrada");

    // sólo añadir si no está ya presente
    const currentMembers = gSnap.data().miembros || [];
    if (!currentMembers.includes(personId)) {
      t.update(groupRef, {
        miembros: arrayUnion(personId),
        cantidadMiembros: (gSnap.data().cantidadMiembros || 0) + 1,
      });
    }

    // actualizar persona con el groupId
    t.update(personRef, { grupoId: groupId });
  });
}
