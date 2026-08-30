import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyByjjJz6w9uEFwYG7SkiVpcD8akcdZqx8g',
  authDomain: 'mine-lommepenge.firebaseapp.com',
  projectId: 'mine-lommepenge',
  storageBucket: 'mine-lommepenge.firebasestorage.app',
  messagingSenderId: '179902889564',
  appId: '1:179902889564:web:8253edd9fd51328fabf099',
  measurementId: 'G-1T4R3GJC7D'
};

const fbApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
let creatingFamily = false;

const gate = document.createElement('div');
gate.id = 'pilotGate';
gate.innerHTML = '<div class="pilot-loading">🐷<strong>Mine Lommepenge</strong><span>Gør klar…</span></div>';
document.body.appendChild(gate);

const style = document.createElement('style');
style.textContent = `
#pilotGate{position:fixed;inset:0;z-index:99999;background:#f7f4ed;color:#06284d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:auto;padding:22px;box-sizing:border-box}
#pilotGate *{box-sizing:border-box}.pilot-loading,.pilot-card{max-width:460px;margin:7vh auto 0;text-align:center}.pilot-loading{display:grid;gap:10px;font-size:44px}.pilot-loading strong{font-size:28px}.pilot-loading span{font-size:15px;color:#6e7781}.pilot-card{background:white;border-radius:24px;padding:26px 22px;box-shadow:0 18px 50px rgba(6,40,77,.12);text-align:left}.pilot-logo{text-align:center;font-size:48px}.pilot-card h1{text-align:center;margin:8px 0 4px;font-size:28px}.pilot-sub{text-align:center;color:#6e7781;margin:0 0 20px;line-height:1.45}.pilot-tabs{display:grid;grid-template-columns:1fr 1fr;background:#eef1f4;border-radius:12px;padding:4px;margin-bottom:18px}.pilot-tabs button{border:0;background:transparent;padding:10px;border-radius:9px;font-weight:700;color:#52606d}.pilot-tabs button.active{background:white;color:#06284d;box-shadow:0 2px 8px rgba(0,0,0,.08)}.pilot-field{margin:12px 0}.pilot-field label{display:block;font-size:13px;font-weight:700;margin:0 0 6px}.pilot-field input{width:100%;border:1px solid #d8dee5;border-radius:12px;padding:13px 14px;font:inherit;font-size:16px}.pilot-btn{width:100%;border:0;border-radius:13px;padding:14px 16px;background:#06284d;color:white;font:inherit;font-weight:800;font-size:16px;margin-top:10px}.pilot-btn:disabled{opacity:.55}.pilot-msg{min-height:20px;color:#b42318;font-size:13px;margin-top:10px;text-align:center}.pilot-note{margin-top:16px;background:#f4f7fa;border-radius:12px;padding:12px;font-size:13px;line-height:1.45;color:#52606d}.pilot-ok{color:#177245}
`;
document.head.appendChild(style);

function authMessage(code){
  if(code==='auth/email-already-in-use')return 'E-mailen er allerede oprettet. Vælg Log ind.';
  if(code==='auth/invalid-credential')return 'Forkert e-mail eller adgangskode.';
  if(code==='auth/weak-password')return 'Adgangskoden skal være på mindst 6 tegn.';
  if(code==='auth/invalid-email')return 'Skriv en gyldig e-mailadresse.';
  if(code==='auth/network-request-failed')return 'Ingen forbindelse til nettet.';
  return 'Det lykkedes ikke. Prøv igen.';
}

