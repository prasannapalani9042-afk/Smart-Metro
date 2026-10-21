/* ================= MetroX core (data, logic, auth, shell) ================= */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* ---- Metro data (real Chennai Metro Phase 1 topology, 40 base stations) ---- */
const LINES = {
  Blue: { color: "#1457b8", ink: "#ffffff", dark: "#1457b8", stations: ["Wimco Nagar","Tiruvottiyur","Tiruvottiyur Theradi","Kaladipet","Tollgate","New Washermanpet",
    "Tondiarpet","Sir Theagaraya College","Washermanpet","Mannadi","High Court","Chennai Central","Government Estate","LIC",
    "Thousand Lights","AG-DMS","Teynampet","Nandanam","Saidapet","Little Mount","Guindy","Alandur","Nanganallur Road",
    "Meenambakkam","Airport"] },
  Green: { color: "#12994f", ink: "#ffffff", dark: "#0d7a3e", stations: ["Chennai Central","Egmore","Nehru Park","Kilpauk","Pachaiyappa's College","Shenoy Nagar",
    "Anna Nagar East","Anna Nagar Tower","Thirumangalam","Koyambedu","CMBT","Arumbakkam","Vadapalani","Ashok Nagar",
    "Ekkatuthangal","Alandur","St. Thomas Mount"] },
  /* Phase 2, opened 11 October 2026: Poonamallee Bypass - Vadapalani (11 elevated stations). Interchange with the Green Line at Vadapalani. */
  Yellow: { color: "#f2b705", ink: "#10243a", dark: "#8a5a00", stations: ["Poonamallee Bypass","Poonamallee Bus Stand","Poonamallee Government Hospital",
    "Karayanchavadi","Kumananchavadi","Kattupakkam","Iyyappanthangal","Thelliyaragaram","Porur Bypass","Porur Junction","Vadapalani"] }
};

/* ---- Admin-added stations (from Admin Panel) are merged live into each line ---- */
function getAdminStations(){ return JSON.parse(localStorage.getItem('metroAdminStations')||'[]'); }
function saveAdminStations(a){ localStorage.setItem('metroAdminStations', JSON.stringify(a)); }
function lineStations(lineName){
  const extra = getAdminStations().filter(s=>s.line===lineName).map(s=>s.name);
  return [...LINES[lineName].stations, ...extra];
}
function allStations(){
  const base = {lat:13.0827,lng:80.2707};
  let l = [];
  Object.entries(LINES).forEach(([ln]) => {
    const stations = lineStations(ln);
    stations.forEach((s,i) => {
      const p = ln==="Blue" ? {lat:base.lat+(i*0.006-0.06), lng:base.lng-(i*0.007-0.06)}
              : ln==="Green" ? {lat:base.lat-(i*0.006-0.06), lng:base.lng+(i*0.007-0.06)}
              : {lat:base.lat-0.012-(i*0.0012), lng:base.lng-0.06-(i*0.0075)};
      l.push({name:s, line:ln, lat:p.lat, lng:p.lng});
    });
  });
  return l;
}
function uniqueNames(){ return [...new Set(allStations().map(s=>s.name))].sort(); }
function lineOf(name){ return allStations().filter(s=>s.name===name).map(s=>s.line); }
function isInterchange(name){ return lineOf(name).length>1; }

