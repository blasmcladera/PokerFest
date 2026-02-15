// js/groupsService.js
// Servicio sencillo para trabajar con la colección "grupos".

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { COLECCION_GRUPO } from "./dbConfig.js"; // <-- usá dbConfig.js (me pediste acordarme)

const groupsCol = () => collection(db, COLECCION_GRUPO);

/**
 * Crea un grupo en Firestore.
 * groupData: { nombre: string, responsable?: string, confirmado?: boolean }
 * Devuelve id del documento creado.
 */
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
    miembros: [], // array de personDocId
    cantidadMiembros: 0,
    fechaCreacion: serverTimestamp(),
  };

  const ref = await addDoc(groupsCol(), payload);
  return ref.id;
}

/**
 * Lista grupos (snapshot único), ordenados por nombre asc.
 * Devuelve Promise<Array<{id, ...data}>>.
 */
export async function listGroups() {
  const q = query(groupsCol(), orderBy("nombre", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * onGroupsSnapshot(callback) -> subscribe a cambios en grupos en tiempo real.
 * callback recibe (arrayDeGrupos). Retorna función unsubscribe().
 */
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
