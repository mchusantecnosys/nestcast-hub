# 002 — Automatización, Rutinas y Horarios (Scheduler Local)

> **Estado:** Borrador v1.0
> **Fecha:** 2026-10-22
> **Autor:** Especificación colaborativa (usuario + asistente)

---

## 1. Contexto y Objetivo

NestCast Hub permite controlar altavoces Google Home Mini de forma manual: reproducir audio, ajustar volumen, enviar frases TTS y eliminar dispositivos. Sin embargo, muchas acciones se repiten diariamente con un patrón predecible —despertadores, cambios de ambiente musical, avisos de cierre— y hoy el usuario debe ejecutarlas a mano cada vez.

**Objetivo:** Dotar al Hub de un programador local de rutinas que permita automatizar acciones recurrentes sobre uno o varios altavoces, gestionar un modo "No Molestar" con limitación de volumen por franja horaria, e iniciar temporizadores con cuenta regresiva hablada y puntos de alerta configurables.

**¿Por qué ahora?** El Hub ya controla altavoces reales en la LAN. Automatizar las tareas repetitivas es el siguiente paso natural para convertirlo en un sistema de sonorización autónomo, tanto para el hogar como para entornos clínicos u oficinas.

---

## 2. Usuarios

| Perfil | Descripción | Necesidad principal |
|--------|-------------|---------------------|
| **Administrador doméstico** | Persona que usa el Hub en casa con 1-3 altavoces | Despertadores, recordatorios de medicación, silencio nocturno |
| **Recepcionista / asistente clínico** | Operador del Hub en una clínica u oficina con 2-5 altavoces | Campanas horarias, aviso de cierre, temporizadores de procedimientos por sala |
| **Profesional de salud** | Dentista, fisioterapeuta, etc. que necesita medir tiempos en consultorios | Cuenta regresiva hablada con alertas intermedias por altavoz específico |

---

## 3. Historias de Usuario

| ID | Historia |
|----|----------|
| HU-01 | Como administrador doméstico, quiero programar un despertador que reproduzca radio suave a las 07:00 de lunes a viernes en el altavoz de mi habitación, para no depender de activar la música manualmente cada mañana. |
| HU-02 | Como recepcionista, quiero que el Hub anuncie automáticamente por TTS "La clínica cierra en 15 minutos" en todos los altavoces a las 18:45 de lunes a sábado, para que pacientes y personal se preparen sin que yo tenga que recordarlo. |
| HU-03 | Como administrador doméstico, quiero definir una franja "No Molestar" de 21:00 a 07:00 donde el volumen máximo se limite al 25% y los TTS no urgentes se bloqueen, para no interrumpir el descanso de la familia. |
| HU-04 | Como profesional de salud, quiero iniciar un temporizador de 20 minutos para blanqueamiento en Consultorio 1, con alertas de voz a los 5 minutos restantes y al finalizar, para no depender de un reloj externo. |
| HU-05 | Como recepcionista, quiero ver en el Hub una lista de todas las rutinas programadas con su próximo disparo, estado (activa/pausada) y un historial de ejecuciones recientes, para saber qué está automatizado y si algo falló. |
| HU-06 | Como administrador doméstico, quiero que una rutina pueda encadenar varias acciones (por ejemplo: ajustar volumen al 30% → reproducir radio → decir frase TTS), para crear secuencias ricas sin tener que programar varias rutinas separadas. |
| HU-07 | Como recepcionista, quiero poder ejecutar varios temporizadores simultáneamente en distintos altavoces, para controlar procedimientos paralelos en varias salas a la vez. |
| HU-08 | Como cualquier usuario, quiero marcar un TTS como "Urgente" para que se reproduzca incluso si el modo No Molestar está activo, porque hay avisos que no pueden esperar (emergencias, alarmas). |

---

## 4. Requisitos Funcionales

### RF-01 — Crear rutina recurrente

**CUANDO** el usuario complete el formulario de nueva rutina indicando nombre, hora, días de la semana, altavoz(ces) destino y al menos una acción, **EL SISTEMA DEBE** almacenar la rutina de forma persistente en el servidor y confirmar la creación mostrando la rutina en la lista con su próximo disparo calculado.

