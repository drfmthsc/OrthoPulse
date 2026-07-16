// admin.js — author dashboard
function el(tag, props={}, ...kids){const n=document.createElement(tag);for(const k in props){if(k==='class')n.className=props[k];else if(k==='html')n.innerHTML=props[k];else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),props[k]);else if(props[k]!=null)n.setAttribute(k,props[k]);}kids.flat().forEach(c=>n.append(c&&c.nodeType?c:document.createTextNode(c??'')));return n;}
const api = (u,o) => fetch(u,o).then(async r=>{ if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.error||'Request failed'); } return r.json(); });

let banks = [];
let activeId = null;

async function refresh(){
  banks = await api('/api/admin/banks');
  const list = document.getElementById('bankList'); list.innerHTML='';
  if(!banks.length) list.append(el('div',{class:'sub'},'No banks yet.'));
  banks.forEach(b=>{
    list.append(el('div',{class:'bank-item'+(b.id===activeId?' active':''),onClick:()=>openBank(b.id)},
      el('div',{class:'bt'}, el('h4',{},b.title), el('div',{class:'bm'}, (b.questions?.length||0)+' questions')),
      el('button',{class:'minibtn del',onClick:(e)=>{e.stopPropagation();delBank(b.id);}},'✕')
    ));
  });
  if(activeId && banks.find(b=>b.id===activeId)) openBank(activeId);
}

