#!/usr/bin/env node
/**
 * P0-02: R3 strict Markdown sections. Parsing and fingerprinting ONLY.
 * No approval, checkpoint, or R3 writing gate is granted by this module.
 * Core sections are immutable once later approved; rolling sections are not.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {projectRoot, readPlan, safeFile, sha256} from './v3_common.mjs';
import {hasR3Namespace, validR3Namespace} from './r3_state_common.mjs';

export const R3_SECTION_SPEC = Object.freeze({
  '00-人物档案.md': Object.freeze({core:'## 核心人设', rolling:'## 动态状态与远期弧线'}),
  '01-大纲.md': Object.freeze({core:'## 核心契约', rolling:'## 滚动卷纲', volumes:true}),
  '03-文风基准.md': Object.freeze({core:'## 文风指纹', rolling:'## 本书校准段落'})
});

const error = code => { throw new Error(code); };
const hasPayload = text => text.trim().length>0;

/**
 * Preserve source text bytes (including CRLF). Do not normalize before hashing.
 * Markdown fences may contain heading-like text, but may not be unterminated.
 * Raw HTML comments are rejected because a heading inside one might be hidden
 * from Markdown readers while being treated as a structural boundary.
 */
function scanLines(source) {
  const lines=source.match(/[^\n]*(?:\n|$)/g).filter(Boolean);
  const found=[];
  let offset=0, fence=null;
  for(let i=0;i<lines.length;i++){
    const raw=lines[i], line=raw.replace(/\r?\n$/,'');
    if(line.includes('<!--')||line.includes('-->'))error('R3_HTML_COMMENT_NOT_ALLOWED');
    const f=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(f){
      const marker=f[1];
      if(!fence){
        if(marker[0]==='`' && f[2].includes('`'))error('R3_INVALID_FENCE');
        fence={char:marker[0],width:marker.length};
      }else if(marker[0]===fence.char && marker.length>=fence.width && !f[2].trim()){
        fence=null;
      }
    }else if(!fence){
      const h=/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/.exec(line);
      if(h)found.push({level:h[1].length,raw:line,offset,line:i+1});
    }
    offset+=raw.length;
  }
  if(fence)error('R3_UNCLOSED_CODE_FENCE');
  return {headings:found,lines};
}

function assertHeaderTitle(source, headings, core) {
  if(headings.length<3||headings[0].level!==1)error('R3_TOP_TITLE_MISSING');
  const title=headings[0];
  if(!/^# [^#\s].*$/.test(title.raw))error('R3_TOP_TITLE_INVALID');
  if(source.slice(0,title.offset).trim())error('R3_PREAMBLE_NOT_ALLOWED');
  const anchors=headings.filter(h=>h.level===2);
  if(anchors.length!==2)error('R3_SECTION_ANCHORS_INVALID');
  if(anchors[0].raw!==core)error('R3_CORE_ANCHOR_MISSING_OR_ORDER');
  return anchors;
}

/**
 * All headings are validated, not just the two expected markers. This
 * prevents an extra H2 or malformed volume H3 from silently being swallowed.
 */
export function splitR3Markdown(filename, source) {
  const spec=R3_SECTION_SPEC[filename];
  if(!spec)error('R3_UNSUPPORTED_PLAN_FILE');
  if(typeof source!=='string'||!source.trim())error('R3_EMPTY_PLAN_FILE');
  const {headings,lines}=scanLines(source);
  const anchors=assertHeaderTitle(source,headings,spec.core);
  const [coreAnchor, rollingAnchor]=anchors;
  if(rollingAnchor.raw!==spec.rolling)error('R3_ROLLING_ANCHOR_MISSING_OR_ORDER');
  if(rollingAnchor.offset<=coreAnchor.offset)error('R3_SECTION_ORDER_INVALID');
  if(headings.some(h=>h.level===1 && h!==headings[0]))error('R3_EXTRA_TOP_TITLE');
  if(headings.some(h=>h.level===2 && h!==coreAnchor && h!==rollingAnchor))
    error('R3_EXTRA_H2');
  if(headings.some(h=>h.level>=1 && h.offset>headings[0].offset && h.offset<coreAnchor.offset))
    error('R3_UNEXPECTED_HEADING_BEFORE_CORE');

  const coreStart=coreAnchor.offset+lines[coreAnchor.line-1].length;
  if(!hasPayload(source.slice(coreStart,rollingAnchor.offset)))error('R3_CORE_CONTENT_EMPTY');
  const core=source.slice(0,rollingAnchor.offset);
  const rolling=source.slice(rollingAnchor.offset);
  const result={filename,core,rolling,coreSha256:sha256(Buffer.from(core))};
  if(!spec.volumes)return {...result,volumes:[]};

  const rollHeadings=headings.filter(h=>h.offset>rollingAnchor.offset);
  // H3 headings are reserved exclusively for volume boundaries in rolling
  // outline. A volume may use H4-H6 for arcs/scenes.
  const volumes=rollHeadings.filter(h=>h.level===3);
  if(!volumes.length)error('R3_VOLUMES_MISSING');
  if(rollHeadings.some(h=>h.level<3))error('R3_INVALID_ROLLING_HEADING');
  const first=volumes[0].offset;
  if(source.slice(rollingAnchor.offset+lines[rollingAnchor.line-1].length,first).trim())
    error('R3_ROLLING_ORPHAN_CONTENT');
  for(let i=0;i<volumes.length;i++){
    if(volumes[i].raw!==`### 第${i+1}卷`)error('R3_VOLUME_NUMBER_OR_HEADING_INVALID');
  }
  const volumeParts=volumes.map((v,i)=>{
    const end=i+1<volumes.length?volumes[i+1].offset:source.length;
    const body=source.slice(v.offset+lines[v.line-1].length,end);
    if(!hasPayload(body))error('R3_VOLUME_CONTENT_EMPTY');
    const text=source.slice(v.offset,end);
    return {volId:i+1,text,sha256:sha256(Buffer.from(text))};
  });
  return {...result,volumes:volumeParts};
}

/** Pure P0-02 fingerprints; not approval or checkpoint verification. */
export function inspectR3Plan(root) {
  const plan=readPlan(root);
  if(!hasR3Namespace(plan)||!validR3Namespace(plan.v3.r3))error('R3_NOT_ENABLED');
  const sections={};
  for(const filename of Object.keys(R3_SECTION_SPEC)){
    const file=safeFile(root,filename);
    if(!file)error('R3_PLAN_FILE_MISSING_OR_UNSAFE');
    sections[filename]=splitR3Markdown(filename,fs.readFileSync(file,'utf8'));
  }
  return sections;
}

const invoked=process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1];
if(invoked){
  const [folder,...opts]=process.argv.slice(2);
  try {
    if(!folder||opts.some(x=>x!=='--json'))error('R3_SECTIONS_USAGE');
    const sections=inspectR3Plan(projectRoot(folder));
    const files=Object.fromEntries(Object.entries(sections).map(([name,s])=>
      [name,{coreSha256:s.coreSha256,rollingChars:s.rolling.length,
        volumes:s.volumes.map(v=>({volId:v.volId,sha256:v.sha256}))}]));
    console.log(JSON.stringify({status:'ready',literaryStatus:'UNVERIFIED',files},null,2));
  }catch(e){
    console.log(JSON.stringify({status:'error',error:e.message}));
    process.exitCode=2;
  }
}