/* Shortest path over all lines. A stop costs 100, changing line costs 1 (so fewer changes win a tie). Works for any number of interchanges. */
function findPath(from,to){
  if(from===to) return null;
  const names=Object.keys(LINES), seqs={};
  names.forEach(l=>{ seqs[l]=lineStations(l); });
  const key=(l,i)=>l+'|'+i, dist={}, prev={}, done={}, pq=[];
  const push=(k,d,p)=>{ if(dist[k]===undefined||d<dist[k]){ dist[k]=d; prev[k]=p; pq.push([d,k]); } };
  names.forEach(l=>seqs[l].forEach((s,i)=>{ if(s===from) push(key(l,i),0,null); }));
  let end=null;
  while(pq.length){
    pq.sort((a,b)=>a[0]-b[0]);
    const [d,k]=pq.shift(); if(done[k]) continue; done[k]=1;
    const parts=k.split('|'), l=parts[0], i=+parts[1], s=seqs[l][i];
    if(s===to){ end=k; break; }
    [i-1,i+1].forEach(j=>{ if(j>=0&&j<seqs[l].length) push(key(l,j),d+100,k); });
    names.forEach(l2=>{ if(l2!==l){ const j=seqs[l2].indexOf(s); if(j>-1) push(key(l2,j),d+1,k); } });
  }
  if(!end) return null;
  const states=[]; for(let k=end;k;k=prev[k]) states.push(k); states.reverse();
  const segments=[];
  states.forEach(k=>{
    const parts=k.split('|'), l=parts[0], s=seqs[l][+parts[1]], last=segments[segments.length-1];
    if(last&&last.line===l) last.stations.push(s); else segments.push({line:l,stations:[s]});
  });
  return {segments,interchange:segments.length-1};
}
function nodeCount(p){ return p.segments.reduce((n,s)=>n+s.stations.length,0)-(p.segments.length-1); }
function stopCount(p){ return nodeCount(p)-1; }
function fareFor(stops){ return stops<=2?10:stops<=5?20:stops<=9?30:stops<=13?40:50; }
function timeFor(stops,ic){ return Math.round(stops*2.5+(+ic||0)*4); }
function haversine(a,b){
  const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function renderPathHTML(path,total){
  let html=`<div style="margin:6px 0 12px;font-size:13px;color:var(--muted)">Total stations in this route: <b style="color:#fff">${total}</b></div>`;
  path.segments.forEach(seg=>{
    html+=`<div style="margin:10px 0 4px"><span class="badge" style="background:${LINES[seg.line].color}22;color:${LINES[seg.line].dark}">${seg.line} Line</span></div>`;
    seg.stations.forEach(st=>{
      html+=`<div class="stationline"><span class="dot" style="background:${LINES[seg.line].color}"></span>${st}${isInterchange(st)?' <span style="color:var(--orange);font-size:11px">⇄ interchange</span>':''}</div>`;
    });
  });
  return html;
}

/* ---- Auth / session (localStorage demo). Users have a role: 'admin' or 'user' ---- */
function getUsers(){ try{return JSON.parse(localStorage.getItem('metroUsers')||'{}')}catch(e){return{}} }
function saveUsers(u){ localStorage.setItem('metroUsers', JSON.stringify(u)); }
function getSession(){ try{return JSON.parse(localStorage.getItem('metroSession')||'null')}catch(e){return null} }
function isAdmin(){ const u=getSession(); return !!(u && u.role==='admin'); }
function ensureLogin(){
  const inAdmin = location.pathname.includes('/admin/');
  if(location.pathname.endsWith('auth.html')) return;
  if(!getSession()) location.href = inAdmin ? '../auth.html' : 'auth.html';
}
function ensureAdmin(){
  ensureLogin();
  if(!isAdmin()){
    alert('Admin access only. Redirecting to your dashboard.');
    location.href='../index.html';
  }
}
async function logout(){
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch(e){}
  localStorage.removeItem('metroSession');
  location.href = location.pathname.includes('/admin/') ? '../auth.html' : 'auth.html';
}

/* ---- Favorites / history ---- */
function getFavs(){ return JSON.parse(localStorage.getItem('metroFavs')||'[]'); }
function isFav(n){ return getFavs().includes(n); }
function toggleFav(n){ let f=getFavs(); f=f.includes(n)?f.filter(x=>x!==n):[...f,n]; localStorage.setItem('metroFavs',JSON.stringify(f)); }
function getHistory(){ return JSON.parse(localStorage.getItem('metroHistory')||'[]'); }
function pushHistory(e){ let h=getHistory(); h.unshift(e); localStorage.setItem('metroHistory',JSON.stringify(h.slice(0,15))); }
function clearHistory(){ localStorage.removeItem('metroHistory'); }

/* ---- Page shell: sidebar / topbar / role-based nav (called on every app page) ---- */
function setupShell(){
  ensureLogin();
  fetch('/api/session').then(r => r.json()).then(d => {
  if (!d.authenticated) {
    localStorage.removeItem('metroSession');
    location.href = location.pathname.includes('/admin/') ? '../auth.html' : 'auth.html';
  }
}).catch(() => {});
  let u = getSession() || {name:'User'};
  /* self-heal: if this session was created before roles existed (or role changed), refresh it from the users table */
  if(u.email){
    const latest = getUsers()[u.email];
    if(latest && u.role !== latest.role){
      u = {...u, role: latest.role};
      localStorage.setItem('metroSession', JSON.stringify(u));
    }
  }
  const name=$('#userName'), avatar=$('#avatar'), date=$('#date'), logoutBtn=$('#logout'), menu=$('#menu'), sidebar=$('#sidebar');
  if(name) name.textContent = u.name;
  if(avatar) avatar.textContent = (u.name||'U').trim().charAt(0).toUpperCase();
  if(date) date.textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short',year:'numeric'});
  if(logoutBtn) logoutBtn.onclick = logout;
  if(menu && sidebar) menu.onclick = () => sidebar.classList.toggle('open');
  const current = location.pathname.split('/').pop();
  $$('.nav a').forEach(a => { if(a.getAttribute('href').split('/').pop()===current) a.classList.add('active'); });
  /* Only admin accounts can see/use the Admin Panel link */
  if(!isAdmin()){
    $$('.nav a').forEach(a => { if(a.getAttribute('href').includes('admin-dashboard.html')) a.style.display='none'; });
  }
}
function toast(msg){
  const t=$('#toast'); if(!t){alert(msg);return;}
  t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500);
}
function togglePwd(id,btn){
  const i=document.getElementById(id); const show=i.type==='password';
  i.type = show?'text':'password'; btn.textContent = show?'🙈':'👁';
}
document.addEventListener('DOMContentLoaded', () => { if($('#sidebar')) setupShell(); });
/* ================= end MetroX core ================= */

/* ---- API helper + small utils for the Train / Route / Schedule / Booking / Report modules ---- */
async function api(method,url,body){
  const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  let d={}; try{d=await r.json()}catch(e){}
  if(r.status===401){ localStorage.removeItem('metroSession'); location.href=location.pathname.includes('/admin/')?'../auth.html':'auth.html'; }
  if(!r.ok||d.ok===false) throw new Error(d.error||'Request failed');
  return d;
}
function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function statusPill(s){ const c=s==='Available'||s==='Confirmed'?'ok':s==='Maintenance'?'warn':'bad'; return `<span class="pill ${c}">${esc(s)}</span>`; }
function lineBadge(l){ const L=LINES[l]||{}, c=L.color||'#fff', d=L.dark||c; return `<span class="badge" style="background:${c}33;color:${d}">${esc(l)}</span>`; }
