

/* ---- page-specific: Station Management (add / edit / delete) ---- */
let editIdx = null;
function resetStationForm(){
  editIdx = null; $('#stnName').value = ''; $('#stnBtn').textContent = 'Add Station'; $('#stnCancel').style.display = 'none';
}
document.addEventListener('DOMContentLoaded',()=>{
  ensureLogin();
  $('#stnLine').innerHTML=Object.keys(LINES).map(l=>`<option value="${l}">${l} Line</option>`).join('');
  $('#lineSections').innerHTML=Object.keys(LINES).map(l=>`<div class="line-head" style="background:${LINES[l].color};color:${LINES[l].ink}"><span class="line-dot" style="background:${LINES[l].ink}"></span><h2 style="color:${LINES[l].ink}">${l} Line</h2><span class="line-count" id="${l.toLowerCase()}Count"></span></div><div class="table-wrap"><table id="${l.toLowerCase()}Table"></table></div>`).join('');
  if(!isAdmin()){                       /* passengers: view only */
    $('#adminForm').style.display='none';
    $('.heading h1').textContent='Stations';
    $('.heading p').textContent='All stations on the Blue, Green and Yellow lines. View only.';
    const eb=$('.heading .eyebrow'); if(eb) eb.textContent='METRO NETWORK';
    const ct=$('.card-title h2'); if(ct) ct.textContent='All Stations';
    const cp=$('.card-title p'); if(cp) cp.textContent='Search any station by name.';
    document.title=document.title.replace('Station Management','Stations');
    const t=$('.topbar h3'); if(t) t.textContent='Stations';
  }
  renderAdmin();
  $$('.admin-tabs a').forEach(a => { if(a.getAttribute('href') === 'admin-dashboard.html') a.classList.add('active'); });
  $('#stnCancel').onclick = resetStationForm;
  $('#stnSearch').oninput = renderAdmin;
  $('#adminForm').onsubmit=e=>{
    if(!isAdmin()){ return false; }
    e.preventDefault();
    const name=$('#stnName').value.trim(), line=$('#stnLine').value;
    if(!name){ toast('Enter a station name.'); return; }
    const exists = allStations().some((s,i)=>s.name.toLowerCase()===name.toLowerCase() && s.line===line &&
      !(editIdx!==null && getAdminStations()[editIdx] && getAdminStations()[editIdx].name===s.name && getAdminStations()[editIdx].line===s.line));
    if(exists){ toast('That station already exists on this line.'); return; }
    let a=getAdminStations();
    if(editIdx!==null){ a[editIdx]={name,line}; toast('Station updated.'); }
    else { a.push({name,line}); toast('Station added — it now appears across the whole app.'); }
    saveAdminStations(a);
    resetStationForm();
    renderAdmin();
  };
});
function renderAdmin(){
  const custom=getAdminStations(), q=(($('#stnSearch')||{}).value||'').toLowerCase();
  Object.keys(LINES).forEach(ln=>{
    const key=ln.toLowerCase(), all=lineStations(ln);
    let rows='<tr><th>#</th><th>Station</th><th>Type</th>'+(isAdmin()?'<th></th>':'')+'</tr>', shown=0;
    all.forEach((name,i)=>{
      if(q && !name.toLowerCase().includes(q)) return;
      const ci=custom.findIndex(s=>s.name===name&&s.line===ln);
      shown++;
      rows+=`<tr><td>${i+1}</td><td><b>${name.replace(/</g,'&lt;')}</b>${isInterchange(name)?' <span class="mini">⇄ interchange</span>':''}</td>
        <td>${ci>=0?'<span class="pill warn">NEW</span>':'<span class="mini">Built-in</span>'}</td>
        ${isAdmin()?`<td class="row-actions">${ci>=0?`<span class="edit" onclick="adminEdit(${ci})">Edit</span><span class="del" onclick="adminDel(${ci})">Delete</span>`:''}</td>`:''}</tr>`;
    });
    if(!shown) rows+='<tr><td colspan="${isAdmin()?4:3}" class="empty">No stations found.</td></tr>';
    $('#'+key+'Table').innerHTML=rows;
    $('#'+key+'Count').textContent=all.length+' stations';
  });
}
function adminEdit(i){
  if(!isAdmin()) return;
  const s=getAdminStations()[i]; editIdx=i;
  $('#stnName').value=s.name; $('#stnLine').value=s.line;
  $('#stnBtn').textContent='Update Station'; $('#stnCancel').style.display='';
  $('#stnName').focus();
}
function adminDel(i){
  if(!isAdmin()) return;
  if(!confirm('Delete this station?')) return;
  let a=getAdminStations(); a.splice(i,1); saveAdminStations(a); resetStationForm(); renderAdmin(); toast('Station deleted.');
}
