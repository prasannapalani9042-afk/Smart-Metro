/* MetroX admin modules: Train, Route and Schedule management + Reports (uses ../core.js) */
const PAGE = document.body.dataset.page;
let editId = null, cache = [];

function highlightTabs(){
  const cur = location.pathname.split('/').pop();
  $$('.admin-tabs a').forEach(a => { if(a.getAttribute('href') === cur) a.classList.add('active'); });
}
function fillSelect(sel, items, current){
  sel.innerHTML = '';
  items.forEach(([v, t]) => sel.add(new Option(t, v)));
  if(current !== undefined) sel.value = current;
}
function resetForm(form, btnText){
  form.reset(); editId = null;
  form.querySelector('button[type=submit]').textContent = btnText;
  const c = form.querySelector('.cancel'); if(c) c.style.display = 'none';
}
function startEdit(form, row, btnText){
  editId = row.id;
  Object.keys(row).forEach(k => { const el = form.elements[k]; if(el) el.value = row[k]; });
  form.querySelector('button[type=submit]').textContent = btnText;
  const c = form.querySelector('.cancel'); if(c) c.style.display = '';
  form.scrollIntoView({behavior:'smooth', block:'center'});
}
async function save(resource, payload, form, addText, afterSave){
  try{
    await api(editId ? 'PUT' : 'POST', `/api/${resource}${editId ? '/' + editId : ''}`, payload);
    toast(editId ? 'Updated successfully.' : 'Added successfully.');
    resetForm(form, addText);
    await afterSave();
  }catch(err){ toast(err.message); }
}
async function remove(resource, id, afterDelete){
  if(!confirm('Delete this record?')) return;
  try{ await api('DELETE', `/api/${resource}/${id}`); toast('Deleted.'); await afterDelete(); }
  catch(err){ toast(err.message); }
}
const actions = (kind, id) => !isAdmin() ? '' : `<td class="row-actions"><span class="edit" onclick="edit_${kind}(${id})">Edit</span><span class="del" onclick="del_${kind}(${id})">Delete</span></td>`;
const getItems = async r => (await api('GET', '/api/' + r)).items;

/* ---------------- Trains ---------------- */
async function loadTrains(){
  cache = await getItems('trains');
  $('#tbl').innerHTML = '<tr><th>Code</th><th>Name</th><th>Line</th><th>Capacity</th><th>Status</th>'+(isAdmin()?'<th></th>':'')+'</tr>' +
    (cache.map(t => `<tr><td><b>${esc(t.code)}</b></td><td>${esc(t.name)}</td><td>${lineBadge(t.line)}</td><td>${t.capacity}</td><td>${statusPill(t.status)}</td>${actions('train', t.id)}</tr>`).join('')
    || '<tr><td colspan="6" class="empty">No trains yet</td></tr>');
}
function edit_train(id){ startEdit($('#frm'), cache.find(t => t.id === id), 'Update Train'); }
function del_train(id){ remove('trains', id, loadTrains); }
function initTrains(){
  const f = $('#frm');
  if(!isAdmin()){ loadTrains(); return; }
  f.onsubmit = e => { e.preventDefault();
    save('trains', {code:f.code.value, name:f.name.value, line:f.line.value, capacity:f.capacity.value, status:f.status.value}, f, 'Add Train', loadTrains); };
  f.querySelector('.cancel').onclick = () => resetForm(f, 'Add Train');
  loadTrains();
}

