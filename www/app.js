// @ts-check

/**
 * @typedef {Object} Libro
 * @property {string} id
 * @property {string} name
 * @property {number} page
 * @property {number} scrollTop
 * @property {number} zoom
 * @property {number} totalPages
 * @property {string} addedAt
 * @property {string} lastOpenedAt
 */
/**
 * @typedef {Object} EntradaLibroDia
 * @property {number} startPage
 * @property {number} maxPage
 */
/**
 * @typedef {Object} EntradaDia
 * @property {Object<string,EntradaLibroDia>} books
 * @property {number} seconds
 * @property {number} [goal]
 */
/**
 * @typedef {Object} Estado
 * @property {number} schemaVersion
 * @property {Object<string,Libro>} books
 * @property {string|null} currentBookId
 * @property {number} goal
 * @property {number} reminderHour
 * @property {Object<string,EntradaDia>} history
 * @property {string} startedAt
 */

const PDFJS = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
if (PDFJS) PDFJS.GlobalWorkerOptions.workerSrc =
  'pdf.worker.min.js';
const STREAK=window.AscuaStreak;
if(!STREAK)throw new Error('No se cargó el motor de racha.');

/* ---------- almacenamiento ---------- */
function db(){return new Promise((res,rej)=>{const r=indexedDB.open('ascua',1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function kvGet(k){const d=await db();return new Promise((res,rej)=>{
  const q=d.transaction('kv','readonly').objectStore('kv').get(k);
  q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function kvSet(k,v){const d=await db();return new Promise((res,rej)=>{
  const q=d.transaction('kv','readwrite').objectStore('kv').put(v,k);
  q.onsuccess=()=>res(true);q.onerror=()=>rej(q.error);});}
async function kvDel(k){const d=await db();return new Promise((res,rej)=>{
  const q=d.transaction('kv','readwrite').objectStore('kv').delete(k);
  q.onsuccess=()=>res(true);q.onerror=()=>rej(q.error);});}

/* ---------- fechas ---------- */
function dayKey(d){d=d||new Date();
  return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);}
function addDays(k,n){const d=new Date(k+'T12:00:00');d.setDate(d.getDate()+n);return dayKey(d);}
const MES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLarga(k){const d=new Date(k+'T12:00:00');return d.getDate()+' de '+MES[d.getMonth()];}

/* ---------- estado ---------- */
const MIN_SEG=120, GRACIA_MES=2;
/** @type {Estado} */
let S=null;
let pdfDoc=null, blobUrl=null, saveT=null;
/** @type {Libro|null} */
let libroActual=null;

/** @returns {Estado} */
function fresh(){return{schemaVersion:3,books:{},currentBookId:null,goal:10,
  reminderHour:21,history:{},startedAt:dayKey()};}

function idLibro(){return 'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

/**
 * @param {any} raw
 * @returns {Promise<Estado>}
 */
async function migrarAMultiLibro(raw){
  const nuevo=fresh();
  if(raw){
    if(raw.goal!=null)nuevo.goal=raw.goal;
    if(raw.reminderHour!=null)nuevo.reminderHour=raw.reminderHour;
    if(raw.startedAt)nuevo.startedAt=raw.startedAt;
    if(raw.history)nuevo.history=raw.history;
    if(raw.books)nuevo.books=raw.books;
    if(raw.currentBookId)nuevo.currentBookId=raw.currentBookId;
  }
  const blobViejo=await kvGet('book');
  const teniaLibroViejo=!!(raw&&(raw.bookName||raw.totalPages||raw.page));
  if(teniaLibroViejo||(blobViejo&&blobViejo.blob)){
    const id='b'+((raw&&raw.startedAt)||dayKey()).replace(/-/g,'')+'0';
    if(!nuevo.books[id]){
      nuevo.books[id]={
        id,
        name:(raw&&raw.bookName)||((blobViejo&&blobViejo.name)||'').replace(/\.pdf$/i,'')||'Libro',
        page:(raw&&raw.page)||1, scrollTop:(raw&&raw.scrollTop)||0, zoom:(raw&&raw.zoom)||1,
        totalPages:(raw&&raw.totalPages)||0,
        addedAt:(raw&&raw.startedAt)||dayKey(), lastOpenedAt:dayKey()
      };
    }
    nuevo.currentBookId=id;
    if(blobViejo&&blobViejo.blob){
      await kvSet('book:'+id,blobViejo);
      await kvDel('book');
    }
    const out={};
    for(const k in nuevo.history){
      /** @type {any} */
      const e=nuevo.history[k];
      if(e&&e.books){out[k]=Object.assign({goal:nuevo.goal},e);continue;}
      out[k]=e&&(e.startPage!=null||e.maxPage!=null)
        ?{books:{[id]:{startPage:e.startPage||0,maxPage:e.maxPage||0}},seconds:e.seconds||0,goal:nuevo.goal}
        :Object.assign({books:{},seconds:0,goal:nuevo.goal},e||{});
    }
    nuevo.history=out;
  }
  nuevo.schemaVersion=3;
  return nuevo;
}

/** @returns {Promise<void>} */
async function loadState(){
  const raw=await kvGet('state');
  let cambio=false;
  if(!raw||!(raw.schemaVersion>=2)){
    S=await migrarAMultiLibro(raw);
    cambio=true;
  }else{
    S=Object.assign(fresh(),raw);
    if(!S.history)S.history={};
    if(!S.books)S.books={};
    for(const k in S.history){
      const e=S.history[k];
      if(e&&e.goal==null){e.goal=S.goal;cambio=true;}
    }
    if(S.schemaVersion<3){S.schemaVersion=3;cambio=true;}
  }
  if(cambio)await kvSet('state',S).catch(()=>{});
}
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{kvSet('state',S).catch(()=>{});},350);}
function saveNow(){clearTimeout(saveT);return kvSet('state',S).catch(()=>{});}

const REMINDER_ID=1001;
async function programarRecordatorio(){
  if(!window.Capacitor)return;
  const LocalNotifications=window.Capacitor.Plugins&&window.Capacitor.Plugins.LocalNotifications;
  if(!LocalNotifications)return;
  try{
    let permiso=await LocalNotifications.checkPermissions();
    if(permiso.display==='prompt'||permiso.display==='prompt-with-rationale'){
      permiso=await LocalNotifications.requestPermissions();
    }
    if(permiso.display!=='granted')return;
    await LocalNotifications.cancel({notifications:[{id:REMINDER_ID}]});
    await LocalNotifications.schedule({notifications:[{
      id:REMINDER_ID,
      title:'Ascua',
      body:'Es hora de encender tu hábito de lectura.',
      schedule:{on:{hour:Number(S.reminderHour),minute:0},allowWhileIdle:true},
      autoCancel:true,
      isExactNotification:true
    }]});
  }catch(err){console.warn('No se pudo programar el recordatorio diario.',err);}
}

/** @returns {EntradaDia} */
function today(){
  const k=dayKey();
  if(!S.history[k])S.history[k]={books:{},seconds:0,goal:S.goal};
  if(!S.history[k].books)S.history[k].books={};
  if(S.history[k].goal==null)S.history[k].goal=S.goal;
  return S.history[k];
}
/**
 * @param {EntradaDia} e
 * @param {string} bookId
 * @param {number} paginaActual
 * @returns {EntradaLibroDia}
 */
function entradaDeLibro(e,bookId,paginaActual){
  if(!e.books)e.books={};
  if(!e.books[bookId])e.books[bookId]={startPage:paginaActual,maxPage:paginaActual};
  return e.books[bookId];
}
/**
 * @param {EntradaDia|undefined} e
 * @returns {number}
 */
function paginasDe(e){
  return STREAK.pages(e);
}
/** @param {EntradaDia|undefined} e */
function diaCumplido(e){return STREAK.completed(e,S.goal,MIN_SEG);}
/** @param {EntradaDia|undefined} e */
function tieneActividad(e){return STREAK.hasActivity(e);}

function analizarRacha(){
  return STREAK.analyze(S.history,{startedAt:S.startedAt,today:dayKey(),defaultGoal:S.goal,
    minSeconds:MIN_SEG,gracePerMonth:GRACIA_MES});
}

function graciaUsada(mes){
  return analizarRacha().graceByMonth[mes]||0;
}

function racha(){
  return analizarRacha().current;
}

function ritmo(){
  let tot=0,dias=0,k=dayKey();
  for(let i=0;i<21;i++){
    const e=S.history[k];
    if(e&&paginasDe(e)>0){tot+=paginasDe(e);dias++;}
    k=addDays(k,-1);
  }
  return dias?tot/dias:0;
}

/* ---------- pantallas ---------- */
function show(id){
  ['scOnboard','scHome','scSet'].forEach(x=>document.getElementById(x).classList.toggle('on',x===id));
  document.getElementById('nav').classList.toggle('hidden',id==='scOnboard');
  document.getElementById('tabHome').classList.toggle('act',id==='scHome');
  document.getElementById('tabSet').classList.toggle('act',id==='scSet');
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('on');
  setTimeout(()=>t.classList.remove('on'),3200);}

/** @param {string} key @param {ReturnType<typeof analizarRacha>} analisis */
function estadoDia(key,analisis){
  const hoy=dayKey();
  if(key>hoy)return 'future';
  if(key<S.startedAt)return 'before';
  if(analisis.fulfilled.has(key))return 'full';
  if(analisis.grace.has(key))return 'grace';
  if(tieneActividad(S.history[key]))return 'part';
  return key===hoy?'pending':'missed';
}

/** @param {string} key @param {string} estado */
function descripcionDia(key,estado){
  const e=S.history[key],p=paginasDe(e),min=Math.floor(((e&&e.seconds)||0)/60);
  const base=key+' · '+p+' '+(p===1?'página':'páginas')+' · '+min+' min';
  if(estado==='future')return 'Día futuro · '+key;
  if(estado==='before')return 'Anterior al inicio de Ascua · '+key;
  if(estado==='full')return 'Meta cumplida · '+base;
  if(estado==='grace')return 'Día de gracia · '+base;
  if(estado==='part')return 'Lectura parcial · '+base;
  if(estado==='pending')return 'Hoy pendiente · '+base;
  return 'Sin lectura · '+key;
}

function pintarHome(){
  const analisis=analizarRacha(),r=analisis.current,e=today(),hoy=paginasDe(e);
  document.getElementById('streakNum').textContent=String(r);
  document.getElementById('streakLabel').textContent=r===1?'día de racha':'días de racha';

  const w=document.getElementById('week');w.innerHTML='';
  const hk=dayKey(), dow=(new Date(hk+'T12:00:00').getDay()+6)%7;
  for(let i=0;i<7;i++){
    const k=addDays(hk,i-dow),estado=estadoDia(k,analisis);
    const dia=document.createElement('span');dia.className='week-day';
    const nombre=document.createElement('span');nombre.className='week-name';nombre.textContent=['L','M','X','J','V','S','D'][i];
    const punto=document.createElement('span');punto.className='dot';
    if(['full','part','grace','missed'].includes(estado))punto.classList.add(estado);
    if(k===hk)punto.classList.add('today');
    dia.title=descripcionDia(k,estado);dia.appendChild(nombre);dia.appendChild(punto);w.appendChild(dia);
  }
  const falta=Math.max(0,S.goal-hoy);
  document.getElementById('todayLine').textContent = diaCumplido(e)
    ? '¡Meta de hoy cumplida!'
    : (hoy===0 ? 'Hoy no has leído'
      : (falta>0 ? hoy+' de '+S.goal+' páginas hoy · faltan '+falta
        : 'Meta de páginas alcanzada · completa 2 minutos'));

  const lib=S.books[S.currentBookId]||null;
  document.getElementById('bookTitle').textContent=lib?lib.name:'Sin libro';
  document.getElementById('bookPages').textContent=lib&&lib.totalPages
    ? 'Página '+lib.page+' de '+lib.totalPages : '—';
  const pct=lib&&lib.totalPages?Math.round(lib.page/lib.totalPages*100):0;
  document.getElementById('barFill').style.width=pct+'%';

  const rest=lib?Math.max(0,lib.totalPages-lib.page):0, rt=ritmo()||S.goal;
  document.getElementById('projection').textContent = !lib ? '—' : (rest===0
    ? 'Terminaste este libro' : 'A este ritmo terminas el '+fechaLarga(addDays(dayKey(),Math.ceil(rest/rt))));

  document.getElementById('goRead').textContent = lib&&lib.page>1?'Seguir leyendo':'Empezar a leer';

  pintarBiblioteca();
}

let mesCalendario=dayKey().slice(0,7)+'-01';

/** @param {string} key @param {number} delta */
function moverMes(key,delta){
  const p=key.split('-').map(Number),d=new Date(p[0],p[1]-1+delta,1,12);
  return dayKey(d).slice(0,7)+'-01';
}

function pintarCalendario(){
  const analisis=analizarRacha(),p=mesCalendario.split('-').map(Number),y=p[0],m=p[1];
  const titulo=MES[m-1].charAt(0).toUpperCase()+MES[m-1].slice(1)+' '+y;
  document.getElementById('calendarTitle').textContent=titulo;
  const grid=document.getElementById('calendarGrid');grid.innerHTML='';
  const primerDia=(new Date(y,m-1,1,12).getDay()+6)%7;
  const cantidad=new Date(y,m,0,12).getDate();
  for(let i=0;i<primerDia;i++){
    const vacio=document.createElement('span');vacio.className='cal-day blank';grid.appendChild(vacio);
  }
  let cumplidosMes=0;
  for(let n=1;n<=cantidad;n++){
    const key=y+'-'+String(m).padStart(2,'0')+'-'+String(n).padStart(2,'0');
    const estado=estadoDia(key,analisis),celda=document.createElement('div');
    celda.className='cal-day';celda.setAttribute('role','img');
    if(['full','part','grace','missed'].includes(estado))celda.classList.add(estado);
    if(key===dayKey())celda.classList.add('today');
    if(estado==='full')cumplidosMes++;
    const numero=document.createElement('b');numero.textContent=String(n);celda.appendChild(numero);
    const paginas=paginasDe(S.history[key]);
    if(paginas>0){const dato=document.createElement('small');dato.textContent=paginas+' pág.';celda.appendChild(dato);}
    const descripcion=descripcionDia(key,estado);celda.title=descripcion;celda.setAttribute('aria-label',descripcion);
    grid.appendChild(celda);
  }
  const usadas=analisis.graceByMonth[mesCalendario.slice(0,7)]||0;
  document.getElementById('calendarSummary').textContent=analisis.current+' '+(analisis.current===1?'día':'días')+
    ' de racha actual · '+cumplidosMes+' cumplidos este mes · '+usadas+' de '+GRACIA_MES+' días de gracia usados';
  /** @type {HTMLButtonElement} */(document.getElementById('calendarPrev')).disabled=
    mesCalendario.slice(0,7)<=S.startedAt.slice(0,7);
  /** @type {HTMLButtonElement} */(document.getElementById('calendarNext')).disabled=
    mesCalendario.slice(0,7)>=dayKey().slice(0,7);
}

function abrirCalendario(){
  mesCalendario=dayKey().slice(0,7)+'-01';pintarCalendario();
  const modal=document.getElementById('streakModal');modal.classList.add('on');modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');document.getElementById('calendarClose').focus();
}
function cerrarCalendario(){
  const modal=document.getElementById('streakModal');modal.classList.remove('on');modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');document.getElementById('streakOpen').focus();
}

function pintarBiblioteca(){
  const cont=document.getElementById('library');
  cont.innerHTML='';
  const libros=Object.values(S.books).sort((a,b)=>b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  for(const libro of libros){
    const row=document.createElement('div');
    row.className='row';

    const info=document.createElement('div');
    const p=document.createElement('p');p.textContent=libro.name||'Libro';
    const small=document.createElement('small');
    small.textContent=libro.totalPages?('Página '+libro.page+' de '+libro.totalPages):'—';
    info.appendChild(p);info.appendChild(small);

    const acciones=document.createElement('div');
    acciones.className='row-actions';
    const btnLeer=document.createElement('button');
    btnLeer.className='btn ghost sm';btnLeer.textContent='Leer';
    btnLeer.dataset.id=libro.id;btnLeer.dataset.accion='leer';
    const btnEliminar=document.createElement('button');
    btnEliminar.className='btn ghost sm';btnEliminar.textContent='Eliminar';
    btnEliminar.dataset.id=libro.id;btnEliminar.dataset.accion='eliminar';
    acciones.appendChild(btnLeer);acciones.appendChild(btnEliminar);

    row.appendChild(info);row.appendChild(acciones);
    cont.appendChild(row);
  }
}

function pintarSet(){
  /** @type {HTMLInputElement} */(document.getElementById('goalIn')).value=String(S.goal);
  /** @type {HTMLInputElement} */(document.getElementById('hourIn')).value=String(S.reminderHour);
  const q=GRACIA_MES-graciaUsada(dayKey().slice(0,7));
  document.getElementById('graceLeft').textContent=
    'Te quedan '+Math.max(0,q)+' de '+GRACIA_MES+' este mes. Un día de gracia congela la racha en vez de romperla.';
}

/* ---------- lector ---------- */
const wrap=document.getElementById('pageWrap'), stage=document.getElementById('pageStage'),
      surface=document.getElementById('pageSurface'),
      canvas=/** @type {HTMLCanvasElement} */(document.getElementById('pageCanvas')),
      textLayer=document.getElementById('textLayer'), spin=document.getElementById('spin');
let cache=new Map(), pending=new Map(), cacheKey='', renderTok=0, preloadTok=0;
let canvasBaseW=0,canvasBaseH=0,canvasQuality=1,qualityT=null,qualityTok=0,qualityTask=null;
let textTok=0,textRenderTask=null,postTimers=[],interactuando=false;

/**
 * @param {string} [bookId]
 * @returns {Promise<boolean>}
 */
async function abrirLibro(bookId){
  bookId=bookId||S.currentBookId;
  const libro=bookId&&S.books[bookId];
  if(!libro)return false;
  const rec=await kvGet('book:'+bookId);
  if(!rec||!rec.blob)return false;
  if(pdfDoc){try{await pdfDoc.destroy();}catch(e){}pdfDoc=null;}
  if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}
  blobUrl=URL.createObjectURL(rec.blob);
  pdfDoc=await PDFJS.getDocument({url:blobUrl}).promise;
  libro.totalPages=pdfDoc.numPages;
  if(libro.page>libro.totalPages)libro.page=libro.totalPages;
  libroActual=libro; S.currentBookId=bookId; libro.lastOpenedAt=dayKey();
  return true;
}

function keyNow(){return String(Math.round(wrap.clientWidth));}
function densidadBase(){return Math.min(window.devicePixelRatio||1,2);}
function soltar(c){c.width=0;c.height=0;}
function revisarCache(){const k=keyNow();
  if(k!==cacheKey){cache.forEach(soltar);cache.clear();cacheKey=k;}}
function podar(n){
  cache.forEach((c,k)=>{if(k<n-1||k>n+3){soltar(c);cache.delete(k);}});
  let pixels=0;cache.forEach(c=>pixels+=c.width*c.height);
  const maxPixelsCache=10000000;
  for(const k of [n-1,n+3,n+2]){
    if(pixels<=maxPixelsCache)break;
    const c=cache.get(k);if(!c)continue;
    pixels-=c.width*c.height;soltar(c);cache.delete(k);
  }
}

async function pintarOff(n,calidad=1,alCrearTarea=null,segundoPlano=false,densidad=null,promover=true){
  const page=await pdfDoc.getPage(n);
  const base=page.getViewport({scale:1});
  const dpr=densidad===null?densidadBase():densidad;
  const ajuste=wrap.clientWidth/base.width;
  let escala=ajuste*dpr*Math.max(1,calidad);
  let vp=page.getViewport({scale:escala});
  const maxPixels=4000000;
  if(vp.width*vp.height>maxPixels){
    escala*=Math.sqrt(maxPixels/(vp.width*vp.height));
    vp=page.getViewport({scale:escala});
  }
  /** @type {any} */
  const off=document.createElement('canvas');
  off.width=Math.round(vp.width); off.height=Math.round(vp.height);
  const tarea=page.render({canvasContext:off.getContext('2d',{alpha:false}),viewport:vp});
  if(alCrearTarea)alCrearTarea(tarea);
  if(segundoPlano)tarea.onContinue=continuar=>{
    if(promover&&libroActual&&n===libroActual.page){continuar();return;}
    if(window.requestIdleCallback)requestIdleCallback(()=>continuar(),{timeout:120});
    else setTimeout(continuar,16);
  };
  await tarea.promise;
  off._w=base.width*ajuste; off._h=base.height*ajuste;
  off._density=dpr;off._quality=calidad*(dpr/densidadBase());
  page.cleanup();
  return off;
}
function aplicarTamanoZoom(zoom){
  if(!canvasBaseW||!canvasBaseH)return;
  surface.style.width=(canvasBaseW*zoom)+'px';
  surface.style.height=(canvasBaseH*zoom)+'px';
  textLayer.style.width=canvasBaseW+'px';textLayer.style.height=canvasBaseH+'px';
  textLayer.style.transform='scale('+zoom+')';
}
function aplicarZoom(){aplicarTamanoZoom(libroActual?libroActual.zoom:1);}
function volcar(off){
  canvas.width=off.width; canvas.height=off.height;
  canvasBaseW=off._w;canvasBaseH=off._h;canvasQuality=off._quality||1;aplicarZoom();
  canvas.getContext('2d',{alpha:false}).drawImage(off,0,0);
}
function cancelarCalidad(){
  clearTimeout(qualityT);qualityTok++;
  if(qualityTask){try{qualityTask.cancel();}catch(e){}qualityTask=null;}
}
function programarCalidad(n){
  cancelarCalidad();
  const zoomActual=libroActual?libroActual.zoom:1;
  if(zoomActual<=1.05){
    const base=cache.get(n);if(canvasQuality>1.05&&base)volcar(base);return;
  }
  if(canvasQuality>=zoomActual-.05)return;
  const tok=qualityTok,pagina=n,zoom=zoomActual,k=cacheKey;
  qualityT=setTimeout(async()=>{
    const guardada=cache.get(pagina);
    if(!guardada||(guardada._density||0)<densidadBase()-.01){
      if(tok===qualityTok&&pagina===libroActual.page)programarCalidad(pagina);return;
    }
    let off;
    try{off=await pintarOff(pagina,zoom,t=>qualityTask=t);}catch(e){qualityTask=null;return;}
    qualityTask=null;
    if(tok!==qualityTok||pagina!==libroActual.page||k!==cacheKey||Math.abs(zoom-libroActual.zoom)>.02){soltar(off);return;}
    volcar(off);soltar(off);
  },1200);
}
async function pintarTexto(n){
  const tok=++textTok;
  textLayer.replaceChildren();
  if(!PDFJS.renderTextLayer)return;
  try{
    const page=await pdfDoc.getPage(n),base=page.getViewport({scale:1});
    const vp=page.getViewport({scale:wrap.clientWidth/base.width});
    const contenido=await page.getTextContent();
    if(tok!==textTok||n!==libroActual.page)return;
    textLayer.style.width=vp.width+'px';textLayer.style.height=vp.height+'px';
    textLayer.style.transform='scale('+libroActual.zoom+')';
    textLayer.style.setProperty('--scale-factor',vp.scale);
    const tarea=PDFJS.renderTextLayer({textContentSource:contenido,container:textLayer,
      viewport:vp,textDivs:[]});
    textRenderTask=tarea;
    if(tarea&&tarea.promise)await tarea.promise;
    if(tok===textTok)textRenderTask=null;
  }catch(e){if(tok===textTok){textRenderTask=null;textLayer.replaceChildren();}}
}
function cancelarPost(){
  postTimers.forEach(clearTimeout);postTimers=[];
  if(textRenderTask){try{textRenderTask.cancel();}catch(e){}textRenderTask=null;
    textTok++;textLayer.replaceChildren();}
  cancelarCalidad();
}
function despues(ms,fn){const id=setTimeout(()=>{
  postTimers=postTimers.filter(x=>x!==id);fn();
},ms);postTimers.push(id);}
function programarPost(n){
  postTimers.forEach(clearTimeout);postTimers=[];
  const actual=cache.get(n),baseDpr=densidadBase();
  if(actual&&actual._density>=baseDpr-.01&&canvasQuality<.99&&!interactuando)volcar(actual);
  else if(!actual||actual._density<baseDpr-.01)despues(320,async()=>{
    let mejor;
    try{mejor=await obtenerOff(n,true,false,false);}catch(e){return;}
    if(n===libroActual.page&&mejor&&!interactuando&&canvasQuality<1.05)volcar(mejor);
  });
  if(!textLayer.childElementCount)despues(850,()=>{
    if(n===libroActual.page)pintarTexto(n);
  });
  programarCalidad(n);
}
function actualizarPosicion(n,actualizarRange=true){
  const texto='Página '+n+' de '+libroActual.totalPages;
  const pct=libroActual.totalPages?Math.round(n/libroActual.totalPages*100):0;
  document.getElementById('readerPosition').textContent=texto;
  document.getElementById('pageBig').textContent=texto;
  document.getElementById('pagePct').textContent=pct+'% leído';
  if(actualizarRange){
    const rg=/** @type {HTMLInputElement} */(document.getElementById('pageRange'));
    rg.max=String(libroActual.totalPages);rg.value=String(n);
  }
}
async function obtenerOff(n,segundoPlano=false,ligera=false,promover=true,calidad=1){
  revisarCache();
  const requerida=ligera?Math.min(1,densidadBase()):densidadBase();
  const existente=cache.get(n);
  if(existente&&(existente._density||densidadBase())>=requerida-.01&&
    (existente._quality||1)>=calidad-.01)return existente;
  const clave=cacheKey+'#'+n+'@'+requerida.toFixed(2)+'x'+calidad.toFixed(2);
  if(pending.has(clave))return pending.get(clave);
  const k=cacheKey;
  const tarea=pintarOff(n,calidad,null,segundoPlano,requerida,promover).then(off=>{
    if(k===cacheKey&&n>=libroActual.page-1&&n<=libroActual.page+3){
      const anterior=cache.get(n);
      if(!anterior||anterior.width*anterior.height<off.width*off.height){
        cache.set(n,off);if(anterior)soltar(anterior);podar(libroActual.page);return off;
      }
      soltar(off);return anterior;
    }
    soltar(off);return null;
  }).finally(()=>pending.delete(clave));
  pending.set(clave,tarea);
  return tarea;
}
async function precargarAlrededor(n){
  const tok=++preloadTok;
  for(const p of [n+1,n+2,n+3]){
    if(tok!==preloadTok)return;
    if(p<1||p>libroActual.totalPages)continue;
    const calidad=p===n+1?Math.max(1,libroActual.zoom):1;
    try{await obtenerOff(p,p!==n+1,false,true,calidad);}catch(e){}
  }
}

async function render(n){
  if(!pdfDoc)return;
  revisarCache();
  const tok=++renderTok;
  preloadTok++;cancelarPost();textTok++;textLayer.replaceChildren();
  const calidadNecesaria=Math.max(1,libroActual.zoom);
  let off=cache.get(n);
  if(off&&(off._quality||1)<calidadNecesaria-.01)off=null;
  if(!off){
    spin.classList.add('on');
    try{off=await obtenerOff(n,false,false,true,calidadNecesaria);}
    catch(e){if(tok===renderTok){spin.classList.remove('on');toast('No se pudo mostrar esta página.');}return;}
  }
  if(tok!==renderTok||!off)return;
  spin.classList.remove('on');volcar(off);
  podar(n);
  actualizarPosicion(n);
  precargarAlrededor(n);
  programarPost(n);
}

/** @param {number} n */
function irA(n){
  n=Math.max(1,Math.min(libroActual.totalPages,n));
  if(n===libroActual.page)return;
  const paginaAnterior=libroActual.page;
  libroActual.page=n;
  const e=today(); const eb=entradaDeLibro(e,libroActual.id,paginaAnterior); if(n>eb.maxPage)eb.maxPage=n;
  libroActual.scrollTop=0; wrap.scrollTop=0;
  render(n); pintarLector(); save();
}
function pintarLector(){
  const e=today();
  document.getElementById('readerTitle').textContent=libroActual.name||'Libro';
  actualizarPosicion(libroActual.page);
  document.getElementById('readToday').textContent='Hoy: '+paginasDe(e)+' pág';
  document.getElementById('readGoal').textContent='Meta: '+S.goal;
}

let marca=0, segTimer=null;
function volcarSeg(){
  if(!marca)return;
  const ahora=Date.now();
  if(document.visibilityState==='visible'){
    today().seconds+=Math.round((ahora-marca)/1000); save();}
  marca=ahora;
}

function abrirLector(){
  document.getElementById('reader').classList.add('on');
  const e=today(); const eb=entradaDeLibro(e,libroActual.id,libroActual.page);
  if(libroActual.page>eb.maxPage)eb.maxPage=libroActual.page;
  cacheKey=''; render(libroActual.page); pintarLector();
  requestAnimationFrame(()=>{wrap.scrollTop=libroActual.scrollTop||0;});
  chrome(true); autoHideT=setTimeout(()=>chrome(false),2600);
  marca=Date.now(); clearInterval(segTimer); segTimer=setInterval(volcarSeg,5000);
  statusBar(true);
}
function cerrarLector(){
  volcarSeg(); clearInterval(segTimer); segTimer=null; marca=0;
  cancelarPost();textTok++;textLayer.replaceChildren();
  libroActual.scrollTop=wrap.scrollTop;
  cache.forEach(soltar); cache.clear(); cacheKey='';
  document.getElementById('reader').classList.remove('on');
  saveNow(); pintarHome(); show('scHome');
  statusBar(false);
}
function chrome(on){
  document.getElementById('topBar').classList.toggle('show',on);
  document.getElementById('botBar').classList.toggle('show',on);
  document.getElementById('reader').classList.toggle('menu-open',on);
}
function statusBar(hide){
  const SB=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.StatusBar;
  if(!SB)return;
  (hide?SB.hide():SB.show()).catch(()=>{});
}

/* gestos */
let tX=0,tY=0,moved=false,autoHideT=null;
let pinching=false,ignorarToque=false,pinchStartDist=0,pinchStartZoom=1,pinchZoom=1;
let pinchAnchorX=.5,pinchAnchorY=.5,pinchLastX=0,pinchLastY=0;
const MIN_ZOOM=.6,MAX_ZOOM=3;
function distancia(t0,t1){return Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY);}
function centroToques(t0,t1){return{x:(t0.clientX+t1.clientX)/2,y:(t0.clientY+t1.clientY)/2};}
function haySeleccion(){const s=window.getSelection&&window.getSelection();return !!(s&&!s.isCollapsed&&s.toString().trim());}
function colocarAncla(cx,cy){
  const r=wrap.getBoundingClientRect(),vx=cx-r.left,vy=cy-r.top;
  wrap.scrollLeft=Math.max(0,pinchAnchorX*stage.scrollWidth-vx);
  wrap.scrollTop=Math.max(0,pinchAnchorY*stage.scrollHeight-vy);
}
function cambiarZoom(nuevo){
  nuevo=Math.round(Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,nuevo))*20)/20;
  if(Math.abs(nuevo-libroActual.zoom)<.01)return;
  pinchAnchorX=(wrap.scrollLeft+wrap.clientWidth/2)/Math.max(1,stage.scrollWidth);
  pinchAnchorY=(wrap.scrollTop+wrap.clientHeight/2)/Math.max(1,stage.scrollHeight);
  libroActual.zoom=nuevo;
  aplicarZoom();
  colocarAncla(wrap.getBoundingClientRect().left+wrap.clientWidth/2,
    wrap.getBoundingClientRect().top+wrap.clientHeight/2);
  libroActual.scrollTop=wrap.scrollTop;save();precargarAlrededor(libroActual.page);programarPost(libroActual.page);
}

wrap.addEventListener('touchstart',ev=>{
  interactuando=true;clearTimeout(autoHideT);cancelarPost();
  if(ev.touches.length===2){
    pinching=true;
    ignorarToque=true;
    pinchStartDist=Math.max(1,distancia(ev.touches[0],ev.touches[1]));
    pinchStartZoom=libroActual.zoom; pinchZoom=libroActual.zoom;
    const c=centroToques(ev.touches[0],ev.touches[1]),r=wrap.getBoundingClientRect();
    pinchLastX=c.x;pinchLastY=c.y;
    pinchAnchorX=(wrap.scrollLeft+c.x-r.left)/Math.max(1,stage.scrollWidth);
    pinchAnchorY=(wrap.scrollTop+c.y-r.top)/Math.max(1,stage.scrollHeight);
  }else if(ev.touches.length===1){
    tX=ev.touches[0].clientX;tY=ev.touches[0].clientY;moved=false;
  }
},{passive:true});
wrap.addEventListener('touchmove',ev=>{
  if(pinching&&ev.touches.length===2){
    ev.preventDefault();
    const d=distancia(ev.touches[0],ev.touches[1]);
    pinchZoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,pinchStartZoom*(d/pinchStartDist)));
    aplicarTamanoZoom(pinchZoom);
    const c=centroToques(ev.touches[0],ev.touches[1]);
    pinchLastX=c.x;pinchLastY=c.y;
    colocarAncla(c.x,c.y);
    return;
  }
  if(ev.touches.length===1&&(Math.abs(ev.touches[0].clientX-tX)>18||Math.abs(ev.touches[0].clientY-tY)>18))moved=true;
},{passive:false});
wrap.addEventListener('touchend',ev=>{
  if(ev.touches.length===0)interactuando=false;
  if(pinching){
    if(ev.touches.length<2){
      pinching=false;
      const nuevo=Math.round(pinchZoom*20)/20;
      if(Math.abs(nuevo-libroActual.zoom)>.02)libroActual.zoom=nuevo;
      aplicarZoom();colocarAncla(pinchLastX,pinchLastY);
      libroActual.scrollTop=wrap.scrollTop;save();precargarAlrededor(libroActual.page);programarPost(libroActual.page);
      if(ev.touches.length===1){
        tX=ev.touches[0].clientX;tY=ev.touches[0].clientY;moved=true;
      }else ignorarToque=false;
    }
    return;
  }
  if(ev.touches.length>0)return;
  if(ignorarToque){ignorarToque=false;programarPost(libroActual.page);return;}
  if(haySeleccion())return;
  if(moved){programarPost(libroActual.page);return;}
  // Mitad inferior de la pantalla = controles de página (izquierda=retroceder,
  // derecha=avanzar); mitad superior = zoom/paneo, nunca cambia de página,
  // para que un gesto de acercar/mover no dispare un cambio de página sin querer.
  const cx=ev.changedTouches[0].clientX, cy=ev.changedTouches[0].clientY;
  if(cy/window.innerHeight>=.5){
    if(cx/window.innerWidth<.5)irA(libroActual.page-1); else irA(libroActual.page+1);
    return;
  }
  chrome(!document.getElementById('topBar').classList.contains('show'));
  programarPost(libroActual.page);
});
wrap.addEventListener('touchcancel',()=>{
  interactuando=false;
  if(!pinching){programarPost(libroActual.page);return;}
  pinching=false;ignorarToque=false;
  aplicarZoom();programarPost(libroActual.page);
},{passive:true});
wrap.addEventListener('click',ev=>{
  if('ontouchstart' in window||haySeleccion())return;
  if(ev.clientY/window.innerHeight>=.5){
    if(ev.clientX/window.innerWidth<.5)irA(libroActual.page-1); else irA(libroActual.page+1);
  }else{
    chrome(!document.getElementById('topBar').classList.contains('show'));
  }
});
let scT=null;
wrap.addEventListener('scroll',()=>{clearTimeout(scT);
  scT=setTimeout(()=>{libroActual.scrollTop=wrap.scrollTop;save();},180);},{passive:true});
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'&&document.getElementById('streakModal').classList.contains('on')){
    cerrarCalendario();return;
  }
  if(!document.getElementById('reader').classList.contains('on'))return;
  if(ev.key==='ArrowRight'||ev.key===' ')irA(libroActual.page+1);
  if(ev.key==='ArrowLeft')irA(libroActual.page-1);
  if(ev.key==='Escape')cerrarLector();
});

