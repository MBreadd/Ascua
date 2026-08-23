# Ascua

Lector de PDF para Android con sistema de hábito de lectura. Un libro a la vez,
meta diaria de páginas y racha con días de gracia. PWA instalable, funciona sin
conexión y no manda ningún dato a ningún servidor.

## Qué hace

- Abre siempre en la página exacta donde se quedó el lector, incluso tras cerrar la app.
- Renderiza el PDF tal cual, sin reflujo de texto, página por página.
- Cuenta páginas y tiempo de lectura por día para calcular la racha.
- Proyecta la fecha de término según el ritmo real de los últimos 21 días.
- Exporta e importa el progreso en JSON.

## Cómo funciona por dentro

- **Sin backend.** El PDF y el progreso viven en IndexedDB, en el propio teléfono.
  El PDF se carga como `blob:` URL para que pdf.js lo lea por partes en vez de
  volcarlo entero en memoria.
- **Renderizado.** Cada página se dibuja en un canvas fuera de pantalla y se
  copia al visible. Se mantienen en caché las páginas dentro de ±2 de la actual;
  la siguiente y la anterior se precargan en tiempo muerto con `requestIdleCallback`.
- **Renders obsoletos.** Cada render lleva un token; si el lector pasa de página
  antes de que termine, el resultado se descarta en vez de pintarse tarde.
- **Rotación y zoom** invalidan la caché por clave `ancho@zoom` y vuelven a dibujar.
- **Tiempo de lectura** se acumula por marcas de reloj cada 5 s y solo mientras la
  pantalla está visible, en vez de un temporizador por segundo.

## Racha

Un día cuenta si se avanzó al menos 1 página y se estuvo al menos 2 minutos
dentro. La meta diaria (10 páginas por defecto) es un objetivo aparte: marca el
día como cumplido, pero no es lo que sostiene la racha. Se permiten 2 días de
gracia al mes que congelan la racha en vez de romperla.

## Estructura

    index.html      la app completa: interfaz, motor de lectura y lógica de hábito
    manifest.json   metadatos de la PWA
    sw.js           service worker, caché para uso sin conexión
    icon-192.png    íconos
    icon-512.png

## Correr en local

Un archivo abierto con doble clic no sirve: el service worker y el
almacenamiento persistente necesitan un servidor. Desde la carpeta:

    python3 -m http.server 8000

Y abrir `http://localhost:8000`.

## Stack

HTML, CSS y JavaScript sin framework ni compilación. Única dependencia externa:
[pdf.js](https://mozilla.github.io/pdf.js/) desde CDN, cacheada por el service worker.
