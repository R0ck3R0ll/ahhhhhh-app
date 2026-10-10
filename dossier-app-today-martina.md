# Dossier de planificación — App "Today"
### Organización de tareas y actividades extraescolares de Martina

Este documento resume el estudio y las decisiones tomadas en la fase de planificación, como base para el desarrollo del proyecto en Claude Code.

> **Estado (9/10/2026)**
> - **App publicada** en https://ahhhhhh-today.web.app desde **`main`** (9/10/2026: todo el trabajo está en `main` y solo `main` publica). Las sesiones nuevas trabajan en su rama y lo pasan a `main` para publicarlo.
> - **GitHub Pages** (páginas de inicio, privacidad y condiciones que usa la pantalla de permisos de Google) aún se publica desde `claude/hopeful-lovelace-18fa2k`: hay que cambiar su origen a `main` / `docs` (GitHub > Settings > Pages) y después ya se puede borrar esa rama.
> - **Hecho y probado por Carlo:** pantallas, tareas y bloques de trabajo, avisos de riesgo, sincronización entre móviles (Firebase), traslados con Google Maps (coche y a pie, ubicación por GPS), lectura del calendario escolar con IA (Gemini en Vertex AI, con preguntas cuando el calendario depende de la alumna).
> - **Pendiente:** conexión con Classroom y Gmail (bloqueada por el colegio, punto 3), extracción con IA de correos y publicaciones con su pantalla de revisión (punto 4), exportación a Google Calendar.
> - **Siguiente proyecto:** App de seguimiento para Carlo: contenido y plan de desarrollo decididos el 10/10/2026 (punto 7 bis).

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
0. **Perfil**: **nombre** de quien usa la App (vacío al instalar; editable para poder dejar la App a otra persona). Sin nombre, los textos usan su versión sin nombre («tu plan del día»). Aparece en los textos («plan de …», «Entregas y tareas de …», el calendario exportado…). También la **dirección de casa**, punto de partida de los traslados.
1. **Idioma**
2. **Aspecto** (tema de Today, fondo claro/oscuro, barra de tiempo)
3. **Horarios** (franja horaria de planificación y horario escolar)
4. **Enlaces** (cuenta de Google para Classroom/Gmail y calendario escolar, como archivo o enlace)
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
  - El **Calendario** (vista semana y día) cabe en una pantalla sin scroll: el horario escolar se dibuja como un tramo **comprimido y rayado** con el icono del colegio (como en la barra de Today), y el selector Semana/Día comparte fila con las flechas y la fecha. En la semana se comprime el horario de lunes a viernes, **salvo** que un día sin cole (sábado, domingo, festivo o día no lectivo del calendario escolar) o con menos horas de cole (sábado con clases) tenga algo en ese tramo: entonces la semana se dibuja sin comprimir, para que nada quede aplastado. Los días sin cole no llevan tramo rayado.
  - **Días no lectivos:** los festivos y días no lectivos del calendario escolar se tratan como un domingo en toda la App (barra de «Hoy» sin cole, Calendario y huecos libres para los bloques de trabajo). Salen del calendario escolar leído con IA o se insertan a mano (ver «Calendario escolar»).
  - En el móvil la App ocupa toda la pantalla (cabecera y pestañas fijas; solo se desplaza el contenido; 8/10/2026: la altura es la de la ventana medida por la App, no la que da el navegador, que en algunos móviles sobraba y obligaba a un pequeño scroll de toda la página, y la página entera nunca se desplaza) y la cuadrícula del Calendario se estira o encoge para llenar el alto disponible de cada teléfono. En pantallas altas muestra la etiqueta de cada hora; en las pequeñas, cada dos. Solo en móviles muy bajos (menos de ~560 px de alto útil) podría hacer falta algo de scroll.
- **Calendario escolar** (en Enlaces): se usa para consultar **festivos y días no lectivos**, que la App trata igual que un domingo (toda la franja horaria disponible). Dos formas de darlo:
  - **Subir archivo**: PDF, Word (.docx) o imagen, de hasta 10 MB. Se muestra con su nombre, tipo y tamaño. Los .doc antiguos no se admiten (la App pide guardarlo como PDF o .docx).
  - **Pegar enlace**: un archivo en **Google Drive** (compartido con «cualquier persona con el enlace») o la página del colegio con el calendario. Se admite sin «https://»; si no es un enlace válido, la App lo avisa. Los enlaces de Drive se muestran como «Archivo en Google Drive».
  - Solo hay **uno a la vez**: subir un archivo o pegar un enlace sustituye al anterior. **Quitar** pide una segunda pulsación. Cuenta como uno de los «2 enlazados» del resumen de Enlaces.
  - **Lectura de los festivos con IA** (hecho 7/10/2026): al subir el archivo o guardar el enlace, la App lo manda a leer al servidor (función `readSchoolCalendar`, ver «Lectura del calendario escolar con IA» en el punto 2 ter) y el estado pasa a «Leyendo».
    - Hace falta tener la **sesión iniciada** (Config > Cuenta); sin ella, la App lo indica y el botón «Leer con IA» queda desactivado.
    - **Preguntas de la IA** (8/10/2026): si el calendario depende de la alumna (p. ej. dos sistemas, etapas, cursos o grupos con días distintos) o tiene algo ambiguo que cambia el resultado, la IA no elige: devuelve hasta 3 preguntas con opciones sacadas del propio calendario (estado «Pregunta»). Se responde con una opción u «Otra respuesta» (texto libre) y la IA vuelve a leer el calendario con las respuestas. Las respuestas se guardan en el plan (`school-read-answers`) y se mandan en cada lectura, también con el calendario de otro curso, para no preguntar lo mismo; se ven como «Datos para la IA: …» con un enlace «Olvidar».
    - **Revisión antes de guardar** (como lo que se extraiga de Classroom y Gmail): la App enseña los periodos encontrados (fechas, motivo y número de días), el curso y los avisos de la IA (p. ej. días que solo afectan a una etapa), cada uno con su casilla marcada. «Guardar (n)» se queda con los marcados; «Descartar» no guarda nada. Lo pendiente de revisar se conserva en el móvil si se cierra la App.
    - Guardado: estado «n periodos», «Leído el …· curso …», los avisos de la IA y la lista de periodos, que se pueden quitar uno a uno (segunda pulsación). Se aplican al momento en toda la App.
    - **Volver a leer**: un enlace se puede releer siempre; un archivo solo mientras sigue abierto en la App (no se guarda el archivo, solo sus datos); después hay que subirlo de nuevo. Lo nuevo, al guardarlo, sustituye a lo leído antes.
    - Subir otro archivo, pegar otro enlace o **Quitar** empieza de cero: se borran los días leídos del calendario anterior.
    - Si falla, un aviso explica el motivo: enlace no compartido, formato no admitido, sin conexión, IA ocupada, máximo de lecturas del día, o la función aún no publicada.
  - **Alternativa: a mano.** Un selector «Archivo o enlace | A mano» elige de dónde salen los días no lectivos.
    - **A mano:** se añaden **días sueltos o periodos** («Desde», «Hasta» opcional, de hasta 120 días, y un «Motivo» opcional, p. ej. «Navidad»). La lista muestra cada día o periodo con su número de días; **quitar** pide una segunda pulsación.
    - Con «A mano» elegido, la **lectura del archivo o enlace se deshabilita**: se conserva, pero se ve tachado con «Lectura desactivada» y no se puede cambiar ni quitar. Al volver a «Archivo o enlace» se usa otra vez (y los días a mano se guardan para cuando se vuelva).
    - Cualquier cambio se aplica al momento en toda la App (barra de «Hoy», Calendario, huecos libres de los bloques de trabajo y avisos de riesgo).
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
- **Festivos nacionales** (10/10/2026): las sesiones no se hacen en los festivos nacionales de España. Son 1/1, 6/1, Viernes Santo, 1/5, 15/8, 12/10, 1/11, 6/12, 8/12 y 25/12, calculados por la App sin consultar nada (los que caen en domingo no se trasladan: eso lo decide cada comunidad).
  - Esas sesiones no salen en «Hoy» ni en el Calendario, no cuentan como ocupadas (huecos libres, riesgo) y la tarea de práctica pasa a la siguiente sesión que sí se hace.
