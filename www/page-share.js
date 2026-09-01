// @ts-check

(function(root){
  const DEFAULT_MAX_SIDE=4096;
  const DEFAULT_MAX_PIXELS=12000000;
  const DEFAULT_DENSITY_MULTIPLIER=2;
  const CHUNK_BYTES=192*1024;

  function positive(value,fallback){
    value=Number(value);
    return Number.isFinite(value)&&value>0?value:fallback;
  }

  function calculateRenderSize(baseWidth,baseHeight,displayWidth,deviceDensity,
    densityMultiplier=DEFAULT_DENSITY_MULTIPLIER,maxSide=DEFAULT_MAX_SIDE,maxPixels=DEFAULT_MAX_PIXELS){
    baseWidth=positive(baseWidth,1);baseHeight=positive(baseHeight,1);
    displayWidth=positive(displayWidth,baseWidth);
    deviceDensity=positive(deviceDensity,1);
    densityMultiplier=positive(densityMultiplier,DEFAULT_DENSITY_MULTIPLIER);
    maxSide=Math.max(1,Math.floor(positive(maxSide,DEFAULT_MAX_SIDE)));
    maxPixels=Math.max(1,Math.floor(positive(maxPixels,DEFAULT_MAX_PIXELS)));

    let scale=(displayWidth/baseWidth)*deviceDensity*densityMultiplier;
    let width=baseWidth*scale,height=baseHeight*scale;
    const downscale=Math.min(1,maxSide/width,maxSide/height,Math.sqrt(maxPixels/(width*height)));
    scale*=downscale;width=baseWidth*scale;height=baseHeight*scale;

    return{
      width:Math.max(1,Math.min(maxSide,Math.round(width))),
      height:Math.max(1,Math.min(maxSide,Math.round(height))),
      scale
    };
  }

  function canvasToPng(canvas){return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se pudo crear el PNG.')),'image/png');
  });}

  async function renderPageToPng(page,options){
    const base=page.getViewport({scale:1});
    const size=calculateRenderSize(base.width,base.height,options.displayWidth,options.deviceDensity,
      options.densityMultiplier,options.maxSide,options.maxPixels);
    const viewport=page.getViewport({scale:size.scale});
    const canvas=document.createElement('canvas');
    canvas.width=size.width;canvas.height=size.height;
    const context=canvas.getContext('2d',{alpha:false});
    if(!context){canvas.width=0;canvas.height=0;throw new Error('Canvas no disponible.');}
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    try{
      await page.render({canvasContext:context,viewport}).promise;
      const blob=await canvasToPng(canvas);
      return{blob,width:canvas.width,height:canvas.height};
    }finally{
      canvas.width=0;canvas.height=0;
      if(page&&page.cleanup)page.cleanup();
    }
  }

  function bytesToBase64(bytes){
    let binary='';
    const step=0x8000;
    for(let i=0;i<bytes.length;i+=step){
      binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+step,bytes.length)));
    }
    return btoa(binary);
  }

  async function appendBlob(plugin,blob){
    for(let offset=0;offset<blob.size;offset+=CHUNK_BYTES){
      const buffer=await blob.slice(offset,Math.min(offset+CHUNK_BYTES,blob.size)).arrayBuffer();
      await plugin.append({data:bytesToBase64(new Uint8Array(buffer))});
    }
  }

  root.AscuaPageShare={
    DEFAULT_DENSITY_MULTIPLIER,
    DEFAULT_MAX_PIXELS,
    DEFAULT_MAX_SIDE,
    appendBlob,
    calculateRenderSize,
    renderPageToPng
  };
})(typeof window!=='undefined'?window:globalThis);
