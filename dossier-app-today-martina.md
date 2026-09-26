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
Organizada en bloques plegables (cerrados al entrar; se despliegan al pulsar y, al abrir uno, se cierra el que estuviera abierto, para no tener que hacer scroll), cada uno con un resumen de su valor actual en la cabecera. Orden:
1. **Idioma**
2. **Aspecto** (tema de Today, fondo claro/oscuro, barra de tiempo)
3. **Horarios** (franja horaria de planificación y horario escolar)
4. **Enlaces** (cuenta de Google para Classroom/Gmail y archivo del calendario escolar)
5. **Categorías**: solo dos de serie, **Tarea** (prioridad alta por defecto) y **Actividad** (media): no se pueden borrar ni renombrar, solo cambiar su prioridad. Las demás las crea el usuario; cada una lleva un botón de lápiz (editar nombre y color) y una X (borrar) justo a la izquierda de la prioridad, que queda alineada con la de las categorías de serie.
   - **Borrar una categoría**: si tiene eventos **activos** (que aún no han terminado) o actividades asociados, aparece un aviso con la lista y **doble confirmación** (Continuar → «Borrar y cancelar (n)»). Al confirmar se borra la categoría y **se cancela todo lo asociado**, con las tareas de preparación de los eventos. Los eventos ya pasados se conservan como historial con su categoría original. Sin nada activo asociado, se borra directamente.
6. **Google Calendar** (exportación)

- Inserción de credenciales / conexión de cuentas externas (Google, y las que se necesiten).
- **Apariencia de Today** (selecciones independientes; se guardan en el dispositivo):
  - **Tema**: el dibujo principal de la pantalla. De momento *Lista*, *Post-it 1* (opción B «Siguiente ahora» de `Design.html`: el próximo evento como protagonista y el resto como una baraja) y *Post-it 2* (post-its flotantes de `boceto-today.html`). Se podrán añadir más.
  - **Fondo claro u oscuro** (el oscuro usa la paleta de `Design.html`); se aplica a toda la App.
  - **Barra de tiempo**: *Puntos* (puntos del color de cada categoría y línea vertical en la hora actual) o *Niña soldado* (el camino con explosiones por evento y la niña con casco en la hora actual). Se podrán añadir más.
  - La barra cubre siempre toda la franja horaria del día. En días de cole, el horario escolar aparece como un tramo **comprimido y rayado** con el **icono del colegio** (la imagen de estilo cómic elegida por el usuario, sin fondo y reducida a tamaño icono: `assets/school-icon.png`); en la barra de la niña, ella entra en el colegio y sale al terminar las clases, de modo que por la mañana también se ve todo lo que viene por la tarde. Días sin cole: toda la franja, sin hueco.
  - En la barra de la niña, las horas de los eventos se alternan abajo y arriba del camino, empezando abajo por el más próximo, para que no se solapen ni se crucen con el dibujo.
- **Idioma de la App**: español, inglés, italiano, francés y alemán (número limitado de idiomas, con textos traducidos y revisados; se pueden añadir más generando un archivo de traducción).
  - Fechas y días de la semana se formatean automáticamente en el idioma elegido.
  - Lo que escribe el usuario (nombres de actividades, lugares, categorías renombradas) no se traduce; las categorías de fábrica sí, mientras no se hayan cambiado.
  - Lo que la IA extrae de Classroom y Gmail se pedirá directamente en el idioma de la App.
- **Franja horaria** definida por el usuario (ej.: 07:30–23:00): horas del día en las que la App puede planificar. Fuera de ella no planifica nada.
- **Horario escolar**: una sola hora de entrada y salida para lunes a viernes, y opción de **clases el sábado** (con su propio horario) si las hubiera.
  - La App solo gestiona el tiempo fuera del cole: en los días de cole se quita el horario escolar de la franja horaria. Tiempo planificable = [inicio franja → entrada] + [salida → fin franja].
  - El tramo antes de entrar al cole también cuenta, así se pueden planificar tareas por la mañana si se quiere.
  - Domingos (y sábados sin clase) = toda la franja horaria disponible.
  - Este horario alimenta la banda "Horario escolar" del Calendario y las notas de contexto de Actividades y Eventos; el Calendario muestra las horas de la franja horaria.
  - El **Calendario** (vista semana y día) cabe en una pantalla sin scroll: el horario escolar se dibuja como un tramo **comprimido y rayado** con el icono del colegio (como en la barra de Today), y el selector Semana/Día comparte fila con las flechas y la fecha. En la semana se comprime el horario de lunes a viernes; los eventos de fin de semana que caigan en ese tramo se ven más pequeños.
  - En el móvil la App ocupa toda la pantalla (cabecera y pestañas fijas; solo se desplaza el contenido) y la cuadrícula del Calendario se estira o encoge para llenar el alto disponible de cada teléfono. En pantallas altas muestra la etiqueta de cada hora; en las pequeñas, cada dos. Solo en móviles muy bajos (menos de ~560 px de alto útil) podría hacer falta algo de scroll.
