// 325 solver: bounded exact Number enumeration + BigInt target arithmetic.
export const PRESETS = [
  {id:'quick', label:'快速演算', seconds:0.5, digits:9, states:1200, bases:32, offsets:1, description:'0.5 秒 · 先得到答案'},
  {id:'short', label:'标准演算', seconds:3, digits:12, states:3000, bases:128, offsets:3, description:'3 秒 · 尝试更短'},
  {id:'deep', label:'深入演算', seconds:20, digits:12, states:5000, bases:256, offsets:5, description:'20 秒 · 扩大搜索'},
  {id:'full', label:'极限演算', seconds:60, digits:15, states:6000, bases:512, offsets:10, description:'60 秒 · 充分枚举'}
];
const clock = () => performance.now();
export function expr(text, prec=3, digits=null) {return {text, prec, digits:digits ?? text.replace(/[^0-9]/g,'').length};}
export function compare(a,b) {return a.text.length-b.text.length || a.digits-b.digits || (a.text<b.text?-1:a.text>b.text?1:0);}
export function combine(a,op,b) {
  const p=op==='*'?2:1;
  const left=a.prec<p?'('+a.text+')':a.text;
  const right=b.prec<p||(op==='-'&&b.prec===p)?'('+b.text+')':b.text;
  return expr(left+op+right,p,a.digits+b.digits);
}
const ONE=expr('3*2-5',1), TEN=expr('3+2+5',1), ZERO=expr('3+2-5',1);
const BASES=[[6,'3-2+5',1],[10,'3+2+5',1],[11,'3*2+5',1],[13,'3+2*5',1],[27,'32-5',1],[30,'3*2*5',2],[37,'32+5',1],[75,'3*25',2],[325,'325',3],[1000,'(3+2+5)*(3+2+5)*(3+2+5)',2],[325325,'325325',3]];
export function parsePositive(text) {
  if(typeof text!=='string'||text.length>20000||! /^[0-9]+$/.test(text.trim())) throw Error('请输入不超过 20000 位的十进制正整数。');
  const value=BigInt(text.trim()); if(value<=0n)throw Error('输入必须大于 0。'); return value;
}
export function verify(text, expected) {
  const tokens=text.match(/[0-9]+|[()+*\-]/g)||[];
  if(tokens.join('')!==text)throw Error('算式含有无效字符。');
  const digits=tokens.filter(t=>/^[0-9]+$/.test(t)).join('');
  if(!digits||digits.length%3||digits!=='325'.repeat(digits.length/3))throw Error('数字顺序不符合完整 325 重复。');
  const values=[], ops=[], precedence={'+':1,'-':1,'*':2}; let needsNumber=true;
  const apply=()=>{const op=ops.pop();if(values.length<2)throw Error('缺少操作数。');const b=values.pop(),a=values.pop();values.push(op==='+'?a+b:op==='-'?a-b:a*b);};
  for(const t of tokens){
    if(/^[0-9]+$/.test(t)){if(!needsNumber)throw Error('缺少运算符。');values.push(BigInt(t));needsNumber=false;}
    else if(t==='('){if(!needsNumber)throw Error('缺少运算符。');ops.push(t);}
    else if(t===')'){if(needsNumber)throw Error('括号内容无效。');while(ops.length&&ops.at(-1)!=='(')apply();if(ops.pop()!=='(')throw Error('括号不匹配。');}
    else {if(needsNumber)throw Error('缺少操作数。');while(ops.length&&ops.at(-1)!=='('&&precedence[ops.at(-1)]>=precedence[t])apply();ops.push(t);needsNumber=true;}
  }
  if(needsNumber)throw Error('缺少最后的操作数。');
  while(ops.length){if(ops.at(-1)==='(')throw Error('括号不匹配。');apply();}
  if(values.length!==1||values[0]!==BigInt(expected))throw Error('算式计算结果不等于输入。');return digits.length/3;
}
function put(map,v,e){const old=map.get(v);if(!old||compare(e,old)<0)map.set(v,e);}
function atom(phase,length){let text='';for(let i=0;i<length;i++)text+='325'[(phase+i)%3];return text;}
function trim(map,cap,stats){
  if(map.size<=cap)return map;
  stats.pruned+=map.size-cap;
  const entries=[...map];
  const small=entries.slice().sort((a,b)=>Math.abs(a[0])-Math.abs(b[0])||compare(a[1],b[1])).slice(0,Math.floor(cap/3));
  entries.sort((a,b)=>compare(a[1],b[1]));const keep=new Map(small);
  for(const [v,e]of entries){if(keep.size>=cap)break;keep.set(v,e);}return keep;
}
export function enumerate(options, onProgress=()=>{}, cachedCells=null) {
  const {seconds, digits:maxDigits, states:cap}=options; const bound=options.bound??1000000;
  if(!Number.isFinite(seconds)||seconds<0||!Number.isInteger(maxDigits)||maxDigits<3||maxDigits>15||!Number.isInteger(cap)||cap<10||!Number.isSafeInteger(bound)||bound<10||bound>100000000)throw Error('枚举参数超出精确整数范围。');
  const start=clock(), deadline=start+seconds*1000, cells=cachedCells??new Map(), table=new Map();
  const stats={enumerations:0,accepted:0,pruned:0,completed_cells:0,complete_values:0,timed_out:false,max_digits:maxDigits,state_cap:cap,absolute_value_bound:bound,cached_cells:0};
  let lastPulse=start;
  const publish=(phase,length,cell,finished)=>{
    if(finished)cells.set(phase+':'+length,cell);
    if(phase===0&&length%3===0)for(const[v,e]of cell)put(table,v,e);
  };
  const pulse=(length,phase,force=false)=>{const now=clock();if(force||now-lastPulse>=120){lastPulse=now;onProgress({stage:'enumeration',label:'常数枚举',message:'正在枚举 '+length+' 位片段，起点相位 '+(phase+1)+' / 3。',elapsed_seconds:(now-start)/1000,enumeration_budget:seconds,budget_fraction:Math.min(1,(now-start)/(Math.max(0.001,seconds)*1000)),enumerations:stats.enumerations,complete_values:table.size});}};
  if(seconds<=0)return {table,stats:{...stats,seconds:0},cells};
  for(let length=1;length<=maxDigits;length++)for(let phase=0;phase<3;phase++){
    const id=phase+':'+length;
    if(cells.has(id)){const cell=cells.get(id);publish(phase,length,cell,true);stats.cached_cells++;continue;}
    const text=atom(phase,length);let cell=new Map([[Number(text),expr(text)]]);
    for(let split=1;split<length;split++){
      const left=cells.get(phase+':'+split), right=cells.get(((phase+split)%3)+':'+(length-split));
      for(const[av,a]of left){for(const[bv,b]of right){
        const values=[av+bv,av-bv,av*bv];
        for(let k=0;k<3;k++){
          stats.enumerations++;const value=values[k];
          // All atoms (<=15 digits) are safe integers. A product inside bound is exact;
          // products too large for Number precision are necessarily outside bound.
          if(Math.abs(value)<=bound&&Number.isSafeInteger(value)){
            const old=cell.get(value);if(!old||a.text.length+b.text.length+1<=old.text.length){const e=combine(a,['+','-','*'][k],b);if(!old||compare(e,old)<0){cell.set(value,e);stats.accepted++;}}
          }
          if((stats.enumerations&2047)===0){pulse(length,phase);if(clock()>=deadline){cell=trim(cell,cap,stats);publish(phase,length,cell,false);stats.timed_out=true;stats.seconds=(clock()-start)/1000;stats.complete_values=table.size;pulse(length,phase,true);return {table,stats,cells};}}
        }
        if(cell.size>=2*cap)cell=trim(cell,cap,stats);
      }}
    }
    cell=trim(cell,cap,stats);publish(phase,length,cell,true);stats.completed_cells++;pulse(length,phase);
  }
  stats.seconds=(clock()-start)/1000;stats.complete_values=table.size;pulse(maxDigits,2,true);return {table,stats,cells};
}
const SAFE=BigInt(Number.MAX_SAFE_INTEGER);
function lookup(table,n){return n<=SAFE&&n>=-SAFE?table.get(Number(n)):undefined;}
function digitsTable(table){const d=[ZERO,ONE];for(let i=2;i<10;i++)d.push(combine(d.at(-1),'+',ONE));for(let i=0;i<10;i++){const e=table.get(i);if(e&&compare(e,d[i])<0)d[i]=e;}return d;}
export function decimalExpr(n,table=new Map(),digits=digitsTable(table)){
  const found=lookup(table,n);if(found)return found;
  const text=n.toString();let e=digits[Number(text[0])];for(const c of text.slice(1)){e=combine(e,'*',TEN);if(c!=='0')e=combine(e,'+',digits[Number(c)]);}return e;
}
export function solveBase(n,spec,table=new Map()){
  const base=BigInt(spec[0]), be=expr(spec[1],spec[2]), digits=digitsTable(table), levels=[new Set([n])];
  while([...levels.at(-1)].some(v=>v>=base)){
    const next=new Set();for(const v of levels.at(-1))if(v>=base&&!lookup(table,v)){const q=v/base,r=v%base;next.add(q);if(r)next.add(q+1n);}
    if(!next.size)break;levels.push(next);
  }
  let memo=new Map(),trials=0;const smallCache=new Map();
  const small=v=>{if(!smallCache.has(v))smallCache.set(v,decimalExpr(v,table,digits));return smallCache.get(v);};
  for(let i=levels.length-1;i>=0;i--){const current=new Map();for(const v of levels[i]){
    if(v<base||lookup(table,v)){current.set(v,small(v));continue;}
    const q=v/base,r=v%base,pairs=r?[[q,r],[q+1n,r-base]]:[[q,0n]];let best=null;
    for(const[quotient,remainder]of pairs){const product=quotient===1n?be:combine(memo.get(quotient),'*',be);let e=product;
      if(remainder){e=combine(product,remainder>0n?'+':'-',small(remainder>0n?remainder:-remainder));const re=lookup(table,remainder);if(re){const alternative=combine(product,'+',re);if(compare(alternative,e)<0)e=alternative;}}
      if(!best||compare(e,best)<0)best=e;trials++;
    }current.set(v,best);
  }memo=current;}
  return {expression:memo.get(n),trials,base:spec[0]};
}
export function candidateBases(table,limit){const specs=new Map(BASES.map(b=>[b[0],b]));const useful=[...table].filter(([v])=>v>1).sort((a,b)=>compare(a[1],b[1])).slice(0,limit);
  for(const[v,e]of useful){const old=specs.get(v);if(!old||compare(e,expr(old[1],old[2]))<0)specs.set(v,[v,e.text,e.prec]);}return [...specs.values()];}