- **«Hoy no voy»** (10/10/2026): quita del plan la sesión de hoy, con el mismo efecto que un festivo, y aparece un aviso con «Deshacer».
  - Se hace con el botón **⦸** de la tarjeta de la actividad en «Hoy» (en el sitio del ✓ de las tareas) o con el botón **«Hoy no voy»** de su ficha, si la sesión de hoy aún no ha terminado.
  - La ficha de la actividad lista las **«Sesiones que no se hacen»** de las próximas 3 semanas («festivo nacional» o «no voy»). Las quitadas con «Hoy no voy» tienen **«Volver a ponerla»**.
  - Se guarda en la actividad (`skip`: fecha y hora de inicio de cada sesión quitada) y se comparte por el plan.
  - Al editar la actividad se conservan las sesiones quitadas y las sesiones de práctica ya hechas (antes, editar una actividad las borraba).
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
- **Completar una tarea** (fase 1 de «ejecución de tareas»):
  - Se marca con el **círculo** de cada fila de Tareas, con el botón **«Marcar como hecha»** de su ficha o con el **✓ rápido** de las tarjetas de tareas en «Hoy». Aparece un aviso con **«Deshacer»**.
  - Una tarea hecha **no vuelve a presentarse**: sale de «Hoy» y de «Próximos días»; en el **Calendario** se ve **atenuada y con ✓** mientras siga en la semana visible; en Tareas pasa a la sección plegable **«Hechas»**, desde donde se puede **reabrir**; sale también de «Hechas» cuando su entrega queda fuera de la semana actual del calendario.
  - Tareas de **práctica de actividades**: se completa solo la de la sesión en curso; tras esa sesión vuelve a estar pendiente para la siguiente.
  - Tareas de **Classroom**: si se marcan como hechas, la App las da por cerradas (no hay dos registros separados de «tarea» y «entrega»).
  - Una tarea cuya entrega ya pasó sin completarse aparece arriba, en **«Atrasadas»**, hasta que se marque como hecha o se elimine. «Atrasadas» y «Hechas» aparecen **plegadas** (con el número de tareas) y **sólo si tienen algo dentro**.
- **Bloques de trabajo** (fase 3 de «ejecución de tareas»): tiempo reservado para trabajar en una tarea.
  - Se crean con el botón **«Planificar»** de la ficha de la tarea (no aparece si la tarea ya está hecha). La primera vez se muestra un **tutorial** breve.
  - **Propuesta de la App:** si la tarea no tiene bloques, la App propone los suyos para cubrir el tiempo estimado: **un bloque por día** (de hasta 1 h 30 min) desde ahora hasta la entrega, en el primer hueco libre donde quepa entero (si no, en el más grande), con **15 min de margen** con lo de antes y después y sin bloques de menos de 30 min. Si con uno por día no se llega, añade más.
  - **Huecos libres:** la franja horaria del día (Config) menos el cole, las actividades, los eventos y los demás bloques; hoy, desde la hora actual; el día de la entrega, hasta la entrega.
  - **Edición:** cada bloque se ve sobre su hueco libre: **arrastrándolo se mueve**; arrastrando sus **extremos se alarga o se acorta** (mínimo 15 min, de 5 en 5 min); **nunca sale del hueco libre**. Con **‹ ›** pasa al hueco anterior o siguiente; con la **papelera** se quita; **«Añadir bloque»** añade otro en el siguiente hueco. Arriba se ve «Estimado · planificado · falta». Se guarda con «Guardar» (o se anula con «Cancelar»).
  - Sin tiempo estimado: no hay propuesta; cada bloque nuevo es de 30 min.
  - **Estilo:** rayas diagonales en **dos tonos cercanos al color de la tarea**, en el Calendario (con su entrada en la leyenda), en las tarjetas de «Hoy» y como tramo rayado en la barra de tiempo.
  - Pulsar un bloque (Calendario u «Hoy») abre la ficha de la tarea, que lista sus bloques. Los bloques de una tarea hecha no salen en «Hoy» y en el Calendario se ven atenuados; si se elimina la tarea, se eliminan sus bloques.
- **Fin de un bloque y progreso** (fase 5):
  - Al terminar un bloque, la App pregunta **«¿Cuánto has trabajado?»** con un control deslizante de **0 a lo que falta** de la tarea (estimado − ya hecho), de 5 en 5 min; por defecto, lo planificado para ese bloque. Sin tiempo estimado, el máximo es la duración del bloque. **No hay cronómetro** ni otras formas de anotar el avance.
  - Si se elige el **máximo**, pregunta si la tarea está terminada: **«Sí, está hecha»** la marca como hecha (con «Deshacer»); **«Todavía no»** solo anota el tiempo.
  - **«Ahora no»** deja la pregunta para la próxima vez que se abra la App. Si hay varios bloques por confirmar, se preguntan uno detrás de otro (del más antiguo al más reciente).
  - Si la App estaba **cerrada** cuando terminó el bloque, la pregunta aparece **al abrirla**, y el móvil muestra una **notificación** (los permisos se piden en la configuración del primer inicio). Con la App abierta se comprueba cada minuto.
  - **Progreso:** barra «hecho de estimado» en la ficha de la tarea (fila «Progreso»), en la lista de Tareas (cuando ya hay algo hecho), en «Planificar» y en la propia pregunta (se actualiza al mover el control). La ficha lista cada bloque con lo que se anotó.
  - «Planificar» cuenta lo hecho: «Estimado · hecho · planificado · falta»; la propuesta de bloques cubre solo lo que falta. Los bloques ya terminados no se pueden mover y se conservan al guardar; en el Calendario se ven atenuados.
- **Anotar trabajo hecho** (10/10/2026), para registrar trabajo **sin haberlo planificado**:
  - Se hace con el botón **«Anotar trabajo hecho»** de la ficha de la tarea (si no está hecha).
  - Se indica **cuándo empezó** (día y hora; tiene que ser un momento del pasado, terminar antes de ahora y el mismo día) y **cuánto** se trabajó, con el mismo control que «¿Cuánto has trabajado?».
    - Por defecto, 30 min que terminan ahora.
    - El máximo es lo que falta de la tarea; sin tiempo estimado (o si ya está cubierto), 4 h.
  - Si se llega a lo que falta, pregunta si la tarea está hecha («Sí, está hecha» / «Todavía no»).
  - Se guarda como un **bloque de trabajo ya registrado** (`manual: true`), así:
    - cuenta en el progreso y en «Planificar» como hecho;
    - se ve atenuado en el Calendario y no se puede mover;
    - en la ficha sale en la lista de bloques con «anotado a mano».
