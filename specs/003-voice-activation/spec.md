# Especificación Funcional: Control del Hub por Activación de Voz ("Jarvis" / "Hey Jarvis")

## 1. Contexto y Objetivo

### El QUÉ

Incorporar en la aplicación un sistema de control manos libres por activación de voz mediante las palabras clave **"Jarvis"** o **"Hey Jarvis"**. Al detectar la palabra de activación, el sistema escucha la orden pronunciada por la persona usuaria y ejecuta acciones operativas sobre el altavoz activo: control de reproducción (reproducir, pausar, detener y cerrar la aplicación activa), ajuste de volumen (subir, bajar, silenciar, reactivar sonido o fijar un porcentaje exacto) y reproducción de emisoras o sonidos predefinidos invocándolos por su nombre.

Para garantizar que la funcionalidad sea operable en cualquier escenario, el sistema contempla la captura desde el micrófono integrado del altavoz (o su simulación funcional en el Hub) y utiliza automáticamente el micrófono del dispositivo donde está abierta la aplicación como respaldo cuando el micrófono interno del altavoz no sea accesible por restricciones físicas o del fabricante. Incluye atenuación automática del sonido (_ducking_) al detectar la palabra clave, retroalimentación auditiva breve y visual en pantalla, un interruptor manual de privacidad y una bitácora visible de los últimos comandos reconocidos.

### El POR QUÉ

En entornos cotidianos del hogar, consultorios clínicos o salas de trabajo, las personas suelen tener las manos ocupadas o encontrarse lejos de la pantalla de control. Reemplazar el asistente propietario del fabricante (que deja de funcionar cuando el altavoz se opera de forma local sin vincular cuenta externa) por un activador por voz propio ("Jarvis" / "Hey Jarvis") devuelve la experiencia de altavoz inteligente manos libres sin sacrificar el control local ni la privacidad.

---

## 2. Usuarios

1. **Operador Clínico o de Recepción**: Persona que trabaja en un consultorio o recepción con las manos ocupadas y necesita cambiar la música ambiental, ajustar el volumen o disparar un sonido de aviso predefinido hablando en voz alta sin tocar la pantalla.
2. **Usuario Doméstico en Sala o Habitación**: Persona que desea pausar una transmisión, silenciar el altavoz o poner su emisora favorita a distancia pronunciando _"Hey Jarvis"_.
3. **Administrador o Integrador del Hub**: Persona que configura, prueba y audita el comportamiento del control por voz, verifica qué fuente de micrófono está activa y revisa el historial de órdenes interpretadas.

---

## 3. Historias de Usuario

- **HU-01 (Activación por palabra clave)**: Como usuario del Hub, quiero decir _"Jarvis"_ o _"Hey Jarvis"_ para que el sistema comience a escuchar mi orden sin necesidad de pulsar botones ni tocar la pantalla.
- **HU-02 (Frase continua o con pausa)**: Como usuario, quiero poder decir la orden en una sola frase continua (_"Hey Jarvis, pausa la música"_) o hacer una breve pausa después de decir _"Jarvis"_ para hablar con naturalidad.
- **HU-03 (Control de reproducción por voz)**: Como usuario, quiero ordenar con mi voz reproducir/reanudar, pausar, detener o cerrar la aplicación activa en el altavoz para gestionar el estado del audio a distancia.
- **HU-04 (Control de volumen por voz)**: Como usuario, quiero pedir que el volumen suba, baje, se silencie, recupere el sonido o se ajuste a un porcentaje específico (por ejemplo, _"Jarvis, volumen al 40 por ciento"_) para adaptar el nivel sonoro al momento.
- **HU-05 (Lanzamiento de emisoras y audios predefinidos)**: Como usuario, quiero pedir una emisora o tono predefinido diciendo su nombre (por ejemplo, _"Hey Jarvis, pon Radio Swiss Jazz"_) para iniciar su transmisión de inmediato.
- **HU-06 (Atenuación automática durante la escucha)**: Como usuario, quiero que el altavoz baje temporalmente su volumen cuando detecte _"Jarvis"_ mientras está sonando música, para que mi orden se escuche con claridad sin interferencia del propio altavoz.
- **HU-07 (Respaldo de micrófono y simulación)**: Como usuario, quiero que el sistema utilice el micrófono del equipo donde corre el Hub o el modo simulado del altavoz cuando el micrófono físico interno del altavoz esté bloqueado, para no perder nunca la capacidad de control por voz.
- **HU-08 (Privacidad y registro de actividad)**: Como usuario, quiero contar con un interruptor claro para encender o apagar la escucha de _"Jarvis"_ en cualquier momento y ver una lista de los últimos comandos detectados con su resultado.

