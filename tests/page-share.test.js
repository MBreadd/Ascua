const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={window:{},globalThis:{},Number,Math};
vm.runInNewContext(fs.readFileSync('www/page-share.js','utf8'),context);
const share=context.window.AscuaPageShare;

test('renderiza a dos veces la densidad física y no al tamaño visible',()=>{
  const result=share.calculateRenderSize(600,800,360,3);
  assert.deepEqual({width:result.width,height:result.height},{width:2160,height:2880});
});

test('limita una página vertical a 4096 px y conserva su proporción',()=>{
  const result=share.calculateRenderSize(600,1200,900,4);
  assert.equal(result.height,4096);
  assert.equal(result.width,2048);
});

test('limita también el total de píxeles de una página cuadrada',()=>{
  const result=share.calculateRenderSize(1000,1000,1000,4);
  assert.ok(result.width<=4096&&result.height<=4096);
  assert.ok(result.width*result.height<=12000000);
  assert.ok(Math.abs(result.width-result.height)<=1);
});

test('aplica los mismos límites a páginas horizontales',()=>{
  const result=share.calculateRenderSize(1600,900,1200,4,3);
  assert.ok(result.width<=4096&&result.height<=4096);
  assert.ok(result.width*result.height<=12000000);
  assert.ok(result.width>result.height);
});
