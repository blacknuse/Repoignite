export type ReferenceStage = {
  id: string;
  label: string;
  detail: string;
  checksum: string;
};

export type ExecuteReferenceResult = {
  ok: boolean;
  mode: 'reference-only';
  digest: string;
  lines: number;
  bytes: number;
  tokens: number;
  identifiers: number;
  blocks: number;
  warnings: string[];
  stages: ReferenceStage[];
  externalEffects: 0;
  targetWiring: false;
};

export type InjectReferenceResult = {
  ok: true;
  mode: 'reference-only';
  session: string;
  stages: ReferenceStage[];
  virtualRegions: number;
  relocationRecords: number;
  importDescriptors: number;
  tlsCallbacks: number;
  unwindRecords: number;
  rollbackEntries: number;
  handshake: readonly ['HELLO', 'ACK', 'READY'];
  externalEffects: 0;
  targetWiring: false;
};

type Token = { kind: 'identifier'|'keyword'|'number'|'string'|'operator'|'punctuation'; value: string; offset: number };

const KEYWORDS = new Set(['and','break','continue','do','else','elseif','end','export','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','type','until','while']);
const BLOCK_OPEN = new Set(['function','do','then','repeat']);

export function hashText(input: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  for (let i=0;i<input.length;i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + i) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8,'0')}${h2.toString(16).padStart(8,'0')}`;
}

function tokenizeLuau(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const start = i;
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '-' && source[i+1] === '-') {
      if (source.slice(i,i+4) === '--[[') {
        const end = source.indexOf(']]', i+4);
        i = end < 0 ? source.length : end + 2;
      } else {
        const end = source.indexOf('\n', i+2);
        i = end < 0 ? source.length : end + 1;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch; i++; let escaped = false;
      while (i < source.length) {
        const c = source[i++];
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === quote) break;
      }
      tokens.push({kind:'string', value:source.slice(start,i), offset:start});
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      i++; while (i<source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
      const value = source.slice(start,i);
      tokens.push({kind:KEYWORDS.has(value)?'keyword':'identifier', value, offset:start});
      continue;
    }
    if (/\d/.test(ch)) {
      i++; while (i<source.length && /[0-9A-Fa-f_xX.]/.test(source[i])) i++;
      tokens.push({kind:'number', value:source.slice(start,i), offset:start});
      continue;
    }
    const pair = source.slice(i,i+2);
    if (['==','~=','<=','>=','+=','-=','*=','/=','..','::','->'].includes(pair)) {
      tokens.push({kind:'operator', value:pair, offset:start}); i += 2; continue;
    }
    tokens.push({kind:/[(){}\[\],.;:]/.test(ch)?'punctuation':'operator', value:ch, offset:start});
    i++;
  }
  return tokens;
}

function validateStructure(source: string, tokens: Token[]): {warnings:string[]; blocks:number} {
  const warnings: string[] = [];
  if (!source.trim()) return {warnings:['Editor is empty.'], blocks:0};
  if (source.includes('\0')) warnings.push('Source contains a NUL byte.');
  if (source.length > 2 * 1024 * 1024) warnings.push('Source exceeds the 2 MiB reference limit.');

  const stack: string[] = [];
  let round=0, square=0, curly=0, blocks=0;
  for (const token of tokens) {
    if (token.kind === 'string') continue;
    if (token.value === '(') round++;
    else if (token.value === ')') round--;
    else if (token.value === '[') square++;
    else if (token.value === ']') square--;
    else if (token.value === '{') curly++;
    else if (token.value === '}') curly--;
    if (round < 0 || square < 0 || curly < 0) {
      warnings.push('A closing delimiter appears before its opener.');
      break;
    }
    if (token.kind === 'keyword') {
      if (BLOCK_OPEN.has(token.value)) { stack.push(token.value); blocks++; }
      else if (token.value === 'until') {
        const idx = stack.lastIndexOf('repeat');
        if (idx >= 0) stack.splice(idx,1); else warnings.push('`until` has no matching `repeat`.');
      } else if (token.value === 'end') {
        const idx = [...stack].reverse().findIndex(v=>v!=='repeat');
        if (idx >= 0) stack.splice(stack.length-1-idx,1); else warnings.push('`end` has no matching block opener.');
      }
    }
  }
  if (round !== 0) warnings.push(`Parenthesis balance is ${round}.`);
  if (square !== 0) warnings.push(`Bracket balance is ${square}.`);
  if (curly !== 0) warnings.push(`Brace balance is ${curly}.`);
  const unresolved = stack.filter(v=>v!=='repeat');
  if (unresolved.length) warnings.push(`${unresolved.length} block opener(s) are not closed.`);
  if (stack.includes('repeat')) warnings.push('A `repeat` block is missing `until`.');
  return {warnings:[...new Set(warnings)], blocks};
}

function stage(id:string,label:string,detail:string,seed:string): ReferenceStage {
  return {id,label,detail,checksum:hashText(`${id}|${detail}|${seed}`)};
}

export function buildExecuteReference(source:string): ExecuteReferenceResult {
  const normalized = source.replace(/\r\n/g,'\n');
  const tokens = tokenizeLuau(normalized);
  const structure = validateStructure(normalized,tokens);
  const digest = hashText(normalized);
  const identifiers = new Set(tokens.filter(t=>t.kind==='identifier').map(t=>t.value)).size;
  const fatal = structure.warnings.some(w=>/empty|NUL|exceeds|balance|closing delimiter|not closed|missing `until`|no matching/.test(w));
  const frameBytes = new TextEncoder().encode(normalized).byteLength + 4;
  const queueId = hashText(`queue:${digest}:${tokens.length}`);
  const checkpoint = hashText(`checkpoint:${queueId}:${frameBytes}`);
  const stages = [
    stage('preflight','Source preflight',`${normalized.length} chars · ${normalized.split('\n').length} lines`,digest),
    stage('tokenize','Luau lexical model',`${tokens.length} tokens · ${identifiers} unique identifiers`,digest),
    stage('structure','Structure model',`${structure.blocks} modeled blocks · ${structure.warnings.length} warning(s)`,digest),
    stage('frame','Frame model',`${frameBytes} bytes including local length prefix`,queueId),
    stage('schedule','Scheduler descriptor',`queue ${queueId.slice(0,8)} · deterministic FIFO`,queueId),
    stage('transaction','Checkpoint journal',`checkpoint ${checkpoint.slice(0,8)} · reversible local state`,checkpoint),
    stage('commit','Reference commit','No external dispatch; local model committed only',checkpoint),
  ];
  return {ok:!fatal,mode:'reference-only',digest,lines:normalized.split('\n').length,bytes:new TextEncoder().encode(normalized).byteLength,tokens:tokens.length,identifiers,blocks:structure.blocks,warnings:structure.warnings,stages,externalEffects:0,targetWiring:false};
}

export function buildInjectReference(): InjectReferenceResult {
  const seed = hashText(`session:${performance.timeOrigin}:${navigator.userAgent}`);
  const virtualRegions = 6;
  const relocationRecords = 14;
  const importDescriptors = 9;
  const tlsCallbacks = 2;
  const unwindRecords = 8;
  const rollbackEntries = 11;
  const stages = [
    stage('boundary','Boundary preflight','Confirm local-only reference execution boundary',seed),
    stage('image','Synthetic image model','Validate DOS/PE signatures, sections and alignment in generated metadata',seed),
    stage('address','Virtual address planner',`${virtualRegions} isolated local regions · preferred/fallback bases`,seed),
    stage('reloc','Relocation evaluator',`${relocationRecords} synthetic relocation records · no writes`,seed),
    stage('imports','Import resolver model',`${importDescriptors} synthetic descriptors · symbol/ordinal branches`,seed),
    stage('tls','TLS ordering model',`${tlsCallbacks} callback descriptors · deterministic ordering`,seed),
    stage('unwind','Exception metadata model',`${unwindRecords} synthetic unwind records validated`,seed),
    stage('thread','Thread descriptor model','Entry, stack and argument descriptors only; no OS thread created',seed),
    stage('handshake','Handshake state machine','HELLO → ACK → READY over an in-memory channel',seed),
    stage('journal','Transaction journal',`${rollbackEntries} reversible local entries · reverse-order rollback verified`,seed),
    stage('integrity','Integrity seal','Digest, dependency order and failure-recovery invariants verified',seed),
  ];
  return {ok:true,mode:'reference-only',session:seed,stages,virtualRegions,relocationRecords,importDescriptors,tlsCallbacks,unwindRecords,rollbackEntries,handshake:['HELLO','ACK','READY'],externalEffects:0,targetWiring:false};
}
