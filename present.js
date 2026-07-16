// present.js — presenter/podium client (timed, Kahoot-style flow)
const socket = io();
const main = document.getElementById('main');
const titlepill = document.getElementById('titlepill');

function el(tag, props={}, ...kids){const n=document.createElement(tag);for(const k in props){if(k==='class')n.className=props[k];else if(k==='html')n.innerHTML=props[k];else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),props[k]);else if(props[k]!=null)n.setAttribute(k,props[k]);}kids.flat().forEach(c=>n.append(c&&c.nodeType?c:document.createTextNode(c??'')));return n;}

let HS = null;                 // host state from server
let phase = 'lobby';           // lobby | question | revealed | leaderboard
let curIndex = -1;             // question index currently displayed
let timerInt = null, timerEnd = 0, timerTotal = 30, autoRevealedFor = -1;
let qrCache = {};              // code -> dataUrl

const codeInUrl = new URLSearchParams(location.search).get('code');
if (codeInUrl) hostSession(codeInUrl.toUpperCase());
else showPicker();

// ---------------- bank picker / start ----------------
async function showPicker(){
  main.innerHTML='';
  const wrap = el('div',{class:'stage'}, el('div',{class:'picker',id:'picker'}));
  main.append(wrap);
  const host = document.getElementById('picker');
  host.append(el('h2',{class:'h-section'},'Start a session'));
  host.append(el('p',{class:'sub'},'Pick a bank to present. Participants join with the code you\u2019ll get next.'));
  let banks=[];
  try{ banks = await (await fetch('/api/admin/banks')).json(); }catch(e){}
  if(!banks.length){
    host.append(el('div',{class:'banner'},'No banks yet. Head to Banks to build one or bulk-upload questions, then come back.'));
    host.append(el('div',{style:'height:14px'})); host.append(el('a',{class:'btn primary',href:'/admin'},'Go to Banks'));
    return;
  }
  banks.forEach(b=>{
    host.append(el('div',{class:'bank-row'},
      el('div',{class:'bt'}, el('h3',{},b.title), el('div',{class:'bm'}, (b.questions?.length||0)+' questions'+(b.description?' · '+b.description:''))),
      el('button',{class:'ctrl solid',onClick:()=>startSession(b.id)},'Present ›')
    ));
  });
  const scoreToggle = el('input',{type:'checkbox',id:'scoreOn',checked:'checked'});
  const randToggle  = el('input',{type:'checkbox',id:'randOn',checked:'checked'});
  const timerInput  = el('input',{type:'number',id:'timerSec',min:'5',max:'300',value:'30',style:'width:80px'});
  host.append(el('div',{class:'startopts'},
    el('label',{class:'toggle'}, scoreToggle, 'Exam mode — score answers & show a leaderboard'),
    el('label',{class:'toggle'}, randToggle, 'Shuffle question order'),
    el('label',{class:'toggle'}, 'Seconds per question:', timerInput)
  ));
}

async function startSession(bankId){
  const scoringOn = document.getElementById('scoreOn')?.checked ?? true;
  const random = document.getElementById('randOn')?.checked ?? true;
  const timerSeconds = Number(document.getElementById('timerSec')?.value) || 30;
  const r = await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bankId,scoringOn,random,timerSeconds})});
  if(!r.ok){ const e=await r.json().catch(()=>({})); alert(e.error||'Could not start.'); return; }
  const { code } = await r.json();
  history.replaceState(null,'','/present?code='+code);
  hostSession(code);
}

// ---------------- host live ----------------
function hostSession(code){
  socket.emit('host',{code},res=>{
    if(res.error){ main.innerHTML=''; main.append(el('div',{class:'stage'}, el('div',{class:'banner'},res.error), el('div',{style:'height:12px'}), el('a',{class:'btn primary',href:'/present'},'Back to start'))); return; }
    titlepill.style.display=''; titlepill.textContent=res.title;
    HS = res; HS.code = code;
    timerTotal = HS.timerSeconds || 30;
    applyState(true);
  });
}

socket.on('host-state', s=>{ if(!HS) return; Object.assign(HS, s); applyState(false); });

function applyState(first){
  if(HS.state==='lobby'){ phase='lobby'; stopTimer(); render(); return; }
  const idx = HS.question ? HS.question.index : -1;
  if(idx !== curIndex){                         // brand-new question
    curIndex = idx; phase='question'; render(); startTimer();
  } else if(HS.revealed && phase==='question'){ // presenter/auto revealed
    phase='revealed'; stopTimer(); render();
  } else if(phase==='question' || phase==='revealed'){
    updateResults();                            // tally-only refresh, keep timer/animation
  } else {
    render();
  }
}