let rzT=null;
window.addEventListener('resize',()=>{
  if(!document.getElementById('reader').classList.contains('on'))return;
  clearTimeout(rzT); rzT=setTimeout(()=>{revisarCache();render(libroActual.page);},260);});

document.getElementById('closeRead').onclick=cerrarLector;
document.getElementById('zoomIn').onclick=()=>cambiarZoom(libroActual.zoom+.25);
document.getElementById('zoomOut').onclick=()=>cambiarZoom(libroActual.zoom-.25);
document.getElementById('pageRange').oninput=ev=>{
  actualizarPosicion(parseInt(/** @type {HTMLInputElement} */(ev.target).value,10),false);};
document.getElementById('pageRange').onchange=ev=>irA(parseInt(/** @type {HTMLInputElement} */(ev.target).value,10));

/* ---------- carga de archivo ---------- */
/** @param {File} file */
async function agregarLibro(file){
  if(!file)return;
  if(file.type&&file.type.indexOf('pdf')===-1){toast('Ese archivo no es un PDF.');return;}
  toast('Guardando el libro…');
  const id=idLibro();
  try{
    await kvSet('book:'+id,{name:file.name,blob:file});
    S.books[id]={id,name:file.name.replace(/\.pdf$/i,''),page:1,scrollTop:0,zoom:1,totalPages:0,
      addedAt:dayKey(),lastOpenedAt:dayKey()};
    cache.forEach(soltar);cache.clear();cacheKey='';
    const ok=await abrirLibro(id);
    if(!ok){
      delete S.books[id]; await kvDel('book:'+id);
      toast('No se pudo leer el PDF.');return;
    }
    await saveNow();
    pintarHome();show('scHome');
    toast('Listo: '+S.books[id].totalPages+' páginas.');
  }catch(err){
    delete S.books[id]; await kvDel('book:'+id).catch(()=>{});
    toast('No se pudo guardar. Puede que no haya espacio en el teléfono.');
  }
}
/** @param {string} id */
async function leerLibro(id){
  if(!S.books[id])return;
  if(!pdfDoc||!libroActual||S.currentBookId!==id){
    const ok=await abrirLibro(id);
    if(!ok){toast('No se pudo leer el PDF.');return;}
  }
  abrirLector();
}
/** @param {string} id */
async function eliminarLibro(id){
  const libro=S.books[id];
  if(!libro)return;
  if(!confirm('¿Eliminar "'+libro.name+'"? Se borra el PDF guardado; tu racha y tu historial no se tocan.'))return;
  if(S.currentBookId===id){
    if(pdfDoc){try{await pdfDoc.destroy();}catch(e){}pdfDoc=null;}
    if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}
    libroActual=null;
    const restantes=Object.keys(S.books).filter(x=>x!==id);
    S.currentBookId=restantes[0]||null;
  }
  delete S.books[id];
  await kvDel('book:'+id);
  await saveNow();
  pintarHome();
  toast('Libro eliminado.');
}
document.getElementById('fileIn').onchange=ev=>agregarLibro(/** @type {HTMLInputElement} */(ev.target).files[0]);
document.getElementById('addBookIn').onchange=ev=>agregarLibro(/** @type {HTMLInputElement} */(ev.target).files[0]);
document.getElementById('library').addEventListener('click',ev=>{
  const btn=/** @type {HTMLElement} */(ev.target).closest('button');
  if(!btn)return;
  const id=btn.dataset.id;
  if(!id)return;
  if(btn.dataset.accion==='leer')leerLibro(id);
  else if(btn.dataset.accion==='eliminar')eliminarLibro(id);
});

