const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={window:{},globalThis:{},Object,Array,Set,Number,String,Math};
vm.runInNewContext(fs.readFileSync('www/library.js','utf8'),context);
const library=context.window.AscuaLibrary;

test('normaliza páginas guardadas sin duplicados y en orden',()=>{
  assert.deepEqual([...library.normalizeChecks([9,'3',3,0,14],10)],[3,9]);
});

test('cada libro antiguo recibe portada ligera y lista de páginas',()=>{
  const book=library.normalizeBook({id:'uno',name:'Libro'},'uno');
  assert.ok(library.COVERS.includes(book.cover));
  assert.deepEqual([...book.checks],[]);
  assert.equal(book.coverPage,1);
});

test('limita la página de portada al tamaño del libro',()=>{
  assert.equal(library.normalizeBook({coverPage:500,totalPages:120},'uno').coverPage,120);
  assert.equal(library.normalizeBook({coverPage:-4,totalPages:120},'uno').coverPage,1);
});

test('marcar y desmarcar una página conserva las demás',()=>{
  const added=library.toggleCheck([2,8],5,20);
  assert.equal(added.added,true);
  assert.deepEqual([...added.checks],[2,5,8]);
  const removed=library.toggleCheck(added.checks,5,20);
  assert.equal(removed.added,false);
  assert.deepEqual([...removed.checks],[2,8]);
});

test('calcula la fecha con páginas restantes divididas entre la meta diaria',()=>{
  const result=library.estimateFinish(100,40,10,'2026-08-30');
  assert.deepEqual({...result},{remaining:60,rate:10,days:6,finishDate:'2026-09-05'});
});

test('redondea hacia arriba cuando queda una fracción de día',()=>{
  const result=library.estimateFinish(101,40,10,'2026-08-30');
  assert.equal(result.days,7);
  assert.equal(result.finishDate,'2026-09-06');
});

test('un libro terminado necesita cero días adicionales',()=>{
  const result=library.estimateFinish(80,80,10,'2026-08-30');
  assert.deepEqual({...result},{remaining:0,rate:10,days:0,finishDate:'2026-08-30'});
});
