/** Optional checks of explicitly entered integers, never parsing narrative prose.
 * The agent must cite the source in the ledger and decide what is materially critical.
 */
export function structuredChecks(ledger,upto){
  if(ledger.r3Checks===undefined)return [];
  if(!Array.isArray(ledger.r3Checks))throw new Error('R3_STRUCTURED_CHECKS_INVALID');
  const seen=new Set(),issues=[];
  for(const c of ledger.r3Checks){
    if(!c||typeof c.id!=='string'||!c.id.trim()||seen.has(c.id)||!Number.isSafeInteger(c.chapter)||
      c.chapter<1||!['quantity_balance','chronology'].includes(c.kind)||
      !['hard','advisory'].includes(c.impact)||typeof c.quote!=='string'||!c.quote.trim())
      throw new Error('R3_STRUCTURED_CHECK_INVALID');
    seen.add(c.id);
    if(c.chapter>upto)continue;
    let mismatch=false;
    if(c.kind==='quantity_balance'){
      // Express all values in the same smallest integer unit, e.g. copper coins.
      if(typeof c.unit!=='string'||!c.unit.trim()||!Number.isSafeInteger(c.opening)||
        !Number.isSafeInteger(c.closing)||!Array.isArray(c.deltas)||!c.deltas.every(Number.isSafeInteger))
        throw new Error('R3_QUANTITY_CHECK_INVALID_'+c.id);
      mismatch=BigInt(c.opening)+c.deltas.reduce((a,b)=>a+BigInt(b),0n)!==BigInt(c.closing);
    }else{
      const valid=t=>t&&Number.isSafeInteger(t.day)&&Number.isSafeInteger(t.minuteOfDay)&&
        t.minuteOfDay>=0&&t.minuteOfDay<1440;
      if(!valid(c.earlier)||!valid(c.later)||!['before','not_after'].includes(c.relation))
        throw new Error('R3_CHRONOLOGY_CHECK_INVALID_'+c.id);
      const instant=t=>BigInt(t.day)*1440n+BigInt(t.minuteOfDay);
      mismatch=c.relation==='before'?instant(c.earlier)>=instant(c.later):instant(c.earlier)>instant(c.later);
    }
    if(mismatch)issues.push({code:'R3_STRUCTURED_'+c.kind.toUpperCase()+'_MISMATCH',
      id:c.id,chapter:c.chapter,impact:c.impact,quote:c.quote,
      note:'仅校验显式结构化输入；原文语义、单位选取及因果仍须编辑判断。'});
  }
  return issues;
}
