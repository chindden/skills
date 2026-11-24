/**
 * Deterministic zero-dependency line diff for R3 snapshot review.
 * Use exact original bytes, including newline changes; large files degrade
 * to a deterministic prefix/suffix replacement instead of quadratic memory.
 */
import {sha256} from './v3_common.mjs';
const split=s=>s.match(/[^\n]*(?:\n|$)/g).filter(Boolean);
export function textDiff(before,after,filename='artifact'){
  if(before===after)return '';
  const old=split(before),cur=split(after);
  let left=0;
  while(left<old.length&&left<cur.length&&old[left]===cur[left])left++;
  let right=0;
  while(right<old.length-left&&right<cur.length-left &&
    old[old.length-right-1]===cur[cur.length-right-1])right++;
  const a=old.slice(left,old.length-right),b=cur.slice(left,cur.length-right);
  let changes=[];
  if((a.length+1)*(b.length+1)>1000000){
    changes=[...a.map(x=>'-'+x.replace(/\r?\n$/,'')),...b.map(x=>'+'+x.replace(/\r?\n$/,''))];
  }else{
    const dp=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
    for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)
      dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
    let i=0,j=0;
    while(i<a.length||j<b.length){
      if(i<a.length&&j<b.length&&a[i]===b[j]){changes.push(' '+a[i].replace(/\r?\n$/,''));i++;j++}
      else if(j<b.length&&(i===a.length||dp[i][j+1]>=dp[i+1][j])){changes.push('+'+b[j].replace(/\r?\n$/,''));j++}
      else{changes.push('-'+a[i].replace(/\r?\n$/,''));i++}
    }
  }
  return '--- a/'+filename+'\n+++ b/'+filename+'\n@@ before-line '+(left+1)+', after-line '+(left+1)+' @@\n'+
    changes.join('\n')+'\n# before-sha256 '+sha256(Buffer.from(before))+'\n# after-sha256 '+sha256(Buffer.from(after))+'\n';
}
export function snapshotDiff(oldFiles,newFiles){
  const names=[...new Set([...Object.keys(oldFiles||{}),...Object.keys(newFiles||{})])].sort();
  const pieces=names.map(name=>textDiff(oldFiles?.[name]??'',newFiles?.[name]??'',name)).filter(Boolean);
  return pieces.length?pieces.join('\n'):'(No textual changes)\n';
}