- Localización del archivo con el calendario escolar (para importarlo). Se usa para consultar **festivos y días no lectivos**, que la App trata igual que un domingo (toda la franja horaria disponible).
- Definición de categorías de eventos, cada una con un nivel de prioridad asignado: Tarea y Actividad de serie; el resto (cita, tiempo libre…) las define el usuario.
- **Exportación a Google Calendar (solo en un sentido: App → Google Calendar).**
  - La App **no importa** eventos del calendario: solo lleva actividades, tareas y eventos que inciden en el tiempo disponible de Martina, y muchos eventos del calendario personal no interesan (cumpleaños, trabajo…).
  - La App crea en Google Calendar un **calendario propio y separado** ("AHHHHHH · Martina") y escribe ahí sus eventos; se ve en el móvil junto a los demás y se puede ocultar o borrar sin tocar el resto.
  - Usa la misma cuenta de Google conectada para Classroom y Gmail.
  - Se elige qué categorías se exportan (una casilla por categoría definida).
  - Las tareas se exportan como aviso a su hora de entrega, no como bloque de tiempo.
  - Opción de aviso a la **hora de salida** calculada cuando el evento implica traslado.

### 2.2 Actividades extraescolares
- Actividades recurrentes semanales: **todo lo inserta el usuario**. Misma lógica que Eventos: con la App nueva solo aparece el botón **Añadir actividad**; después, la lista; **cada actividad se abre pulsando encima** (ficha de consulta con Editar y Eliminar).
- Campos **obligatorios**: nombre, **día o días de la semana**, hora de inicio y de fin **de cada día**, categoría, prioridad y **ubicación** (para el cálculo de traslados).
  - Si hay más de un día, cada uno puede tener su horario; al añadir un día se propone el mismo horario del primero.
- Campos **opcionales**: descripción.
- Categoría y prioridad funcionan igual que en Eventos (mismas categorías, la categoría propone su prioridad, se puede crear una categoría nueva desde el formulario).
- **Tarea de práctica** (opcional), para actividades en las que hay que practicar entre sesiones (p. ej. música):
  - Nombre propio (propuesta: «Practicar: <actividad>») y tiempo estimado en horas y minutos, sin tope.
  - **Deadline automática: la siguiente sesión de la misma actividad** (cada sesión genera la tarea para la siguiente). La lista muestra la próxima entrega.
  - Por defecto toma la prioridad de la actividad (se le puede poner una propia desde Tareas). Se edita desde la actividad o desde **Tareas**, y se elimina con la actividad; para el resto de la App es una tarea más (Today, Calendario, avisos).
- Eliminar una actividad pide una segunda pulsación (y avisa si se elimina también su tarea).
- Las actividades recurrentes cuentan siempre como **activas** a efectos de borrar su categoría (ver Configuración).

### 2.3 Eventos
- Eventos puntuales (no recurrentes): **todo lo inserta el usuario**. Con la App nueva la pantalla solo muestra el botón **Añadir evento**; después, la lista de próximos eventos ordenada por fecha y hora; **cada evento se abre pulsando encima** (ficha de consulta con Editar y Eliminar).
- Campos **obligatorios**: nombre, fecha, hora de inicio, **duración** (horas y minutos), **categoría** y prioridad (Alta / Media / Baja).
- Campos **opcionales**: descripción y ubicación.
- **Categoría**: las mismas de Configuración. Al elegirla se propone su prioridad (se puede cambiar; si ya se eligió una prioridad a mano, no se toca). Desde el propio formulario se puede crear una **categoría nueva** (nombre y color): es una categoría de usuario como cualquier otra (aparece en Configuración, donde se puede renombrar, cambiar de color y prioridad o borrar).
- **Tarea de preparación** (opcional): si el evento requiere preparar algo antes, se puede generar una tarea asociada.
  - Tiene nombre propio (propuesta: «Preparar: <evento>»), deadline independiente (fecha y hora; propuesta: la víspera a las 20:00; tiene que ser antes del evento) y tiempo estimado de ejecución en horas y minutos, **sin tope**.
  - Por defecto **toma la prioridad del evento** (si cambia la del evento, cambia la de la tarea), salvo que en Tareas se le ponga una propia.
  - Se edita desde el evento o desde **Tareas**. Si se cancela el evento, se cancela también la tarea (la cancelación pide confirmación y lo avisa).
  - Para el resto de la App es **una tarea cualquiera**: se ve en Today y en el Calendario y cuenta para los avisos (p. ej. la alerta de tareas de más de 1,5 h en los próximos 5 días).