---

## 4. Requisitos Funcionales y Criterios de Aceptación (Notación EARS)

### RF-1: Control de Privacidad y Estado de Escucha

Permitir al usuario activar o desactivar manualmente la escucha continua de la palabra de activación e indicar en todo momento qué estado y qué fuente de micrófono están activos.

- **CA-1.1 (Ubicuo)**: El sistema debe mostrar de forma permanente el estado actual del módulo de voz (_Desactivado_, _Esperando "Jarvis"_, _Escuchando orden_, _Ejecutando_ o _Error_) junto con la fuente de micrófono activa (_Micrófono del Altavoz / Simulado_ o _Micrófono de Respaldo del Hub_).
- **CA-1.2 (Dirigido por eventos)**: CUANDO el usuario active el interruptor de escucha por voz, el sistema debe iniciar la detección continua de las palabras clave _"Jarvis"_ y _"Hey Jarvis"_.
- **CA-1.3 (Dirigido por eventos)**: CUANDO el usuario apague el interruptor de privacidad de voz, el sistema debe detener inmediatamente toda captura y análisis de audio hasta que vuelva a activarse manualmente.
- **CA-1.4 (Comportamiento no deseado)**: SI el usuario no concede permiso de acceso al micrófono o no existe ningún micrófono disponible, ENTONCES el sistema debe informar claramente el motivo en pantalla y ofrecer un modo de prueba interactiva para simular comandos de voz.

### RF-2: Origen del Micrófono y Conmutación de Respaldo

Priorizar la experiencia de micrófono en el altavoz y conmutar de forma transparente al micrófono del dispositivo donde se ejecuta el Hub cuando el hardware del altavoz no entregue flujo de voz directo.

- **CA-2.1 (Dirigido por estado)**: MIENTRAS el altavoz seleccionado no exponga su flujo de micrófono físico por restricciones de fábrica, el sistema debe capturar la voz a través del micrófono del dispositivo donde opera el Hub y reflejar la recepción como vinculada al altavoz activo.
- **CA-2.2 (Dirigido por eventos)**: CUANDO se produzca un cambio en la fuente de captura de voz hacia el micrófono de respaldo, el sistema debe notificar visualmente qué micrófono está recibiendo la voz del usuario.

### RF-3: Detección de Palabra Clave ("Jarvis" / "Hey Jarvis") y Ventana de Escucha

Reconocer la invocación tanto en frases corridas como con pausa posterior.

- **CA-3.1 (Dirigido por eventos)**: CUANDO el usuario pronuncie _"Jarvis"_ o _"Hey Jarvis"_ seguido inmediatamente de una orden en la misma frase, el sistema debe extraer y procesar la orden sin obligar al usuario a esperar una pausa.
- **CA-3.2 (Dirigido por eventos)**: CUANDO el usuario pronuncie únicamente _"Jarvis"_ o _"Hey Jarvis"_ y haga una pausa, el sistema debe abrir una ventana de escucha activa de 6 segundos, emitir una señal auditiva corta y mostrar en pantalla que está esperando la orden.
- **CA-3.3 (Comportamiento no deseado)**: SI transcurre la ventana de escucha activa sin que el usuario pronuncie ninguna orden, ENTONCES el sistema debe cancelar la espera, restaurar el estado previo del altavoz y volver al modo de espera de palabra clave.

### RF-4: Atenuación Automática del Altavoz (_Audio Ducking_)

Evitar que el sonido emitido por el propio altavoz impida escuchar la orden del usuario.

- **CA-4.1 (Dirigido por eventos)**: CUANDO se detecte la palabra de activación _"Jarvis"_ o _"Hey Jarvis"_ y el altavoz activo esté reproduciendo audio con un volumen superior al 20%, el sistema debe reducir temporalmente el volumen del altavoz al 20% mientras escucha la orden.
- **CA-4.2 (Dirigido por eventos)**: CUANDO finalice la captura de la orden (o expire el tiempo de espera) y la orden no haya sido un cambio explícito de volumen, el sistema debe restaurar el volumen del altavoz a su nivel previo antes de la atenuación.

### RF-5: Ejecución de Órdenes de Reproducción Básica

Traducir intenciones de transporte multimedia a acciones sobre el altavoz activo.