**Criterios de aceptación:**
- CA-01.1: La rutina se persiste en el servidor y sobrevive al cierre del navegador y al reinicio del proceso servidor.
- CA-01.2: Los días de la semana se seleccionan individualmente (lunes a domingo); también se permite la opción "Todos los días".
- CA-01.3: La hora se expresa en formato 24h referida a la zona horaria local del servidor.
- CA-01.4: Se debe seleccionar al menos un altavoz destino; se permite seleccionar varios ("todos los altavoces").
- CA-01.5: El nombre de la rutina es obligatorio y de máximo 80 caracteres.

### RF-02 — Acciones disponibles dentro de una rutina

**EL SISTEMA DEBE** soportar los siguientes tipos de acción dentro de una rutina, ejecutables en secuencia ordenada:

| Tipo de acción | Parámetros |
|----------------|------------|
| Reproducir URL de audio | URL del stream, título descriptivo opcional |
| Enviar frase TTS | Texto, idioma (es/en/pt), flag de urgencia |
| Ajustar volumen | Nivel (0-100) |
| Activar/desactivar silencio (mute) | Encendido o apagado |
| Pausar / detener reproducción | Acción (pause, stop) |

**Criterios de aceptación:**
- CA-02.1: Una rutina puede contener de 1 a 10 acciones en secuencia.
- CA-02.2: Las acciones se ejecutan en el orden definido, esperando a que cada una se envíe al altavoz antes de lanzar la siguiente.
- CA-02.3: Si una acción intermedia falla, las restantes se siguen intentando ejecutar y el error se registra en el historial.

### RF-03 — Editar, pausar, reanudar y eliminar rutina

**CUANDO** el usuario seleccione una rutina existente, **EL SISTEMA DEBE** permitir:
- Editar cualquier campo (nombre, horario, días, altavoces, acciones).
- Pausar la rutina (deja de dispararse pero no se elimina).
- Reanudar una rutina pausada.
- Eliminar la rutina permanentemente, previa confirmación.

**Criterios de aceptación:**
- CA-03.1: Una rutina pausada muestra un indicador visual claro de su estado y no se ejecuta en su horario.
- CA-03.2: Al reanudar, el próximo disparo se recalcula a partir de la hora actual.
- CA-03.3: Eliminar requiere confirmación explícita del usuario.

### RF-04 — Ejecución automática de rutinas desde el servidor

**CUANDO** llegue la hora y el día programados para una rutina activa, **EL SISTEMA DEBE** ejecutar la secuencia de acciones sobre los altavoces destino sin intervención del usuario, independientemente de si el navegador está abierto o cerrado.

**Criterios de aceptación:**
- CA-04.1: La ejecución se basa en la hora local del servidor.
- CA-04.2: Si el altavoz destino no es alcanzable, el sistema reintenta hasta 3 veces con intervalos de 30 segundos entre cada intento.
- CA-04.3: Si tras los 3 reintentos el altavoz sigue inalcanzable, el sistema registra una notificación de error visible en el Hub la próxima vez que el usuario lo abra.
- CA-04.4: Cada ejecución (exitosa o fallida) se registra en un historial con fecha, hora, resultado y, en caso de error, el motivo.

### RF-05 — Vista de rutinas y próximas ejecuciones

**EL SISTEMA DEBE** mostrar en la interfaz una lista de todas las rutinas con: nombre, horario, días activos, altavoz(ces) destino, estado (activa / pausada), próximo disparo y último resultado de ejecución.

**Criterios de aceptación:**
- CA-05.1: Las rutinas se ordenan por proximidad de su próximo disparo (la más cercana primero).
- CA-05.2: El historial de ejecuciones se conserva de forma indefinida sin límite de retención automático.
- CA-05.3: El usuario dispone de la opción de eliminar entradas del historial de ejecuciones manualmente cuando lo desee.
- CA-05.4: Las ejecuciones fallidas se destacan visualmente con color e icono diferenciado.

### RF-06 — Modo "No Molestar" (DND)

