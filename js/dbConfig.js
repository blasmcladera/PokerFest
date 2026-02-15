// =========================
// COLECCIONES
// =========================

export const COLECCION_PERSONA = "personas";
export const COLECCION_GRUPO = "grupos";

// =========================
// CAMPOS PERSONA
// =========================

export const CAMPOS_PERSONA = {
  NOMBRE: "nombre",
  APELLIDO: "apellido",
  GENERO: "genero",
  PAGADO: "pagado",
  GRUPO_ID: "grupoId",
  FECHA_REGISTRO: "fechaRegistro",
};

// =========================
// VALORES PERMITIDOS PERSONA
// =========================

export const GENEROS = {
  MUJER: "mujer",
  HOMBRE: "hombre",
};

export const ESTADO_PAGO = {
  PAGADO: true,
  NO_PAGADO: false,
};

// =========================
// CAMPOS GRUPO
// =========================

export const CAMPOS_GRUPO = {
  NOMBRE: "nombre",
  RESPONSABLE: "responsable",
  CONFIRMADO: "confirmado",
  MIEMBROS: "miembros",
  CANTIDAD_MIEMBROS: "cantidadMiembros",
  FECHA_CREACION: "fechaCreacion",
};

// =========================
// VALORES PERMITIDOS GRUPO
// =========================

export const ESTADO_CONFIRMACION = {
  CONFIRMADO: true,
  NO_CONFIRMADO: false,
};