- **Aviso de riesgo** (fase 6): la App comprueba si cada tarea cabe en el **tiempo libre** que queda hasta su entrega.
  - **Cálculo:** por orden de entrega, lo que falta de las tareas (estimado − hecho), **acumulado** con las que se entregan antes o a la vez, tiene que caber en el tiempo libre desde ahora hasta cada entrega. Tiempo libre: la franja horaria menos cole, actividades y eventos (los bloques de trabajo cuentan como libres: son tiempo para las tareas). Las tareas sin tiempo estimado no se pueden comprobar.
  - Se comprueba al abrir la App y tras cualquier cambio (tareas, eventos, actividades, bloques), después de las preguntas de fin de bloque.
  - **Aviso emergente** «No da tiempo»: qué hace falta, hasta cuándo y cuánto tiempo libre queda (y, si influyen otras tareas, que se cuentan también). Botones «Ver la tarea» y «Entendido»; **aceptado, no vuelve a salir** para esa tarea.
  - **Aviso ámbar** «Cuidado, el tiempo se agota»: cuando sí cabe pero con **menos de 1 h de margen** (el tiempo libre no llega a lo que hace falta + 1 h). Mismo funcionamiento que el rojo, con los botones también en ámbar; si una tarea pasa de ámbar a rojo, avisa otra vez.
  - **Triángulo:** uno solo, junto a la barra de tiempo de «Hoy», mientras quede alguna tarea avisada **sin hacer ni eliminar**: **rojo** si alguna llegó a rojo; si no, **ámbar**. Al pulsarlo, lista las tareas avisadas, cada una con su triángulo y los datos de ahora (o «ahora ya cabe» si ya no hay riesgo); cada una abre su ficha.
- **Pulsación larga** (fase 4): mantener pulsado (~0,5 s) un **hueco libre** de la barra de tiempo de «Hoy» (Puntos o Niña soldado) o del **Calendario** (vista semana o día) pregunta **«¿Quieres añadir un evento o trabajar en una tarea?»**, con el día y la hora del punto (al cuarto de hora).
  - **Añadir evento:** abre el formulario de evento con **fecha y hora** de ese punto y la **duración hasta el siguiente elemento** (o hasta el final de la franja horaria), **con un tope de 2 h**.
  - **Trabajar en una tarea:** lista las tareas pendientes con entrega posterior (con lo que falta por planificar); al elegir una se abre «Planificar» con un **bloque que empieza en ese punto** (lo que falta, hasta 1 h 30 min, sin salir del hueco), junto a los bloques que ya tenga.
  - Guardar o cancelar **vuelve a donde se pulsó** (Calendario u «Hoy»).
  - Pulsar sobre algo ocupado (un bloque, el cole…) avisa de que hay que pulsar un hueco libre; un momento pasado, que ya ha pasado. Un toque corto no hace nada; mientras se mantiene pulsado aparece un círculo que crece.
  - Debajo de la leyenda del Calendario, una línea lo recuerda (no en móviles pequeños, para que quepa sin scroll); también lo menciona el tutorial de los bloques de trabajo.

### Prioridades y edición (común a Actividades, Eventos y Tareas)
- Todo formulario tiene **«✕ Cancelar»** arriba (y «Cancelar» abajo), que vuelve al punto de partida (ficha, lista, Calendario u «Hoy»). Si se sale de un formulario abierto pulsando otra pestaña, la App pregunta **«¿Anular?»** («Seguir editando» / «Anular»).
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
- **Solo el primer deadline lleva detalles** (lugar, traslado, hora de salida…); los siguientes muestran **hora y nombre** y, si tienen traslado, **sus horas de salida** en pequeño con los mismos iconos (andando y coche) (8/10/2026: los trayectos se calculan para todos los de hoy).
- **Tarea cubierta por bloques de trabajo** (8/10/2026): si una tarea vence hoy y lo ya hecho más los bloques de trabajo de hoy aún sin registrar cubren su tiempo estimado, en «Hoy» no se ve la tarjeta de la tarea, solo las de sus bloques, con «(antes de las HH:MM)» y la hora de entrega en el nombre. Solo mientras quede algún bloque de hoy por terminar; si no, vuelve la tarjeta de la tarea. Sin tiempo estimado no se puede comprobar y se ven las dos.
- **Tareas de un evento o actividad** (8/10/2026): se muestran **siempre antes** del elemento al que pertenecen, porque hay que hacerlas antes. Si ese elemento tiene traslado, en «Hoy» la entrega de la tarea se ve a la **hora de salida** (la más temprana si hay coche y a pie), no a la hora del elemento. En Tareas y Calendario la entrega sigue siendo la suya.
  - En **Post-it 1 y Post-it 2** el primer deadline es compacto: **hora y nombre en la misma línea**, **nombre del destino (sin dirección) y distancia**, y las **horas de salida solo con icono** (andando, si el trayecto es de 1,5 km o menos, y coche), cada una con su hora; caben las dos. En Post-it 2 van a la derecha, una encima de la otra.
- **Pulsar una tarjeta de «Hoy»** abre ese elemento en su pantalla (Actividades, Eventos o Tareas), igual que al pulsarlo allí, con un botón **«‹ Volver a Hoy»**. En Post-it 2, un post-it de detrás primero viene al frente; el de delante se abre.
  - En Post-it 2 los post-its son casi cuadrados: hora en la esquina superior derecha y nombre al pie; se solapan escalonados (bastante juntos, para que en un móvil grande quepa también «Próximos días» desplegada) de modo que la hora y el nombre de cada uno queden a la vista.
- **Color del primer deadline según lo que falta:**
  - Más de 1 h: borde y texto del color de la categoría; relleno algo más oscuro que el fondo.
  - Entre 1 h y 30 min: borde y texto en **ámbar**, todo en negrita; relleno del color de la categoría.
  - 30 min o menos: borde y texto en **rojo oscuro**, todo en negrita; relleno del color de la categoría.
  - El **punto del próximo deadline en la barra de tiempo** sigue el mismo código (borde y relleno; en la barra de la niña, el contorno de su explosión).
- Muestra los deadlines del día: hora de inicio de actividades/citas programadas, y para tareas de Classroom, la hora de entrega como deadline.
- **Datos reales** (fase 2 de «ejecución de tareas»): «Hoy» se construye con lo que hay en la App: las sesiones de hoy de las **actividades**, los **eventos** de hoy y las **tareas** (Classroom, sueltas, de eventos y de práctica) con entrega hoy.
  - Se quitan los elementos que ya han terminado y las **tareas hechas**; una tarea cuya hora ya pasó sin completarse queda en «Atrasadas» (pantalla Tareas).
  - En las tareas, la línea de detalle es su origen y el tiempo estimado (p. ej. «Classroom · Lengua»).
  - El **✓ rápido** aparece en todas las tarjetas de tareas, también en la del primer deadline: un círculo pequeño con un **✓ atenuado dentro** (para que se entienda para qué sirve). Marca la tarea como hecha en toda la App, con «Deshacer». En Post-it 2 va debajo de la hora, en la esquina que queda a la vista aunque los post-its se solapen.
  - El tiempo que falta se escribe **abreviado**: «45 min», «2h», «4h45».
  - Si no queda nada para hoy, el cuerpo muestra «No queda nada más para hoy.»
  - «Próximos días» también usa las tareas reales pendientes.
  - Los **traslados** (distancia y horas de salida) quedan pendientes hasta conectar Google Maps: mientras tanto se muestran el lugar y **desde dónde se sale** («Polideportivo · desde casa»).
- Si un evento implica desplazamiento, se muestran **dos datos**: el deadline en sí, y la hora de salida calculada según el tiempo de traslado (Google Maps).
  - Distancias de 1,5 km o menos: también el tiempo andando (al principio se pensó en 1 km y preguntar; ver punto 2 quater).
  - Resto de distancias: calcular en coche.
  - **Servicio: Google Maps (Routes API)**, con **tráfico**: el tiempo se pide para la **hora de salida prevista** (tráfico previsto para ese día y hora), se ajusta una vez con la nueva hora de salida y se actualiza con el tráfico real a partir de 1 h antes. La clave de la API va en la App, restringida a su dirección y a Routes API y Places API (New).
  - **Punto de partida** de cada traslado (solo actividades y eventos con ubicación):
    - **Desde 1 h antes de la hora de salida** (hora del elemento menos el tiempo en coche; decidido 7/10/2026, antes era 1 h antes del elemento): la **ubicación del móvil**.
    - Antes de eso, si ese día hay **elementos programados antes** (actividades o eventos): **el lugar del anterior**. Si es el mismo lugar, no hay traslado; si el anterior **no tiene ubicación**, se sale de **casa**.
    - Si no hay ninguno: **casa**. **El cole no cuenta** como punto de partida: lo primero después del cole sale de casa.
    - La dirección de casa se configura en **Configuración > Perfil**.
