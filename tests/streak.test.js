const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={window:{},Date,Set,Object,Number,globalThis:{}};
vm.runInNewContext(fs.readFileSync('www/streak.js','utf8'),context);
const streak=context.window.AscuaStreak;

function entry(pages,seconds=180,goal=10){
  return {goal,seconds,books:{book:{startPage:1,maxPage:1+pages}}};
}

function analyze(history,today='2026-08-30'){
  return streak.analyze(history,{startedAt:'2026-08-01',today,defaultGoal:10,minSeconds:120,gracePerMonth:2});
}

test('cuatro días cumplidos, incluido hoy, producen una racha de cuatro',()=>{
  const history={
    '2026-08-27':entry(10),'2026-08-28':entry(12),
    '2026-08-29':entry(10),'2026-08-30':entry(15)
  };
  const result=analyze(history);
  assert.equal(result.current,4);
  assert.deepEqual([...result.fulfilled],Object.keys(history));
});

test('una lectura parcial de hoy no suma ni rompe la racha anterior',()=>{
  const result=analyze({'2026-08-29':entry(10),'2026-08-30':entry(1)});
  assert.equal(result.current,1);
  assert.equal(result.fulfilled.has('2026-08-30'),false);
});

test('un día perdido reciente usa gracia y conserva la racha',()=>{
  const result=analyze({'2026-08-27':entry(10),'2026-08-28':entry(10)});
  assert.equal(result.current,2);
  assert.equal(result.grace.has('2026-08-29'),true);
  assert.equal(result.graceByMonth['2026-08'],1);
});

test('una tercera falta mensual rompe la racha y no se marca como gracia',()=>{
  const result=analyze({'2026-08-26':entry(10)},'2026-08-30');
  assert.equal(result.current,0);
  assert.deepEqual([...result.grace],['2026-08-27','2026-08-28']);
  assert.equal(result.grace.has('2026-08-29'),false);
});

test('la meta guardada en cada día no cambia al modificar la meta actual',()=>{
  const result=streak.analyze({'2026-08-30':entry(5,180,5)},
    {startedAt:'2026-08-30',today:'2026-08-30',defaultGoal:20,minSeconds:120,gracePerMonth:2});
  assert.equal(result.current,1);
});