**CUANDO** el usuario configure una franja horaria de "No Molestar" indicando hora de inicio, hora de fin, y un volumen máximo permitido, **EL SISTEMA DEBE** almacenar la configuración de forma persistente y aplicarla automáticamente cada día.

**MIENTRAS** la franja "No Molestar" esté activa, **EL SISTEMA DEBE:**
- Limitar automáticamente el volumen de todos los altavoces al máximo configurado (por defecto 25%).
- Bloquear la ejecución de acciones TTS que no estén marcadas como "Urgentes", tanto manuales como provenientes de rutinas.
- Permitir la ejecución de acciones TTS marcadas como "Urgentes".
- Permitir acciones de tipo reproducción de audio y ajuste de volumen, respetando siempre el techo de volumen.

**Criterios de aceptación:**
- CA-06.1: Si el usuario intenta subir el volumen por encima del techo durante DND, el sistema lo fija al máximo permitido y muestra un aviso informativo.
- CA-06.2: Si una rutina programada incluye una acción de volumen superior al techo, se aplica el techo en su lugar.
- CA-06.3: Si una rutina contiene un TTS no urgente durante DND, esa acción se omite, las demás acciones de la rutina se ejecutan normalmente, y se registra en el historial que el TTS fue bloqueado por DND.
- CA-06.4: El indicador de DND activo es visible en la interfaz principal del Hub (sidebar o header).
- CA-06.5: Solo se permite una franja DND activa a la vez.
- CA-06.6: La franja puede cruzar la medianoche (ej. 22:00 a 06:00).

### RF-07 — Flag "Urgente" en TTS

**CUANDO** el usuario envíe un TTS manual o configure una acción TTS dentro de una rutina, **EL SISTEMA DEBE** ofrecer un checkbox "Urgente" (desactivado por defecto).

**SI** el TTS está marcado como urgente y el modo No Molestar está activo, **ENTONCES EL SISTEMA DEBE** reproducir el TTS igualmente, respetando el techo de volumen de la franja DND.

**Criterios de aceptación:**
- CA-07.1: El checkbox "Urgente" está disponible tanto en el formulario de TTS manual como en la configuración de acciones TTS dentro de rutinas.
- CA-07.2: Un TTS urgente durante DND se ejecuta al volumen techo, no al volumen solicitado si este es mayor.
- CA-07.3: El historial registra que el TTS se ejecutó en modo urgente durante DND.

### RF-08 — Temporizador con cuenta regresiva

**CUANDO** el usuario inicie un temporizador indicando duración total (en minutos), altavoz destino, mensaje descriptivo y puntos de alerta, **EL SISTEMA DEBE** iniciar la cuenta regresiva en el servidor y ejecutar avisos TTS en los momentos configurados.

**Criterios de aceptación:**
- CA-08.1: La duración se expresa en minutos (mínimo 1, máximo 480 — 8 horas).
- CA-08.2: El usuario puede definir de 0 a 5 puntos de alerta intermedia, cada uno expresado como "minutos restantes" (ej. 10, 5, 1).
- CA-08.3: Al llegar a cada punto de alerta, el sistema emite un TTS en el altavoz destino con un mensaje del tipo: *"[Mensaje descriptivo]: faltan [X] minutos"*.
- CA-08.4: Al llegar a cero, el sistema emite un TTS de finalización: *"[Mensaje descriptivo]: tiempo completado"*.
- CA-08.5: El temporizador es visible en la interfaz con una barra de progreso o cuenta regresiva en tiempo real (cuando el navegador está abierto).
- CA-08.6: El temporizador se ejecuta en el servidor; si el navegador se cierra, las alertas siguen emitiéndose.
- CA-08.7: Los avisos TTS del temporizador se emiten exclusivamente con voz (solo voz, sin pitidos, tonos ni beeps de acompañamiento).

### RF-09 — Temporizadores simultáneos

**EL SISTEMA DEBE** soportar la ejecución de múltiples temporizadores activos simultáneamente, cada uno asociado a un altavoz destino distinto o al mismo.

