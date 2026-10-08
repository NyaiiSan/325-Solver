import {PRESETS,parsePositive} from './solver.js';
const $=id=>document.getElementById(id), fmt=new Intl.NumberFormat('zh-CN');
let worker=null,requestId=0,busy=false,result=null;const previous=new Map();
function status(text){$('status-message').textContent=text;}
function clearResult(){
  result=null;$('result').hidden=true;$('verified').hidden=true;$('empty').hidden=false;
  $('expression').value='';$('target-label').textContent='';$('target-label').title='';
  for(const id of ['stats','copy-status','result-note','elapsed','live-count'])$(id).textContent='';
  for(const id of ['characters','blocks','time','operations'])$(id).textContent='—';
  $('stage').textContent='终端就绪';status('输入目标整数，选择演算深度。');
}
function revealResult(){
  if(!window.matchMedia('(max-width: 680px)').matches)return;
  const completed=result;
  requestAnimationFrame(()=>{
    if(result!==completed||!result)return;
    document.querySelector('.output-panel').scrollIntoView({block:'start',behavior:'smooth'});
  });
}
function setBusy(value){busy=value;$('run').disabled=value;$('number').disabled=value;$('cancel').hidden=!value;document.querySelectorAll('[name=preset],[data-number]').forEach(e=>e.disabled=value);$('status').classList.toggle('running',value);if(!value)$('progress').hidden=true;}
function ensureWorker(){if(!worker){worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker.onmessage=receive;worker.onerror=event=>{event.preventDefault();worker.terminate();worker=null;setBusy(false);$('stage').textContent='计算线程异常';status('计算线程未能加载或已中断。请通过 HTTP/HTTPS 静态站点打开页面，再重试。');};}return worker;}
function receive({data:packet}){
  if(packet.id!==requestId)return;
  const data=packet.data;
  if(packet.type==='progress'){
    $('stage').textContent=data.label;status(data.message);$('elapsed').textContent=data.elapsed_seconds.toFixed(1)+' 秒';
    $('progress').hidden=false;$('progress').classList.toggle('indeterminate',data.budget_fraction==null);$('progress-fill').style.width=data.budget_fraction==null?'30%':Math.min(100,data.budget_fraction*100)+'%';
    $('live-count').textContent=data.enumerations==null?'':'本次枚举 '+fmt.format(data.enumerations)+' 次';
  }else if(packet.type==='result'){
    result=data;const normalized=data.input;previous.set(normalized,data.expression);if(previous.size>20)previous.delete(previous.keys().next().value);
    $('empty').hidden=true;$('result').hidden=false;$('verified').hidden=false;$('expression').value=data.expression;
    $('target-label').textContent='N = '+normalized;$('target-label').title=normalized;
    $('characters').textContent=fmt.format(data.characters);$('blocks').textContent=fmt.format(data.blocks_325);$('time').textContent=data.wall_seconds.toFixed(2)+'s';$('operations').textContent=fmt.format(data.enumeration.enumerations);
    $('stats').textContent=JSON.stringify(data,null,2);$('copy-status').textContent='';
    $('result-note').textContent=data.saved_best_used?'本次未得到更短算式，保留此前结果。数字顺序与整数结果已精确校验。':'完整325数字顺序与整数结果已精确校验。启发式搜索，不保证全局最短。';
    setBusy(false);$('stage').textContent='演算完成';$('elapsed').textContent=data.wall_seconds.toFixed(2)+' 秒';
    status(data.enumeration.cached_cells?'算式已校验；已复用 '+data.enumeration.cached_cells+' 个完整枚举片段。':'算式已生成并通过精确校验。');
    revealResult();
  }else if(packet.type==='error'){setBusy(false);$('stage').textContent='输入或计算异常';status(data.message);}
}
for(const preset of PRESETS){const label=document.createElement('label');label.className='preset';const input=document.createElement('input');input.type='radio';input.name='preset';input.value=preset.id;input.checked=preset.id==='short';const text=document.createElement('span');text.append(document.createTextNode(preset.label));const small=document.createElement('small');small.textContent=preset.description;text.append(small);label.append(input,text);$('presets').append(label);}
$('number').addEventListener('input',()=>{$('digit-count').textContent=fmt.format($('number').value.trim().length)+' 位';clearResult();});
$('digit-count').textContent=fmt.format($('number').value.trim().length)+' 位';
document.querySelector('section.hero').addEventListener('click',()=>{
  if(window.matchMedia('(max-width: 680px)').matches){
    document.querySelector('.input-panel').scrollIntoView({block:'start',behavior:'smooth'});
  }
});
document.querySelectorAll('[data-number]').forEach(button=>button.addEventListener('click',()=>{$('number').value=button.dataset.number;$('number').dispatchEvent(new Event('input'));$('number').focus();}));
$('number').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();$('form').requestSubmit();}});
$('form').addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;let number;
  try{number=parsePositive($('number').value).toString();}catch(error){status(error.message);$('number').focus();return;}
  setBusy(true);$('stage').textContent='部署演算';$('elapsed').textContent='';$('live-count').textContent='';status('正在启动本地计算线程。');
  if(result)$('result-note').textContent='保留上一份演算记录；当前目标仍在计算。';
  const preset=document.querySelector('[name=preset]:checked').value;
  try{ensureWorker().postMessage({id:++requestId,number,preset,previous:previous.get(number)});}catch(error){setBusy(false);status('无法启动计算：'+error.message);}
});
$('cancel').addEventListener('click',()=>{requestId++;if(worker)worker.terminate();worker=null;setBusy(false);$('stage').textContent='演算终止';status('已终止本地计算线程。此前完成的结果仍保留；下次计算会重新建立枚举缓存。');$('live-count').textContent='';if(result)$('result-note').textContent='这是上一份已通过精确校验的演算记录。';});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('expression').value);$('copy-status').textContent='已复制';}catch{$('expression').focus();$('expression').select();$('copy-status').textContent='请按 Ctrl+C 或长按复制';}});
$('save').addEventListener('click',()=>{if(!result)return;const blob=new Blob([result.input+' = '+result.expression+'\n\n'+JSON.stringify(result,null,2)],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='325-战报.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
if(!('Worker'in window)||typeof BigInt==='undefined'){$('run').disabled=true;status('此页面需要支持 BigInt 和 Web Worker 的浏览器。');}