/* ---------- ajustes ---------- */
document.getElementById('goalIn').onchange=ev=>{
  const t=/** @type {HTMLInputElement} */(ev.target);
  S.goal=Math.max(1,Math.min(200,parseInt(t.value,10)||10));t.value=String(S.goal);
  today().goal=S.goal;save();pintarHome();pintarSet();};
document.getElementById('hourIn').onchange=ev=>{
  const t=/** @type {HTMLInputElement} */(ev.target);
  S.reminderHour=Math.max(0,Math.min(23,parseInt(t.value,10)||21));t.value=String(S.reminderHour);save();
  programarRecordatorio();};

document.getElementById('exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='ascua-progreso-'+dayKey()+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast('Guarda ese archivo en Drive o en tu correo.');
};
document.getElementById('importIn').onchange=ev=>{
  const f=/** @type {HTMLInputElement} */(ev.target).files[0];if(!f)return;
  const r=new FileReader();
  r.onload=async()=>{
    try{
      const d=JSON.parse(String(r.result));
      if(!d||typeof d!=='object'||!d.history)throw 0;
      const migrado=(d.schemaVersion>=2)?d:await migrarAMultiLibro(d);
      const librosPrevios=S.books,idPrevio=S.currentBookId;
      S=Object.assign(fresh(),migrado);
      if(!S.books||!Object.keys(S.books).length){S.books=librosPrevios;S.currentBookId=idPrevio;}
      for(const k in S.history)if(S.history[k]&&S.history[k].goal==null)S.history[k].goal=S.goal;
      S.schemaVersion=3;
      await saveNow();pintarHome();pintarSet();toast('Progreso restaurado.');
    }catch(e){toast('Ese archivo no sirve. Debe ser el que exportó Ascua.');}
  };
  r.readAsText(f);
};