**Criterios de aceptación:**
- CA-09.1: Se permiten hasta 10 temporizadores activos simultáneamente.
- CA-09.2: Cada temporizador opera de forma independiente (cancelar o finalizar uno no afecta a los demás).
- CA-09.3: La interfaz muestra la lista de temporizadores activos con su tiempo restante y altavoz destino.

### RF-10 — Cancelar temporizador y ciclo de vida

**CUANDO** el usuario cancele un temporizador activo, **EL SISTEMA DEBE** detener la cuenta regresiva, no emitir ninguna alerta pendiente y removerlo de la interfaz inmediatamente.

**Criterios de aceptación:**
- CA-10.1: La cancelación es inmediata y no requiere confirmación adicional.
- CA-10.2: Si una alerta estaba a punto de emitirse (menos de 5 segundos para el siguiente punto), el sistema garantiza que no se emite.
- CA-10.3: Tanto los temporizadores cancelados como los completados desaparecen por completo de la interfaz al finalizar (no se conserva un historial de temporizadores).

### RF-11 — Historial de notificaciones de error

**CUANDO** una rutina o temporizador falle tras agotar los reintentos, **EL SISTEMA DEBE** registrar una notificación de error persistente y mostrársela al usuario la próxima vez que acceda al Hub.

**Criterios de aceptación:**
- CA-11.1: Las notificaciones de error incluyen: nombre de la rutina/temporizador, fecha y hora del fallo, altavoz afectado y motivo del error.
- CA-11.2: El usuario puede marcar las notificaciones como leídas o descartarlas.
- CA-11.3: Se muestra un badge numérico en la interfaz indicando errores no leídos.

---

## 5. Requisitos No Funcionales

| ID | Requisito |
|----|-----------|
| RNF-01 | **Precisión temporal:** Las rutinas deben dispararse con una tolerancia máxima de ±30 segundos respecto a la hora programada. |
| RNF-02 | **Persistencia:** Todas las rutinas, la configuración DND y los temporizadores activos deben sobrevivir al reinicio del proceso servidor. |
| RNF-03 | **Rendimiento:** La evaluación del scheduler (comprobar qué rutinas deben dispararse) no debe bloquear las operaciones normales del Hub (control manual, discovery). |
| RNF-04 | **Capacidad:** El sistema debe soportar al menos 50 rutinas recurrentes y 10 temporizadores simultáneos sin degradación perceptible. |
| RNF-05 | **Accesibilidad:** Los formularios de creación de rutinas y temporizadores deben ser navegables por teclado y tener etiquetas ARIA descriptivas. |
| RNF-06 | **Retroalimentación visual:** Toda operación del scheduler (creación, ejecución, fallo, DND activo) debe tener feedback visual inmediato cuando el navegador esté abierto. |

---

## 6. Casos Límite

| # | Caso | Comportamiento esperado |
|---|------|------------------------|
| CL-01 | Rutina programada para un altavoz que fue eliminado del Hub | La rutina se marca como "sin destino" con indicador visual de advertencia. No se ejecuta hasta que el usuario reasigne un altavoz. |
| CL-02 | Franja DND cruza la medianoche (ej. 22:00 → 06:00) | El sistema interpreta correctamente el cruce: DND activo desde las 22:00 del día actual hasta las 06:00 del día siguiente. |
| CL-03 | Dos rutinas programadas a la misma hora exacta en el mismo altavoz | Se ejecutan secuencialmente en orden de creación (la más antigua primero). |
| CL-04 | Temporizador con punto de alerta mayor que la duración total (ej. alerta a 30 min en timer de 20 min) | El sistema rechaza la configuración y muestra error de validación al crear el temporizador. |
| CL-05 | Servidor se reinicia mientras un temporizador está activo | El temporizador se reanuda con el tiempo restante correcto (basado en la hora de inicio almacenada vs. la hora actual). |
| CL-06 | Cambio de hora del sistema (horario de verano/invierno) | Las rutinas se ejecutan según la hora local vigente tras el cambio. Si el cambio causa que se "salte" una hora programada, esa ejecución se pierde. Si el reloj retrocede, la rutina no se ejecuta dos veces en la misma ventana. |
| CL-07 | Rutina con acción TTS no urgente + acciones de volumen durante DND | La acción TTS se omite, las acciones de volumen se ejecutan respetando el techo. El historial registra qué acciones se ejecutaron y cuáles se bloquearon. |
| CL-08 | Usuario intenta crear un temporizador con duración 0 | El sistema rechaza la creación con error de validación. Mínimo 1 minuto. |

