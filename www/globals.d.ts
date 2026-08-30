// Declaraciones ambientales para globales que vienen de scripts externos
// (pdf.js vendoreado, plugins nativos de Capacitor). Se dejan como `any`
// a propósito: lo que nos interesa tipar es el estado y la lógica propios
// de Ascua en app.js, no la superficie de esas librerías externas.

interface Window {
  Capacitor?: any;
  pdfjsLib?: any;
  'pdfjs-dist/build/pdf'?: any;
}
