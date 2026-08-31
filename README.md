# Ascua

Lector de PDF para Android con biblioteca local, meta diaria de páginas y racha
con días de gracia. Funciona sin conexión y no manda datos a ningún servidor.

## Qué hace

- Abre siempre en la página exacta donde se quedó el lector, incluso tras cerrar la app.
- Guarda varios libros, páginas para revisar y una portada ligera por libro.
- Renderiza el PDF tal cual, sin reflujo de texto, página por página.
- Cuenta páginas y tiempo de lectura por día para calcular la racha.
- Proyecta la fecha de término según el ritmo real de los últimos 21 días.
- Exporta e importa el progreso en JSON.

## Cómo funciona por dentro

- **Sin backend.** El PDF y el progreso viven en IndexedDB, en el propio teléfono.
  El PDF se carga como `blob:` URL para que pdf.js lo lea por partes en vez de
  volcarlo entero en memoria.
- **Portadas sin imágenes.** Cada libro guarda solo el identificador de uno de
  seis diseños CSS; no se duplican archivos ni miniaturas del PDF.
- **Renderizado.** Cada página se dibuja en un canvas fuera de pantalla y se
  copia al visible. La caché se limita a 6 millones de píxeles y se precargan
  hasta las dos páginas siguientes en tiempo muerto con `requestIdleCallback`.
- **Renders obsoletos.** Cada render lleva un token; si el lector pasa de página
  antes de que termine, el resultado se descarta en vez de pintarse tarde.
- **Rotación y zoom** invalidan la caché por clave `ancho@zoom` y vuelven a dibujar.
- **Tiempo de lectura** se acumula por marcas de reloj cada 5 s y solo mientras la
  pantalla está visible, en vez de un temporizador por segundo.

## Racha

Un día cuenta si se alcanza la meta diaria guardada para ese día y se permanece
al menos 2 minutos en el lector. Se permiten 2 días de gracia al mes que
congelan la racha en vez de romperla.

## Estructura

    index.html      interfaz y estilos
    app.js          lector, almacenamiento y control de pantallas
    library.js      portadas y páginas guardadas por libro
    streak.js       cálculo puro de la racha
    manifest.json   metadatos de la PWA
    sw.js           service worker, caché para uso sin conexión
    icon-192.png    íconos
    icon-512.png

## Correr en local

Para revisar tipos y ejecutar las pruebas:

    npm run check
    npm test

Para copiar, compilar e instalar en un teléfono Android conectado por USB:

    npx cap run android

Para abrir la versión web desde la carpeta `www`:

    cd www
    python -m http.server 8000

Y abrir `http://localhost:8000`.

## Stack

HTML, CSS y JavaScript sin framework. El lector usa una copia local de
[pdf.js](https://mozilla.github.io/pdf.js/) para funcionar sin conexión.
