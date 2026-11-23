import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
export function projectRoot(input) {
  const root = fs.realpathSync(path.resolve(input));
  if (!fs.statSync(root).isDirectory()) throw new Error('PROJECT_NOT_DIRECTORY');
  return root;
}
export function safeFile(root, relative) {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) return null;
  const candidate = path.resolve(root, relative);
  const rel = path.relative(root, candidate);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  try {
    const real = fs.realpathSync(candidate);
    const realRel = path.relative(root, real);
    if (!realRel || realRel === '..' || realRel.startsWith('..' + path.sep) || path.isAbsolute(realRel)) return null;
    return fs.statSync(real).isFile() ? real : null;
  } catch { return null; }
}
export function readJsonFile(root, relative) {
  const file = safeFile(root, relative);
  if (!file) throw new Error('INVALID_PATH_OR_MISSING_FILE: ' + relative);
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
export function readPlan(root) {
  const plan = readJsonFile(root, '02-写作计划.json');
  if (!Array.isArray(plan.chapters) || !plan.chapters.length) throw new Error('INVALID_CHAPTER_PLAN');
  const seen = new Set();
  for (const c of plan.chapters) {
    if (!Number.isSafeInteger(c?.chapterNumber) || c.chapterNumber < 1 ||
        seen.has(c.chapterNumber) || typeof c.filePath !== 'string' || !c.filePath.trim()) {
      throw new Error('INVALID_CHAPTER_ENTRY');
    }
    seen.add(c.chapterNumber);
  }
  return plan;
}
export function atomicWritePlan(root, plan) {
  const file = path.join(root, '02-写作计划.json');
  const temp = file + '.v3-tmp-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
  try { fs.renameSync(temp, file); } catch (e) { fs.rmSync(temp, {force: true}); throw e; }
}
export function pilotHashes(root, plan) {
  const hashes = {};
  for (let n = 1; n <= 3; n++) {
    const c = plan.chapters.find(x => x.chapterNumber === n);
    if (!c || c.status !== 'completed' || c.wordCountPass !== true) {
      throw new Error('PILOT_CHAPTER_INCOMPLETE_' + n);
    }
    const p = safeFile(root, c.filePath);
    if (!p) throw new Error('PILOT_FILE_MISSING_OR_UNSAFE_' + n);
    hashes[String(n)] = sha256(fs.readFileSync(p));
  }
  return hashes;
}
export function sameHashes(a, b) {
  return !!a && !!b && [1, 2, 3].every(n => typeof a[String(n)] === 'string' &&
    a[String(n)] === b[String(n)] && /^[a-f0-9]{64}$/.test(a[String(n)]));
}
export function structuredReportValid(report, revision, hashes) {
  const errors = [];
  if (report?.schemaVersion !== 1 || report.revision !== revision) errors.push('REVIEW_REVISION_MISMATCH');
  if (!sameHashes(report?.manuscriptHashes, hashes)) errors.push('REVIEW_HASH_MISMATCH');
  if (!['independent_agent', 'human'].includes(report?.reviewer?.kind) ||
      typeof report?.reviewer?.runId !== 'string' || !report.reviewer.runId.trim()) errors.push('REVIEWER_MISSING');
  if (!['pass_candidate', 'revise', 'reject'].includes(report?.decision)) errors.push('INVALID_REVIEW_DECISION');
  if (typeof report?.summary !== 'string' || !report.summary.trim() ||
      !Array.isArray(report?.issues) || !Array.isArray(report?.strengths)) errors.push('INVALID_REVIEW_STRUCTURE');
  if (Array.isArray(report?.issues)) {
    const ids = new Set();
    for (const issue of report.issues) {
      if (typeof issue?.id !== 'string' || !issue.id.trim() || ids.has(issue.id) ||
          !['BLOCKER', 'MAJOR', 'MINOR'].includes(issue.severity) ||
          !['open', 'resolved', 'accepted'].includes(issue.status) ||
          !Number.isInteger(issue.chapter) || issue.chapter < 1 || issue.chapter > 3 ||
          typeof issue.quote !== 'string' || !issue.quote.trim() ||
          typeof issue.reason !== 'string' || !issue.reason.trim() ||
          typeof issue.suggestion !== 'string' || !issue.suggestion.trim() ||
          (issue.status === 'accepted' && (!issue.acceptanceReason || !issue.acceptanceReason.trim()))) {
        errors.push('INVALID_ISSUE'); break;
      }
      ids.add(issue.id);
    }
    if (report?.decision === 'pass_candidate' && report.issues.some(
      issue => issue.status === 'open' && ['BLOCKER', 'MAJOR'].includes(issue.severity)
    )) errors.push('UNRESOLVED_MAJOR_ISSUES');
    if (report?.decision === 'pass_candidate' && report.issues.some(
      issue => issue.status === 'accepted' && issue.severity === 'BLOCKER'
    )) errors.push('BLOCKER_CANNOT_BE_ACCEPTED');
  }
  return errors;
}
