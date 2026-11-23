import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../check_repetition.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'novelist-repetition-'));
try{
  const long='修道院落边的银杏树下埋着一枚无人知晓的铜钥匙。'.repeat(5);
  fs.writeFileSync(path.join(root,'ch1.md'),'# 第一章\n\n'+long+'\n');
  fs.writeFileSync(path.join(root,'ch2.md'),'# 第二章\n\n'+long+'\n');
  fs.writeFileSync(path.join(root,'02-写作计划.json'),JSON.stringify({chapters:[{chapterNumber:1,filePath:'ch1.md'},{chapterNumber:2,filePath:'ch2.md'}]}));
  const r=spawnSync(process.execPath,[script,root,'--json'],{encoding:'utf8'});
  assert.equal(r.status,1);
  assert.equal(JSON.parse(r.stdout).findings[0].type,'DUPLICATE_PARAGRAPH');
  console.log('PASS repetition scanner: 2 assertions');
}finally{fs.rmSync(root,{recursive:true,force:true});}