async function createBank(){
  const t = document.getElementById('newBankTitle').value.trim();
  if(!t) return;
  const b = await api('/api/admin/banks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t})});
  document.getElementById('newBankTitle').value='';
  activeId=b.id; await refresh();
}
async function delBank(id){ if(!confirm('Delete this bank and its questions?'))return; await api('/api/admin/banks/'+id,{method:'DELETE'}); if(activeId===id)activeId=null; await refresh(); if(!activeId)document.getElementById('bankPanel').innerHTML='<div class="card"><div class="sub" style="margin:0">Select or create a bank.</div></div>'; }

async function openBank(id){
  activeId=id;
  document.querySelectorAll('.bank-item').forEach(x=>x.classList.remove('active'));
  const bank = await api('/api/admin/banks/'+id);
  const panel = document.getElementById('bankPanel'); panel.innerHTML='';
  const head = el('div',{class:'card'},
    el('div',{style:'display:flex;align-items:center;gap:10px;flex-wrap:wrap'},
      el('h3',{style:'font-family:var(--f-display);margin:0;flex:1;font-size:20px'}, bank.title),
      el('a',{class:'ctrl solid',href:'/present'},'Present ›')
    ),
    el('div',{class:'row-actions',style:'margin-top:14px;margin-bottom:0'},
      el('button',{class:'ctrl',onClick:()=>openEditor(bank.id,null)},'+ Add question'),
      el('button',{class:'ctrl',onClick:()=>document.getElementById('importFile').click()},'Bulk upload'),
      el('a',{class:'minibtn',href:'/api/sample.csv'},'Download sample CSV'),
      el('input',{type:'file',id:'importFile',accept:'.csv,.xlsx,.xls',style:'display:none',onChange:e=>doImport(bank.id,e.target.files[0])})
    )
  );
  panel.append(head);
  refresh.__lastBank = bank;

  if(!bank.questions.length){ panel.append(el('div',{class:'card'}, el('div',{class:'sub',style:'margin:0'},'No questions yet. Add one, or bulk-upload a CSV/Excel file.'))); return; }
  const qwrap = el('div',{});
  bank.questions.forEach((q,i)=>{
    const correctTxt = q.correct.map(ci=>q.options[ci]?.text).filter(Boolean).join(', ');
    qwrap.append(el('div',{class:'q-item'},
      el('span',{class:'qn'}, 'Q'+(i+1)),
      el('div',{class:'qmain'},
        el('div',{class:'qt'}, q.text || '(image question)'),
        q.imageUrl?el('img',{src:q.imageUrl,alt:''}):'',
        el('div',{class:'qmeta'}, (q.type==='truefalse'?'True/False':'MCQ')+' · answer: '+(correctTxt||'—')+(q.timeLimit?' · '+q.timeLimit+'s':''))
      ),
      el('div',{class:'qa'},
        el('button',{class:'minibtn',onClick:()=>openEditor(bank.id,q)},'Edit'),
        el('button',{class:'minibtn del',onClick:()=>delQ(bank.id,q.id)},'Del')
      )
    ));
  });
  panel.append(qwrap);
}

async function delQ(bankId,qid){ if(!confirm('Delete this question?'))return; await api('/api/admin/banks/'+bankId+'/questions/'+qid,{method:'DELETE'}); openBank(bankId); refresh(); }

async function doImport(bankId,file){
  if(!file) return;
  const fd = new FormData(); fd.append('file',file);
  try{
    const res = await api('/api/admin/banks/'+bankId+'/import',{method:'POST',body:fd});
    let m = 'Imported '+res.added+' question'+(res.added===1?'':'s')+'.';
    if(res.errors && res.errors.length) m += '\nSkipped:\n'+res.errors.slice(0,8).join('\n');
    alert(m);
    openBank(bankId); refresh();
  }catch(e){ alert(e.message); }
  document.getElementById('importFile').value='';
}

// ---------------- question editor modal ----------------
function openEditor(bankId, existing){
  const q = existing ? JSON.parse(JSON.stringify(existing)) : { type:'mcq', text:'', imageUrl:null, options:[{text:''},{text:''}], correct:[0], explanation:'', timeLimit:null };
  const root = document.getElementById('modalRoot');

  function draw(){
    root.innerHTML='';
    const box = el('div',{class:'box'});
    box.append(el('h3',{style:'font-family:var(--f-display);margin:0 0 16px;font-size:22px'}, existing?'Edit question':'New question'));

    // type toggle
    box.append(el('div',{class:'field'}, el('label',{},'Type'),
      el('div',{class:'seg'},
        el('button',{class:q.type==='mcq'?'on':'',onClick:()=>{q.type='mcq'; if(q.options.length<2)q.options=[{text:''},{text:''}]; q.correct=[0]; draw();}},'Multiple choice'),
        el('button',{class:q.type==='truefalse'?'on':'',onClick:()=>{q.type='truefalse'; q.options=[{text:'True'},{text:'False'}]; q.correct=[0]; draw();}},'True / False')
      )
    ));

    // question text
    const ta = el('textarea',{placeholder:'Type the question…',oninput:e=>q.text=e.target.value}); ta.value=q.text||'';
    box.append(el('div',{class:'field'}, el('label',{},'Question'), ta));

    // image
    const imgField = el('div',{class:'field'}, el('label',{},'Image (optional)'),
      el('div',{style:'display:flex;gap:8px;align-items:center'},
        el('button',{class:'ctrl',onClick:()=>document.getElementById('qimg').click()}, q.imageUrl?'Replace image':'Upload image'),
        q.imageUrl?el('button',{class:'minibtn del',onClick:()=>{q.imageUrl=null;draw();}},'Remove'):'',
        el('input',{type:'file',id:'qimg',accept:'image/*',style:'display:none',onChange:uploadImg})
      ),
      q.imageUrl?el('img',{class:'imgprev',src:q.imageUrl}):''
    );
    box.append(imgField);

    // options
    if(q.type==='mcq'){
      const ow = el('div',{class:'field'}, el('label',{},'Options — tap the circle to mark the correct answer'));
      q.options.forEach((o,i)=>{
        const line = el('div',{class:'optline'},
          el('button',{class:'radio'+(q.correct.includes(i)?' on':''),title:'Mark correct',onClick:()=>{q.correct=[i];draw();}}),
          (()=>{const inp=el('input',{placeholder:'Option '+(i+1),oninput:e=>q.options[i].text=e.target.value});inp.value=o.text;return inp;})(),
          q.options.length>2?el('button',{class:'minibtn del',onClick:()=>{q.options.splice(i,1); q.correct=[Math.min(q.correct[0]||0,q.options.length-1)]; draw();}},'✕'):''
        );
        ow.append(line);
      });
      if(q.options.length<6) ow.append(el('button',{class:'minibtn',style:'width:100%;padding:9px',onClick:()=>{q.options.push({text:''});draw();}},'+ add option'));
      box.append(ow);
    } else {
      box.append(el('div',{class:'field'}, el('label',{},'Correct answer'),
        el('div',{class:'seg'},
          el('button',{class:q.correct[0]===0?'on':'',onClick:()=>{q.correct=[0];draw();}},'True'),
          el('button',{class:q.correct[0]===1?'on':'',onClick:()=>{q.correct=[1];draw();}},'False')
        )
      ));
    }

    // explanation + timer
    const ex = el('textarea',{placeholder:'Shown after reveal (optional)',oninput:e=>q.explanation=e.target.value}); ex.value=q.explanation||'';
    box.append(el('div',{class:'field'}, el('label',{},'Explanation'), ex));
    const tl = el('input',{type:'number',min:'5',max:'300',placeholder:'e.g. 30 — leave blank for no timer / flat scoring',oninput:e=>q.timeLimit=e.target.value?Number(e.target.value):null}); if(q.timeLimit)tl.value=q.timeLimit;
    box.append(el('div',{class:'field'}, el('label',{},'Time limit (seconds, optional — enables speed bonus)'), tl));

    box.append(el('div',{class:'err',id:'edErr',style:'margin-bottom:10px'}));
    box.append(el('div',{style:'display:flex;gap:10px;justify-content:flex-end'},
      el('button',{class:'ctrl',onClick:()=>root.innerHTML=''},'Cancel'),
      el('button',{class:'ctrl solid',onClick:save},'Save question')
    ));

    const modal = el('div',{class:'modal',onClick:e=>{if(e.target===modal)root.innerHTML='';}}, box);
    root.append(modal);
  }

  async function uploadImg(e){
    const f = e.target.files[0]; if(!f) return;
    const fd = new FormData(); fd.append('image',f);
    try{ const r = await api('/api/admin/upload-image',{method:'POST',body:fd}); q.imageUrl=r.url; draw(); }
    catch(err){ alert(err.message); }
  }

  async function save(){
    const err = document.getElementById('edErr');
    if(!q.text.trim() && !q.imageUrl){ err.textContent='Add question text or an image.'; return; }
    if(q.type==='mcq'){
      q.options = q.options.map(o=>({text:(o.text||'').trim()})).filter(o=>o.text);
      if(q.options.length<2){ err.textContent='Add at least two options.'; return; }
      if(!q.correct.length || q.correct[0]>=q.options.length) q.correct=[0];
    }
    const payload = { type:q.type, text:q.text, imageUrl:q.imageUrl, options:q.options, correct:q.correct, explanation:q.explanation, timeLimit:q.timeLimit };
    try{
      if(existing) await api('/api/admin/banks/'+bankId+'/questions/'+existing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      else await api('/api/admin/banks/'+bankId+'/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      root.innerHTML=''; openBank(bankId); refresh();
    }catch(e){ err.textContent=e.message; }
  }

  draw();
}

document.getElementById('newBankTitle').addEventListener('keydown',e=>{if(e.key==='Enter')createBank();});
refresh();