### 2.3 bis Tareas
- Pestaña propia, **después de Eventos** (barra: Today · Actividades · Eventos · Tareas · Calendario · Config).
- Lista única de **todas las tareas**, ordenada por entrega: las de Classroom (extraídas y aprobadas), las generadas por eventos y actividades y las **tareas sueltas** añadidas a mano con el botón **Añadir tarea** (nombre, entrega, tiempo estimado y descripción; prioridad por defecto la de la categoría Tarea). Cada una muestra prioridad, entrega, tiempo estimado (o «falta tiempo estimado»), de dónde viene y la descripción.
- **Se abre pulsando encima** (ficha de consulta) y con **Editar** se cambia: nombre, entrega (fecha y hora; en las de actividades es siempre la siguiente sesión y no se edita), tiempo estimado (obligatorio, horas y minutos), prioridad y descripción (opcional).
- **Eliminar** (desde la ficha) pide segunda pulsación; en una tarea de evento o actividad la quita de su evento o actividad.

### Prioridades y edición (común a Actividades, Eventos y Tareas)
- Pulsar un elemento de la lista abre su **ficha de consulta** (todos los detalles, solo lectura, con «‹ Volver»). En la ficha están los botones **Editar** (abre el formulario) y **Eliminar** (pide una segunda pulsación de confirmación). Al guardar se vuelve a la ficha; al cancelar la edición, también.
- Cada elemento toma **por defecto la prioridad de su categoría** (las tareas de eventos y actividades, la de su evento o actividad; las de Classroom, la de la categoría Tarea). Se puede cambiar **solo para ese elemento** al insertarlo o al editarlo en su pantalla, **sin cambiar la prioridad de la categoría**.

### Deadlines, avisos y visualización en el Calendario
- El sistema de avisos trabaja sobre **deadlines**: para las tareas, el límite de entrega; para actividades y eventos, la hora de inicio. La barra de tiempo de Today también usa la deadline.
- Solo para dibujarlas en el Calendario:
  - **Actividades**: su duración.
  - **Eventos**: su duración (campo obligatorio), con el color de su categoría.
  - **Entregas de tareas**: un bloque estándar de **media hora que termina en la deadline** (entrega a las 18:00 → se ve de 17:30 a 18:00), con un borde inferior que marca el momento de la entrega.
- Si varios bloques se solapan, se reparten el ancho de la columna. La leyenda muestra las categorías que aparecen en la vista.
- **Pulsar un bloque del Calendario** (actividad, evento o entrega de tarea) abre ese elemento en su pantalla, igual que al pulsarlo allí (ficha con Editar y Eliminar), con un botón **«‹ Volver al Calendario»**. Si se edita, la ficha sigue ofreciendo volver al Calendario; si se elimina, se vuelve al Calendario.

### 2.4 Pantalla principal — "Today"
- Nombre de la pantalla **en el idioma de la App**: Hoy (es), Today (en), Oggi (it), Aujourd’hui (fr), Heute (de); en la pestaña, en el título y en los textos que la mencionan.
- **Barra de tiempo**: dibuja **todos** los deadlines del día. En las dos barras (Puntos y Niña soldado) cada deadline lleva su hora, alternando abajo y arriba y empezando abajo por el más próximo. **Sin etiqueta con la hora actual**: el momento presente lo marcan la línea vertical (Puntos) o la niña (Niña soldado).
- **Cuerpo** (debajo de la barra): **como máximo 4 deadlines**: el más próximo destacado y los siguientes por orden, según la vista elegida (Lista, Post-it 1, Post-it 2). Si hay más, una línea avisa de cuántos quedan («Y 2 más hoy: los ves en la barra de tiempo»).
- **Solo el primer deadline lleva detalles** (lugar, traslado, hora de salida…); los siguientes muestran **solo hora y nombre**.
  - En **Post-it 1 y Post-it 2** el primer deadline es compacto: **hora y nombre en la misma línea**, **nombre del destino (sin dirección) y distancia**, y las **horas de salida solo con icono** (andando, si el destino está a menos de 1 km, y coche), cada una con su hora; caben las dos. En Post-it 2 van a la derecha, una encima de la otra.
- **Pulsar una tarjeta de «Hoy»** abre ese elemento en su pantalla (Actividades, Eventos o Tareas), igual que al pulsarlo allí, con un botón **«‹ Volver a Hoy»**. En Post-it 2, un post-it de detrás primero viene al frente; el de delante se abre.
  - En Post-it 2 los post-its son casi cuadrados: hora en la esquina superior derecha y nombre al pie; se solapan escalonados (bastante juntos, para que en un móvil grande quepa también «Próximos días» desplegada) de modo que la hora y el nombre de cada uno queden a la vista.