// ---------------- timer ----------------
function stopTimer(){ if(timerInt){ clearInterval(timerInt); timerInt=null; } }
function startTimer(){
  stopTimer();
  timerTotal = (HS.question && HS.question.timeLimit) || HS.timerSeconds || 30;
  timerEnd = Date.now() + timerTotal*1000;
  tick();
  timerInt = setInterval(tick, 200);
}
function tick(){
  const remMs = Math.max(0, timerEnd - Date.now());
  const rem = Math.ceil(remMs/1000);
  const num = document.getElementById('timernum');
  const ring = document.getElementById('timerRing');
  if(num) num.textContent = rem;
  if(ring){
    const pct = Math.max(0, Math.min(100, remMs/(timerTotal*1000)*100));
    const col = rem<=5 ? 'var(--amber)' : 'var(--teal)';
    ring.style.background = `conic-gradient(${col} ${pct}%, rgba(240,233,219,.12) 0)`;
  }
  if(remMs<=0){
    stopTimer();
    if(phase==='question' && autoRevealedFor!==curIndex){ autoRevealedFor=curIndex; socket.emit('present:reveal'); }
  }
}

function joinURL(){ return location.origin + '/join?code=' + HS.code; }

// ---------------- render ----------------
function render(){
  if(!HS) return;
  main.innerHTML='';
  const stage = el('div',{class:'stage'});

  if(phase==='lobby'){
    stage.append(el('div',{class:'qcount'},'Lobby'));
    stage.append(el('div',{class:'qtext'},'Ready when you are.'));
    stage.append(joinCard());
    stage.append(el('div',{class:'stage-foot'},
      el('div',{class:'votes-live'}, el('span',{class:'dot'}), el('span',{}, HS.participants+' joined')),
      el('div',{style:'flex:1'}),
      timerEditor(),
      el('button',{class:'ctrl solid',onClick:()=>socket.emit('present:start')},'Start ›')
    ));
    main.append(stage); return;
  }

  if(phase==='leaderboard'){ renderLeaderboard(stage); main.append(stage); return; }

  // question / revealed
  const q = HS.question;
  stage.append(el('div',{class:'stage-head'},
    el('span',{class:'qcount'}, `Q${q.index+1} / ${q.total}`),
    el('span',{class:'qtype'}, q.type==='truefalse'?'True / False':(q.imageUrl?'Image · MCQ':'MCQ')),
    el('div',{style:'flex:1'}),
    phase==='question' ? timerRing() : el('span',{class:'qtype',style:'border-color:var(--teal);color:var(--teal)'},'Answers closed')
  ));
  stage.append(el('div',{class:'qtext'}, q.text||''));

  const media = el('div',{class:'qmedia'});
  if(q.imageUrl) media.append(el('img',{src:q.imageUrl,alt:''}));
  media.append(resultsBox());
  stage.append(media);

  if(phase==='question') stage.append(joinCard());
  if(phase==='revealed' && q.explanation) stage.append(el('div',{class:'explain-host'}, q.explanation));

  const foot = el('div',{class:'stage-foot'});
  foot.append(el('div',{class:'votes-live'}, el('span',{class:'dot'}), el('span',{id:'answered'}, HS.tally.total+' / '+HS.participants+' answered')));
  foot.append(el('div',{style:'flex:1'}));
  if(phase==='question'){
    foot.append(timerEditor());
    foot.append(el('button',{class:'ctrl warn',onClick:()=>socket.emit('present:reset')},'Clear'));
    foot.append(el('button',{class:'ctrl solid big',onClick:()=>{ stopTimer(); socket.emit('present:reveal'); }},'Reveal answer ›'));
  } else { // revealed
    if(HS.scoringOn) foot.append(el('button',{class:'ctrl solid big',onClick:showLeaderboard},'Show scores ›'));
    else foot.append(nextButton());
  }
  stage.append(foot);
  main.append(stage);
}

function timerRing(){
  return el('div',{class:'timer-ring',id:'timerRing'}, el('span',{id:'timernum'}, String(timerTotal)));
}
function timerEditor(){
  const inp = el('input',{type:'number',min:'5',max:'300',value:String(HS.timerSeconds||timerTotal),class:'timer-edit',id:'timerEdit'});
  return el('div',{class:'timer-editor'},
    el('span',{class:'te-label'},'Timer'),
    inp,
    el('button',{class:'ctrl',onClick:()=>{
      const v=Number(document.getElementById('timerEdit').value)||30;
      socket.emit('present:setTimer',{seconds:v});
      HS.timerSeconds=v;
      if(phase==='question'){ timerTotal=v; timerEnd=Date.now()+v*1000; }  // restart current countdown locally
    }},'Set')
  );
}

