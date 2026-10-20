# Linkwarden

Conecte Gladys con [Linkwarden](https://linkwarden.app), la aplicación
autoalojada para recopilar, ordenar y conservar enlaces: siga sus contadores,
reaccione cuando se guarda un enlace en una colección, guarde enlaces desde sus
escenas o desde el panel, y lea los más recientes en un mensaje. Todo se queda
en su red local: Gladys habla directamente con su servidor Linkwarden.

Probada con un servidor Linkwarden 2.16.3 real (la imagen Docker oficial). Sus
comentarios son bienvenidos en el foro de Gladys.

## Requisitos previos

- Gladys Assistant 5.2 o posterior.
- Linkwarden 2.10 o posterior, accesible desde la máquina de Gladys, en el
  puerto 3000 por defecto, o detrás de un proxy inverso.
- Un token de acceso: en Linkwarden, abra **Ajustes → Tokens de acceso** y
  cree uno. Elija la caducidad **Nunca**, o anote la fecha para renovarlo. La
  integración ve los enlaces del usuario al que pertenece el token, incluidas
  las colecciones compartidas.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de Linkwarden**, introduzca la dirección IP del servidor, por
   ejemplo `192.168.1.50`: la integración usa entonces el puerto 3000. Añada un
   puerto si el suyo es distinto (`192.168.1.50:3100`). Detrás de un proxy
   inverso, introduzca la dirección completa (`https://enlaces.example.org`).
3. Pegue el **Token de acceso**.
4. **Leer Linkwarden cada**: 5, 15, 30 (por defecto) o 60 minutos. Los nuevos
   enlaces se anuncian en la siguiente lectura; los enlaces guardados desde
   Gladys actualizan los contadores al instante.
5. **Idioma de nombres y mensajes** fija los nombres de las funciones (al
   añadir un dispositivo) y los textos de la integración. Francés por defecto.
6. Guarde y use **Probar la conexión**: muestra el usuario de Linkwarden y el
   número de enlaces y colecciones.
7. En la pestaña **Descubrimiento**, añada el dispositivo **Linkwarden**, y las
   colecciones que quiera seguir.

## Dispositivos

**Linkwarden** (un dispositivo para el usuario del token):

| Función              | Valor                                                         |
| -------------------- | ------------------------------------------------------------- |
| Enlaces              | número de enlaces, en todas las colecciones                   |
| Enlaces añadidos hoy | enlaces guardados desde medianoche (vuelve a 0 justo después) |
| Colecciones          | número de colecciones, subcolecciones incluidas               |
| Último enlace        | nombre del enlace más reciente (su dominio si no tiene)       |

**Un dispositivo por colección** (con el nombre de la colección,
`Padre / Hijo` para una subcolección), con una función, **Enlaces**: el número
de enlaces directamente en la colección. Añada solo las que le interesen.

Los contadores conservan su historial: un gráfico muestra cómo crece una
colección.

## Widget del panel

**Linkwarden**: tres casillas (enlaces, hoy, colecciones), los seis enlaces más
recientes y un botón **Guardar enlace**. En los ajustes del widget,
**Colección** elige un dispositivo de colección: el widget muestra entonces su
número de enlaces y sus enlaces más recientes, y guarda en ella. Toque un
enlace para leer su descripción y abrirlo (solo enlaces https; **Abrir en
Linkwarden** aparece cuando se accede a Linkwarden por https). **Guardar
enlace** abre un formulario: introduzca un enlace (`https://…` o `www.…`) y la
integración lo guarda.

## Disparadores de escena

**Nuevo enlace**: se guarda un enlace en Linkwarden, desde la aplicación web,
la extensión del navegador, la aplicación móvil o un feed RSS. El filtro
**Colección** solo conserva los enlaces de una colección (elija un dispositivo
de colección; vacío: todas). Las importaciones y los enlaces guardados por esta
integración no se anuncian.

Variables: **Nombre**, **Enlace**, **Descripción**, **Colección** (su nombre),
**Etiquetas** (separadas por comas) e **Id. del enlace**.

La primera lectura tras la instalación es silenciosa: los enlaces ya presentes
no se anuncian. Se disparan como máximo diez eventos por lectura; el resto se
cuenta como visto.

## Acciones de escena

- **Guardar un enlace en Linkwarden**: **Enlace** (obligatorio) y,
  opcionalmente, **Nombre** (vacío: Linkwarden toma el título de la página),
  **Colección** (el nombre de una colección existente, sin importar mayúsculas
  o minúsculas, `Padre/Hijo` para una subcolección; vacío: Unorganized) y
  **Etiquetas** (separadas por comas; las que faltan se crean). Una colección
  desconocida es un error: la integración nunca crea ninguna. Devuelve **Id.
  del enlace**, **Nombre**, **Colección** y **Ya guardado** (verdadero cuando
  Linkwarden rechaza los duplicados, una opción de sus preferencias, y el
  enlace ya está).
- **Leer los últimos enlaces de Linkwarden**: **Colección** (opcional, como
  arriba) y **Número de enlaces** (1, 3, 5 o 10). Devuelve **Número de enlaces
  leídos**, **Enlaces, uno por línea** (`nombre — dirección`), **Nombre del
  enlace más reciente** y **Dirección del enlace más reciente**.

## Ejemplos de escenas

- **Recetas en el móvil**: disparador **Nuevo enlace**, colección **Recetas** →
  enviar un mensaje «Nueva receta: {{triggerEvent.data.name}}
  {{triggerEvent.data.url}}».
- **Lectura del domingo**: cada domingo a las 10:00 → **Leer los últimos
  enlaces de Linkwarden**, colección `Leer`, 5 enlaces → enviar un mensaje con
  la salida **Enlaces, uno por línea**.
- **Guardar el clip de la cámara**: cuando otra integración da la dirección de
  un clip → **Guardar un enlace en Linkwarden** con esa dirección, colección
  `Cámaras`, etiqueta `timbre`.
- **Pila de lectura**: cada noche → continuar solo si la función **Enlaces** de
  la colección `Leer` supera 30 → enviar un mensaje «Su pila de lectura supera
  los 30 enlaces».

## Solución de problemas

- **«Linkwarden rechazó el token de acceso»**: el token se revocó, caducó o se
  copió mal. Cree uno nuevo en Linkwarden → Ajustes → Tokens de acceso.
- **«Linkwarden no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys. El contenedor usa una red puente: `localhost` es el propio
  contenedor, introduzca en su lugar la dirección IP del servidor.
- **«Esta dirección no responde como Linkwarden 2.10 o posterior»**: responde
  una página de inicio de sesión de un proxy en lugar de Linkwarden, o
  Linkwarden es demasiado antiguo. Introduzca la dirección del propio
  Linkwarden, o actualícelo.
- **«No hay ninguna colección … en Linkwarden»**: la colección de la acción de
  escena debe existir. Créela primero en Linkwarden.
- Falta una colección en el filtro del disparador o en los ajustes del widget:
  añada primero su dispositivo en la pestaña **Descubrimiento**.
- Para ver más detalles en los registros de la integración, configure
  `LOG_LEVEL=debug`.

## Límites

- Un solo usuario de Linkwarden: el propietario del token.
- El disparador se activa en la siguiente lectura (30 minutos por defecto), no
  al instante: Linkwarden no envía nada por sí mismo.
- **Enlaces añadidos hoy** y el disparador leen hasta 500 enlaces por lectura:
  más allá, el recuento del día se queda en 500 y los más antiguos no se
  anuncian.
- El descubrimiento ofrece las 100 primeras colecciones.
- La integración nunca borra, mueve ni archiva nada en Linkwarden.
- Sin relación con el proyecto Linkwarden.
