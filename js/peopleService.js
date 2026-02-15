// js/peopleService.js
/**
 * Capa de acceso para la colección "personas".
 * - Importa `db` desde tu js/firebase.js (asegurate que exporte `db`).
 * - Importa constantes desde ./constants.js (ajusta la ruta si tus constantes están en src/).
 *
 * Exporta funciones CRUD básicas y utilidades.
 */

import { db } from "./firebase.js"; // ajusta ruta si es necesario
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { COLECCION_PERSONA, CAMPOS_PERSONA, GENEROS } from "./dbConfig.js"; // ajustá la ruta si tus constantes están en otro lugar

/* ---------------------------
 * Helpers / Validaciones
 * --------------------------- */

/**
 * Valida estructura mínima de personData.
 * Devuelve { valid: boolean, errors: string[] }
 */
export function validatePersonData(personData = {}) {
  const errors = [];

  // nombre/apellido requeridos y no vacíos
  if (
    !personData.nombre ||
    typeof personData.nombre !== "string" ||
    !personData.nombre.trim()
  ) {
    errors.push("El campo 'nombre' es obligatorio.");
  }
  if (
    !personData.apellido ||
    typeof personData.apellido !== "string" ||
    !personData.apellido.trim()
  ) {
    errors.push("El campo 'apellido' es obligatorio.");
  }

  // género (opcional pero si viene, debe ser uno de los permitidos)
  if (personData.genero !== undefined && personData.genero !== null) {
    const validGeneros = Object.values(GENEROS || {});
    if (!validGeneros.includes(personData.genero)) {
      errors.push(
        `'genero' inválido. Valores permitidos: ${validGeneros.join(", ")}`,
      );
    }
  }

  // pagado si viene, debe ser boolean
  if (
    personData.pagado !== undefined &&
    typeof personData.pagado !== "boolean"
  ) {
    errors.push("'pagado' debe ser boolean (true/false).");
  }

  // grupoId si viene debe ser string o null
  if (personData.grupoId !== undefined && personData.grupoId !== null) {
    if (typeof personData.grupoId !== "string") {
      errors.push("'grupoId' debe ser string o null.");
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ---------------------------
 * Colección reference
 * --------------------------- */

const peopleCol = (/* no args */) => collection(db, COLECCION_PERSONA);

/* ---------------------------
 * CRUD Básico
 * --------------------------- */

/**
 * Crea una persona.
 * personData: { nombre, apellido, genero?, pagado? (bool), grupoId? }
 * Devuelve id del documento creado (string).
 */
export async function createPerson(personData = {}) {
  const { valid, errors } = validatePersonData(personData);
  if (!valid) throw new Error("Datos inválidos: " + errors.join(" | "));

  const payload = {
    nombre: personData.nombre.trim(),
    apellido: personData.apellido.trim(),
    genero: personData.genero || null,
    pagado: typeof personData.pagado === "boolean" ? personData.pagado : false,
    grupoId: personData.grupoId || null,
    [CAMPOS_PERSONA.FECHA_REGISTRO || "fechaRegistro"]: serverTimestamp(),
  };

  const ref = await addDoc(peopleCol(), payload);
  return ref.id;
}

/**
 * Obtiene una persona por id.
 * Devuelve { id, ...data } o null si no existe.
 */
export async function getPerson(personId) {
  if (!personId) throw new Error("personId requerido");
  const ref = doc(db, COLECCION_PERSONA, personId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Lista todas las personas, ordenadas por fecha de registro descendente.
 * Devuelve array de {id, ...data}
 */
export async function listPeople() {
  // si tu campo fechaRegistro tiene otro nombre, se adapta con CAMPOS_PERSONA.FECHA_REGISTRO
  const fechaCampo = CAMPOS_PERSONA.FECHA_REGISTRO || "fechaRegistro";
  const q = query(peopleCol(), orderBy(fechaCampo, "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Actualiza una persona.
 * updates: Partial<{nombre, apellido, genero, pagado, grupoId}>
 */
export async function updatePerson(personId, updates = {}) {
  if (!personId) throw new Error("personId requerido");
  // opcional: validar sólo los campos provistos
  const toValidate = {
    nombre: updates.nombre !== undefined ? updates.nombre : undefined,
    apellido: updates.apellido !== undefined ? updates.apellido : undefined,
    genero: updates.genero !== undefined ? updates.genero : undefined,
    pagado: updates.pagado !== undefined ? updates.pagado : undefined,
    grupoId: updates.grupoId !== undefined ? updates.grupoId : undefined,
  };
  const { valid, errors } = validatePersonData(toValidate);
  if (!valid) throw new Error("Datos inválidos: " + errors.join(" | "));

  // no actualizamos fechaRegistro aquí
  const safeUpdates = {};
  if (updates.nombre !== undefined) safeUpdates.nombre = updates.nombre.trim();
  if (updates.apellido !== undefined)
    safeUpdates.apellido = updates.apellido.trim();
  if (updates.genero !== undefined) safeUpdates.genero = updates.genero;
  if (updates.pagado !== undefined) safeUpdates.pagado = !!updates.pagado;
  if (updates.grupoId !== undefined) safeUpdates.grupoId = updates.grupoId;

  const ref = doc(db, COLECCION_PERSONA, personId);
  await updateDoc(ref, safeUpdates);
}

/**
 * Borra una persona.
 */
export async function deletePerson(personId) {
  if (!personId) throw new Error("personId requerido");
  const ref = doc(db, COLECCION_PERSONA, personId);
  await deleteDoc(ref);
}

/* ---------------------------
 * Utilidades
 * --------------------------- */

/**
 * Marca/desmarca pago.
 */
export async function setPersonPaid(personId, paid = true) {
  if (!personId) throw new Error("personId requerido");
  const ref = doc(db, COLECCION_PERSONA, personId);
  await updateDoc(ref, { pagado: !!paid });
}

/**
 * Buscar personas por grupoId.
 * Devuelve array de personas.
 */
export async function findPeopleByGroup(groupId) {
  if (!groupId) throw new Error("groupId requerido");
  const q = query(peopleCol(), where("grupoId", "==", groupId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Listener en tiempo real sobre la colección personas.
 * callback recibe (arrayDePersonas).
 * Retorna la función unsubscribe.
 */
export function onPeopleSnapshot(callback) {
  const fechaCampo = CAMPOS_PERSONA.FECHA_REGISTRO || "fechaRegistro";
  const q = query(peopleCol(), orderBy(fechaCampo, "desc"));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(data);
    },
    (err) => {
      console.error("onPeopleSnapshot error:", err);
      // opcional: podríamos llamar callback([]) o propagar error
    },
  );
  return unsubscribe;
}