---

## 7. Fuera de Alcance (v1)

Los siguientes elementos **no** forman parte de esta versión y se dejan documentados para futuras iteraciones:

- **Condiciones lógicas / triggers por eventos:** No se soportan rutinas disparadas por eventos (ej. "cuando alguien se conecte al Wi-Fi"). Solo por hora y día.
- **Rutinas con intervalo recurrente intra-día:** No se soporta "cada 2 horas". Solo una hora fija por rutina (crear múltiples para el mismo efecto).
- **Grupos de altavoces persistentes:** No se crean "grupos" como abstracción. El usuario selecciona altavoces individuales o "todos".
- **Sincronización con calendarios externos:** No hay integración con Google Calendar, iCal ni otros servicios de calendario.
- **Múltiples franjas DND:** Solo se permite una franja "No Molestar" activa.
- **Personalización del mensaje TTS del temporizador:** En v1, el formato del aviso es fijo (*"[Descripción]: faltan X minutos"*). No se permiten plantillas personalizadas del texto de alerta.
- **Opción "Ejecutar ahora" (prueba manual):** No se incluye opción para forzar o probar la ejecución manual de una rutina fuera de su horario programado.
- **Historial de temporizadores pasados:** Los temporizadores completados o cancelados no se archivan en un historial; desaparecen de la interfaz al terminar.
- **Exportar / importar rutinas:** No hay mecanismo para exportar la configuración a un archivo o importarla en otro Hub.
- **Autenticación y permisos:** Cualquier usuario con acceso al Hub puede crear, editar y eliminar rutinas. No hay roles ni contraseñas.

---

## 8. Criterios de Finalización

La funcionalidad se considera **completa** cuando:

- [ ] Se pueden crear, editar, pausar, reanudar y eliminar rutinas recurrentes con secuencias de acciones.
- [ ] Las rutinas se ejecutan automáticamente desde el servidor a la hora y día configurados, incluso sin navegador abierto.
- [ ] Las acciones TTS, reproducción de audio, ajuste de volumen, mute y stop funcionan dentro de rutinas.
- [ ] El modo "No Molestar" limita volumen y bloquea TTS no urgentes durante la franja configurada.
- [ ] El flag "Urgente" en TTS permite saltar la restricción DND.
- [ ] Se pueden iniciar temporizadores con puntos de alerta configurables y cuentan regresivamente en el servidor.
- [ ] Múltiples temporizadores pueden correr simultáneamente en distintos altavoces.
- [ ] Los fallos de ejecución se reintentan (3 intentos / 30s) y, en caso de fallo definitivo, se notifican en el Hub.
- [ ] Existe una vista de rutinas con próximo disparo, estado e historial de ejecuciones.
- [ ] Los temporizadores activos muestran tiempo restante en la interfaz.
- [ ] La especificación ha sido revisada y aprobada por el usuario antes de comenzar el plan técnico.

---

## 9. Decisiones de Diseño y Dudas Resueltas

Todas las dudas surgidas durante la elaboración de esta especificación han sido resueltas y consolidadas:

- **Avisos de temporizador (solo voz):** Los avisos TTS de temporizador solo usan voz; no van acompañados de pitidos ni tonos audibles.
- **Retención del historial de rutinas:** Se conserva indefinidamente sin límite de retención automático, con opción de eliminación manual por el usuario.
- **Ciclo de vida de temporizadores:** Los temporizadores completados o cancelados desaparecen de la interfaz al finalizar (no existe historial de temporizadores).
- **Ejecución manual de prueba ("Ejecutar ahora"):** Descartada para v1; las rutinas solo se ejecutan automáticamente en su horario y días programados.