- Tarjeta **«Próximos días»** (sustituye a «Carga de trabajo»): recoge **todas las tareas de los siguientes 5 días con tiempo estimado de 1,5 h o más**, ordenadas por entrega.
  - Cada tarea: **nombre**; debajo, **tiempo estimado** (sin la palabra «estimado») y **«antes de» fecha y hora** de entrega. Puede tener varias líneas.
  - **Pulsar una tarea** abre su ficha en Tareas (con Editar, Eliminar y Marcar como hecha) y el botón **«‹ Volver a Hoy»**.
  - Va **abajo del todo, fija justo encima de la barra de pestañas** (se ve aunque el resto se desplace).
  - Marco naranja pastel, fondo amarillo pastel y el texto de cada tarea del color de su categoría.
  - Cuenta **desde mañana** hasta el final del quinto día: lo de hoy ya está en el cuerpo de «Hoy».
  - Si no hay ninguna tarea que cumpla la condición, la tarjeta no aparece.
  - **Regla de espacio:** si con la tarjeta desplegada la pantalla no da para todo sin que nada quede tapado, la tarjeta aparece **plegada** (solo «Próximos días · n») y hay que pulsarla para ver las tareas; al pulsar de nuevo se pliega.
- Para ganar espacio, «Hoy» usa una **cabecera compacta** (sin la marca, título y fecha en una línea), una **barra de tiempo más baja** y un **primer elemento más compacto**.
  - **Solo en móviles pequeños** (hasta 360 px de ancho o 620 px de alto): los elementos 2 a 4 son más pequeños en las tres vistas (fichas más bajas en Lista, cartas más pequeñas en Post-it 1, post-its más pequeños y más juntos en Post-it 2).
- En **Post-it 1**, las cartas de los elementos 2 a 4 usan el mismo código de color que los post-its de Post-it 2 (relleno del color de la categoría con brillo, borde oscuro y texto oscuro de la categoría).

---

## 2 bis. La App real (paso 1: sin servidor)

- **Dónde está:** `docs/app/` del repositorio, publicada con GitHub Pages en **https://r0ck3r0ll.github.io/ahhhhhh-app/app/** (la página de inicio enlaza con ella). La maqueta `mockup-pantallas.html` queda como referencia de la fase de diseño; **el desarrollo sigue en `docs/app/`**.
- **Archivos:** `index.html` (pantallas), `styles.css`, `i18n.js` (textos en los cinco idiomas), `app.js` (lógica), `manifest.webmanifest` y `sw.js` (instalable y sin conexión), `icons/` (icono: cronómetro, calendario con un día marcado, notas adhesivas y chincheta de ubicación, con una estela azul, sobre fondo crema; dibujo vectorial en `icons/icon.svg`, del que salen los PNG y la versión adaptable de Android) y `assets/`.
- **Instalable:** en iPhone, Safari → Compartir → «Añadir a la pantalla de inicio»; en Android, Chrome → menú → «Instalar aplicación». Se abre a pantalla completa, con su icono, y funciona sin conexión (el service worker guarda la App; al haber conexión carga siempre la última versión publicada).
- **Reloj real:** «Hoy», el Calendario, los avisos y los bloques usan la fecha y la hora del dispositivo (se actualizan cada minuto y al volver a la App). Si cambia el día, todo se redibuja.
- **Calendario:** flechas ‹ › para pasar de semana (o de día en la vista día); pulsar la fecha vuelve a hoy.
- **Primera instalación limpia:** sin nombre, sin franja horaria, sin horario escolar y solo con las dos categorías de serie (Tarea y Actividad).
  - Para usar la App hace falta, **como mínimo, el nombre, la franja horaria y el horario escolar**. Mientras falte algo, la App **se abre en Configuración** (con Perfil desplegado), las **demás pestañas están bloqueadas** (atenuadas; al tocarlas avisa de qué falta) y arriba una tarjeta **«Para empezar a usar la App, completa:»** lista lo que falta; cada punto abre su bloque.
  - Al completarlo aparece «¡Listo! Ya puedes usar la App» y se desbloquean las pestañas.
- **Datos:** en el dispositivo, sin datos de ejemplo. Además de lo que ya guardaba la maqueta (actividades, eventos, tareas, bloques, aspecto, idioma, nombre, direcciones, calendario escolar), ahora se guardan también la **franja horaria**, el **horario escolar**, las **categorías** (nombre, color, prioridad, orden y borradas) y la **exportación a Google Calendar**.
- **Aún no (llega con el servidor, paso 3 «Firebase»):** conexión con Google (el botón «Conectar» lo avisa), traslados con Maps, lectura con IA, notificaciones con la App cerrada y sincronización entre dispositivos. Al pasar a Firebase cambiará la dirección de la App; los datos del dispositivo se llevarán a la nueva al iniciar sesión por primera vez.

## 2 ter. Firebase (paso 3: servidor)

- **Proyecto:** el mismo de Google Cloud, `ahhhhhh-today` (número 356797407017), con Firebase añadido. Plan **Blaze** a través de la **prueba gratuita de Google Cloud** (264 € de crédito, 90 días, hasta el 6/1/2027). **Antes de esa fecha hay que pulsar «Actualizar»** en la tarjeta de facturación de Firebase para pasar a la cuenta de pago normal; si no, los servicios se paran. Con el uso familiar el coste esperado es 0 €. Pendiente: alerta de presupuesto de 5 €.
- **App web registrada** («AHHHHHH Today web»): su `firebaseConfig` es público y va dentro de la App.
- **Firestore** (base de datos) en `europe-southwest1` (Madrid), en modo producción.
- **Authentication:** inicio de sesión con Google.
- **Sincronización (Config > Cuenta, `docs/app/sync.js`):** el inicio de sesión es opcional; sin él la App funciona solo en el móvil. Al iniciar sesión, los datos se guardan en un **plan** compartido:
  - `plans/{id}`: dueño y lista de correos que comparten el plan (`memberEmails`). Solo el dueño añade o quita personas.
  - `plans/{id}/kv/{clave}`: los datos (nombre, ajustes, actividades, eventos, tareas, bloques, direcciones, calendario escolar…). El idioma y el aspecto son de cada móvil.
  - `users/{uid}`: a qué plan pertenece cada persona.
  - Primera vez sin invitación: se crea un plan y se suben los datos del móvil. Con invitación (el dueño ha añadido ese correo): se entra en su plan y los datos del plan sustituyen a los del móvil, tras confirmarlo.
  - Un cambio en un móvil llega a los demás al momento; la App se vuelve a cargar sola (nunca con un formulario a medias).
  - Reglas en `firestore.rules`, publicadas por el mismo flujo de GitHub: cada uno solo ve sus planes; solo los miembros leen y escriben los datos.
  - El inicio de sesión funciona solo en https://ahhhhhh-today.web.app (en GitHub Pages la sección Cuenta lo indica). La dirección `https://ahhhhhh-today.web.app/__/auth/handler` está autorizada en el cliente OAuth web de Firebase en Google Cloud.
  - **Probado (7/10/2026):** inicio de sesión y sincronización funcionan entre móviles.
