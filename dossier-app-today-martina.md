# Dossier de planificación — App "Today"
### Organización de tareas y actividades extraescolares de Martina

Este documento resume el estudio y las decisiones tomadas en la fase de planificación, como base para el desarrollo del proyecto en Claude Code.

---

## 1. Objetivo del proyecto

Una web app que centraliza la organización diaria de Martina combinando:
- Datos extraídos automáticamente de Google Classroom y Gmail.
- Actividades extraescolares y eventos introducidos manualmente por el usuario (Carlo).
- Un cálculo de traslados basado en ubicación.
- Una pantalla principal ("Today") que presenta el día priorizado y avisa de cargas de trabajo relevantes.

Se desarrolla directamente la versión ambiciosa completa (no un MVP reducido), integrando Classroom, Gmail, geolocalización/Google Maps y extracción de contenido con IA.

---

## 2. Pantallas y contenido

### 2.1 Configuración
- Inserción de credenciales / conexión de cuentas externas (Google, y las que se necesiten).
- **Horario escolar por día de la semana** (hora de entrada y salida, y si ese día hay cole o no).
  - La App **solo gestiona el tiempo fuera de la escuela**: la franja que planifica es distinta cada día según el horario (ej.: L–J sale a las 17:00, V a las 15:00, fines de semana todo el día).
  - Se define también el **margen del día de Martina** (ej.: 08:00–22:00): fuera de él la App no planifica nada.
  - Franja cubierta de un día con cole = [inicio del día → entrada] + [salida → fin del día]. Día sin cole = todo el margen del día.
  - Los festivos del calendario escolar importado cuentan como días sin cole.
  - Este horario alimenta la banda "Horario escolar" del Calendario y las notas de contexto de Actividades y Eventos.
- Localización del archivo con el calendario escolar (para importarlo).
- Definición de categorías de eventos (tarea, actividad, cita, etc.), cada una con un nivel de prioridad asignado.
- **Exportación al calendario del móvil (solo en un sentido: App → móvil).**
  - La App **no importa** eventos del calendario del móvil: solo lleva actividades, tareas y eventos que inciden en el tiempo disponible de Martina, y muchos eventos del calendario personal no interesan (cumpleaños, trabajo…).
  - Los eventos de la App se escriben en un **calendario propio y separado** ("AHHHHHH · Martina"), que se puede ocultar o borrar desde el móvil sin tocar el resto.
  - Se elige qué categorías se exportan (una casilla por categoría definida).
  - Las tareas se exportan como aviso a su hora de entrega, no como bloque de tiempo.
  - Opción de aviso a la **hora de salida** calculada cuando el evento implica traslado.

### 2.2 Actividades extraescolares
- Insertadas manualmente por el usuario.
- Periodicidad habitual semanal (ej.: lunes y miércoles a una hora determinada).
- Cada actividad puede llevar asociada una ubicación (dirección/coordenadas) para el cálculo de traslados.

### 2.3 Eventos aislados y tiempo libre
- El usuario puede insertar eventos puntuales (no recurrentes) y bloques de tiempo libre.

### 2.4 Pantalla principal — "Today"
- Nombre de la pantalla en inglés: **Today**.
- Muestra los deadlines del día: hora de inicio de actividades/citas programadas, y para tareas de Classroom, la hora de entrega como deadline.
- Si un evento implica desplazamiento, se muestran **dos datos**: el deadline en sí, y la hora de salida calculada según el tiempo de traslado (Google Maps).
  - Distancias menores de 1 km: preguntar al usuario si se va andando.
  - Resto de distancias: calcular en coche.
- Aviso destacado en la pantalla: cualquier tarea de los próximos 5 días con tiempo estimado de ejecución superior a 1,5 horas genera una alerta visible en "Today".

---

## 3. Flujo de sincronización con Google (Classroom + Gmail)

- Al abrir la app, se conecta con Classroom y con el correo de Google.
- Debe leer **solo lo que ha cambiado** desde la última conexión → requiere un log propio interno que registre qué contenido ya ha sido procesado (para no re-leer ni duplicar).
- El login con Google debe diseñarse de forma que no rompa la experiencia de uso (evitar fricción/discontinuidad en cada apertura) — a estudiar la mejor estrategia de sesión persistente/refresco de token.
- El contenido nuevo (correos y publicaciones de Classroom) se procesa con IA para extraer la información relevante para la planificación (cambios de horario, cancelaciones, plazos de entrega, permisos, etc.).

## 4. Revisión y aprobación de eventos extraídos

