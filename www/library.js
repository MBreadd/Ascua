// @ts-check

(function(root){
  'use strict';

  const COVERS=Object.freeze(['ascua','bosque','oceano','ciruela','arena','noche']);

  /** @param {string} seed */
  function coverFor(seed){
    let hash=0;
    for(const char of String(seed||'libro'))hash=((hash<<5)-hash+char.charCodeAt(0))|0;
    return COVERS[Math.abs(hash)%COVERS.length];
  }

  /** @param {any} value @param {number} [totalPages] */
  function normalizeChecks(value,totalPages){
    const max=Number(totalPages)||Number.MAX_SAFE_INTEGER;
    return [...new Set((Array.isArray(value)?value:[])
      .map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=max))].sort((a,b)=>a-b);
  }

  /** @param {any} book @param {string} [seed] */
  function normalizeBook(book,seed){
    const normalized=Object.assign({},book||{});
    normalized.cover=COVERS.includes(normalized.cover)?normalized.cover:coverFor(seed||normalized.id||normalized.name);
    normalized.checks=normalizeChecks(normalized.checks,normalized.totalPages);
    const max=Number(normalized.totalPages)||Number.MAX_SAFE_INTEGER;
    normalized.coverPage=Math.max(1,Math.min(max,Math.floor(Number(normalized.coverPage)||1)));
    return normalized;
  }

  /** @param {any} value @param {number} page @param {number} [totalPages] */
  function toggleCheck(value,page,totalPages){
    const checks=normalizeChecks(value,totalPages);
    page=Math.round(Number(page));
    const index=checks.indexOf(page);
    if(index>=0){checks.splice(index,1);return{checks,added:false};}
    if(page>=1&&(!totalPages||page<=totalPages))checks.push(page);
    checks.sort((a,b)=>a-b);
    return{checks,added:true};
  }

  /** @param {string} key @param {number} days */
  function addDays(key,days){
    const p=String(key).split('-').map(Number);
    const date=new Date(Date.UTC(p[0],p[1]-1,p[2]+days));
    return date.toISOString().slice(0,10);
  }

  /**
   * @param {number} totalPages
   * @param {number} currentPage
   * @param {number} pagesPerDay
   * @param {string} today
   */
  function estimateFinish(totalPages,currentPage,pagesPerDay,today){
    const total=Math.max(0,Math.floor(Number(totalPages)||0));
    if(!total||!/^\d{4}-\d{2}-\d{2}$/.test(today))return null;
    const current=Math.max(1,Math.min(total,Math.floor(Number(currentPage)||1)));
    const rate=Math.max(1,Math.floor(Number(pagesPerDay)||1));
    const remaining=Math.max(0,total-current);
    const days=remaining?Math.ceil(remaining/rate):0;
    return{remaining,rate,days,finishDate:addDays(today,days)};
  }

  root.AscuaLibrary=Object.freeze({COVERS,coverFor,normalizeChecks,normalizeBook,toggleCheck,estimateFinish});
})(typeof window!=='undefined'?window:globalThis);
