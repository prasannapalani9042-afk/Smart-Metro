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
function logout(){
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


/* ---- page-specific: Ticket Booking ---- */
let trainsCache=[], schedCache=[];
function refreshTrains(){
  const from=$('#qrFrom').value, to=$('#qrTo').value, path=findPath(from,to), sel=$('#qrTrain');
  const lines=path?path.segments.map(s=>s.line):[];
  const usable=trainsCache.filter(t=>lines.includes(t.line));
  sel.innerHTML='';
  sel.add(new Option(usable.length?'Any available train':'No trains on this route',''));
  usable.forEach(t=>{ const s=schedCache.find(x=>x.train_id===t.id);
    const o=new Option(`${t.code} · ${t.name}${s?` · ${s.first_train}-${s.last_train}, every ${s.frequency} min`:''}${t.status!=='Available'?` (${t.status})`:''}`, t.id);
    if(t.status!=='Available') o.disabled=true; sel.add(o); });
  updateFare();
}
function updateFare(){
  const path=findPath($('#qrFrom').value,$('#qrTo').value), box=$('#fareNote');
  if(!path){ box.innerHTML='Choose two different stations to see the fare.'; return null; }
  const stops=stopCount(path), fare=fareFor(stops), pax=+$('#qrPax').value||1;
  box.innerHTML=`<b>${stops}</b> stops · ~${timeFor(stops,path.interchange)} min · ₹${fare} per passenger · <b>Total ₹${fare*pax}</b>`;
  return {path,stops,fare,pax};
}
/* ---- payment step (demo): UPI / QR / Card / Cash ---- */
let pending=null, payMethod='UPI';
const METHODS=[['UPI','UPI'],['QR','QR Code'],['Card','Card'],['Cash','Cash']];
function payBody(){
  const total=pending.info.fare*pending.info.pax;
  if(payMethod==='UPI') return `<div class="field"><label>UPI ID</label><input id="payUpi" placeholder="name@bank" autocomplete="off"></div><p class="mini">A payment request is sent to this UPI id (demo).</p>`;
  if(payMethod==='QR'){
    const upi=`upi://pay?pa=smartmetro@upi&pn=Smart Metro&am=${total}.00&cu=INR&tn=Metro ticket`;
    return `<img class="qr-img" alt="UPI payment QR code" src="/api/qr?text=${encodeURIComponent(upi)}"><p class="mini" style="text-align:center">Scan with any UPI app to pay ₹${total}, then press the button below.</p>`;
  }
  if(payMethod==='Card') return `<div class="form-grid"><div class="field full"><label>CARD NUMBER</label><input id="cdNum" inputmode="numeric" placeholder="1234 5678 9012 3456" maxlength="23" autocomplete="off"></div>
    <div class="field"><label>EXPIRY (MM/YY)</label><input id="cdExp" placeholder="08/29" maxlength="5" autocomplete="off"></div><div class="field"><label>CVV</label><input id="cdCvv" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div>
    <div class="field full"><label>NAME ON CARD</label><input id="cdName" autocomplete="off"></div></div>`;
  return `<div class="fare-note">Pay <b>₹${total}</b> in cash at the station ticket counter. Your ticket is confirmed now; show the ticket id at the counter.</div>`;
}
function showPayment(info,from,to,date,trainId){
  pending={info,from,to,date,trainId};
  const total=info.fare*info.pax;
  $('#ticketResult').innerHTML=`<span class="badge" style="background:#e8eeff;color:var(--navy)">STEP 2 OF 2 · PAYMENT</span>
    <h2 style="margin:10px 0 6px">Choose how to pay</h2>
    <div class="fare-note">${esc(from)} → ${esc(to)} · ${esc(date)} · ${info.pax} passenger${info.pax>1?'s':''} · <b>Total ₹${total}</b></div>
    <div class="pay-tabs" style="margin:14px 0">${METHODS.map(([k,l])=>`<button type="button" data-m="${k}" class="${k===payMethod?'on':''}">${l}</button>`).join('')}</div>
    <div id="payBody">${payBody()}</div>
    <div style="display:flex;gap:10px;margin-top:16px"><button class="btn primary" id="payGo" type="button" style="flex:1">${payMethod==='Cash'?'Confirm cash booking':'Pay ₹'+total}</button><button class="btn ghost" id="payBack" type="button">Back</button></div>
    <p class="mini" style="margin-top:10px">Demo payment: no real money is charged. Card number and CVV are not stored.</p>`;
  $$('.pay-tabs button').forEach(b=>b.onclick=()=>{ payMethod=b.dataset.m; showPayment(info,from,to,date,trainId); });
  $('#payBack').onclick=()=>{ pending=null; $('#ticketResult').innerHTML='<span class="badge">PASS</span><h2 style="margin:10px 0">No ticket yet</h2><p>Book a ticket to see your QR code.</p>'; };
  const cn=$('#cdNum'); if(cn) cn.oninput=()=>{ cn.value=cn.value.replace(/\D/g,'').slice(0,19).replace(/(.{4})/g,'$1 ').trim(); };
  const ce=$('#cdExp'); if(ce) ce.oninput=()=>{ let v=ce.value.replace(/\D/g,'').slice(0,4); if(v.length>2) v=v.slice(0,2)+'/'+v.slice(2); ce.value=v; };
  $('#payGo').onclick=confirmPayment;
}
async function confirmPayment(){
  const {info,from,to,date,trainId}=pending, pay={method:payMethod};
  if(payMethod==='UPI') pay.upi_id=$('#payUpi').value;
  if(payMethod==='Card'){ pay.card_number=$('#cdNum').value; pay.expiry=$('#cdExp').value; pay.cvv=$('#cdCvv').value; pay.card_name=$('#cdName').value; }
  const btn=$('#payGo'); btn.disabled=true;
  try{
    const r=await api('POST','/api/bookings',{source:from,destination:to,train_id:trainId,travel_date:date,passengers:info.pax,fare:info.fare,payment:pay});
    const train=trainsCache.find(x=>String(x.id)===String(trainId));
    const qrText=`SMART METRO|${r.ticket_id}|${from}>${to}|${date}|${info.pax} pax|Rs${r.total_fare}|${r.payment_method}`;
    $('#ticketResult').innerHTML=`<div class="ticket-box"><img class="qr-img" alt="Ticket QR code" src="/api/qr?text=${encodeURIComponent(qrText)}">
      <div style="font-weight:700;font-size:17px">${esc(from)} → ${esc(to)}</div>
      <div class="ticket-meta"><div><span>TICKET ID</span>${esc(r.ticket_id)}</div><div><span>TRAVEL DATE</span>${esc(date)}</div>
        <div><span>PASSENGERS</span>${info.pax}</div><div><span>TRAIN</span>${train?esc(train.code):'Any available'}</div>
        <div><span>FARE / PAX</span>₹${info.fare}</div><div><span>TOTAL</span><b>₹${r.total_fare}</b></div>
        <div style="grid-column:1/3"><span>PAYMENT</span>${esc(r.payment_method)} · ${esc(r.payment_ref)} · <b>${r.payment_method==='Cash'?'Pay at counter':'Paid'}</b></div></div>
      <span class="badge" style="background:#d3f3e3;color:#075c37">Booking confirmed · see Booking History</span></div>`;
    pushHistory({from,to,type:'Ticket ₹'+r.total_fare,ts:Date.now()}); pending=null;
    toast('Ticket booked successfully!');
  }catch(err){ btn.disabled=false; toast(err.message); }
}
document.addEventListener('DOMContentLoaded',async()=>{
  const f=$('#qrFrom'), t=$('#qrTo');
  uniqueNames().forEach(s=>{f.add(new Option(s,s));t.add(new Option(s,s))});
  t.selectedIndex=Math.min(5,t.options.length-1);
  $('#qrDate').value=new Date().toISOString().slice(0,10); $('#qrDate').min=$('#qrDate').value;
  try{ [trainsCache,schedCache]=await Promise.all([api('GET','/api/trains').then(d=>d.items),api('GET','/api/schedules').then(d=>d.items)]); }catch(e){}
  [f,t].forEach(el=>el.onchange=refreshTrains); $('#qrPax').onchange=updateFare; refreshTrains();
  $('#ticketForm').onsubmit=e=>{
    e.preventDefault();
    const info=updateFare();
    if(!info){toast('Choose two different stations.');return;}
    showPayment(info,f.value,t.value,$('#qrDate').value,$('#qrTrain').value);
  };
});