- Los eventos que la IA extrae de Classroom/Gmail se presentan al usuario para su revisión, con posibilidad de editarlos.
- Solo tras la edición/aprobación del usuario, el evento entra en la base de datos que alimenta la planificación diaria (no se aplican solos y en silencio).
- Para las tareas extraídas de Classroom específicamente, el usuario debe añadir el tiempo estimado de ejecución (dato que no viene de Classroom).

---

## 5. Integraciones técnicas necesarias

| Integración | Qué requiere | Notas |
|---|---|---|
| Google Classroom API | Proyecto en Google Cloud, API activada, OAuth (modo "Testing", sin verificación de Google al ser uso familiar) | Ya confirmado: el colegio (Laude San Pedro) usa Google Classroom |
| Gmail API | Mismo proyecto de Google Cloud, API activada, mismo OAuth | Se usa tanto para leer contenido relevante como para la extracción con IA |
| Geolocalización del dispositivo | Ninguna cuenta ni API — función estándar del navegador con permiso del usuario | Trivial |
| Google Maps Platform (cálculo de traslados reales) | Clave de API de Google Maps — **requiere asociar una tarjeta de crédito a la cuenta de Google Cloud**, aunque el uso se mantenga dentro del nivel gratuito | Alternativa sin tarjeta: estimación en línea recta con velocidad media (menos realista) — decisión pendiente de confirmar antes de implementar esta parte |
| Exportación al calendario del móvil | Opción A: **feed iCalendar (.ics) de suscripción** servido por la propia App — funciona en iPhone y Android, sin permisos sobre el calendario del usuario. Opción B: **Google Calendar API** con el mismo OAuth, usando el permiso limitado a calendarios creados por la App (`calendar.app.created`) | Solo escritura/publicación, nunca lectura del calendario del usuario. La suscripción .ics se refresca según el móvil (de minutos a horas); Google Calendar es inmediato — decisión pendiente |
| Extracción de contenido con IA (Claude API) | Clave de API propia de Anthropic una vez la app esté fuera de Claude.ai | Coste mínimo para volumen familiar, pero no es gratuito como dentro de este chat |

---

## 6. Consideraciones de arquitectura

- El proyecto no puede vivir como un simple artifact de conversación: necesita alojamiento propio (ej. Vercel o Netlify, capa gratuita) para sostener el login OAuth de forma persistente entre sesiones.
- Se construye en **Claude Code**, no en este chat — Carlo ya tiene experiencia previa usando Claude Code (entorno de Python en VS Code).
- Plan de trabajo acordado: el estudio y la planificación se hacen en este chat; el desarrollo e implementación se hacen en una sesión de Claude Code, usando este dossier como punto de partida.

---

## 7. Pendiente de definir sobre la marcha

- Estrategia concreta de login/sesión persistente con Google que no interrumpa la experiencia de uso.
- Decisión final sobre Google Maps (con tarjeta, traslados reales) vs. estimación aproximada sin tarjeta.
- Diseño gráfico y de contenido detallado de cada pantalla (mencionado como primer paso a definir en Code).
- Método de exportación al calendario del móvil: suscripción .ics (universal, refresco más lento) vs. Google Calendar API (inmediato, requiere que el móvil use Google Calendar).
- Peso relativo de los criterios de priorización en el algoritmo de planificación diaria.
- Grado de autonomía de la IA al interpretar correos (todo lo extraído pasa por aprobación del usuario, según lo decidido en el punto 4).

---

## 8. Primer prompt para Claude Code

```
Voy a construir una web app llamada "Today" para ayudar a organizar las tareas y actividades
extraescolares de mi hija. Te adjunto un dossier de planificación (dossier-app-today-martina.md)
con todas las decisiones de alcance, pantallas, integraciones y flujo de datos ya acordadas.

Quiero que empecemos por el primer paso que definimos: diseñar la interfaz gráfica y el
contenido de cada pantalla (Configuración, Actividades extraescolares, Eventos aislados/tiempo
libre, y la pantalla principal "Today"), antes de tocar ninguna integración externa.

No tengo experiencia en desarrollo web ni en HTML — necesito que me guíes paso a paso en
cualquier configuración externa que haga falta (Google Cloud, despliegue, etc.) cuando lleguemos
a esa parte. Por ahora, empecemos revisando el dossier y proponiendo la estructura de pantallas
y navegación antes de escribir código de integración.
```

---

*Dossier preparado a partir de la sesión de planificación en chat — listo para continuar en Claude Code.*
