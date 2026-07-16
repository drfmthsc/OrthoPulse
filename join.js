// join.js — participant client
const socket = io();
const shell = document.getElementById('shell');
const card = document.getElementById('card');
const codepill = document.getElementById('codepill');

let clientId = localStorage.getItem('op_clientId') || null;
let state = { joined:false, question:null, myChoice:null, answered:false, revealed:false, revealData:null, scoringOn:false, name:'' };

function el(tag, props={}, ...kids){const n=document.createElement(tag);for(const k in props){if(k==='class')n.className=props[k];else if(k==='html')n.innerHTML=props[k];else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),props[k]);else n.setAttribute(k,props[k]);}kids.flat().forEach(c=>n.append(c&&c.nodeType?c:document.createTextNode(c??'')));return n;}

function showCodeEntry(){
  shell.classList.remove('bright');
  card.innerHTML='';
  card.append(
    el('h2',{},'Enter the code'),
    el('p',{class:'lead'},'Your presenter is showing a 5-character code.'),
    (()=>{const i=el('input',{class:'code-input',id:'codeIn',maxlength:'5',placeholder:'· · · · ·',autocomplete:'off',autocapitalize:'characters'});i.addEventListener('input',()=>{i.value=i.value.toUpperCase().replace(/[^A-Z0-9]/g,'');});return i;})(),
    el('input',{class:'name-input',id:'nameIn',maxlength:'24',placeholder:'Your name (optional)',autocomplete:'off'}),
    el('button',{class:'send',onClick:doJoin},'Join session'),
    el('div',{class:'status err',id:'jmsg'})
  );
  const q = new URLSearchParams(location.search).get('code');
  if(q) document.getElementById('codeIn').value = q.toUpperCase().slice(0,5);
  document.getElementById('codeIn').addEventListener('keydown',e=>{if(e.key==='Enter')doJoin();});
}

function doJoin(){
  const code=(document.getElementById('codeIn').value||'').toUpperCase().trim();
  const name=(document.getElementById('nameIn').value||'').trim();
  const msg=document.getElementById('jmsg'); msg.textContent='';
  if(code.length<4){msg.textContent='That code looks too short.';return;}
  state.name=name;
  socket.emit('join',{code,name,clientId},res=>{
    if(res.error){msg.textContent=res.error;return;}
    clientId=res.clientId; localStorage.setItem('op_clientId',clientId);
    state.joined=true; state.scoringOn=res.scoringOn; state.question=res.question; state.answered=res.alreadyAnswered; state.revealed=res.revealed;
    codepill.style.display=''; codepill.textContent='Code '+code;
    shell.classList.add('bright');
    if(!state.question) showLobby(res.title); else drawQuestion();
  });
}

function showLobby(title){
  card.innerHTML='';
  card.append(
    el('div',{class:'thanks'},
      el('div',{class:'waitspin'}),
      el('div',{style:'font-family:var(--f-display);font-weight:600;font-size:22px;color:#152029'}, title||'You\u2019re in.'),
      el('div',{style:'color:#3a464e;margin-top:6px'},'Waiting for the presenter to start\u2026'),
      state.name?el('div',{class:'pill-dark'},'Joined as '+state.name):''
    )
  );
}

function drawQuestion(){
  const q=state.question; if(!q){showLobby();return;}
  shell.classList.add('bright');
  card.innerHTML='';
  card.append(el('div',{style:'font-family:var(--f-mono);font-size:12px;color:#5a6670;margin-bottom:4px'}, `Question ${q.index+1} of ${q.total}`));
  card.append(el('div',{class:'pq'}, q.text||''));
  if(q.imageUrl) card.append(el('img',{class:'qimg',src:q.imageUrl,alt:''}));

  const opts=el('div',{class:'opts'});
  q.options.forEach((o,i)=>{
    let cls='opt';
    const locked = state.answered || state.revealed;
    if(state.revealed && state.revealData){
      if(state.revealData.correct.includes(i)) cls+=' correct';
      else if(i===state.myChoice) cls+=' incorrect';
      else cls+=' disabled';
    } else if(state.myChoice===i){ cls+=' sel'; }
    else if(locked){ cls+=' disabled'; }
    const b=el('button',{class:cls,onClick:()=>{ if(state.answered||state.revealed)return; answer(i); }},
      el('span',{class:'k'}, q.type==='truefalse'? (i===0?'T':'F') : String.fromCharCode(65+i)),
      el('span',{}, o.text)
    );
    if(state.revealed && state.revealData){
      if(state.revealData.correct.includes(i)) b.append(el('span',{class:'rmark',style:'color:var(--good)'},'✓'));
      else if(i===state.myChoice) b.append(el('span',{class:'rmark',style:'color:var(--bad)'},'✕'));
    }
    opts.append(b);
  });
  card.append(opts);

  if(state.revealed && state.revealData){
    if(state.scoringOn && state.myChoice!=null){
      const right = state.revealData.correct.includes(state.myChoice);
      card.append(el('div',{class:'pill-dark',style:right?'color:var(--teal-deep);border-color:var(--teal)':''}, right?'Correct ✓':'Not this time'));
    }
    if(state.revealData.explanation) card.append(el('div',{class:'explain'}, state.revealData.explanation));
  } else if(state.answered){
    card.append(el('div',{class:'status'},'Answer locked in — waiting for the reveal.'));
  } else {
    card.append(el('div',{class:'status'},'Tap your answer.'));
  }
}

function answer(i){
  state.myChoice=i; drawQuestion();
  socket.emit('answer',{choice:i},res=>{
    if(res && res.error){ state.myChoice=null; drawQuestion(); return; }
    state.answered=true; drawQuestion();
  });
}

function showLeaderboard(list){
  card.innerHTML='';
  card.append(el('h2',{style:'text-align:center'},'Leaderboard'));
  const lb=el('div',{class:'lb'});
  list.forEach((p,i)=>{
    lb.append(el('div',{class:'row'+(p.name===state.name?' me':'')},
      el('span',{class:'rk'},'#'+(i+1)), el('span',{class:'nm'},p.name), el('span',{class:'sc'},p.score)));
  });
  if(!list.length) lb.append(el('div',{class:'row'},'No scores yet.'));
  card.append(lb);
}

// ---- socket events ----
socket.on('question', q=>{ state.question=q; state.myChoice=null; state.answered=false; state.revealed=false; state.revealData=null; drawQuestion(); });
socket.on('reveal', data=>{ state.revealed=true; state.revealData=data; drawQuestion(); });
socket.on('leaderboard', list=>{ showLeaderboard(list); });
socket.on('ended', ({leaderboard})=>{
  card.innerHTML='';
  card.append(el('div',{class:'thanks'}, el('div',{class:'big'},'That\u2019s a wrap.'), el('div',{},'Thanks for taking part.')));
  if(state.scoringOn && leaderboard && leaderboard.length){ card.append(el('div',{style:'height:14px'})); showLeaderboardAppend(leaderboard); }
});
function showLeaderboardAppend(list){ const lb=el('div',{class:'lb'}); list.forEach((p,i)=>lb.append(el('div',{class:'row'+(p.name===state.name?' me':'')},el('span',{class:'rk'},'#'+(i+1)),el('span',{class:'nm'},p.name),el('span',{class:'sc'},p.score)))); card.append(lb); }
socket.on('disconnect', ()=>{ /* socket.io auto-reconnects; state stays */ });
socket.on('connect', ()=>{ if(state.joined && clientId){ /* re-register on reconnect */ const code=codepill.textContent.replace('Code ','').trim(); socket.emit('join',{code,name:state.name,clientId},()=>{}); } });

showCodeEntry();
