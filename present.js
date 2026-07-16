// present.js — presenter/podium client
const socket = io();
const main = document.getElementById('main');
const titlepill = document.getElementById('titlepill');

function el(tag, props={}, ...kids){const n=document.createElement(tag);for(const k in props){if(k==='class')n.className=props[k];else if(k==='html')n.innerHTML=props[k];else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),props[k]);else if(props[k]!=null)n.setAttribute(k,props[k]);}kids.flat().forEach(c=>n.append(c&&c.nodeType?c:document.createTextNode(c??'')));return n;}

let HS = null; // host state from server
let showingLeaderboard = false;

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
  const scoreToggle = el('input',{type:'checkbox',id:'scoreOn',checked:'checked'});
  banks.forEach(b=>{
    host.append(el('div',{class:'bank-row'},
      el('div',{class:'bt'}, el('h3',{},b.title), el('div',{class:'bm'}, (b.questions?.length||0)+' questions'+(b.description?' · '+b.description:''))),
      el('button',{class:'ctrl solid',onClick:()=>startSession(b.id)},'Present ›')
    ));
  });
  host.append(el('label',{class:'toggle',style:'margin-top:8px'}, scoreToggle, 'Exam mode — score answers and show a leaderboard'));
}

async function startSession(bankId){
  const scoringOn = document.getElementById('scoreOn')?.checked ?? true;
  const r = await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bankId,scoringOn})});
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
    HS = res; HS.code = code; HS.scoringOn = res.scoringOn;
    render();
  });
}

socket.on('host-state', s=>{ if(!HS) return; Object.assign(HS, s); if(!showingLeaderboard) render(); else renderLeaderboard(); });

function joinURL(){ return location.origin + '/join?code=' + HS.code; }

function render(){
  if(!HS) return;
  showingLeaderboard=false;
  const q = HS.question;
  main.innerHTML='';
  const stage = el('div',{class:'stage'});

  // lobby (before first question pushed)
  if(HS.state==='lobby'){
    stage.append(el('div',{class:'qcount'},'Lobby'));
    stage.append(el('div',{class:'qtext'},'Ready when you are.'));
    stage.append(joinCard());
    stage.append(el('div',{class:'stage-foot'},
      el('div',{class:'votes-live'}, el('span',{class:'dot'}), el('span',{}, HS.participants+' joined')),
      el('div',{class:'spacer'}),
      el('button',{class:'ctrl solid',onClick:()=>socket.emit('present:start')},'Start ›')
    ));
    main.append(stage); return;
  }

  stage.append(el('div',{class:'stage-head'},
    el('span',{class:'qcount'}, `Q${q.index+1} / ${q.total}`),
    el('span',{class:'qtype'}, q.type==='truefalse'?'True / False':(q.imageUrl?'Image · MCQ':'MCQ'))
  ));
  stage.append(el('div',{class:'qtext'}, q.text||''));

  const media = el('div',{class:'qmedia'});
  if(q.imageUrl) media.append(el('img',{src:q.imageUrl,alt:''}));
  media.append(resultsBox());
  stage.append(media);

  stage.append(joinCard());

  const foot = el('div',{class:'stage-foot'},
    el('div',{class:'votes-live'}, el('span',{class:'dot'}), el('span',{}, HS.tally.total+' / '+HS.participants+' answered')),
    el('div',{class:'spacer'}),
    el('button',{class:'ctrl warn',onClick:()=>socket.emit('present:reset')},'Clear'),
    el('button',{class:'ctrl',onClick:()=>socket.emit('present:reveal')}, HS.revealed?'Answer shown':'Reveal answer'),
    HS.scoringOn?el('button',{class:'ctrl',onClick:()=>{socket.emit('present:leaderboard');}},'Leaderboard'):'',
    el('button',{class:'ctrl',onClick:()=>socket.emit('present:prev'),disabled:q.index===0?'disabled':null},'‹ Prev'),
    q.index===q.total-1
      ? el('button',{class:'ctrl solid',onClick:()=>{ if(confirm('End the session?')) socket.emit('present:end'); }},'Finish')
      : el('button',{class:'ctrl solid',onClick:()=>socket.emit('present:next')},'Next ›')
  );
  stage.append(foot);
  main.append(stage);
}

function joinCard(){
  const url = joinURL();
  const c = el('div',{class:'joincard'},
    el('div',{class:'plate'}, HS.code),
    el('div',{class:'jmeta'},
      el('div',{class:'k'},'Join at'),
      el('div',{class:'v'}, location.host + '/join'),
      el('div',{class:'k',style:'margin-top:8px'},'or scan →')
    ),
    el('div',{class:'qr',id:'qrbox'}, el('div',{style:'width:120px;height:120px'}))
  );
  fetch('/api/qr?text='+encodeURIComponent(url)).then(r=>r.json()).then(({dataUrl})=>{
    const box=document.getElementById('qrbox'); if(box&&dataUrl){ box.innerHTML=''; box.append(el('img',{src:dataUrl,alt:'Join QR'})); }
  }).catch(()=>{});
  return c;
}

function resultsBox(){
  const box = el('div',{class:'results'});
  const q = HS.question, t = HS.tally;
  q.options.forEach((o,i)=>{
    const pct = t.total ? Math.round(t.counts[i]/t.total*100) : 0;
    const isC = HS.revealed && t.correct.includes(i);
    const isW = HS.revealed && !t.correct.includes(i);
    box.append(el('div',{class:'bar-row'+(isC?' is-correct':'')},
      el('div',{class:'bar-top'},
        el('span',{class:'bar-key'}, q.type==='truefalse'?(i===0?'T':'F'):String.fromCharCode(65+i)),
        el('span',{class:'bar-label'}, o.text),
        el('span',{class:'bar-pct'}, pct+'%')
      ),
      el('div',{class:'bar-track'}, el('div',{class:'bar-fill'+(isC?' correct':isW?' wrong':''),style:`width:${Math.max(pct, t.counts[i]?4:0)}%`}, t.counts[i]?el('span',{class:'cnt'},t.counts[i]):''))
    ));
  });
  if(!t.total) box.append(el('div',{class:'empty'},'Waiting for the first response…'));
  return box;
}

function renderLeaderboard(){
  showingLeaderboard=true;
  main.innerHTML='';
  const stage=el('div',{class:'stage'});
  stage.append(el('div',{class:'qcount'},'Standings'));
  stage.append(el('div',{class:'qtext'},'Leaderboard'));
  const lb=el('div',{class:'lb'});
  (HS.leaderboard||[]).forEach((p,i)=>{
    lb.append(el('div',{class:'row'+(i<3?' top':'')}, el('span',{class:'rk'},'#'+(i+1)), el('span',{class:'nm'},p.name), el('span',{class:'sc'},p.score)));
  });
  if(!(HS.leaderboard||[]).length) lb.append(el('div',{class:'row'},'No scores yet.'));
  stage.append(lb);
  stage.append(el('div',{class:'stage-foot'}, el('div',{class:'spacer'}), el('button',{class:'ctrl solid',onClick:render},'Back to question ›')));
  main.append(stage);
}

socket.on('connect', ()=>{ if(HS && HS.code) socket.emit('host',{code:HS.code},res=>{ if(!res.error){ Object.assign(HS,res); if(!showingLeaderboard) render(); } }); });