/* ---------------- Routes ---------------- */
async function loadRoutes(){
  cache = await getItems('routes');
  $('#tbl').innerHTML = '<tr><th>Route</th><th>Source → Destination</th><th>Line</th><th>Stops</th><th>Via stations</th>'+(isAdmin()?'<th></th>':'')+'</tr>' +
    (cache.map(r => { const p = findPath(r.source, r.destination); const n = p ? stopCount(p) : '—';
      return `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.source)} → ${esc(r.destination)}</td><td>${lineBadge(r.line)}</td><td>${n}</td><td style="max-width:260px;color:var(--muted)">${esc(r.stations) || '—'}</td>${actions('route', r.id)}</tr>`; }).join('')
    || '<tr><td colspan="6" class="empty">No routes yet</td></tr>');
}
function edit_route(id){ startEdit($('#frm'), cache.find(r => r.id === id), 'Update Route'); previewRoute(true); }
function del_route(id){ remove('routes', id, loadRoutes); }
function previewRoute(keepStations){
  const f = $('#frm'), p = findPath(f.source.value, f.destination.value), box = $('#preview');
  if(!p){ box.innerHTML = 'Choose two different stations to preview the route.'; return; }
  const names = [...new Set(p.segments.flatMap(s => s.stations))];
  f.line.value = p.segments[0].line;
  if(!keepStations) f.stations.value = names.slice(1, -1).join(', ');
  const stops = stopCount(p);
  box.innerHTML = `<b>${stops}</b> stops · ~<b>${timeFor(stops, p.interchange)} min</b> · fare <b>₹${fareFor(stops)}</b>${p.interchange ? ' · includes interchange' : ''}`;
}
function initRoutes(){
  initPlanner();
  const f = $('#frm'), names = uniqueNames().map(n => [n, n]);
  if(!isAdmin()){ loadRoutes(); return; }
  fillSelect(f.source, names); fillSelect(f.destination, names, names[1][0]);
  f.source.onchange = f.destination.onchange = () => previewRoute(false);
  f.onsubmit = e => { e.preventDefault();
    save('routes', {name:f.name.value, source:f.source.value, destination:f.destination.value, line:f.line.value, stations:f.stations.value}, f, 'Add Route', loadRoutes); };
  f.querySelector('.cancel').onclick = () => { resetForm(f, 'Add Route'); previewRoute(false); };
  previewRoute(false); loadRoutes();
}

/* ---------------- Schedules ---------------- */
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
async function loadSchedules(){
  cache = await getItems('schedules');
  $('#tbl').innerHTML = '<tr><th>Train</th><th>Route</th><th>First</th><th>Last</th><th>Every</th><th>Trips/day</th>'+(isAdmin()?'<th></th>':'')+'</tr>' +
    (cache.map(s => `<tr><td><b>${esc(s.train_code)}</b> ${esc(s.train_name)} ${s.train_status !== 'Available' ? statusPill(s.train_status) : ''}</td><td>${esc(s.route_name)}<div class="mini">${esc(s.source)} → ${esc(s.destination)}</div></td>
      <td>${esc(s.first_train)}</td><td>${esc(s.last_train)}</td><td>${s.frequency} min</td><td>${Math.floor((toMin(s.last_train) - toMin(s.first_train)) / s.frequency) + 1}</td>${actions('schedule', s.id)}</tr>`).join('')
    || '<tr><td colspan="7" class="empty">No schedules yet</td></tr>');
}
function edit_schedule(id){ startEdit($('#frm'), cache.find(s => s.id === id), 'Update Schedule'); }
function del_schedule(id){ remove('schedules', id, loadSchedules); }
async function initSchedules(){
  const f = $('#frm');
  if(!isAdmin()){ loadSchedules(); return; }
  const [trains, routes] = await Promise.all([getItems('trains'), getItems('routes')]);
  fillSelect(f.train_id, trains.map(t => [t.id, `${t.code} · ${t.name} (${t.status})`]));
  fillSelect(f.route_id, routes.map(r => [r.id, `${r.name} (${r.source} → ${r.destination})`]));
  f.onsubmit = e => { e.preventDefault();
    save('schedules', {train_id:f.train_id.value, route_id:f.route_id.value, first_train:f.first_train.value, last_train:f.last_train.value, frequency:f.frequency.value}, f, 'Add Schedule', loadSchedules); };
  f.querySelector('.cancel').onclick = () => resetForm(f, 'Add Schedule');
  loadSchedules();
}

