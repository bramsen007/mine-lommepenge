import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyByjjJz6w9uEFwYG7SkiVpcD8akcdZqx8g',
  authDomain: 'mine-lommepenge.firebaseapp.com',
  projectId: 'mine-lommepenge',
  storageBucket: 'mine-lommepenge.firebasestorage.app',
  messagingSenderId: '179902889564',
  appId: '1:179902889564:web:8253edd9fd51328fabf099',
  measurementId: 'G-1T4R3GJC7D'
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const LOCAL_KEY='mineLommepengeDeviceV3';
const seed={parentName:'Simon',profileImage:'',childName:'Mit barn',pin:'2468',childPin:'',savingsGoal:{title:'',target:0,saved:0},tasks:[],history:[]};

const DEFAULT_TASKS=[
  {title:'Tøm opvaskemaskinen',emoji:'🍽️'},
  {title:'Læg undertøj sammen og på plads',emoji:'👕'},
  {title:'Ryd op på dit værelse',emoji:'🧹'},
  {title:'Læs i 20 minutter',emoji:'📚'},
  {title:'Tør køkkenbordet af',emoji:'🧽'},
  {title:'Tør alle borde af',emoji:'🧽'},
  {title:'Tag skraldet ud',emoji:'🗑️'},
  {title:'Dæk bord',emoji:'🍽️'},
  {title:'Red din seng',emoji:'🛏️'},
  {title:'Læg tøj sammen',emoji:'👕'}
];

let user=null;
let authReady=false;
let state=null;
let view='home';
let role=loadDevice().role || 'parent';
let childUnlocked=sessionStorage.getItem('mineLommepengeChildUnlocked')==='1';
let modal=null;
let filter='all';
let unsubscribe=null;
let proofs={};
let photoDraft=null;
let photoStatus='';
let busy=false;
let syncState='offline';

