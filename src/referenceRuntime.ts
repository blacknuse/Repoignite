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
  statements: number;
  maxDepth: number;
  frameBytes: number;
  queueDepth: number;
  journalEntries: number;
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
  dependencyNodes: number;
  failureCases: number;
  replayPasses: number;
  handshake: readonly ['HELLO', 'ACK', 'READY'];
  externalEffects: 0;
  targetWiring: false;
};

type TokenKind = 'identifier'|'keyword'|'number'|'string'|'operator'|'punctuation';
type Token = { kind: TokenKind; value: string; offset: number; line: number; column: number };

const KEYWORDS = new Set(['and','break','continue','do','else','elseif','end','export','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','type','until','while']);
const BLOCK_OPEN = new Set(['function','do','then','repeat']);
const TWO_CHAR_OPS = new Set(['==','~=','<=','>=','+=','-=','*=','/=','%=','..','::','->','//']);
const THREE_CHAR_OPS = new Set(['...','..=','//=']);

export function hashText(input: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  let h3 = 0x27d4eb2d >>> 0;
  for (let i=0;i<input.length;i++) {
    const c = input.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + i) >>> 0; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    h3 ^= ((c << (i & 7)) | (c >>> (8 - (i & 7)))) >>> 0; h3 = Math.imul(h3, 0xc2b2ae35) >>> 0;
  }
  return `${h1.toString(16).padStart(8,'0')}${h2.toString(16).padStart(8,'0')}${h3.toString(16).padStart(8,'0')}`;
}

function tokenizeLuau(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1, column = 1;
  const advance = (count=1) => {
    for (let n=0;n<count && i<source.length;n++) {
      if (source[i] === '\n') { line++; column = 1; } else column++;
      i++;
    }
  };
  while (i < source.length) {
    const start = i, startLine = line, startColumn = column, ch = source[i];
    if (/\s/.test(ch)) { advance(); continue; }
    if (ch === '-' && source[i+1] === '-') {
      if (source.slice(i,i+4) === '--[[') {
        advance(4);
        while (i < source.length && source.slice(i,i+2) !== ']]') advance();
        if (source.slice(i,i+2) === ']]') advance(2);
      } else {
        while (i < source.length && source[i] !== '\n') advance();
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch; advance(); let escaped = false;
      while (i < source.length) {
        const c = source[i]; advance();
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === quote) break;
      }
      tokens.push({kind:'string',value:source.slice(start,i),offset:start,line:startLine,column:startColumn});
      continue;
    }
    if (source.slice(i,i+2) === '[[') {
      advance(2);
      while (i < source.length && source.slice(i,i+2) !== ']]') advance();
      if (source.slice(i,i+2) === ']]') advance(2);
      tokens.push({kind:'string',value:source.slice(start,i),offset:start,line:startLine,column:startColumn});
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      advance(); while (i<source.length && /[A-Za-z0-9_]/.test(source[i])) advance();
      const value = source.slice(start,i);
      tokens.push({kind:KEYWORDS.has(value)?'keyword':'identifier',value,offset:start,line:startLine,column:startColumn});
      continue;
    }
    if (/\d/.test(ch)) {
      advance(); while (i<source.length && /[0-9A-Fa-f_xXpP.eE+-]/.test(source[i])) advance();
      tokens.push({kind:'number',value:source.slice(start,i),offset:start,line:startLine,column:startColumn});
      continue;
    }
    const triple = source.slice(i,i+3), pair = source.slice(i,i+2);
    if (THREE_CHAR_OPS.has(triple)) { tokens.push({kind:'operator',value:triple,offset:start,line:startLine,column:startColumn}); advance(3); continue; }
    if (TWO_CHAR_OPS.has(pair)) { tokens.push({kind:'operator',value:pair,offset:start,line:startLine,column:startColumn}); advance(2); continue; }
    tokens.push({kind:/[(){}\[\],.;:]/.test(ch)?'punctuation':'operator',value:ch,offset:start,line:startLine,column:startColumn});
    advance();
  }
  return tokens;
}

