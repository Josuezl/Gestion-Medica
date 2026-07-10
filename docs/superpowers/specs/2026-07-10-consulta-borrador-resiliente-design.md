# Guardado resiliente en Nueva Consulta (borrador local + aviso de conexión)

**Fecha:** 2026-07-10
**Estado:** Aprobado por el usuario (enfoque A)

## Problema

Un médico reportó (2 veces el mismo día) que al presionar "Finalizar Consulta & Recetar" el botón
se queda en "Guardando Consulta..." indefinidamente cuando se pierde la conexión a internet. No hay
ningún aviso, y al refrescar la página se pierde TODO el contenido de la consulta.

**Causa raíz:** en `app/dashboard/consultations/new/NewConsultationClient.tsx`, `handleSubmit` hace
`await createConsultation(...)` sin `try/catch`. Si el fetch del server action falla (red caída),
la excepción mata el handler en silencio y `loading` queda en `true` para siempre. Además, el
formulario vive solo en memoria del navegador: un refresh pierde todo.

## Alcance

Solo el formulario de **Nueva Consulta** (`/dashboard/consultations/new`). El mecanismo de borrador
se implementa como módulo/hook reutilizable para poder extenderlo a otros formularios después.
Aplica a todos los tenants (como toda feature).

## Diseño

### 1. Arreglo del bug del botón colgado

- Envolver `await createConsultation(...)` en `try/catch` + timeout de 15 s (`Promise.race`).
  (Ajustado de 30 s → 15 s a pedido del usuario: el guardado normal toma 1-2 s, así que 15 s
  sigue siendo ~10× de colchón sin desesperar al médico.)
- Si el guardado tarda >5 s, mostrar junto al botón: "Esto está tardando más de lo normal…"
  para que el médico nunca espere sin señal (en el caso típico de red caída el fetch falla en ~1 s;
  el timeout solo aplica al caso de petición colgada, p. ej. wifi conectado sin internet real).
- Al fallar: `loading = false` (botón reactivado), datos intactos en el formulario, y error visible:
  - Si `navigator.onLine === false`: "Sin conexión a internet. La consulta NO se guardó, pero tus
    datos están respaldados en este dispositivo. Revisa tu conexión e inténtalo de nuevo."
  - Si no: "No se pudo guardar la consulta. Revisa tu conexión e inténtalo de nuevo. Si el problema
    persiste, verifica en el expediente si la consulta ya quedó registrada antes de volver a guardar."
    (mitiga el caso raro de duplicado: petición que sí llegó al servidor pero cuya respuesta se perdió).
- Reintento manual: volver a presionar el mismo botón.

### 2. Borrador local con autosave

Módulo puro y testeable `utils/formDraft.ts` (`saveDraft`, `loadDraft`, `clearDraft`,
`purgeExpiredDrafts`) + integración en el componente cliente:

- **Captura:** `onInput` en el `<form>` con debounce ~1.5 s. Serializa `new FormData(formEl)`
  (cubre inputs no controlados, controlados con `name` y los hidden de laboratorio/estudios) + el
  textarea de medicamentos (sin `name`) como campo extra. Checkbox `include_diagnosis` se guarda
  explícito (FormData omite checkboxes desmarcados).
- **Clave:** `consultation-draft:v1:{userId}:{patientId}` en `localStorage`, con timestamp `savedAt`.
- **Restauración:** al montar, si existe borrador con menos de 24 h → banner "Encontramos una
  consulta sin guardar de las HH:MM — [Restaurar] [Descartar]". Restaurar escribe los valores en
  los inputs no controlados vía `form.elements[name]` y hace `setState` de los controlados
  (diagnóstico, tratamiento, medicamentos, notas de receta, include_diagnosis, labOrder, studyRequest).
- **Limpieza:** borrar al guardar con éxito; purgar borradores >24 h al montar (política elegida:
  borrar al guardar + expiración 24 h, por privacidad en máquinas compartidas).
- **Degradación:** si `localStorage` no está disponible (modo privado, cuota), todas las funciones
  fallan en silencio y el formulario sigue funcionando sin borrador.
- Edge case aceptado: mismo paciente en dos pestañas → gana el último que escribe.

### 3. Aviso de conexión en vivo

Componente `ConnectionBanner` (cliente) montado en esta página:

- Escucha eventos `online`/`offline` del navegador.
- Offline → banner fijo: "📶 Sin conexión — tus cambios se están respaldando en este dispositivo".
- Al volver → "Conexión restablecida", se auto-oculta a los pocos segundos.
- `navigator.onLine` es solo indicativo; la señal definitiva de fallo es el error del fetch al guardar.

### 4. Fuera de alcance (a propósito)

Sin IndexedDB, sin service worker, sin cola de sincronización automática, sin reintentos
automáticos, sin cambios de base de datos (sin clave de idempotencia — se documentó el trade-off y
el usuario eligió el enfoque A).

## Pruebas

- **Unit:** `utils/formDraft.ts` con storage falso — guardar/cargar, expiración 24 h, purga,
  storage inexistente/lleno, JSON corrupto.
- **E2E (puppeteer, dev local):** llenar formulario → simular offline → guardar → verificar mensaje
  de error y botón reactivado → recargar → verificar banner de restauración y datos recuperados →
  volver online → guardar → verificar que el borrador se limpió.
- `npm run build` + `npm test` en verde antes de push a main.