function loadDevice(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}catch{return {}}}
function saveDevice(){localStorage.setItem(LOCAL_KEY,JSON.stringify({role}))}
function clone(o){return JSON.parse(JSON.stringify(o))}
function fmt(n){return `${Number(n||0).toLocaleString('da-DK')} kr.`}
function earned(){return (state?.history||[]).filter(x=>x.type==='earn').reduce((s,x)=>s+Number(x.amount||0),0)}
function balance(){return (state?.history||[]).reduce((s,x)=>s+Number(x.amount||0),0)}
function savedForGoal(){return Number(state?.savingsGoal?.saved||0)}
function goalProgress(){const target=Number(state?.savingsGoal?.target||0);return target>0?Math.min(100,Math.max(0,(savedForGoal()/target)*100)):0}
function pendingTotal(){return (state?.tasks||[]).filter(t=>t.status==='pending').reduce((s,t)=>s+Number(t.amount||0),0)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function statusText(){return syncState==='online'?'Synkroniseret':syncState==='saving'?'Gemmer…':'Ikke synkroniseret'}
function statusClass(){return syncState==='online'?'done':'pending'}

async function cloudSave(){
  if(!user||!state)return;
  syncState='saving'; render();
  try{
    await setDoc(doc(db,'users',user.uid),{...state,proofs,updatedAt:serverTimestamp()},{merge:true});
    syncState='online';
  }catch(e){
    console.error(e); syncState='offline'; alert('Kunne ikke gemme i skyen. Kontrollér Firebase-opsætningen.');
  }
  render();
}

function startSync(u){
  if(unsubscribe)unsubscribe();
  const ref=doc(db,'users',u.uid);
  unsubscribe=onSnapshot(ref, async snap=>{
    if(snap.exists()){
      const d=snap.data();
      const goal=(d.savingsGoal && typeof d.savingsGoal==='object')?d.savingsGoal:{};
      state={parentName:d.parentName||'Simon',profileImage:d.profileImage||'',childName:d.childName||'Barn',pin:d.pin||'2468',childPin:d.childPin||'',savingsGoal:{title:goal.title||'',target:Number(goal.target||0),saved:Number(goal.saved||0)},tasks:Array.isArray(d.tasks)?d.tasks:[],history:Array.isArray(d.history)?d.history:[]};
      proofs=(d.proofs && typeof d.proofs==='object')?d.proofs:{};
      const dueChanged=activateDueTasks();
      syncState='online'; render();
      if(dueChanged)setDoc(ref,{...state,proofs,updatedAt:serverTimestamp()},{merge:true}).catch(console.error);
    }else{
      state=clone(seed); syncState='saving'; render();
      proofs={};
      await setDoc(ref,{...state,proofs,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      syncState='online'; render();
    }
  },err=>{console.error(err);syncState='offline';render();});

}

onAuthStateChanged(auth,u=>{
  authReady=true;
  user=u;
  if(u){startSync(u)}else{if(unsubscribe){unsubscribe();unsubscribe=null}proofs={};state=null;syncState='offline';render()}
});

function nav(id,icon,label){return `<button class="nav ${view===id?'active':''}" data-nav="${id}"><i>${icon}</i>${label}</button>`}
function bottomNav(){return role==='parent'?`${nav('home','⌂','Hjem')}${nav('tasks','☷','Opgaver')}${nav('money','◎','Sparemål')}${nav('history','◷','Historik')}${nav('settings','♙','Profil')}`:`${nav('home','🏠','Hjem')}${nav('tasks','☑️','Opgaver')}${nav('money','💰','Lommepenge')}${nav('history','📋','Historik')}${nav('settings','⚙️','Indstillinger')}`}
function render(){
  const root=document.getElementById('app');
  if(!authReady){root.innerHTML='<div class="splash"><div class="pig big">🐷</div><h1>Mine Lommepenge</h1><p>Åbner appen…</p></div>';return}
  if(!user){root.innerHTML=loginHtml();bindLogin();return}
  if(!state){root.innerHTML='<div class="splash"><div class="pig big">🐷</div><h1>Mine Lommepenge</h1><p>Henter jeres data…</p></div>';return}
  if(role==='child'&&state.childPin&&!childUnlocked){root.innerHTML=childUnlockHtml();bindChildUnlock();return}
  root.innerHTML=`<main class="app ${role==='parent'?'parent-ui':'child-ui'}">${header()}${content()}${role==='parent'&&view==='tasks'?'<button class="fab premium-fab" data-action="add">+</button>':''}</main><nav class="bottom ${role==='parent'?'premium-bottom':''}">${bottomNav()}</nav>${modal?modalHtml():''}`;
  bind();
}

function loginHtml(){return `<div class="auth-shell"><div class="auth-card"><div class="auth-logo">🐷</div><h1>Mine Lommepenge</h1><p class="auth-sub">Opgaver, godkendelser og lommepenge på både iPhone og iPad.</p><div class="switcher"><button id="loginTab" class="active">Log ind</button><button id="signupTab">Opret konto</button></div><div class="field"><label>E-mail</label><input id="authEmail" type="email" autocomplete="email" placeholder="din@email.dk"></div><div class="field"><label>Adgangskode</label><input id="authPassword" type="password" autocomplete="current-password" placeholder="Mindst 6 tegn"></div><button id="authSubmit" class="btn primary full">Log ind</button><div id="authMsg" class="auth-msg"></div><div class="notice">Brug den samme konto på din iPhone og din datters iPad. Hver enhed kan derefter vælges som Forælder eller Barn.</div></div></div>`}

function bindLogin(){
  let mode='login';
  const lt=document.getElementById('loginTab'), st=document.getElementById('signupTab'), btn=document.getElementById('authSubmit'), msg=document.getElementById('authMsg');
  const setMode=m=>{mode=m;lt.classList.toggle('active',m==='login');st.classList.toggle('active',m==='signup');btn.textContent=m==='login'?'Log ind':'Opret konto'};
  lt.onclick=()=>setMode('login'); st.onclick=()=>setMode('signup');
  btn.onclick=async()=>{
    const email=document.getElementById('authEmail').value.trim(); const password=document.getElementById('authPassword').value;
    if(!email||password.length<6){msg.textContent='Skriv en gyldig e-mail og en adgangskode på mindst 6 tegn.';return}
    btn.disabled=true; msg.textContent='';
    try{if(mode==='signup')await createUserWithEmailAndPassword(auth,email,password);else await signInWithEmailAndPassword(auth,email,password)}catch(e){console.error(e);msg.textContent=authError(e.code)}finally{btn.disabled=false}
  }
}
function authError(code){if(code==='auth/email-already-in-use')return 'E-mailen er allerede oprettet. Vælg Log ind.';if(code==='auth/invalid-credential')return 'Forkert e-mail eller adgangskode.';if(code==='auth/operation-not-allowed')return 'E-mail/adgangskode er ikke aktiveret i Firebase endnu.';if(code==='auth/network-request-failed')return 'Ingen forbindelse til nettet.';return 'Kunne ikke logge ind. Prøv igen.'}

function childUnlockHtml(){return `<div class="auth-shell"><div class="auth-card child-lock"><div class="auth-logo">🐷</div><h1>Hej ${esc(state.childName)} 💜</h1><p class="auth-sub">Indtast din 4-cifrede kode for at åbne Mine Lommepenge.</p><div class="field"><label>Din kode</label><input id="childPinInput" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••"></div><button id="childUnlockBtn" class="btn primary full">Åbn appen</button><button id="parentFromLock" class="linkbtn lock-parent">Forælder?</button><div id="childPinMsg" class="auth-msg"></div></div></div>`}
function bindChildUnlock(){
  const input=document.getElementById('childPinInput');
  const btn=document.getElementById('childUnlockBtn');
  const msg=document.getElementById('childPinMsg');
  const unlock=()=>{if(input.value===String(state.childPin||'')){childUnlocked=true;sessionStorage.setItem('mineLommepengeChildUnlocked','1');render()}else{msg.textContent='Forkert kode. Prøv igen.';input.select()}};
  btn.onclick=unlock;input.onkeydown=e=>{if(e.key==='Enter')unlock()};
  document.getElementById('parentFromLock').onclick=()=>{const pin=prompt('Indtast forældre-PIN');if(pin===String(state.pin)){role='parent';saveDevice();childUnlocked=false;sessionStorage.removeItem('mineLommepengeChildUnlocked');view='home';render()}else if(pin!==null)alert('Forkert PIN')};
  input.focus();
}

function repeatText(t){
  if(t.status==='scheduled'&&t.nextAvailable){return `Næste gang ${new Date(Number(t.nextAvailable)).toLocaleDateString('da-DK',{weekday:'short',day:'numeric',month:'short'})}`}
  if(t.repeat==='dagligt')return 'Dagligt';
  if(t.repeat==='ugentligt')return 'Ugentligt';
  return 'Engangsopgave';
}
function nextAvailableAt(repeat,from=Date.now()){
  const d=new Date(from);d.setHours(0,0,0,0);
  if(repeat==='dagligt'){d.setDate(d.getDate()+1);return d.getTime()}
  if(repeat==='ugentligt'){d.setDate(d.getDate()+7);return d.getTime()}
  return 0;
}
function activateDueTasks(){
  if(!state?.tasks)return false;let changed=false;const now=Date.now();
  for(const t of state.tasks){if(t.status==='scheduled'&&Number(t.nextAvailable||0)<=now){t.status='open';delete t.nextAvailable;changed=true}}
  return changed;
}

function greeting(){const h=new Date().getHours();return h<10?'God morgen':h<18?'God eftermiddag':'God aften'}
function monthEarned(){const now=new Date();return (state?.history||[]).filter(x=>{if(x.type!=='earn')return false;const d=new Date(Number(x.date));return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((s,x)=>s+Number(x.amount||0),0)}
function parentAvatar(cls=''){const img=state.profileImage;const initial=(state.parentName||'S').trim().charAt(0).toUpperCase()||'S';return img?`<span class="parent-avatar ${cls}"><img src="${img}" alt="Profilbillede"></span>`:`<span class="parent-avatar ${cls} parent-avatar-fallback">${esc(initial)}</span>`}
function header(){if(role==='parent'){const pending=(state.tasks||[]).filter(t=>t.status==='pending').length;return `<div class="premium-top"><button class="avatar-button" data-nav="settings">${parentAvatar()}</button><div class="premium-welcome"><span>${greeting()},</span><strong>${esc(state.parentName||'Simon')}</strong><small>Mine Lommepenge · <span class="sync-dot ${statusClass()}">${statusText()}</span></small></div><button class="premium-bell" data-action="showPending" aria-label="Afventende opgaver">♢${pending?`<b>${pending}</b>`:''}</button></div>`}return `<div class="top"><div class="brand"><div class="pig">🐷</div><div><div class="title">Mine Lommepenge</div><div class="subtitle">Hej ${esc(state.childName)} 💜 · <span class="sync-dot ${statusClass()}">${statusText()}</span></div></div></div><button class="role" data-action="role">🧒 Barn</button></div>`}
function content(){return ({home,tasks,money,history,settings}[view]||home)()}
function parentMiniTask(t){const proof=proofs[String(t.id)];const status=t.status==='pending'?'Afventer':t.status==='rejected'?'Afvist':'Klar';return `<button class="premium-mini-task" data-nav="tasks"><span class="mini-thumb ${proof?.imageData?'has-image':''}">${proof?.imageData?`<img src="${proof.imageData}" alt="">`:t.emoji||'⭐'}</span><span class="mini-main"><b>${esc(t.title)}</b><small>${status}</small></span><strong>${fmt(t.amount)}</strong></button>`}
function parentHome(){const pending=(state.tasks||[]).filter(t=>t.status==='pending');const current=(state.tasks||[]).filter(t=>['pending','open','rejected'].includes(t.status)).sort((a,b)=>{const rank={pending:0,rejected:1,open:2};return (rank[a.status]??9)-(rank[b.status]??9)}).slice(0,4);const g=state.savingsGoal||{};const hasGoal=Boolean(g.title&&Number(g.target)>0);return `<section class="premium-wallet"><div class="wallet-top"><div><span class="wallet-child">${esc(state.childName)}</span><small>Aktuel saldo</small><div class="premium-balance">${fmt(balance())}</div></div>${balance()>0?'<button class="gold-button" data-action="quickPayout">▣ Udbetal</button>':''}</div><div class="wallet-stats"><div><span>Afventer godkendelse</span><b>${fmt(pendingTotal())}</b></div><div><span>Optjent denne måned</span><b>${fmt(monthEarned())}</b></div><div><span>Sparemål i alt</span><b>${fmt(savedForGoal())}</b></div></div></section>${pending.length?`<button class="approval-banner" data-action="showPending"><span class="approval-clock">◷</span><span><b>${pending.length} ${pending.length===1?'opgave venter':'opgaver venter'} på dig</b><small>I alt ${fmt(pendingTotal())} · afventer godkendelse</small></span><strong>Se og godkend</strong></button>`:''}<div class="premium-section-head"><h3>Aktuelle opgaver</h3><button data-nav="tasks">Se alle</button></div>${current.length?`<div class="premium-mini-list">${current.map(parentMiniTask).join('')}</div>`:'<div class="empty premium-empty">Ingen aktive opgaver lige nu 🎉</div>'}${hasGoal?`<div class="premium-section-head"><h3>Sparemål</h3><button data-nav="money">Se alle</button></div><button class="premium-goal-card" data-nav="money"><div class="goal-picture">🎯</div><div class="goal-copy"><b>${esc(g.title)}</b><span>${fmt(savedForGoal())} / ${fmt(g.target)}</span><div class="premium-progress"><i style="width:${goalProgress()}%"></i></div></div><strong>${Math.round(goalProgress())}%</strong></button>`:''}`}
function home(){if(role==='parent')return parentHome();const homeTasks=(state.tasks||[]).filter(t=>['open','rejected'].includes(t.status)).slice(0,4);return `<section class="hero"><h2>Din saldo</h2><div class="balance">${fmt(balance())}</div><div class="hero-grid"><div class="hero-stat"><span>Afventer godkendelse</span><b>${fmt(pendingTotal())}</b></div><div class="hero-stat"><span>Udbetalt</span><b>${fmt(Math.abs((state.history||[]).filter(x=>x.type==='payout').reduce((s,x)=>s+Number(x.amount||0),0)))}</b></div></div></section><div class="section-head"><h3>Dine opgaver</h3><button data-nav="tasks">Se alle ›</button></div>${taskList(homeTasks)}`}
function taskList(arr){if(!arr.length)return `<div class="empty">Ingen opgaver her endnu 🎉</div>`; return `<div class="list">${arr.map(taskCard).join('')}</div>`}
function taskCard(t){
  let p=role==='parent';
  let status={open:'Klar',pending:'Afventer godkendelse',approved:'Godkendt',rejected:'Ikke godkendt',scheduled:'Planlagt'}[t.status]||'';
  const proof=proofs[String(t.id)];
  const proofHtml=proof?.imageData?`<button class="proof-card" data-action="viewPhoto" data-id="${t.id}" aria-label="Se billede"><img src="${proof.imageData}" alt="Billede af udført opgave"><span>📷 Se billede</span></button>`:'';
  return `<div class="task"><div class="task-row"><div class="emoji">${t.emoji||'⭐'}</div><div class="grow"><div class="task-title">${esc(t.title)}</div><div class="task-meta">${esc(repeatText(t))} · <span class="badge ${t.status==='pending'?'pending':t.status==='approved'?'done':t.status==='rejected'?'rejected':t.status==='scheduled'?'scheduled':''}">${status}</span>${proof?.imageData?' · 📷 billede':''}</div></div><div class="money">${fmt(t.amount)}</div></div>${proofHtml}<div class="actions">${p&&t.status==='pending'?`<button class="btn green" data-action="approve" data-id="${t.id}">✓ Godkend</button><button class="btn red" data-action="reject" data-id="${t.id}">✕ Afvis</button>`:''}${p?`<button class="btn gray" data-action="edit" data-id="${t.id}">Rediger</button>`:''}${!p&&(t.status==='open'||t.status==='rejected')?`<button class="btn primary full" data-action="finish" data-id="${t.id}">Jeg er færdig ✓</button>`:''}</div></div>`
}
function tasks(){let p=role==='parent'; let arr=(state.tasks||[]).filter(t=>filter==='all'||t.status===filter);return `<div class="section-head"><h3>Opgaver</h3></div><div class="tabs"><button class="tab ${filter==='all'?'active':''}" data-filter="all">Alle</button><button class="tab ${filter==='open'?'active':''}" data-filter="open">Klar</button><button class="tab ${filter==='pending'?'active':''}" data-filter="pending">Afventer</button><button class="tab ${filter==='scheduled'?'active':''}" data-filter="scheduled">Planlagt</button><button class="tab ${filter==='approved'?'active':''}" data-filter="approved">Godkendt</button></div><div style="height:10px"></div>${taskList(arr)}${p?'<div class="notice">Daglige og ugentlige opgaver bliver automatisk klar igen på den næste planlagte dag.</div>':''}`}
function money(){
  const g=state.savingsGoal||{title:'',target:0,saved:0};
  const hasGoal=Boolean(g.title&&Number(g.target)>0);
  const goalPanel=hasGoal
    ? `<div class="panel goal-panel"><div class="goal-head"><div><div class="goal-label">🎯 Sparemål</div><h3>${esc(g.title)}</h3></div><b>${fmt(savedForGoal())} / ${fmt(g.target)}</b></div><div class="progress"><span style="width:${goalProgress()}%"></span></div><div class="goal-actions">${balance()>0?'<button class="btn primary" data-action="addToGoal">Læg på sparemål</button>':''}${role==='parent'?'<button class="btn gray" data-action="editGoal">Rediger mål</button>':''}${role==='parent'&&savedForGoal()>0?'<button class="btn gray" data-action="releaseGoal">Flyt tilbage</button>':''}</div></div>`
    : (role==='parent'?`<div class="panel goal-panel"><div class="goal-head"><div><div class="goal-label">🎯 Sparemål</div><h3>Hvad sparer ${esc(state.childName)} op til?</h3></div></div><button class="btn primary full" data-action="editGoal">Opret sparemål</button></div>`:'');
  return `<div class="section-head"><h3>Lommepenge</h3></div><section class="hero ${role==='parent'?'parent':''}"><h2>Til rådighed</h2><div class="balance">${fmt(balance())}</div><div class="hero-grid"><div class="hero-stat"><span>Optjent i alt</span><b>${fmt(earned())}</b></div><div class="hero-stat"><span>På sparemål</span><b>${fmt(savedForGoal())}</b></div></div></section>${goalPanel}${role==='parent'?`<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Registrer udbetaling</h3><div class="field"><label>Beløb</label><input id="payoutAmount" type="number" min="1" step="1" value="${Math.max(0,balance())}"></div><button class="btn primary full" data-action="payout">Marker som udbetalt</button></div>`:'<div class="success">Når en opgave er godkendt, kommer pengene automatisk på din saldo.</div>'}`;
}
function history(){
  let h=[...(state.history||[])].sort((a,b)=>Number(b.date)-Number(a.date));
  return `<div class="section-head"><h3>Historik</h3></div>${h.length?`<div class="list">${h.map(x=>`<div class="history-item"><div class="emoji">${x.type==='payout'?'💸':x.type==='save'||x.type==='unsave'?'🎯':'✅'}</div><div class="grow"><div class="task-title">${esc(x.title)}</div><div class="date">${new Date(Number(x.date)).toLocaleString('da-DK',{dateStyle:'medium',timeStyle:'short'})}</div></div><div class="money ${x.amount<0?'negative':''}">${x.amount>0?'+':''}${fmt(x.amount)}</div></div>`).join('')}</div>`:'<div class="empty">Ingen historik endnu.</div>'}`;
}
function settings(){if(role!=='parent')return `<div class="section-head"><h3>Indstillinger</h3></div><div class="settings-group"><div class="setting"><span>☁️ Synkronisering</span><span class="badge ${statusClass()}">${statusText()}</span></div><div class="setting"><span>📱 Denne enhed</span><button class="linkbtn" data-action="deviceRole">Barn</button></div><div class="setting"><span>📲 Installér på hjemmeskærm</span><button class="linkbtn" data-action="installHelp">Vis hjælp</button></div><div class="setting"><span>🚪 Log ud</span><button class="linkbtn danger" data-action="logout">Log ud</button></div></div>`;return `<div class="profile-page"><div class="profile-hero"><h2>Rediger profil</h2><div class="profile-avatar-large">${parentAvatar('large')}<label for="profileCamera" class="avatar-edit">✎</label></div><label class="profile-change" for="profileGallery">Skift profilbillede</label><input id="profileGallery" class="camera-input" type="file" accept="image/*"><input id="profileCamera" class="camera-input" type="file" accept="image/*" capture="user"></div><div class="profile-actions"><label for="profileCamera">📷 Tag billede</label><label for="profileGallery">▧ Vælg fra billeder</label>${state.profileImage?'<button class="danger-row" data-action="removeProfileImage">🗑 Fjern billede</button>':''}</div><div class="profile-settings"><h4>KONTOINDSTILLINGER</h4><div class="panel premium-settings-panel"><div class="field"><label>Dit navn</label><input id="parentName" value="${esc(state.parentName||'Simon')}"></div><div class="field"><label>Barnets navn</label><input id="childName" value="${esc(state.childName)}"></div><div class="field"><label>Barnets 4-cifrede kode</label><input id="childPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${esc(state.childPin||'')}" placeholder="Valgfri"></div><div class="field"><label>Forældre-PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="6" value="${esc(state.pin)}"></div><button class="btn premium-primary full" data-action="saveSettings">Gem ændringer</button></div></div><div class="settings-group premium-settings-list"><div class="setting"><span>☁️ Synkronisering</span><span class="badge ${statusClass()}">${statusText()}</span></div><div class="setting"><span>📱 Denne enhed</span><button class="linkbtn" data-action="deviceRole">Forælder</button></div><div class="setting"><span>🚪 Log ud</span><button class="linkbtn danger" data-action="logout">Log ud</button></div></div></div>`}
function modalHtml(){
  if(modal.type==='task'){
    let t=modal.task||{};
    const presetOptions=DEFAULT_TASKS.map(x=>`<option value="${esc(x.title)}" ${t.title===x.title?'selected':''}>${esc(x.title)}</option>`).join('');
    return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>${t.id?'Rediger opgave':'Ny opgave'}</h3><button class="close" data-action="close">×</button></div><div class="field"><label>Vælg en hurtig opgave</label><select id="mPreset"><option value="">Vælg fra listen…</option>${presetOptions}</select></div><div class="field"><label>Opgave</label><input id="mTitle" value="${esc(t.title||'')}" placeholder="Eller skriv din egen opgave her"></div><div class="field"><label>Beløb i kr.</label><input id="mAmount" type="number" min="0" step="1" value="${t.amount??10}"></div><div class="field"><label>Emoji</label><input id="mEmoji" value="${esc(t.emoji||'⭐')}"></div><div class="field"><label>Gentagelse</label><select id="mRepeat"><option value="engang">Engangsopgave</option><option value="dagligt" ${t.repeat==='dagligt'?'selected':''}>Dagligt</option><option value="ugentligt" ${t.repeat==='ugentligt'?'selected':''}>Ugentligt</option></select></div><button class="btn primary full" data-action="saveTask" data-id="${t.id||''}">Gem opgave</button>${t.id?`<button class="btn red full" style="margin-top:8px" data-action="deleteTask" data-id="${t.id}">Slet opgave</button>`:''}</div></div>`
  }
  if(modal.type==='pin')return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Forældreadgang</h3><button class="close" data-action="close">×</button></div><div class="field"><label>Indtast PIN</label><input id="pinInput" type="password" inputmode="numeric" maxlength="6" autofocus></div><button class="btn primary full" data-action="checkPin">Fortsæt</button></div></div>`;
  if(modal.type==='install')return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Installér appen</h3><button class="close" data-action="close">×</button></div><p><b>iPhone/iPad:</b> Åbn appens HTTPS-adresse i Safari, tryk på Del-knappen og vælg <b>Føj til hjemmeskærm</b>.</p><p>Derefter åbner Mine Lommepenge som en selvstændig app med eget ikon.</p></div></div>`;
  if(modal.type==='device')return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Denne enhed</h3><button class="close" data-action="close">×</button></div><p>Vælg hvordan denne enhed skal åbne appen.</p><div class="switcher"><button class="${role==='parent'?'active':''}" data-action="setParent">👨‍👧 Forælder</button><button class="${role==='child'?'active':''}" data-action="setChild">🧒 Barn</button></div></div></div>`;
  if(modal.type==='goalEdit'){const g=state.savingsGoal||{};return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Sparemål</h3><button class="close" data-action="close">×</button></div><div class="field"><label>Hvad spares der op til?</label><input id="goalTitle" value="${esc(g.title||'')}" placeholder="Fx nye høretelefoner"></div><div class="field"><label>Mål i kr.</label><input id="goalTarget" type="number" min="1" step="1" value="${Number(g.target||500)}"></div><button class="btn primary full" data-action="saveGoal">Gem sparemål</button></div></div>`;}
  if(modal.type==='goalAdd'){return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Læg på sparemål</h3><button class="close" data-action="close">×</button></div><p>Til rådighed: <b>${fmt(balance())}</b></p><div class="field"><label>Beløb</label><input id="goalAmount" type="number" min="1" max="${Math.max(0,balance())}" step="1" value="${Math.max(0,balance())}"></div><button class="btn primary full" data-action="saveGoalAmount">Læg på sparemål</button></div></div>`;}
  if(modal.type==='goalRelease'){return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Flyt tilbage til saldo</h3><button class="close" data-action="close">×</button></div><p>På sparemålet: <b>${fmt(savedForGoal())}</b></p><div class="field"><label>Beløb</label><input id="goalReleaseAmount" type="number" min="1" max="${savedForGoal()}" step="1" value="${savedForGoal()}"></div><button class="btn primary full" data-action="releaseGoalAmount">Flyt tilbage</button></div></div>`;}
  if(modal.type==='photo'){
    const t=modal.task;
    return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Opgaven er færdig 🎉</h3><button class="close" data-action="close">×</button></div><p class="photo-help">Du kan tage et billede af <b>${esc(t.title)}</b>, så din forælder kan se det før godkendelse.</p><label class="camera-btn" for="proofInput">📷 Tag billede</label><input id="proofInput" class="camera-input" type="file" accept="image/*" capture="environment"><div id="photoPreview" class="photo-preview">${photoDraft?`<img src="${photoDraft}" alt="Billedet der sendes">`:'<span>Intet billede valgt endnu</span>'}</div><div id="photoStatus" class="photo-status">${esc(photoStatus)}</div><button class="btn primary full" data-action="sendPhoto" data-id="${t.id}" ${photoDraft?'':'disabled'}>Send med billede</button><button class="btn gray full" style="margin-top:8px" data-action="skipPhoto" data-id="${t.id}">Send uden billede</button></div></div>`
  }
  if(modal.type==='viewPhoto'){
    const proof=proofs[String(modal.taskId)];
    return `<div class="modal-wrap"><div class="modal"><div class="modal-head"><h3>Billede af opgaven</h3><button class="close" data-action="close">×</button></div>${proof?.imageData?`<img class="proof-full" src="${proof.imageData}" alt="Billede af udført opgave">`:'<div class="empty">Billedet er ikke længere tilgængeligt.</div>'}</div></div>`
  }
  return ''
}

function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Kunne ikke læse billedet'));
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('Kunne ikke åbne billedet'));
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function compressPhoto(file){
  if(!file || !file.type.startsWith('image/'))throw new Error('Vælg et billede');
  const img=await fileToImage(file);
  let maxDim=720;
  let quality=.58;
  let data='';
  for(let i=0;i<5;i++){
    const scale=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,w,h);
    data=canvas.toDataURL('image/jpeg',quality);
    if(data.length<180000)return data;
    maxDim=Math.round(maxDim*.82);
    quality=Math.max(.38,quality-.07);
  }
  if(data.length>=220000)throw new Error('Billedet er for stort. Prøv igen lidt længere fra motivet.');
  return data;
}

async function compressProfilePhoto(file){
  if(!file || !file.type.startsWith('image/'))throw new Error('Vælg et billede');
  const img=await fileToImage(file);
  let maxDim=420,quality=.72,data='';
  for(let i=0;i<5;i++){
    const scale=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const side=Math.min(w,h);
    const sx=Math.max(0,Math.round((w-side)/2));
    const sy=Math.max(0,Math.round((h-side)/2));
    const canvas=document.createElement('canvas');canvas.width=side;canvas.height=side;
    const temp=document.createElement('canvas');temp.width=w;temp.height=h;
    temp.getContext('2d').drawImage(img,0,0,w,h);
    canvas.getContext('2d').drawImage(temp,sx,sy,side,side,0,0,side,side);
    data=canvas.toDataURL('image/jpeg',quality);
    if(data.length<100000)return data;
    maxDim=Math.round(maxDim*.82);quality=Math.max(.48,quality-.06);
  }
  return data;
}
function bindProfileInputs(){
  ['profileGallery','profileCamera'].forEach(id=>{const input=document.getElementById(id);if(!input)return;input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{state.profileImage=await compressProfilePhoto(file);await cloudSave()}catch(e){console.error(e);alert('Kunne ikke gemme profilbilledet. Prøv et andet billede.')}}});
}
function saveProof(taskId,imageData,title){
  proofs[String(taskId)]={imageData,title,createdAt:Date.now()};
}

function removeProof(taskId){
  delete proofs[String(taskId)];
}

function bindPhotoInput(){
  const input=document.getElementById('proofInput');
  if(!input)return;
  input.onchange=async()=>{
    const file=input.files?.[0];
    if(!file)return;
    photoStatus='Gør billedet klar…';
    render();
    try{
      photoDraft=await compressPhoto(file);
      photoStatus='Billedet er klar til at blive sendt.';
    }catch(e){
      console.error(e);photoDraft=null;photoStatus=e.message||'Kunne ikke behandle billedet.';
    }
    render();
  }
}

function bindTaskPreset(){
  const preset=document.getElementById('mPreset');
  if(!preset)return;
  preset.onchange=()=>{
    const chosen=DEFAULT_TASKS.find(x=>x.title===preset.value);
    if(!chosen)return;
    const title=document.getElementById('mTitle');
    const emoji=document.getElementById('mEmoji');
    if(title)title.value=chosen.title;
    if(emoji)emoji.value=chosen.emoji;
    title?.focus();
  };
}
function bind(){bindPhotoInput();bindTaskPreset();bindProfileInputs();document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{view=b.dataset.nav;render()});document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action,b.dataset.id));}
async function act(a,id){
  let t=(state.tasks||[]).find(x=>String(x.id)===String(id));
  if(a==='role'){if(role==='parent'){role='child';childUnlocked=false;sessionStorage.removeItem('mineLommepengeChildUnlocked');saveDevice();view='home';render()}else{modal={type:'pin'};render()}}
  if(a==='checkPin'){if(document.getElementById('pinInput').value===state.pin){role='parent';childUnlocked=false;sessionStorage.removeItem('mineLommepengeChildUnlocked');saveDevice();view='home';modal=null;render()}else alert('Forkert PIN')}
  if(a==='close'){modal=null;photoDraft=null;photoStatus='';render()}
  if(a==='showPending'){filter='pending';view='tasks';render()}
  if(a==='quickPayout'){const n=Math.max(0,balance());if(n<=0)return;if(confirm(`Registrer ${fmt(n)} som udbetalt?`)){state.history.push({type:'payout',title:'Udbetaling',amount:-n,date:Date.now()});await cloudSave()}}
  if(a==='add'){modal={type:'task'};render()}
  if(a==='edit'){modal={type:'task',task:t};render()}
  if(a==='saveTask'){
    let title=document.getElementById('mTitle').value.trim();
    if(!title)return alert('Skriv en opgave');
    const repeat=document.getElementById('mRepeat').value;
    let status=t?.status||'open';
    let next=t?.nextAvailable;
    if(status==='scheduled'&&repeat==='engang'){status='open';next=0}
    if(status==='scheduled'&&t?.repeat!==repeat&&repeat!=='engang')next=nextAvailableAt(repeat);
    let obj={id:id?Number(id):Date.now(),title,amount:Number(document.getElementById('mAmount').value||0),emoji:document.getElementById('mEmoji').value||'⭐',repeat,status,created:t?.created||Date.now(),...(next?{nextAvailable:next}:{})};
    if(id)state.tasks=state.tasks.map(x=>String(x.id)===String(id)?obj:x);else state.tasks.unshift(obj);
    modal=null;await cloudSave()
  }
  if(a==='deleteTask'){state.tasks=state.tasks.filter(x=>String(x.id)!==String(id));modal=null;removeProof(id);await cloudSave()}
  if(a==='finish'){photoDraft=null;photoStatus='';modal={type:'photo',task:t};render()}
  if(a==='skipPhoto'){
    removeProof(id);
    t.status='pending';t.submittedAt=Date.now();modal=null;photoDraft=null;photoStatus='';await cloudSave()
  }
  if(a==='sendPhoto'){
    if(!photoDraft)return alert('Tag eller vælg først et billede.');
    if(busy)return;
    busy=true;photoStatus='Sender billedet…';render();
    try{
      saveProof(id,photoDraft,t.title);
      t.status='pending';t.submittedAt=Date.now();modal=null;photoDraft=null;photoStatus='';await cloudSave();
    }catch(e){
      console.error(e);photoStatus='Kunne ikke sende billedet. Prøv igen.';render();
    }finally{busy=false}
  }
  if(a==='viewPhoto'){modal={type:'viewPhoto',taskId:id};render()}
  if(a==='approve'){
    t.approvedAt=Date.now();state.history.push({type:'earn',title:t.title,amount:Number(t.amount),date:Date.now()});
    if(t.repeat==='dagligt'||t.repeat==='ugentligt'){t.status='scheduled';t.nextAvailable=nextAvailableAt(t.repeat)}else{t.status='approved'}
    removeProof(id);await cloudSave()
  }
  if(a==='reject'){t.status='rejected';removeProof(id);await cloudSave()}
  if(a==='payout'){let n=Number(document.getElementById('payoutAmount').value||0);if(n<=0||n>balance())return alert('Indtast et gyldigt beløb');state.history.push({type:'payout',title:'Udbetaling',amount:-n,date:Date.now()});await cloudSave()}
  if(a==='editGoal'){modal={type:'goalEdit'};render()}
  if(a==='saveGoal'){const title=document.getElementById('goalTitle').value.trim();const target=Number(document.getElementById('goalTarget').value||0);if(!title||target<=0)return alert('Skriv et navn og et mål større end 0 kr.');state.savingsGoal={title,target,saved:savedForGoal()};modal=null;await cloudSave()}
  if(a==='addToGoal'){if(balance()<=0)return alert('Der er ingen penge til rådighed endnu.');modal={type:'goalAdd'};render()}
  if(a==='saveGoalAmount'){const n=Number(document.getElementById('goalAmount').value||0);if(n<=0||n>balance())return alert('Indtast et gyldigt beløb.');state.savingsGoal.saved=savedForGoal()+n;state.history.push({type:'save',title:`Sparemål: ${state.savingsGoal.title}`,amount:-n,date:Date.now()});modal=null;await cloudSave()}
  if(a==='releaseGoal'){modal={type:'goalRelease'};render()}
  if(a==='releaseGoalAmount'){const n=Number(document.getElementById('goalReleaseAmount').value||0);if(n<=0||n>savedForGoal())return alert('Indtast et gyldigt beløb.');state.savingsGoal.saved=Math.max(0,savedForGoal()-n);state.history.push({type:'unsave',title:`Fra sparemål: ${state.savingsGoal.title}`,amount:n,date:Date.now()});modal=null;await cloudSave()}
  if(a==='saveSettings'){const cp=document.getElementById('childPin').value.trim();if(cp&&!/^\d{4}$/.test(cp))return alert('Barnets kode skal være 4 cifre eller stå tom.');const pn=document.getElementById('parentName');if(pn)state.parentName=pn.value.trim()||'Simon';state.childName=document.getElementById('childName').value.trim()||'Barn';state.childPin=cp;state.pin=document.getElementById('pin').value.trim()||'2468';await cloudSave()}
  if(a==='removeProfileImage'){if(confirm('Vil du fjerne profilbilledet?')){state.profileImage='';await cloudSave()}}
  if(a==='installHelp'){modal={type:'install'};render()}
  if(a==='deviceRole'){modal={type:'device'};render()}
  if(a==='setParent'){modal={type:'pin'};render()}
  if(a==='setChild'){role='child';childUnlocked=false;sessionStorage.removeItem('mineLommepengeChildUnlocked');saveDevice();modal=null;view='home';render()}
  if(a==='logout'){if(confirm('Vil du logge ud på denne enhed?'))await signOut(auth)}
}

render();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