- **Color del primer deadline según lo que falta:**
  - Más de 1 h: borde y texto del color de la categoría; relleno algo más oscuro que el fondo.
  - Entre 1 h y 30 min: borde y texto en **ámbar**, todo en negrita; relleno del color de la categoría.
  - 30 min o menos: borde y texto en **rojo oscuro**, todo en negrita; relleno del color de la categoría.
  - El **punto del próximo deadline en la barra de tiempo** sigue el mismo código (borde y relleno; en la barra de la niña, el contorno de su explosión).
- Muestra los deadlines del día: hora de inicio de actividades/citas programadas, y para tareas de Classroom, la hora de entrega como deadline.
- Si un evento implica desplazamiento, se muestran **dos datos**: el deadline en sí, y la hora de salida calculada según el tiempo de traslado (Google Maps).
  - Distancias menores de 1 km: preguntar al usuario si se va andando.
  - Resto de distancias: calcular en coche.
- Tarjeta **«Próximos días»** (sustituye a «Carga de trabajo»): recoge **todas las tareas de los siguientes 5 días con tiempo estimado de 1,5 h o más**, ordenadas por entrega.
  - Cada tarea: **nombre**; debajo, **tiempo estimado** (sin la palabra «estimado») y **«antes de» fecha y hora** de entrega. Puede tener varias líneas.
  - Va **abajo del todo, fija justo encima de la barra de pestañas** (se ve aunque el resto se desplace).
  - Marco naranja pastel, fondo amarillo pastel y el texto de cada tarea del color de su categoría.
  - Si no hay ninguna tarea que cumpla la condición, la tarjeta no aparece.
  - **Regla de espacio:** si con la tarjeta desplegada la pantalla no da para todo sin que nada quede tapado, la tarjeta aparece **plegada** (solo «Próximos días · n») y hay que pulsarla para ver las tareas; al pulsar de nuevo se pliega.
- Para ganar espacio, «Hoy» usa una **cabecera compacta** (sin la marca, título y fecha en una línea), una **barra de tiempo más baja** y un **primer elemento más compacto**.
  - **Solo en móviles pequeños** (hasta 360 px de ancho o 620 px de alto): los elementos 2 a 4 son más pequeños en las tres vistas (fichas más bajas en Lista, cartas más pequeñas en Post-it 1, post-its más pequeños y más juntos en Post-it 2).
- En **Post-it 1**, las cartas de los elementos 2 a 4 usan el mismo código de color que los post-its de Post-it 2 (relleno del color de la categoría con brillo, borde oscuro y texto oscuro de la categoría).

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
| Google Calendar API (exportación) | Mismo proyecto de Google Cloud y mismo OAuth; API de Google Calendar activada. Permiso limitado `calendar.app.created` (solo puede gestionar calendarios creados por la App, no lee los demás) | Decidido: exportar a Google Calendar. Solo escritura en el calendario propio de la App |
| Extracción de contenido con IA (Claude API) | Clave de API propia de Anthropic una vez la app esté fuera de Claude.ai | Coste mínimo para volumen familiar, pero no es gratuito como dentro de este chat |

---

## 6. Consideraciones de arquitectura

- **Dónde se guardan los datos**: en la maqueta, en el propio dispositivo (almacenamiento del navegador): no pide permisos ni interrumpe. Pero el navegador puede borrarlo (Safari en iPhone borra los datos de una web que no se abre en 7 días si no está añadida a la pantalla de inicio) y no se comparte entre dispositivos. En la App real los datos se guardarán en la base de datos de la App (en el servidor, necesaria de todos modos para Google y la sincronización), con una copia local para abrir al instante y funcionar sin conexión; así tampoco hay peticiones de permisos.

- El proyecto no puede vivir como un simple artifact de conversación: necesita alojamiento propio (ej. Vercel o Netlify, capa gratuita) para sostener el login OAuth de forma persistente entre sesiones.
- Se construye en **Claude Code**, no en este chat — Carlo ya tiene experiencia previa usando Claude Code (entorno de Python en VS Code).
- Plan de trabajo acordado: el estudio y la planificación se hacen en este chat; el desarrollo e implementación se hacen en una sesión de Claude Code, usando este dossier como punto de partida.

---

## 7. Pendiente de definir sobre la marcha

- Estrategia concreta de login/sesión persistente con Google que no interrumpa la experiencia de uso.
- Decisión final sobre Google Maps (con tarjeta, traslados reales) vs. estimación aproximada sin tarjeta.
- Diseño gráfico y de contenido detallado de cada pantalla (mencionado como primer paso a definir en Code).
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
