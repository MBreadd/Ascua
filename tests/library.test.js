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
});

test('marcar y desmarcar una página conserva las demás',()=>{
  const added=library.toggleCheck([2,8],5,20);
  assert.equal(added.added,true);
  assert.deepEqual([...added.checks],[2,5,8]);
  const removed=library.toggleCheck(added.checks,5,20);
  assert.equal(removed.added,false);
  assert.deepEqual([...removed.checks],[2,8]);
});
