# Tareas de Classroom y del correo con Cowork

Cómo llegan a la App las tareas del colegio mientras la cuenta del colegio siga bloqueada para apps externas (dossier, punto 3).

## Cómo funciona

1. En el Chrome del ordenador de Carlo, Martina tiene abierta la sesión de su **cuenta del colegio** (Classroom y Gmail) y la de la **App** (https://ahhhhhh-today.web.app, con su cuenta del plan, no la de supervisor).
2. Una tarea programada de **Cowork** (Claude in Chrome) lee Classroom y el correo, estima el tiempo de cada tarea y pega la lista en la pantalla oculta de importación de la App: `https://ahhhhhh-today.web.app/#importar`.
3. La App añade las tareas marcadas como **«Por confirmar»** y las sube a la nube. Con el mismo `ref`:
   - si la tarea sigue **por confirmar**, se **actualiza** con lo que llega («Actualizadas»), sin duplicarla;
   - si ya está **confirmada, hecha o con tiempo anotado**, no se toca (lo dice la pantalla);
   - si se **descartó o se borró**, no vuelve a entrar y la pantalla lo dice («Descartadas o borradas antes»). Para recuperarla, se vuelve a importar con `"restore": true` (en la tarea o en toda la lista).
   Tampoco entra una tarea con el mismo nombre y la misma entrega que otra (p. ej. añadida a mano).
4. La primera vez que Martina abre la App después, un aviso le enseña las tareas nuevas: ajusta el tiempo estimado, **desmarca las que quiere descartar** (no vuelven a salir) y pulsa «Confirmar». «Ahora no» las deja pendientes para la próxima vez que abra la App. Cualquier tarea, importada o no, se puede borrar desde su ficha en Tareas (esa pestaña se abre aunque falte la configuración).
5. Debajo del cuadro, **«Datos guardados en el plan (solo lectura)»** enseña la franja horaria, el horario escolar, todas las tareas guardadas (con su estado, fecha, hora y `ref`) y las descartadas o borradas.

Condiciones: el ordenador tiene que estar encendido, con la app de escritorio de Claude abierta, a la hora de la tarea programada. Si la sesión del colegio o la de la App caducan, Martina vuelve a iniciar sesión en ese Chrome.

## Formato de la lista

```json
{
  "tasks": [
    {
      "ref": "https://classroom.google.com/c/…/a/…/details",
      "source": "classroom",
      "course": "ICT",
      "name": "Presentación sobre redes",
      "due": "2026-10-30T09:00",
      "est": 90,
      "desc": "8 diapositivas sobre tipos de redes; subir en PDF.",
      "link": "https://classroom.google.com/c/…/a/…/details"
    }
  ]
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `ref` | sí | Identificador estable: la dirección de la tarea en Classroom o la del correo en Gmail. Es lo que evita repetirla. |
| `source` | sí | `classroom` o `gmail`. |
| `course` | sí | Asignatura o clase (en correos: la asignatura o quien lo envía). |
| `name` | sí | Nombre corto de la tarea. |
| `due` | Classroom: sí | Entrega real en Classroom, `AAAA-MM-DDTHH:MM` (o solo `AAAA-MM-DD`: se toma `23:59`). La App pone como **hora límite las 22:00 del día anterior** y guarda la real, que sale en la ficha como «Entrega en Classroom». |
| `date` | correo: sí | Fecha límite, `AAAA-MM-DD`, para lo que no es de Classroom (o si no se da `due`). Sin fecha no se importa. |
| `time` | no | Hora límite con `date`, `HH:MM` (por defecto `23:59`). |
| `restore` | no | `true` para volver a añadir una tarea que se descartó o se borró. |
| `est` | sí | Tiempo estimado en minutos. |
| `desc` | no | Qué hay que hacer, en una o dos frases. |
| `link` | no | Enlace a la tarea o al correo (solo `https://`). |

## Instrucciones para la tarea programada de Cowork

Copiar tal cual como instrucciones de la tarea:

> Eres el asistente que pasa las tareas del colegio de Martina a su App. Usa Chrome (Claude in Chrome), donde ya está abierta la sesión de su cuenta del colegio y la de la App. Solo lees: no entregues, no marques, no respondas ni cambies nada en Classroom ni en Gmail.
>
> 0. **Cuenta.** En Chrome hay varias cuentas de Google abiertas: usa siempre la del colegio de Martina (cámbiala con el selector de cuenta o con `/u/1/` en la dirección) y comprueba que se ven sus clases. No cambies la cuenta por defecto ni cierres ninguna sesión.
>
> 1. **Classroom.** Abre https://classroom.google.com/a/not-turned-in/all (Trabajo pendiente de todas las clases). Para cada tarea asignada y no entregada, abre su página y anota: asignatura, nombre, fecha y hora de entrega, qué hay que hacer y la dirección de la página. Mira también el Tablón de cada clase por si hay avisos con una entrega o algo que preparar con fecha (exámenes, material, autorizaciones).
> 2. **Correo.** En el Gmail del colegio, revisa los correos de los últimos 3 días (`newer_than:3d`), sin contar las notificaciones automáticas de Classroom (ya salen en el paso 1). Quédate solo con los que piden algo con fecha: entregas, autorizaciones que firmar, material que llevar, exámenes que preparar.
> 3. **Tiempo estimado.** Para cada tarea, estima en minutos cuánto le llevará a Martina según lo que pide (extensión, tipo de trabajo, curso): p. ej. firmar una autorización 5–10 min, una ficha de ejercicios 30–45 min, una redacción 60 min, una presentación 90–120 min, preparar un examen 120–180 min. Redondea a múltiplos de 5.
> 4. **Lista.** Prepara la lista en JSON:
> `{"tasks":[{"ref":"…","source":"classroom|gmail","course":"…","name":"…","due":"AAAA-MM-DDTHH:MM","date":"AAAA-MM-DD","time":"HH:MM","est":minutos,"desc":"…","link":"https://…"}]}`
> - `ref`: la dirección de la tarea en Classroom o del correo en Gmail (siempre la misma para la misma tarea: así la App la actualiza en vez de duplicarla).
> - Classroom: pon en `due` la entrega real tal como sale en Classroom (fecha y hora); la App calcula sola la hora límite (22:00 del día anterior). No hace falta `date` ni `time`.
> - Correo: pon `date` y `time` (si no hay hora, `23:59`; exámenes, material que llevar o autorizaciones, `08:00` de ese día).
> - No incluyas lo que no tenga fecha (si el texto da una fecha aunque Classroom no la tenga, úsala). Nombre y descripción en español.
> 5. **Importar.** Abre https://ahhhhhh-today.web.app/#importar. Espera a que el aviso diga «Listo para importar» (si dice que hay que iniciar sesión, para y avísame). Pega la lista en el cuadro «Lista de tareas (JSON)» y pulsa «Importar». Espera a «Guardado en la nube ✓».
> 6. **Resumen.** Dime lo que pone la pantalla (añadidas, actualizadas, sin cambios, ya confirmadas, descartadas antes, no válidas) y cualquier cosa que no hayas podido leer. Si hace falta comprobar qué hay guardado, míralo en «Datos guardados en el plan (solo lectura)», debajo del cuadro.