export function targetScan(n,table,initial,offsets=3){let best=initial,probes=0,improvements=0;const offer=e=>{if(compare(e,best)<0){best=e;improvements++;}};
  const direct=lookup(table,n);if(direct)offer(direct);
  for(const[an,ae]of table){const a=BigInt(an);
    for(const[v,op,reverse]of [[n-a,'+',false],[a-n,'-',false],[n+a,'-',true]]){probes++;const be=lookup(table,v);if(be)offer(reverse?combine(be,op,ae):combine(ae,op,be));}
    if(a<=1n)continue;const q=n/a;
    for(let delta=-offsets;delta<=offsets+1;delta++){const b=q+BigInt(delta);if(b<1n)continue;probes++;const be=lookup(table,b);if(!be)continue;const r=n-a*b,plus=lookup(table,r),minus=lookup(table,-r);if(r&&!plus&&!minus)continue;const product=b===1n?ae:combine(ae,'*',be);if(!r)offer(product);if(plus)offer(combine(product,'+',plus));if(minus)offer(combine(product,'-',minus));}
  }return {expression:best,probes,improvements};
}
export class Solver {
  constructor(){this.best=new Map();this.table=new Map();this.statsByProfile=new Map();this.cellCache=new Map();}
  solve(number,preset=PRESETS[1],onProgress=()=>{}){
    const wallStart=clock(), n=parsePositive(number), normalized=n.toString();
    const cacheKey=[preset.digits,preset.states,preset.bound??1000000].join(':');
    const cached=this.cellCache.get(cacheKey)||new Map();
    const enumeration=enumerate(preset,onProgress,cached);this.cellCache.set(cacheKey,enumeration.cells);
    for(const[v,e]of enumeration.table)put(this.table,v,e);
    const table=new Map(this.table);if(normalized.length<=15&&normalized.length%3===0&&normalized==='325'.repeat(normalized.length/3))table.set(Number(normalized),expr(normalized));
    const start=clock(),specs=candidateBases(table,preset.bases);let best=null,base=null,trials=0;
    for(let i=0;i<specs.length;i++){const result=solveBase(n,specs[i],table);trials+=result.trials;if(!best||compare(result.expression,best)<0){best=result.expression;base=result.base;}
      if(i%8===0||i===specs.length-1)onProgress({stage:'search',label:'算式搜索',message:'正在比较候选基数 '+(i+1)+' / '+specs.length+'。',elapsed_seconds:(clock()-wallStart)/1000,budget_fraction:null,enumerations:enumeration.stats.enumerations,bases_completed:i+1,bases_total:specs.length});
    }
    // Exact large literals do not fit the small-number table; handle them directly.
    if(normalized.length%3===0&&normalized==='325'.repeat(normalized.length/3)){const literal=expr(normalized);if(compare(literal,best)<0){best=literal;base=null;}}
    const previous=this.best.get(normalized);if(previous&&compare(previous,best)<0){best=previous;base=null;}
    const before=best.text.length;onProgress({stage:'target',label:'目标分解',message:'正在检查乘积与余数，寻找更短的组合。',elapsed_seconds:(clock()-wallStart)/1000,budget_fraction:null,enumerations:enumeration.stats.enumerations});
    const scan=targetScan(n,table,best,preset.offsets);if(compare(scan.expression,best)<0){best=scan.expression;base=null;}
    const searchSeconds=(clock()-start)/1000;
    onProgress({stage:'verify',label:'精确校验',message:'正在校验整数结果与 325 数字顺序。',elapsed_seconds:(clock()-wallStart)/1000,budget_fraction:null,enumerations:enumeration.stats.enumerations});
    const check=clock(),blocks=verify(best.text,n),verificationSeconds=(clock()-check)/1000;
    this.best.set(normalized,best);
    return {input:normalized,expression:best.text,characters:best.text.length,blocks_325:blocks,selected_base:base,verified:true,proven_globally_shortest:false,wall_seconds:(clock()-wallStart)/1000,enumeration:enumeration.stats,search_seconds:searchSeconds,verification_seconds:verificationSeconds,radix_candidates:specs.length,radix_transitions:trials,target_search:{probes:scan.probes,improvements:scan.improvements},characters_before_target_search:before,complete_values_available:this.table.size,saved_best_used:!!previous&&best.text===previous.text};
  }
}