- **Publicación automática:** `.github/workflows/firebase-deploy.yml` publica `docs/app` en **Firebase Hosting** (https://ahhhhhh-today.web.app) cada vez que cambia la App en `main`, con la cuenta de servicio `github-deploy` (roles: Administrador de Firebase, Administrador de Cloud Functions, Usuario de cuenta de servicio y Editor). Su llave está guardada como secreto `FIREBASE_SERVICE_ACCOUNT` del repositorio; el archivo descargado se borró.
- **Lectura del calendario escolar con IA** (`functions/`, función `readSchoolCalendar`, región `europe-west1`):
  - **IA: Gemini en Vertex AI** del propio proyecto `ahhhhhh-today` (decidido 8/10/2026, en lugar de la API de Claude, que necesitaría una cuenta y un saldo aparte en Anthropic: la suscripción de Claude no sirve para una app propia). Ventajas: el gasto va a la facturación del proyecto (lo cubre el crédito de prueba y, después, son céntimos al mes), **no hay clave** (la función entra con su cuenta de servicio) y, con Vertex AI, Google **no usa los datos para entrenar** (importante para Classroom y Gmail). Descartados los planes gratuitos de otros proveedores (pueden usar los datos para entrenar y son poco fiables).
  - Modelo: `gemini-3.5-flash` (estable, sin retirar antes de mayo de 2027), en el punto de acceso `global`. Se puede cambiar sin tocar el código con el parámetro `GEMINI_MODEL` (archivo `functions/.env`, p. ej. `GEMINI_MODEL=gemini-3.8-flash`). Antes de que Google lo retire hay que pasar a uno más nuevo.
  - Recibe el archivo (en base64) o el enlace. PDF e imágenes van tal cual a Gemini; Word (.docx) se pasa a texto; de una página web se queda el texto. Los enlaces de Google Drive/Docs/Sheets se leen con la **API de Drive** (Drive API activada en el proyecto; la función entra con su cuenta de servicio, permiso de solo lectura) y, si falla, con su dirección de descarga pública; los Docs/Sheets se exportan a PDF.
  - **Archivos de Drive con la descarga desactivada** («los lectores no pueden descargar, imprimir ni copiar»): Google no deja descargarlos a ningún programa, ni con la API; solo se ven en el navegador. La App lo detecta y lo explica: hay que subir capturas de las páginas o pedir una versión descargable. Es el caso del calendario del Laude 2026/2027 (8/10/2026). No se intenta saltar esa restricción.
  - Si un enlace falla, el aviso de la App incluye el motivo técnico (p. ej. «HTTP 403 …») para poder diagnosticarlo. Solo descarga de direcciones públicas (nunca de la red interna del servidor), con un máximo de 10 MB.
  - Pide los días sin clase del calendario con salida en JSON de esquema fijo, en el idioma de la App, y comprueba lo que devuelve (fechas válidas, periodos de menos de 120 días, años cercanos).
  - Solo la pueden usar personas con sesión iniciada que estén en algún plan, y como mucho **20 lecturas por persona y día** (contador en `usage/{uid}`, que la App no puede leer ni cambiar). Coste estimado: menos de un céntimo por lectura.
  - Pruebas: `npm test` en `functions/` (lectura de archivos y enlaces, y comprobación de fechas); probado también con los emuladores de Firebase (sesión, plan, límite diario, enlaces) y la petición a Gemini contra un servidor simulado. **Pendiente: probarlo con Gemini de verdad y el calendario real del colegio** una vez publicada la función.
  - Publicación: el mismo flujo de GitHub publica las funciones cuando cambia la carpeta `functions` (trabajo aparte del de la App, para que un fallo aquí no impida publicar la App).
  - **Para activarla (una vez):**
    1. La **Vertex AI API** la activa sola la publicación automática (si no pudiera, avisa en GitHub y hay que activarla a mano en https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=ahhhhhh-today > «Habilitar»).
    2. Comprobar en **IAM y administración > IAM** que la cuenta `356797407017-compute@developer.gserviceaccount.com` (con la que corre la función) tiene el rol **Editor** o **Usuario de Vertex AI**; si no, «Conceder acceso» con el rol **Usuario de Vertex AI**. Si falta, la App avisa de que la lectura con IA aún no está activada.
- GitHub Pages sigue sirviendo las páginas de inicio, privacidad y condiciones (`docs/`) que usa la pantalla de consentimiento de Google.

## 2 quater. Google Maps (paso 2: traslados con tráfico)

- **Routes API** activada en el proyecto `ahhhhhh-today`. Clave «Maps App» restringida a los sitios `https://ahhhhhh-today.web.app/*` y `https://ahhhhhh-today.firebaseapp.com/*` y solo a Routes API; va dentro de la App (es pública por naturaleza, la protege la restricción).
- **Alerta de presupuesto** de 5 € en Facturación > Budgets & caps (avisa por correo, no corta el gasto).
- **En la App** (`refreshRoutes` / `applyRoute` en `app.js`): cada elemento de hoy con lugar y traslado tiene su tiempo en coche (con tráfico previsto) y, si el trayecto en coche es de **1,5 km o menos**, a pie (si son 45 min o menos). (9/10/2026: decidido 1,5 km; antes era 2,5 km, demasiado.) La pantalla Hoy muestra las horas de salida y la distancia del próximo.
  - Punto de partida según las reglas del punto de traslados (ubicación del móvil desde 1 h antes de la hora de salida; si no se puede saber, casa).
  - **Cuándo se calcula** (decidido 7/10/2026):
    - la primera vez que se abre la App en el día: todos los de hoy;
    - para cada elemento: cuando falta 1 h para su hora de salida y luego cada 20 min hasta la hora del elemento;
    - si cambia algo de hoy (crear, cambiar o borrar una actividad o un evento, la casa o el sitio exacto de un lugar): todos;
    - si la App se cierra y se vuelve a abrir fuera de esos momentos, se usan las estimaciones guardadas, sin consultar.
  - **Ubicación del móvil con GPS** (8/10/2026): se pide con precisión alta. La ubicación por red puede desviarse 1-2 km: en coche apenas cambia el tiempo, pero andando sí (se vio 36 min a pie donde Google Maps daba 14). Si la precisión es peor de 300 m, se vuelve a pedir al minuto; y si el móvil está a más de 300 m del punto usado, los trayectos «desde tu ubicación» se recalculan enseguida.
  - (9/10/2026) Una ubicación con precisión peor de **1 km** no se usa (el trayecto saldría de otro sitio: se vio 5-6 min para un destino a casi 20 km): se calcula desde casa y, en cuanto hay una ubicación buena, se recalcula desde el móvil. Las peticiones llevan `regionCode: ES` y la App guarda los puntos exactos de salida y llegada que usa Google (`route-cache`, campos `s` y `e` de cada modo) para poder ver de dónde sale un trayecto raro.
  - Máximo 60 consultas por móvil y día; si Google rechaza la clave o el cupo, se deja de preguntar 1 h; si falla un cálculo, se reintenta a los 10 min.
- **Cuota diaria de Routes API: Google no deja cambiarla** (7/10/2026: «Directions - ComputeRoutes per request quota per day» = ilimitado, no ajustable). El control del gasto queda en: el máximo de 40 consultas por móvil y día de la App (con dos móviles, menos de unas 2.400 al mes, frente a unas 10.000 gratis), la restricción de la clave (solo nuestra dirección y solo Routes API) y la alerta de 5 €.
- **Lugares** (casa, actividades, eventos): al escribir salen primero los ya usados; a partir de 10 caracteres, si no se ha elegido ninguno, se busca el texto en Google Maps (**Places API (New)**, Autocomplete) al dejar de escribir 0,7 s, máximo 150 búsquedas por móvil y día. Al elegir una sugerencia de Google se guarda su identificador (`places`, compartido por el plan) y las rutas van a ese sitio exacto. En Perfil, «Usar mi ubicación actual» guarda el punto exacto de casa.
  - **Calle sin número** (8/10/2026): si la sugerencia elegida es solo la calle, el cursor se queda tras el nombre de la calle y un aviso pide el número; se añade ahí mismo, sin reescribir la dirección. Al dejar el campo con el texto cambiado, se busca en Google el sitio exacto de lo escrito y, si es una dirección con número o un sitio concreto **y contiene todas las palabras y números de lo escrito** (para no tomar una calle con el mismo nombre en otro pueblo), se guarda su identificador. Las últimas búsquedas se recuerdan para no repetirlas.
  - Requiere **Places API (New)** activada y añadida a las restricciones de la clave «Maps App».
- Pendiente: el aviso a la hora de salida (Config > Google Calendar > «Aviso a la hora de salida») todavía no usa estos tiempos.

## 3. Flujo de sincronización con Google (Classroom + Gmail)

> **Estado (3/10/2026): la cuenta del colegio está bloqueada para apps externas.**
> - Prueba hecha con el proyecto real de Google Cloud («AHHHHHH Today», cuenta de Carlo; app publicada sin verificar, con páginas de inicio, privacidad y condiciones en GitHub Pages: `https://r0ck3r0ll.github.io/ahhhhhh-app/`).
> - La cuenta de Martina (`@students.laudesanpedro.com`) entra en Google con SSO de ClassLink/Microsoft (grupo ISP). Al dar permiso: **«Access blocked: Your institution's admin needs to review AHHHHHH Today» (Error 400: access_not_configured)**. Tampoco se puede añadir como usuaria de prueba.
> - Alternativas comprobadas y **cerradas**: dirección iCal de los calendarios de clase (no existe: los calendarios no son de Martina) y reenvío automático del Gmail del colegio (desactivado por el colegio).
> - Hecho: solicitud enviada con el botón «Request access» (sin texto). Pendiente: correo de Martina al colegio con el ID de cliente y la política de privacidad en inglés.
> - Hecho también: correo de Martina al especialista de IT del colegio (4/10/2026), con el ID de cliente y la política de privacidad en inglés.
> - **Decisión:** se sigue con el planteamiento original (conexión directa con Classroom y Gmail). En **Config > Enlaces** un aviso explica que en cuentas de colegio o empresa el administrador puede tener que autorizar la App; si no lo ha hecho, Google muestra «Acceso bloqueado» y **las tareas se añaden a mano** en Tareas («Añadir tarea»). La App real, al recibir ese error al conectar, lo explicará con ese mismo mensaje en vez de mostrar el error técnico.

- Al abrir la app, se conecta con Classroom y con el correo de Google.
- Debe leer **solo lo que ha cambiado** desde la última conexión → requiere un log propio interno que registre qué contenido ya ha sido procesado (para no re-leer ni duplicar).
  - El log guarda también lo que el usuario **ha cancelado, eliminado o cerrado** (p. ej. una tarea de Classroom completada o un evento extraído de un correo y descartado), para **no volver a cargarlo** en las siguientes sincronizaciones.
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
| Google Classroom API | Proyecto en Google Cloud, API activada, OAuth. App **publicada sin verificar** (en «Testing» los permisos caducan a los 7 días); al conectar sale una vez el aviso de app no verificada | El colegio (Laude San Pedro) usa Google Classroom. **Bloqueado por el colegio** hasta que su administrador autorice la App (ver punto 3) |
| Gmail API | Mismo proyecto de Google Cloud, API activada, mismo OAuth | Se usa tanto para leer contenido relevante como para la extracción con IA |
| Geolocalización del dispositivo | Ninguna cuenta ni API — función estándar del navegador con permiso del usuario | Trivial |
| Google Maps Platform (cálculo de traslados reales) | Clave de API de Google Maps — **requiere asociar una tarjeta de crédito a la cuenta de Google Cloud**, aunque el uso se mantenga dentro del nivel gratuito | **Decidido: Google Maps** (Routes API, con tráfico). Se pone un **tope de gasto** (límite de cuota diaria y alerta de presupuesto en Google Cloud) para que el uso familiar se quede siempre en el nivel gratuito. Descartados: Waze (sin API pública de rutas), TomTom (alternativa sin tarjeta) y la estimación en línea recta |
| Google Calendar API (exportación) | Mismo proyecto de Google Cloud y mismo OAuth; API de Google Calendar activada. Permiso limitado `calendar.app.created` (solo puede gestionar calendarios creados por la App, no lee los demás) | Decidido: exportar a Google Calendar. Solo escritura en el calendario propio de la App |
| Extracción de contenido con IA (**Gemini en Vertex AI**, decidido 8/10/2026) | Vertex AI API activada en el mismo proyecto de Google Cloud; sin clave (cuenta de servicio de la función) | Se paga con la facturación del proyecto (crédito de prueba; después, céntimos al mes). Google no usa los datos para entrenar. Ver punto 2 ter |

---

## 6. Consideraciones de arquitectura

- **Dónde se guardan los datos**: en la maqueta, en el propio dispositivo (almacenamiento del navegador): no pide permisos ni interrumpe. Pero el navegador puede borrarlo (Safari en iPhone borra los datos de una web que no se abre en 7 días si no está añadida a la pantalla de inicio) y no se comparte entre dispositivos. En la App real los datos se guardarán en la base de datos de la App (en el servidor, necesaria de todos modos para Google y la sincronización), con una copia local para abrir al instante y funcionar sin conexión; así tampoco hay peticiones de permisos.

- El proyecto no puede vivir como un simple artifact de conversación: necesita alojamiento propio (ej. Vercel o Netlify, capa gratuita) para sostener el login OAuth de forma persistente entre sesiones.
- Se construye en **Claude Code**, no en este chat — Carlo ya tiene experiencia previa usando Claude Code (entorno de Python en VS Code).
- Plan de trabajo acordado: el estudio y la planificación se hacen en este chat; el desarrollo e implementación se hacen en una sesión de Claude Code, usando este dossier como punto de partida.

---

## 7. Pendiente de definir sobre la marcha

- Estrategia concreta de login/sesión persistente con Google que no interrumpa la experiencia de uso.
- Diseño gráfico y de contenido detallado de cada pantalla (mencionado como primer paso a definir en Code).
- Peso relativo de los criterios de priorización en el algoritmo de planificación diaria.
- Grado de autonomía de la IA al interpretar correos (todo lo extraído pasa por aprobación del usuario, según lo decidido en el punto 4).

---

## 7 bis. App de seguimiento (Carlo): plan de desarrollo

> **Decidido el 10/10/2026** (lluvia de ideas con Carlo). La App de Martina la usa solo ella; Carlo quiere **estar al tanto de sus planes**, **ver si se organiza bien** y **enviarle mensajes**. Sin logística (horas de salida, quién la lleva).

### 7 bis.1 Qué es

- **La misma App y la misma dirección** (https://ahhhhhh-today.web.app), en **modo supervisor**: si quien inicia sesión es el **supervisor** del plan (ver 7 bis.3), la App se abre con las pantallas de seguimiento y **sin nada que cambie el plan**.
  - Motivo: aprovecha el Calendario, las fichas de tareas y los cálculos (huecos libres, riesgo, progreso) que ya existen. Así hay una sola instalación, una sola publicación y un solo inicio de sesión.
  - El código propio del modo supervisor va en `docs/app/supervisor.js`, que **solo se carga en ese modo**: la App de Martina no crece.
- **Pestañas:** Ahora · Calendario · Tareas · Análisis · Historial · Config. En la cabecera hay una **campana con los avisos** y un botón de **mensajes**.
- **Solo lectura:** el supervisor no puede cambiar nada del plan, ni desde la App ni por error. Lo impiden las reglas de Firestore, no solo la pantalla. Lo único que escribe son mensajes.

### 7 bis.2 Contenido

**1. Ahora**
- **Dónde está o estará Martina:** lo que tiene en este momento (cole, actividad, evento o bloque de trabajo) y lo siguiente, con su hora.
- **Barra de tiempo del día**, como la de «Hoy» pero más sencilla: los deadlines y los bloques de trabajo de hoy, sin traslados ni horas de salida.
- Pulsar cualquier elemento abre su ficha, de solo lectura y con todos los detalles: lugar, descripción, material… No hay sección aparte de preparativos.

**2. Calendario** (semana y día, como el de Martina)
- **Qué se ve:** actividades, eventos, entregas de tareas, **bloques de trabajo planificados**, **días sin cole** y **huecos libres**.
- **Planificado y trabajado a la vez:** cada bloque terminado se rellena en proporción a lo que Martina anotó. Por ejemplo, un bloque de 1 h con 40 min anotados se rellena 2/3. Un bloque terminado **sin registrar** se ve con borde punteado y uno con **0 min**, tachado.
- **Tareas hechas:** un **✓ en el momento en que se marcaron** (día y hora), además de su entrega.
- Pulsar un elemento abre su ficha, con «‹ Volver al Calendario».

**3. Tareas**
- **Lista como la de Martina:** Atrasadas, Pendientes por orden de entrega y Hechas. Hechas no se limita a la semana actual: se ven todas, con selector de periodo.
- **Ficha de cada tarea** (solo lectura):
  - Nombre, origen (Classroom, suelta, evento o actividad), prioridad y descripción.
  - **Entrega, tiempo estimado, planificado (bloques), trabajado y lo que falta**, con barra de progreso y la lista de bloques con lo anotado en cada uno.
  - **Cuándo se marcó como hecha** y **con cuánta antelación** respecto a la entrega (o con cuánto retraso).
  - **Historia** (del Historial, 7 bis.5): cuándo se creó, cuándo se planificó y si se movió la entrega o se cambió el estimado (de qué a qué y cuándo).
  - Botón **«Enviar mensaje sobre esta tarea»** (7 bis.2, punto 7).

**4. Estado de las tareas** (resumen al principio de la pestaña Análisis)
- Recuento por estado en el periodo elegido (esta semana · 4 semanas · curso).
- **Pulsar un total abre la lista** de esas tareas, y cada tarea de la lista abre su ficha.
- **Estados** (cada tarea está en uno solo; se aplica el primero que cumple, en este orden):
  1. **Eliminada:** se borró sin hacerla. Sale del Historial.
  2. **Hecha a tiempo:** hecha antes de su entrega o en ella.
  3. **Hecha tarde:** hecha después de su entrega.
  4. **Atrasada:** la entrega pasó y no está hecha.
  5. **Sin estimar:** pendiente y sin tiempo estimado.
  6. **En curso:** pendiente y con tiempo ya trabajado.
  7. **Planificada:** pendiente, sin tiempo trabajado y con bloques que cubren lo que falta.
  8. **Sin planificar:** pendiente, sin trabajar y con bloques que no cubren lo que falta, o sin bloques.

**5. Análisis** (pestaña propia, debajo del Estado de las tareas)
- **% de tareas entregadas a tiempo**, con su evolución semana a semana en un gráfico.
- **Antelación media:** cuánto antes de la entrega se terminan las tareas, en media y en mediana. Por ejemplo, «2 días antes» o «la noche de antes».
- **Precisión de las estimaciones:** trabajado frente a estimado en las tareas hechas. Muestra si se queda corta o se pasa, y en qué porcentaje.
- **Cumplimiento de lo planificado:** trabajado frente a planificado en los bloques terminados.
- **Procrastinación:** qué parte del trabajo de cada tarea se hizo en las últimas 24 h antes de la entrega, en media y por semana.
- **Horas de estudio** por día y por semana, separadas por asignatura u origen (curso de Classroom, evento, actividad, sueltas).
- **Carga que viene:** horas comprometidas (lo que falta de las tareas pendientes) en los próximos 7 días frente al tiempo libre, día a día, con los **días críticos** resaltados (en ámbar o rojo con el mismo cálculo de riesgo que la App de Martina).

**6. Avisos** (notificación en el móvil de Carlo y lista en la campana)

| Aviso | Cuándo salta | Por defecto |
|---|---|---|
| Tarea no hecha a tiempo | pasa la entrega y sigue pendiente | activado |
| Riesgo rojo «No da tiempo» | mismo cálculo que en la App de Martina | activado |
| Riesgo ámbar «Cuidado, el tiempo se agota» | mismo cálculo; vuelve a avisar si pasa a rojo | activado, margen de 1 h |
| Entrega próxima | faltan X horas para la entrega y no está hecha | X = 24 h y 3 h |
| Tarea grande sin bloques | estimado de **3 h o más**, sin bloques y con la entrega a N días o menos | N = 3 días |
| Tarea sin tiempo estimado | al aparecer una tarea pendiente sin estimar (no se puede comprobar su riesgo) | activado |
| Bloque terminado sin registrar | han pasado H horas desde el fin del bloque y sigue sin anotar | H = 2 h |
| Bloque saltado | al registrarlo, anota menos de lo planificado para ese bloque (no lo completa) | activado |
| Novedades | tarea nueva (de Classroom o a mano), evento nuevo, entrega cambiada | activado |

- Cada aviso sale **una sola vez** por tarea o bloque. El riesgo vuelve a avisar al pasar de ámbar a rojo.
- El **trabajo anotado a mano** (sin bloque planificado) cuenta como trabajado, pero no como planificado: no entra en los avisos de bloques ni en el «cumplimiento de lo planificado».
- Los avisos de bloques **no añaden nada a la App de Martina**: ella sigue con su pregunta «¿Cuánto has trabajado?» de siempre.
- En la campana, cada aviso abre su ficha.

**Resúmenes**
- **Diario a las 22:00:** qué hizo hoy (tareas hechas, tiempo trabajado y bloques cumplidos o no) y qué queda para mañana.
- **Semanal el domingo a las 22:00**, además del diario: la semana que viene (entregas, carga por día y días críticos).

**7. Mensajes**

Un **único instrumento** sirve para todo: sugerencias, ánimos, proponer un evento y preguntar cómo va.
- **Carlo** escribe un texto libre. Opcionalmente puede ir **ligado a una tarea**, desde su ficha. Hay atajos que rellenan el texto:
  - «¿Cómo vas?»
  - «¡Bien hecho!» (en tareas hechas)
  - «Propongo un evento:» con fecha y hora
- **Martina** lo ve:
  - Con su App **abierta:** como **aviso emergente**.
  - Con la App **cerrada:** como **notificación** y, al abrir la App, como aviso emergente.
- **Respuesta:** ella responde con **«OK»** o con un **texto**. Si hay que cambiar algo (planificar, crear el evento…), **lo hace ella** en su App. El mensaje no cambia ningún dato del plan.
- **Carlo** recibe la respuesta como notificación. En la lista de mensajes ve cada uno con su estado: enviado · visto · respondido (con la respuesta).
- Martina tiene en su App una lista con los mensajes recibidos.

**8. Configuración del supervisor**
- Activar o desactivar cada aviso y cambiar sus umbrales: X horas antes de la entrega (varios valores), margen del ámbar, tamaño de «tarea grande» y días antes, y horas para «sin registrar».
- Activar o desactivar cada resumen.
- Cuenta: cerrar sesión.

**No se incluye** (decidido): logística y horas de salida, «¿la llevo yo?», material aparte, el Google Calendar de Carlo, aviso de salida, inactividad, uso de la App, rachas, horas de silencio, varios supervisores y varios planes.

### 7 bis.3 Alta del supervisor (en la App de Martina)

- Se hace en **Config > Cuenta > «Supervisor»**: quien es dueño del plan escribe el correo. Si el dueño del plan es Carlo (si lo creó él), antes hay que **pasar la propiedad a Martina**: el dueño no puede ser solo supervisor.
- **Antes de confirmar**, un aviso explica: «*correo* podrá **ver toda tu planificación** (calendario, tareas, tiempo trabajado e historial) y **enviarte mensajes**. No puede cambiar nada de tu plan.» Botones: «Añadir supervisor» / «Cancelar».
- Después, en Config > Cuenta queda la línea «*correo* puede ver tu plan y enviarte mensajes», con el botón **«Quitar»** (pide una segunda pulsación).
- Una persona es **miembro** (lee y escribe) **o supervisora** (solo lee), no las dos cosas. Si el correo de Carlo ya estaba en el plan como miembro, al hacerlo supervisor deja de ser miembro.
- Carlo inicia sesión en la App con ese correo y la App detecta el rol: entra en modo supervisor.

### 7 bis.4 Datos (Firestore)

- `plans/{id}`: nuevo campo **`viewerEmails`** (lista; la pantalla permite uno). Solo lo cambia el dueño.
- **Reglas** (`firestore.rules`):
  - Leen el plan y `kv` quienes están en `memberEmails` o en `viewerEmails`; **escriben `kv` solo los miembros**.
  - `log`, `archive` y `sent` los escribe solo el servidor.
  - Mensajes: el supervisor los crea y la dueña solo puede cambiar su estado y la respuesta.
- **`plans/{id}/log/{auto}`**: historial. Lo escribe la función `onPlanChange` (7 bis.6) **comparando el antes y el después** de cada cambio de `app-tasks`, `app-events`, `app-activities` y `app-blocks`, sin tocar la App de Martina.
  - Campos: `{ at, type, key, name, before, after }`.
  - Tipos de tarea: `task.created`, `task.due-changed`, `task.est-changed`, `task.done`, `task.reopened`, `task.deleted`.
  - Tipos de bloque: `block.planned`, `block.moved`, `block.removed`, `block.logged`.
  - Tipos de eventos y actividades: `event.created` / `event.changed` / `event.deleted` y lo mismo para `activity.*`.
  - **Empieza a contar cuando se publique la función**: de lo que ya existía, la primera entrada es «ya existía el dd/mm».
  - Un cambio hecho sin conexión se registra cuando llega al servidor. La hora de «hecha» se toma del dato `doneAt`, no de la llegada.
- **`plans/{id}/archive/{clave}`**: copia de cada tarea eliminada con sus bloques, porque la App de Martina borra los bloques al eliminar la tarea. Sirve para el estado «Eliminada» y para que las estadísticas no pierdan el tiempo trabajado.
- **`plans/{id}/messages/{id}`**: `{ from, text, taskKey?, createdAt, seenAt?, reply?: { ok | text, at } }`.
- **`plans/{id}/sent/{clave}`**: qué avisos se han enviado ya, para no repetirlos.
- **`users/{uid}`**: `viewerOf` (plan que supervisa) y `alerts` (configuración de avisos del supervisor). En **`users/{uid}/devices/{token}`** se guardan los móviles que reciben notificaciones, de Carlo y de Martina.

### 7 bis.5 Cambios en la App de Martina

1. **`doneAt` con fecha y hora:** hoy guarda solo la fecha. Las tareas de práctica de actividades guardarán también la hora de cada sesión hecha (`doneAtFor`). Las tareas marcadas antes del cambio solo tendrán el día.
2. **Supervisor en Config > Cuenta**, con su aviso (7 bis.3).
3. **Mensajes:** aviso emergente con «OK» / «Responder», lista de mensajes recibidos y notificaciones con la App cerrada. Necesita el permiso de notificaciones (ya se pide en la configuración del primer inicio) y registrar el móvil para recibir notificaciones.
4. **`sync.js`:** detecta el rol (miembro o supervisor). En modo supervisor no sube nada.
5. **Cálculos a un módulo común, `docs/app/core.js`.** Incluye sacar de `app.js` las funciones puras:
   - la lista de tareas a partir de tareas, eventos y actividades (hoy `allTasks`);
   - las sesiones de actividades, los huecos y el tiempo libre;
   - el riesgo y el progreso.

   Así los usan igual la App de Martina, el modo supervisor y el servidor (los avisos con las apps cerradas). Es la pieza más delicada: **no debe cambiar nada de lo que hace la App de Martina**, y se comprueba con pruebas automáticas antes y después. La publicación copia `core.js` a `functions/`.

### 7 bis.6 Servidor (Cloud Functions, hora de Madrid)

- **`onPlanChange`** (al cambiar `plans/{id}/kv/{clave}`):
  - escribe el historial y el archivo;
  - lanza los avisos de **novedades**;
  - vuelve a calcular el **riesgo** al momento.
- **`checkAlerts`** (cada 15 min): entrega próxima, atrasada, riesgo, tarea grande sin bloques, sin estimar, bloque sin registrar y bloque saltado. Usa `core.js` y `sent` para no repetir.
- **`dailySummary`** (todos los días a las 22:00) y **`weeklySummary`** (domingo a las 22:00).
- **`onMessage`:** al crear un mensaje, notificación a Martina; al responder, notificación a Carlo.
- **Notificaciones:** con **Firebase Cloud Messaging** (Web Push, gratis). El `sw.js` las recibe con la App cerrada. Hay que crear la **clave VAPID** en Firebase (Configuración del proyecto > Cloud Messaging).
  - **En iPhone solo funcionan con la App instalada en la pantalla de inicio** (iOS 16.4 o posterior).
- **Coste esperado: 0 €.** `checkAlerts` son unas 3.000 ejecuciones al mes, dentro del nivel gratuito; las lecturas y escrituras son pocas.
- **Pruebas:** con `npm test` en `functions/`: `core.js`, la comparación del historial, los estados de las tareas y los avisos con fechas simuladas. Las reglas se prueban con los emuladores de Firebase.

### 7 bis.7 Fases

Cada fase se publica y la prueba Carlo antes de pasar a la siguiente.

1. **Base y permisos:**
   - `core.js` con sus pruebas, sin cambios visibles en la App de Martina;
   - `viewerEmails`, reglas y alta del supervisor con su aviso;
   - `doneAt` con hora;
   - modo supervisor vacío (inicio de sesión, detección del rol y pestañas);
   - **`onPlanChange` escribiendo ya el historial** (y el archivo), para que el historial empiece a acumularse cuanto antes, aunque todavía no se vea.
2. **Ver:** Ahora, Calendario (con lo trabajado y los ✓) y Tareas con sus fichas.
3. **Historial:** pestaña Historial (línea de tiempo con filtros por tipo; cada entrada abre su ficha) e historia en la ficha de cada tarea.
4. **Análisis:** Estado de las tareas (totales → lista → ficha) e indicadores.
5. **Avisos y resúmenes:** notificaciones (FCM), `checkAlerts`, novedades, resúmenes de las 22:00, campana y Config de avisos.
6. **Mensajes:** envío, aviso emergente o notificación a Martina, respuesta «OK» o texto, y lista de mensajes en las dos apps.

### 7 bis.8 Valores por defecto a confirmar al probar

Todos se pueden cambiar en Config del supervisor:
- Entrega próxima: 24 h y 3 h antes.
- Margen del ámbar: 1 h.
- Tarea grande: 3 h o más, a 3 días o menos de la entrega.
- Bloque sin registrar: 2 h después de su fin.
- Procrastinación: últimas 24 h antes de la entrega.
- Resumen semanal: el domingo a las 22:00, además del diario.

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