document.getElementById('tabHome').onclick=()=>{pintarHome();show('scHome');};
document.getElementById('tabSet').onclick=()=>{pintarSet();show('scSet');};
document.getElementById('streakOpen').onclick=abrirCalendario;
document.getElementById('calendarClose').onclick=cerrarCalendario;
document.getElementById('calendarPrev').onclick=()=>{mesCalendario=moverMes(mesCalendario,-1);pintarCalendario();};
document.getElementById('calendarNext').onclick=()=>{mesCalendario=moverMes(mesCalendario,1);pintarCalendario();};
document.getElementById('streakModal').addEventListener('click',ev=>{
  if(ev.target===document.getElementById('streakModal'))cerrarCalendario();
});
document.getElementById('goRead').onclick=async()=>{
  if(!S.currentBookId){toast('Carga un PDF primero.');return;}
  if(!pdfDoc||!libroActual){const ok=await abrirLibro(S.currentBookId);if(!ok){toast('Carga un PDF primero.');return;}}
  abrirLector();
};

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){volcarSeg();saveNow();}
  else if(segTimer){marca=Date.now();}});
window.addEventListener('pagehide',()=>{
  if(segTimer){volcarSeg();libroActual.scrollTop=wrap.scrollTop;}saveNow();});

/* ---------- arranque ---------- */
(async function(){
  await loadState();
  await programarRecordatorio();

  const AppPlugin=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
  if(AppPlugin){
    if(AppPlugin.getInfo){
      try{
        const info=await AppPlugin.getInfo();
        document.getElementById('appVersion').textContent=info.version+' ('+info.build+')';
      }catch(e){}
    }
    AppPlugin.addListener('backButton',()=>{
      if(document.getElementById('streakModal').classList.contains('on')){cerrarCalendario();return;}
      if(document.getElementById('reader').classList.contains('on')){cerrarLector();return;}
      if(!document.getElementById('scHome').classList.contains('on')){pintarHome();show('scHome');return;}
      AppPlugin.minimizeApp();
    });
  }
  if(navigator.storage&&navigator.storage.persist){
    try{
      const ya=await navigator.storage.persisted();
      const ok=ya||await navigator.storage.persist();
      document.getElementById('persistState').textContent = ok
        ? 'Protegido. Android no borrará tu libro para liberar espacio.'
        : 'Sin protección. Instala la app en tu pantalla de inicio y exporta tu progreso de vez en cuando.';
    }catch(e){document.getElementById('persistState').textContent='No se pudo comprobar.';}
  }else{document.getElementById('persistState').textContent='Tu navegador no permite comprobarlo.';}

  if(Object.keys(S.books).length){
    try{await abrirLibro(S.currentBookId||Object.keys(S.books)[0]);}catch(e){}
    pintarHome();pintarSet();show('scHome');
  }else{show('scOnboard');}

  const esNativa=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
  if(!esNativa&&'serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
})();