- **CA-5.1 (Dirigido por eventos)**: CUANDO el usuario ordene reproducir, reanudar o continuar (ej. _"Jarvis, reproduce"_, _"Hey Jarvis, continúa"_), el sistema debe reanudar la reproducción en el altavoz activo.
- **CA-5.2 (Dirigido por eventos)**: CUANDO el usuario ordene pausar (ej. _"Jarvis, pausa"_, _"Hey Jarvis, pon en pausa"_), el sistema debe pausar la reproducción activa en el altavoz.
- **CA-5.3 (Dirigido por eventos)**: CUANDO el usuario ordene detener o parar (ej. _"Jarvis, detén la música"_, _"Hey Jarvis, para"_), el sistema debe detener la reproducción actual del altavoz.
- **CA-5.4 (Dirigido por eventos)**: CUANDO el usuario ordene cerrar o salir de la aplicación del altavoz (ej. _"Jarvis, cierra la aplicación"_, _"Hey Jarvis, desconecta el audio"_), el sistema debe cerrar la aplicación activa en el altavoz.

### RF-6: Ejecución de Órdenes de Volumen y Silencio

Modificar el nivel de volumen de forma relativa, absoluta o mediante silencio.

- **CA-6.1 (Dirigido por eventos)**: CUANDO el usuario ordene subir o bajar el volumen sin especificar un número (ej. _"Jarvis, sube el volumen"_, _"Hey Jarvis, baja un poco"_), el sistema debe incrementar o disminuir el volumen actual en saltos de 15 puntos porcentuales (respetando los límites de 0% y 100%).
- **CA-6.2 (Dirigido por eventos)**: CUANDO el usuario indique un nivel numérico de volumen entre 0 y 100 (ej. _"Jarvis, pon el volumen al 50"_, _"Hey Jarvis, volumen a 30 por ciento"_), el sistema debe fijar el volumen del altavoz exactamente en ese porcentaje.
- **CA-6.3 (Dirigido por eventos)**: CUANDO el usuario ordene silenciar o quitar el silencio (ej. _"Jarvis, silencia"_, _"Hey Jarvis, activa el sonido"_), el sistema debe activar o desactivar el estado de silencio del altavoz respectivamente.

### RF-7: Reproducción de Emisoras y Sonidos Predefinidos por Nombre

Iniciar cualquiera de los audios o emisoras predefinidas en el Hub al mencionarlos por voz.

- **CA-7.1 (Dirigido por eventos)**: CUANDO el usuario pida reproducir una emisora o sonido predefinido por su nombre completo o parcial (ej. _"Jarvis, pon Groove Salad"_, _"Hey Jarvis, reproduce Jazz"_, _"Jarvis, pon tono de recepción"_), el sistema debe identificar la coincidencia dentro del catálogo de predefinidos e iniciar su transmisión en el altavoz activo.
- **CA-7.2 (Comportamiento no deseado)**: SI el nombre de la emisora o audio mencionado no coincide con ningún elemento predefinido, ENTONCES el sistema debe informar que no encontró esa emisora y mantener el estado actual del altavoz sin interrumpirlo.

### RF-8: Retroalimentación Multimodal y Registro de Comandos

Confirmar al usuario el resultado de cada orden y conservar un historial auditable.

- **CA-8.1 (Dirigido por eventos)**: CUANDO una orden de voz se ejecute con éxito, el sistema debe emitir una confirmación breve (sonido corto o respuesta hablada concisa) y mostrar en pantalla la transcripción detectada junto con la acción realizada.
- **CA-8.2 (Comportamiento no deseado)**: SI la frase pronunciada tras _"Jarvis"_ no corresponde a ninguna orden soportada, ENTONCES el sistema debe emitir un aviso breve de orden no reconocida y mostrar en pantalla una sugerencia con ejemplos de comandos válidos.
- **CA-8.3 (Ubicuo)**: El sistema debe mantener un registro visible en pantalla con los últimos comandos de voz detectados, incluyendo la hora, el texto transcrito, la acción interpretada y si el resultado fue exitoso o no reconocido.

---

## 5. Requisitos No Funcionales

- **RNF-1 (Tiempo de respuesta de activación)**: El reconocimiento de la palabra clave _"Jarvis"_ / _"Hey Jarvis"_ y la indicación visual/sonora de escucha activa deben producirse en menos de 1 segundo desde que el usuario termina de pronunciarla.
- **RNF-2 (Tolerancia a variaciones del habla en español)**: El intérprete de intenciones debe reconocer sinónimos naturales en español (por ejemplo: _"pon"_, _"reproduce"_, _"inicia"_; _"calla"_, _"silencia"_, _"mutea"_; números dichos en palabras o dígitos) e ignorar diferencias de mayúsculas, tildes o signos de puntuación.
- **RNF-3 (Privacidad por defecto)**: La escucha del micrófono nunca debe iniciarse automáticamente al cargar la página sin una acción explícita del usuario sobre el interruptor de activación por voz.
- **RNF-4 (Claridad visual a distancia)**: El indicador de estado de _"Jarvis"_ (en espera, escuchando orden, ejecutando) debe ser legible a simple vista desde al menos 2 metros de distancia de la pantalla del Hub.