function nextButton(){
  const q=HS.question;
  return q.index===q.total-1
    ? el('button',{class:'ctrl solid big',onClick:()=>{ if(confirm('End the session?')) socket.emit('present:end'); }},'Finish ›')
    : el('button',{class:'ctrl solid big',onClick:()=>socket.emit('present:next')},'Next question ›');
}

function showLeaderboard(){
  socket.emit('present:leaderboard');   // push to participants too
  phase='leaderboard'; render();
}

function joinCard(){
  const url = joinURL();
  const box = el('div',{class:'qr',id:'qrbox'}, el('div',{style:'width:120px;height:120px'}));
  const c = el('div',{class:'joincard'},
    el('div',{class:'plate'}, HS.code),
    el('div',{class:'jmeta'},
      el('div',{class:'k'},'Join at'),
      el('div',{class:'v'}, location.host + '/join'),
      el('div',{class:'k',style:'margin-top:8px'},'or scan →')
    ), box);
  if(qrCache[HS.code]){ box.innerHTML=''; box.append(el('img',{src:qrCache[HS.code],alt:'Join QR'})); }
  else fetch('/api/qr?text='+encodeURIComponent(url)).then(r=>r.json()).then(({dataUrl})=>{
    if(dataUrl){ qrCache[HS.code]=dataUrl; const b=document.getElementById('qrbox'); if(b){ b.innerHTML=''; b.append(el('img',{src:dataUrl,alt:'Join QR'})); } }
  }).catch(()=>{});
  return c;
}

function resultsBox(){
  const box = el('div',{class:'results',id:'results'});
  const q = HS.question, t = HS.tally;
  q.options.forEach((o,i)=>{
    const pct = t.total ? Math.round(t.counts[i]/t.total*100) : 0;
    const isC = HS.revealed && t.correct.includes(i);
    const isW = HS.revealed && !t.correct.includes(i);
    box.append(el('div',{class:'bar-row'+(isC?' is-correct':'')+(isC&&phase==='revealed'?' reveal-pop':'')},
      el('div',{class:'bar-top'},
        el('span',{class:'bar-key'}, q.type==='truefalse'?(i===0?'T':'F'):String.fromCharCode(65+i)),
        el('span',{class:'bar-label'}, o.text),
        el('span',{class:'bar-pct',id:'pct-'+i}, pct+'%')
      ),
      el('div',{class:'bar-track'}, el('div',{class:'bar-fill'+(isC?' correct':isW?' wrong':''),id:'fill-'+i,style:`width:${Math.max(pct, t.counts[i]?4:0)}%`}, el('span',{class:'cnt',id:'cnt-'+i}, t.counts[i]||'')))
    ));
  });
  if(!t.total && phase==='question') box.append(el('div',{class:'empty'},'Waiting for the first response…'));
  return box;
}

// patch tally without rebuilding (keeps timer + animation smooth)
function updateResults(){
  const t = HS.tally; if(!document.getElementById('results')) { render(); return; }
  const a = document.getElementById('answered'); if(a) a.textContent = t.total+' / '+HS.participants+' answered';
  HS.question.options.forEach((o,i)=>{
    const pct = t.total ? Math.round(t.counts[i]/t.total*100) : 0;
    const fill=document.getElementById('fill-'+i), p=document.getElementById('pct-'+i), c=document.getElementById('cnt-'+i);
    if(fill) fill.style.width = Math.max(pct, t.counts[i]?4:0)+'%';
    if(p) p.textContent = pct+'%';
    if(c) c.textContent = t.counts[i]||'';
  });
}

function renderLeaderboard(stage){
  stage.append(el('div',{class:'qcount'},'Standings'));
  stage.append(el('div',{class:'qtext'},'Leaderboard'));
  const board = HS.leaderboard||[];
  const max = Math.max(1, ...board.map(p=>p.score));
  const lb = el('div',{class:'lb'});
  board.forEach((p,i)=>{
    const row = el('div',{class:'row lbrow'+(i<3?' top':''),style:`animation-delay:${i*90}ms`},
      el('span',{class:'rk'},'#'+(i+1)),
      el('span',{class:'nm'},p.name),
      el('span',{class:'sc'}, String(p.score))
    );
    lb.append(row);
  });
  if(!board.length) lb.append(el('div',{class:'row'},'No scores yet.'));
  stage.append(lb);
  const foot = el('div',{class:'stage-foot'}, el('div',{style:'flex:1'}),
    el('button',{class:'ctrl',onClick:()=>{ phase='revealed'; render(); }},'‹ Back to results'),
    nextButton()
  );
  stage.append(foot);
}

socket.on('connect', ()=>{ if(HS && HS.code) socket.emit('host',{code:HS.code},res=>{ if(!res.error){ Object.assign(HS,res); applyState(false); } }); });
