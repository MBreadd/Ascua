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

  root.AscuaLibrary=Object.freeze({COVERS,coverFor,normalizeChecks,normalizeBook,toggleCheck});
})(typeof window!=='undefined'?window:globalThis);