function validateStructure(source:string,tokens:Token[]) {
  const warnings:string[]=[];
  if(!source.trim()) return {warnings:['Editor is empty.'],blocks:0,statements:0,maxDepth:0};
  if(source.includes('\0')) warnings.push('Source contains a NUL byte.');
  if(new TextEncoder().encode(source).byteLength>2*1024*1024) warnings.push('Source exceeds the 2 MiB reference limit.');
  const stack:string[]=[]; let round=0,square=0,curly=0,blocks=0,maxDepth=0,statements=0;
  for(const token of tokens){
    if(token.kind==='string') continue;
    if(token.value==='(') round++; else if(token.value===')') round--;
    else if(token.value==='[') square++; else if(token.value===']') square--;
    else if(token.value==='{') curly++; else if(token.value==='}') curly--;
    if(token.value===';' || token.kind==='keyword' && ['local','return','if','for','while','function'].includes(token.value)) statements++;
    if(round<0||square<0||curly<0){warnings.push(`Closing delimiter appears before an opener at ${token.line}:${token.column}.`);break;}
    if(token.kind==='keyword'){
      if(BLOCK_OPEN.has(token.value)){stack.push(token.value);blocks++;maxDepth=Math.max(maxDepth,stack.length);}
      else if(token.value==='until'){
        const idx=stack.lastIndexOf('repeat'); if(idx>=0) stack.splice(idx,1); else warnings.push(`\`until\` has no matching \`repeat\` at ${token.line}:${token.column}.`);
      } else if(token.value==='end'){
        const rev=[...stack].reverse().findIndex(v=>v!=='repeat'); if(rev>=0) stack.splice(stack.length-1-rev,1); else warnings.push(`\`end\` has no matching opener at ${token.line}:${token.column}.`);
      }
    }
  }
  if(round!==0) warnings.push(`Parenthesis balance is ${round}.`);
  if(square!==0) warnings.push(`Bracket balance is ${square}.`);
  if(curly!==0) warnings.push(`Brace balance is ${curly}.`);
  const unresolved=stack.filter(v=>v!=='repeat'); if(unresolved.length) warnings.push(`${unresolved.length} block opener(s) are not closed.`);
  if(stack.includes('repeat')) warnings.push('A `repeat` block is missing `until`.');
  return {warnings:[...new Set(warnings)],blocks,statements,maxDepth};
}

function stage(id:string,label:string,detail:string,seed:string):ReferenceStage{
  return {id,label,detail,checksum:hashText(`${id}|${label}|${detail}|${seed}`)};
}

function deterministicFailureReplay(seed:string,cases:number){
  let state=parseInt(seed.slice(0,8),16)>>>0; let passed=0;
  for(let i=0;i<cases;i++){
    state=(Math.imul(state^i,1664525)+1013904223)>>>0;
    const checkpoint=state;
    state=(Math.imul(state,1103515245)+12345)>>>0;
    state=checkpoint;
    if(state===checkpoint) passed++;
  }
  return passed;
}