/* ---------------- Reports ---------------- */
const rs = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = ym => MONTHS[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
const dayLabel = d => { const x = new Date(d + 'T00:00:00'); return `${d.slice(8)} ${MONTHS[x.getMonth()]}, ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][x.getDay()]}`; };
let lastDaily = [], lastMonth = '';
async function loadReports(){
  const month = $('#rpMonth').value; lastMonth = month;
  const [a, d] = await Promise.all([api('GET', '/api/admin/analytics?month=' + month), api('GET', '/api/admin/reports')]);
  const t = a.totals, td = a.today, pk = a.peak;
  $('#kpis').innerHTML = [
    ["TODAY'S COLLECTION", rs(td.collection), `${td.bookings} bookings today`], ["TODAY'S PASSENGERS", td.passengers, td.date],
    ['MONTH COLLECTION', rs(t.collection), `${monthLabel(a.month)} · ${t.bookings} bookings`], ['MONTH PASSENGERS', t.passengers, `${t.cancelled} cancelled`]
  ].map(([l, v, s]) => `<div class="card stat"><label>${l}</label><strong>${v}</strong><span class="mini">${s}</span></div>`).join('');
  /* weekly */
  const maxW = Math.max(1, ...a.weeks.map(w => w.collection));
  const peakW = a.weeks.find(w => w.week === pk.collection);
  $('#weekSub').innerHTML = peakW ? `Peak week: <b>Week ${peakW.week} (${peakW.from}–${peakW.to})</b> with ${rs(peakW.collection)} collected and ${peakW.passengers} passengers` : 'No bookings in this month yet';
  $('#weekChart').innerHTML = `<div class="bars">${a.weeks.map(w => `<div class="bar"><b>${rs(w.collection)}</b><i style="height:${Math.round(w.collection / maxW * 100)}%;${w.week === pk.collection ? 'background:#ffb703' : ''}"></i>Wk ${w.week}<br>${w.from}–${w.to}</div>`).join('')}</div>`;
  $('#weekTbl').innerHTML = '<tr><th>Week</th><th>Days</th><th>Bookings</th><th>Passengers</th><th>Collection</th><th>Peak</th></tr>' + a.weeks.map(w => {
    const tags = [pk.collection === w.week ? 'Sales' : '', pk.bookings === w.week ? 'Bookings' : '', pk.passengers === w.week ? 'Passengers' : ''].filter(Boolean);
    return `<tr><td><b>Week ${w.week}</b></td><td>${w.from}–${w.to}</td><td>${w.bookings}</td><td>${w.passengers}</td><td><b>${rs(w.collection)}</b></td><td>${tags.map(x => `<span class="pill warn">PEAK ${x}</span>`).join(' ')}</td></tr>`;
  }).join('');
  /* daily */
  lastDaily = a.daily; const maxD = Math.max(1, ...a.daily.map(x => x.collection));
  $('#dayTbl').innerHTML = '<tr><th>Date</th><th>Bookings</th><th>Passengers</th><th>Collection</th></tr>' + a.daily.map(x =>
    `<tr><td>${dayLabel(x.day)}</td><td>${x.bookings}</td><td>${x.passengers}</td><td><b>${rs(x.collection)}</b><div class="hbar"><i style="width:${x.collection / maxD * 100}%"></i></div></td></tr>`).join('') +
    `<tr><td><b>Total</b></td><td><b>${t.bookings}</b></td><td><b>${t.passengers}</b></td><td><b>${rs(t.collection)}</b></td></tr>`;
  /* monthly */
  const maxM = Math.max(1, ...a.monthly.map(x => x.collection));
  $('#monTbl').innerHTML = '<tr><th>Month</th><th>Bookings</th><th>Passengers</th><th>Collection</th></tr>' + a.monthly.map(x =>
    `<tr><td>${x.month === a.month ? '<b>' + monthLabel(x.month) + '</b>' : monthLabel(x.month)}</td><td>${x.bookings}</td><td>${x.passengers}</td><td><b>${rs(x.collection)}</b><div class="hbar"><i style="width:${x.collection / maxM * 100}%"></i></div></td></tr>`).join('');
  /* payment modes */
  const maxP = Math.max(1, ...a.payment_modes.map(x => x.collection));
  $('#payModes').innerHTML = a.payment_modes.map(x => `<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;font-size:16px;gap:8px"><b>${x.method === 'QR' ? 'QR Code' : x.method}</b><span>${rs(x.collection)} · ${x.bookings} booking${x.bookings === 1 ? '' : 's'}</span></div><div class="hbar"><i style="width:${x.collection / maxP * 100}%"></i></div></div>`).join('');
  /* top routes + recent */
  const mr = Math.max(1, ...d.top_routes.map(x => x.bookings));
  $('#top').innerHTML = d.top_routes.map(r => `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;font-size:15px;gap:8px"><span>${esc(r.source)} → ${esc(r.destination)}</span><b>${r.bookings} booking${r.bookings === 1 ? '' : 's'} · ${rs(r.revenue)}</b></div><div class="hbar"><i style="width:${r.bookings / mr * 100}%"></i></div></div>`).join('') || '<div class="empty">No data yet</div>';
  $('#tbl').innerHTML = '<tr><th>Ticket</th><th>Passenger</th><th>Journey</th><th>Date</th><th>Pax</th><th>Fare</th><th>Payment</th><th>Status</th></tr>' +
    (d.recent.map(b => `<tr><td>${esc(b.ticket_id)}</td><td>${esc(b.passenger_name)}</td><td>${esc(b.source)} → ${esc(b.destination)}</td><td>${esc(b.travel_date)}</td><td>${b.passengers}</td><td>${rs(b.total_fare)}</td><td>${esc(b.payment_method)}</td><td>${statusPill(b.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No bookings yet</td></tr>');
}
async function initReports(){
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  $('#rpMonth').value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  $('#rpMonth').onchange = () => $('#rpMonth').value && loadReports().catch(e => toast(e.message));
  $('#csv').onclick = () => {
    const rows = [['Date', 'Bookings', 'Passengers', 'Collection (Rs)'], ...lastDaily.map(x => [x.day, x.bookings, x.passengers, x.collection])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], {type: 'text/csv'}));
    a.download = `daily-report-${lastMonth}.csv`; a.click();
  };
  await loadReports();
}

/* ---------------- Route planner (everyone) ---------------- */
function initPlanner(){
  const a = $('#plFrom'), b = $('#plTo'), box = $('#plResult'); if(!a) return;
  const names = uniqueNames();
  names.forEach(n => { a.add(new Option(n, n)); b.add(new Option(n, n)); });
  b.selectedIndex = Math.min(5, names.length - 1);
  const go = () => {
    const p = findPath(a.value, b.value);
    if(!p){ box.innerHTML = 'Choose two different stations.'; return; }
    const stops = stopCount(p), via = [...new Set(p.segments.flatMap(s => s.stations))];
    const lines = p.segments.map(s => `${esc(s.line)} Line`).join(' → ');
    box.innerHTML = `<b>${stops}</b> stops · ~<b>${timeFor(stops, p.interchange)} min</b> · fare <b>₹${fareFor(stops)}</b> · ${lines}${p.interchange ? ' (change at the interchange)' : ''}<div class="mini" style="margin-top:8px">${via.map(esc).join(' → ')}</div>`;
  };
  a.onchange = b.onchange = go; go();
}

/* passengers see read-only pages: titles change, edit forms are hidden */
const VIEW_TEXT = {
  trains:{h:'Trains', p:'Where is my train, station timetables and trains between stations. View only.', c:'All trains', cp:'Status of every train.'},
  routes:{h:'Routes', p:'Routes with source, destination and stops. View only.', c:'All routes', cp:'Routes set by the administrator.'},
  schedules:{h:'Schedules', p:'Train timings and frequency. View only.', c:'All schedules', cp:'First train, last train and how often trains run.'}
};
function applyViewMode(){
  if(isAdmin() || !VIEW_TEXT[PAGE]) return;
  const t = VIEW_TEXT[PAGE], f = $('#frm'); if(f) f.style.display = 'none';
  const set = (sel, v) => { const e = $(sel); if(e) e.textContent = v; };
  set('.heading h1', t.h); set('.heading p', t.p); set('.heading .eyebrow', 'METRO NETWORK'); set('.card-title h2', t.c); set('.card-title p', t.cp); set('.topbar h3', t.h);
  document.title = document.title.replace(/ \| .*$/, ' | ' + t.h);
}

document.addEventListener('DOMContentLoaded', () => {
  if(PAGE === 'reports' || PAGE === 'trains') ensureAdmin(); else ensureLogin();
  const ls = $('#frm [name=line]'); if(ls) ls.innerHTML = Object.keys(LINES).map(l => `<option value="${l}">${l} Line</option>`).join('');
  applyViewMode();
  ({trains:initTrains, routes:initRoutes, schedules:initSchedules, reports:initReports}[PAGE])();
});
