// @ts-check

(function(root){
  'use strict';

  /** @param {string} key @param {number} days */
  function addDays(key,days){
    const p=key.split('-').map(Number);
    const d=new Date(Date.UTC(p[0],p[1]-1,p[2]+days));
    return d.toISOString().slice(0,10);
  }

  /** @param {any} entry */
  function pages(entry){
    if(!entry||!entry.books)return 0;
    let total=0;
    for(const id in entry.books){
      const book=entry.books[id]||{};
      total+=Math.max(0,(Number(book.maxPage)||0)-(Number(book.startPage)||0));
    }
    return total;
  }

  /** @param {any} entry @param {number} defaultGoal @param {number} minSeconds */
  function completed(entry,defaultGoal,minSeconds){
    if(!entry)return false;
    const goal=Math.max(1,Number(entry.goal)||defaultGoal||1);
    return pages(entry)>=goal&&(Number(entry.seconds)||0)>=minSeconds;
  }

  /** @param {any} entry */
  function hasActivity(entry){
    return !!entry&&(pages(entry)>0||(Number(entry.seconds)||0)>0);
  }

  /**
   * Recorre la historia en orden cronológico. Los días de gracia solo se usan
   * cuando ya existe una racha activa, se conservan aunque la racha se rompa
   * después y nunca se aplica una falta al día de hoy antes de que termine.
   *
   * @param {Object<string,any>} history
   * @param {{startedAt:string,today:string,defaultGoal:number,minSeconds:number,gracePerMonth:number}} options
   */
  function analyze(history,options){
    const fulfilled=new Set();
    const grace=new Set();
    /** @type {Object<string,number>} */
    const graceByMonth={};
    const today=options.today;
    let key=/^\d{4}-\d{2}-\d{2}$/.test(options.startedAt||'')?options.startedAt:today;
    if(key>today)key=today;
    let current=0;

    for(let guard=0;key<=today&&guard<5000;guard++,key=addDays(key,1)){
      const entry=history[key];
      if(completed(entry,options.defaultGoal,options.minSeconds)){
        fulfilled.add(key);
        current++;
        continue;
      }
      if(key===today)continue;
      if(current===0)continue;

      const month=key.slice(0,7);
      const used=graceByMonth[month]||0;
      if(used<options.gracePerMonth){
        graceByMonth[month]=used+1;
        grace.add(key);
      }else{
        current=0;
      }
    }

    return {current,fulfilled,grace,graceByMonth};
  }

  root.AscuaStreak=Object.freeze({addDays,pages,completed,hasActivity,analyze});
})(typeof window!=='undefined'?window:globalThis);