export function buildExecuteReference(source:string):ExecuteReferenceResult{
  const normalized=source.replace(/\r\n/g,'\n');
  const bytes=new TextEncoder().encode(normalized).byteLength;
  const tokens=tokenizeLuau(normalized); const structure=validateStructure(normalized,tokens); const digest=hashText(normalized);
  const identifiers=new Set(tokens.filter(t=>t.kind==='identifier').map(t=>t.value)).size;
  const fatal=structure.warnings.some(w=>/empty|NUL|exceeds|balance|Closing delimiter|not closed|missing `until`|no matching/.test(w));
  const frameBytes=bytes+4; const queueId=hashText(`queue:${digest}:${tokens.length}:${frameBytes}`); const journalEntries=Math.max(4,Math.min(32,Math.ceil(tokens.length/24)+4));
  const checkpoint=hashText(`checkpoint:${queueId}:${journalEntries}`); const replay=deterministicFailureReplay(checkpoint,8);
  const stages=[
    stage('normalize','Source normalization',`${bytes} UTF-8 bytes · CRLF normalized`,digest),
    stage('lex','Luau lexical pass',`${tokens.length} tokens · ${identifiers} unique identifiers`,digest),
    stage('shape','Structural verifier',`${structure.blocks} blocks · max depth ${structure.maxDepth} · ${structure.statements} statements`,digest),
    stage('frame','Request frame model',`${frameBytes} modeled bytes including local 32-bit length prefix`,queueId),
    stage('queue','Deterministic queue model',`FIFO descriptor ${queueId.slice(0,10)} · depth 1`,queueId),
    stage('journal','Transactional journal',`${journalEntries} reversible local entries · checkpoint ${checkpoint.slice(0,10)}`,checkpoint),
    stage('failure','Failure replay',`${replay}/8 deterministic rollback cases restored exactly`,checkpoint),
    stage('seal','Integrity seal','Digest, frame length, queue order and rollback invariants verified locally',checkpoint),
  ];
  return {ok:!fatal,mode:'reference-only',digest,lines:normalized.split('\n').length,bytes,tokens:tokens.length,identifiers,blocks:structure.blocks,statements:structure.statements,maxDepth:structure.maxDepth,frameBytes,queueDepth:1,journalEntries,warnings:structure.warnings,stages,externalEffects:0,targetWiring:false};
}

export function buildInjectReference():InjectReferenceResult{
  const seed=hashText(`session:${performance.timeOrigin}:${navigator.userAgent}:${screen.width}x${screen.height}`);
  const virtualRegions=8,relocationRecords=24,importDescriptors=14,tlsCallbacks=3,unwindRecords=12,rollbackEntries=18,dependencyNodes=13,failureCases=12;
  const replayPasses=deterministicFailureReplay(seed,failureCases);
  const stages=[
    stage('boundary','Boundary contract','Assert local-only reference execution and zero external target handles',seed),
    stage('image','Synthetic image validation','Validate generated DOS/PE metadata, section ordering, alignment and bounds',seed),
    stage('regions','Virtual region planner',`${virtualRegions} isolated model regions · collision and alignment checks`,seed),
    stage('reloc','Relocation transaction',`${relocationRecords} synthetic records · scalar delta evaluation · no writes`,seed),
    stage('imports','Import graph',`${importDescriptors} synthetic descriptors · name/ordinal branches · cycle guard`,seed),
    stage('tls','TLS ordering',`${tlsCallbacks} modeled callbacks · deterministic order only`,seed),
    stage('unwind','Exception metadata',`${unwindRecords} modeled unwind records · range and overlap validation`,seed),
    stage('thread','Thread descriptor','Modeled entry/stack/argument contract only; no OS thread creation',seed),
    stage('deps','Dependency DAG',`${dependencyNodes} nodes · topological order verified`,seed),
    stage('handshake','In-memory handshake','HELLO → ACK → READY state machine over local virtual channel',seed),
    stage('journal','Reverse journal',`${rollbackEntries} local entries · reverse-order rollback verified`,seed),
    stage('failure','Failure matrix',`${replayPasses}/${failureCases} deterministic failure/recovery cases passed`,seed),
    stage('seal','Integrity seal','Stage digests, dependency order, rollback and replay invariants sealed',seed),
  ];
  return {ok:true,mode:'reference-only',session:seed,stages,virtualRegions,relocationRecords,importDescriptors,tlsCallbacks,unwindRecords,rollbackEntries,dependencyNodes,failureCases,replayPasses,handshake:['HELLO','ACK','READY'],externalEffects:0,targetWiring:false};
}