function showEntry(){
  gate.innerHTML = `
    <div class="pilot-card">
      <div class="pilot-logo">🐷</div>
      <h1>Mine Lommepenge</h1>
      <p class="pilot-sub">Pilotversion til familien. Opret familien én gang, og brug derefter samme familiekonto på forælderens iPhone og barnets iPhone eller iPad.</p>
      <div class="pilot-tabs"><button id="pilotCreateTab" class="active">Opret familie</button><button id="pilotLoginTab">Log ind</button></div>
      <div id="pilotFamilyFields">
        <div class="pilot-field"><label>Familiens navn</label><input id="pilotFamilyName" autocomplete="organization" placeholder="Fx Familien Jensen"></div>
        <div class="pilot-field"><label>Forælderens navn</label><input id="pilotParentName" autocomplete="name" placeholder="Fx Mette"></div>
        <div class="pilot-field"><label>Barnets navn</label><input id="pilotChildName" autocomplete="off" placeholder="Fx Alma"></div>
      </div>
      <div class="pilot-field"><label>E-mail</label><input id="pilotEmail" type="email" autocomplete="email" placeholder="din@email.dk"></div>
      <div class="pilot-field"><label>Adgangskode</label><input id="pilotPassword" type="password" autocomplete="current-password" placeholder="Mindst 6 tegn"></div>
      <button id="pilotSubmit" class="pilot-btn">Opret familie</button>
      <div id="pilotMsg" class="pilot-msg"></div>
      <div class="pilot-note">📱 På barnets enhed logger en forælder ind med den samme familiekonto én gang og vælger derefter <b>Barn</b> som denne enheds rolle. Login bliver husket på enheden.</div>
    </div>`;

  let mode='create';
  const createTab=document.getElementById('pilotCreateTab');
  const loginTab=document.getElementById('pilotLoginTab');
  const fields=document.getElementById('pilotFamilyFields');
  const submit=document.getElementById('pilotSubmit');
  const msg=document.getElementById('pilotMsg');
  const setMode=(next)=>{
    mode=next;
    createTab.classList.toggle('active',next==='create');
    loginTab.classList.toggle('active',next==='login');
    fields.style.display=next==='create'?'block':'none';
    submit.textContent=next==='create'?'Opret familie':'Log ind';
    msg.textContent='';
  };
  createTab.onclick=()=>setMode('create');
  loginTab.onclick=()=>setMode('login');
  submit.onclick=async()=>{
    const email=document.getElementById('pilotEmail').value.trim();
    const password=document.getElementById('pilotPassword').value;
    if(!email || password.length<6){msg.textContent='Skriv en gyldig e-mail og en adgangskode på mindst 6 tegn.';return;}
    submit.disabled=true;msg.textContent='';
    try{
      if(mode==='login'){
        await signInWithEmailAndPassword(auth,email,password);
        return;
      }
      const familyName=document.getElementById('pilotFamilyName').value.trim();
      const parentName=document.getElementById('pilotParentName').value.trim();
      const childName=document.getElementById('pilotChildName').value.trim();
      if(!familyName || !parentName || !childName){msg.textContent='Udfyld familienavn, forældernavn og barnets navn.';submit.disabled=false;return;}
      creatingFamily=true;
      const cred=await createUserWithEmailAndPassword(auth,email,password);
      await setDoc(doc(db,'users',cred.user.uid),{
        familyId:cred.user.uid,
        familyName,
        parentName,
        childName,
        profileImage:'',
        pin:'2468',
        childPin:'',
        savingsGoal:{title:'',target:0,saved:0},
        tasks:[],
        history:[],
        proofs:{},
        pilotVersion:1,
        onboardingComplete:true,
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      },{merge:true});
      gate.innerHTML='<div class="pilot-loading">🐷<strong>Familien er oprettet</strong><span class="pilot-ok">Åbner Mine Lommepenge…</span></div>';
      setTimeout(()=>gate.remove(),450);
      creatingFamily=false;
    }catch(e){
      console.error(e);creatingFamily=false;msg.textContent=authMessage(e.code);submit.disabled=false;
    }
  };
}

onAuthStateChanged(auth,async user=>{
  if(creatingFamily)return;
  if(!user){showEntry();return;}
  try{
    const snap=await getDoc(doc(db,'users',user.uid));
    if(snap.exists()){
      gate.remove();
    }else{
      showEntry();
      const msg=document.getElementById('pilotMsg');
      if(msg)msg.textContent='Kontoen mangler familieopsætning. Vælg Opret familie med en ny e-mail.';
    }
  }catch(e){console.error(e);gate.remove();}
});

async function loadPilotApp(){
  const res=await fetch('./app.js',{cache:'no-store'});
  if(!res.ok)throw new Error('Kunne ikke hente app.js');
  let source=await res.text();
  const oldCompress=`async function compressPhoto(file){
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
}`;
  const newCompress=`async function compressPhoto(file){
  if(!file || !file.type.startsWith('image/'))throw new Error('Vælg et billede');
  const img=await fileToImage(file);
  let maxDim=480;
  let quality=.30;
  let data='';
  const MAX_DATA_URL_CHARS=44000;
  for(let i=0;i<8;i++){
    const scale=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,w,h);
    data=canvas.toDataURL('image/jpeg',quality);
    if(data.length<=MAX_DATA_URL_CHARS)return data;
    maxDim=Math.max(240,Math.round(maxDim*.82));
    quality=Math.max(.16,quality-.035);
  }
  if(data.length>MAX_DATA_URL_CHARS)throw new Error('Billedet kunne ikke komprimeres nok. Tag billedet igen.');
  return data;
}`;
  if(!source.includes(oldCompress))throw new Error('Pilotpatch kunne ikke finde billedkomprimeringen.');
  source=source.replace(oldCompress,newCompress);
  source=source.replace('Brug den samme konto på din iPhone og din datters iPad. Hver enhed kan derefter vælges som Forælder eller Barn.','Brug den samme familiekonto på forælderens iPhone og barnets iPhone eller iPad. Vælg derefter Forælder eller Barn på hver enhed.');
  const blob=new Blob([source],{type:'text/javascript'});
  await import(URL.createObjectURL(blob));
}

loadPilotApp().catch(err=>{
  console.error(err);
  gate.innerHTML='<div class="pilot-loading">⚠️<strong>Kunne ikke åbne pilotversionen</strong><span>Genindlæs siden og prøv igen.</span></div>';
});