---

## 6. Casos Límite

1. **Mención casual de "Jarvis" sin intención de comando**: Si alguien dice _"Jarvis"_ en una conversación y luego guarda silencio o dice algo sin relación con los controles del Hub, el sistema debe descartar la entrada al cabo de unos segundos o marcarla como orden no reconocida sin alterar la reproducción en curso (restaurando el volumen original si hubo atenuación).
2. **Orden de voz sin ningún altavoz seleccionado o conectado**: Si el usuario invoca a _"Jarvis"_ cuando no hay ningún altavoz activo, el sistema debe reconocer la voz pero advertir inmediatamente que debe seleccionarse o buscarse un altavoz antes de ejecutar la acción.
3. **Valores de volumen fuera de rango o ambiguos**: Si el usuario pide _"Jarvis, sube el volumen"_ cuando ya está al 95%, el volumen debe ajustarse al tope de 100% sin generar error; si está al 5% y pide bajarlo, debe quedar en 0%.
4. **Coincidencia parcial entre dos emisoras predefinidas**: Si el usuario dice solo _"Jarvis, pon radio"_ y existen varias emisoras en la categoría Radio, el sistema debe seleccionar la primera emisora prioritaria de esa categoría e indicar claramente cuál comenzó a reproducirse.
5. **Pérdida repentina del permiso o desconexión del micrófono**: Si el micrófono se desconecta mientras la escucha está activa, el interruptor debe pasar a estado de pausa/error y notificar al usuario sin bloquear el resto de los controles manuales del Hub.

---

## 7. Fuera de Alcance

Quedan explícitamente excluidos de esta versión:

- **Respuestas conversacionales abiertas o asistente general**: _"Jarvis"_ no responderá preguntas de cultura general, clima, chistes ni mantendrá conversaciones libres; se limita estrictamente a ejecutar comandos de control del Hub.
- **Control de dispositivos ajenos al ecosistema de audio del Hub**: No se controlarán luces, cerraduras, enchufes ni televisores externos.
- **Entrenamiento biométrico de voz (Voice Match)**: Cualquier persona en la sala que pronuncie _"Jarvis"_ o _"Hey Jarvis"_ con la escucha activa podrá ejecutar las órdenes básicas.
- **Modificación del firmware interno de fábrica del altavoz**: No se realizará alteración física ni desbloqueo de hardware en el altavoz para extraer su micrófono interno; cuando el altavoz bloquee dicho acceso, se operará mediante el respaldo del Hub y su simulación integrada.
- **Búsqueda abierta en catálogos musicales de terceros con cuenta**: No se buscarán canciones arbitrarias en servicios de suscripción cerrados; la reproducción por nombre opera sobre las emisoras y sonidos predefinidos del Hub.

---

## 8. Criterios de Finalización

La funcionalidad se considerará completada cuando:

1. El usuario pueda activar y desactivar el modo de escucha _"Jarvis"_ mediante un interruptor de privacidad visible y verificar qué micrófono está en uso.
2. El sistema detecte tanto _"Jarvis"_ como _"Hey Jarvis"_ (en frase continua o con pausa de hasta 6 segundos) y atenúe temporalmente el volumen del altavoz si estaba sonando fuerte.
3. Las tres familias de comandos acordadas (reproducción básica, ajuste de volumen/silencio y reproducción de emisoras/sonidos predefinidos por nombre) ejecuten la acción real sobre el altavoz activo y actualicen su estado en el Hub.
4. El sistema emita confirmación visual y sonora breve tras cada orden válida, e informe con claridad cuando una orden no sea comprendida.
5. El registro histórico en pantalla muestre los últimos comandos de voz procesados con su marca de tiempo, frase detectada y resultado.

---

## 9. Dudas Abiertas

- ** Ninguna duda bloqueante abierta**: Todas las ambigüedades sobre el origen del micrófono y su respaldo, el catálogo de órdenes soportadas, la interacción con atenuación de volumen y los límites de alcance quedaron resueltas durante la sesión de clarificación. _(Si en una fase futura se incorpora un micrófono inalámbrico externo dedicado por habitación, se especificará su emparejamiento en una iteración posterior)._
