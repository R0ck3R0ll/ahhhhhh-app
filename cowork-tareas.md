# Tareas de Classroom y del correo con Cowork

Cómo llegan a la App las tareas del colegio mientras la cuenta del colegio siga bloqueada para apps externas (dossier, punto 3).

## Cómo funciona

1. En el Chrome del ordenador de Carlo, Martina tiene abierta la sesión de su **cuenta del colegio** (Classroom y Gmail) y la de la **App** (https://ahhhhhh-today.web.app, con su cuenta del plan, no la de supervisor).
2. Una tarea programada de **Cowork** (Claude in Chrome) lee Classroom y el correo, estima el tiempo de cada tarea y pega la lista en la pantalla oculta de importación de la App: `https://ahhhhhh-today.web.app/#importar`.
3. La App añade las tareas marcadas como **«Por confirmar»** y las sube a la nube. No repite ninguna: recuerda cada tarea importada (aunque después se descarte o se borre) y no añade una que ya exista con el mismo nombre y la misma entrega.
4. La primera vez que Martina abre la App después, un aviso le enseña las tareas nuevas: ajusta el tiempo estimado, desmarca las que no quiere y confirma. «Ahora no» lo deja para la próxima vez que abra la App.

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
      "date": "2026-10-30",
      "time": "23:59",
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
| `date` | sí | Entrega, `AAAA-MM-DD`. Sin fecha no se importa. |
| `time` | no | Hora de entrega, `HH:MM` (por defecto `23:59`). |
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
> 4. **Lista.** Prepara la lista en JSON con el formato de `cowork-tareas.md` (campos `ref`, `source`, `course`, `name`, `date`, `time`, `est`, `desc`, `link`). Usa como `ref` la dirección de la tarea o del correo. Hora de entrega: la que ponga; si no pone ninguna, `23:59`, salvo exámenes, material que llevar o autorizaciones, que son para ese día a primera hora (`08:00`). No incluyas lo que no tenga fecha de entrega (si el texto da una fecha aunque Classroom no la tenga, úsala). Escribe nombre y descripción en español.
> 5. **Importar.** Abre https://ahhhhhh-today.web.app/#importar. Espera a que el aviso diga «Listo para importar» (si dice que hay que iniciar sesión, para y avísame). Pega la lista en el cuadro «Lista de tareas (JSON)» y pulsa «Importar». Espera a «Guardado en la nube ✓».
> 6. **Resumen.** Dime qué se ha añadido, qué ya estaba y qué no era válido (lo pone la propia pantalla), y cualquier cosa que no hayas podido leer.
