import {Solver, PRESETS, expr, verify} from './solver.js';
const solver=new Solver();
self.onmessage=({data})=>{
  const {id, number, preset: presetId, previous}=data;
  try {
    const preset=PRESETS.find(p=>p.id===presetId);if(!preset)throw Error('搜索挡位无效。');
    self.postMessage({id,type:'progress',data:{stage:'starting',label:'演算开始',message:'计算线程已启动，正在准备常数表。',elapsed_seconds:0,budget_fraction:null,enumerations:0}});
    if(previous){try{verify(previous,BigInt(number));solver.best.set(BigInt(number).toString(),expr(previous,1));}catch{}}
    const report=solver.solve(number,preset,progress=>self.postMessage({id,type:'progress',data:progress}));
    self.postMessage({id,type:'result',data:report});
  }catch(error){self.postMessage({id,type:'error',data:{message:error.message||'计算失败，请尝试较低挡位。'}});}
};
