/* Trains = "Where Is My Train": search, tap a train, see its running status, station timetable and trains between stations.
   Everything is worked out from the schedules (first train, last train, frequency) at 2.5 min per stop (+4 min per interchange). */
(function(){
  const pad = n => String(n).padStart(2, '0');
  const hm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
  let SCH = [], TR = [], clockStr = '', S = {a: '', b: '', mode: 'all'}, D = null, view;
  const now = () => clockStr ? toMin(clockStr) : new Date().getHours() * 60 + new Date().getMinutes();
  const running = x => (x.train_status || x.status) === 'Available';   /* works for a train and for a schedule row */

  function timeline(s){
    const p = findPath(s.source, s.destination); if(!p) return null;
    const names = [], offs = []; let t = 0;
    p.segments.forEach((seg, si) => seg.stations.forEach((st, i) => { if(si > 0 && i === 0){ t += 4; return; } if(names.length) t += 2.5; names.push(st); offs.push(t); }));
    const total = offs[offs.length - 1];
    return { total, down: { names, offs, label: `${names[0]} → ${names[names.length - 1]}` },
             up: { names: names.slice().reverse(), offs: offs.map(o => total - o).reverse(), label: `${names[names.length - 1]} → ${names[0]}` } };
  }
  function departures(s){ const o = []; for(let d = toMin(s.first_train); d <= toMin(s.last_train); d += Math.max(1, s.frequency)) o.push(d); return o; }
  /* where is the trip that left at d? */
  function where(tl, dir, d){
    const L = tl[dir], n = now();
    if(n < d) return {st: 'wait', i: -1, L, d};
    if(n > d + tl.total) return {st: 'done', i: L.names.length - 1, L, d};
    let i = 0; while(i < L.names.length - 1 && d + L.offs[i + 1] <= n) i++;
    const last = i >= L.names.length - 1, exact = d + L.offs[i] === n;
    return {st: 'run', i, L, d, last, exact, pct: Math.round((n - d) / tl.total * 100),
            text: last ? `Reached ${L.names[i]}` : exact ? `At ${L.names[i]}` : `Between ${L.names[i]} and ${L.names[i + 1]}`,
            next: last ? null : {name: L.names[i + 1], at: d + L.offs[i + 1]}};
  }
  /* the trip a train is on now (most recently started), else the next one */
  function bestTrip(s, tl){
    const n = now(); let best = null;
    ['down', 'up'].forEach(dir => departures(s).forEach(d => { if(d <= n && n <= d + tl.total && (!best || d > best.d)) best = {dir, d}; }));
    if(best) return best;
    const nxt = departures(s).find(d => d > n); return {dir: 'down', d: nxt !== undefined ? nxt : departures(s)[departures(s).length - 1]};
  }
  const scheds = t => SCH.filter(s => s.train_id === t.id);

  /* ---------------- list of trains ---------------- */
  function nowText(t){
    if(!running(t)) return `<span class="pill warn">${esc(t.status)}</span> Not running`;
    const ss = scheds(t); if(!ss.length) return '<span class="mini">No timetable yet</span>';
    for(const s of ss){ const tl = timeline(s); if(!tl) continue; const tr = bestTrip(s, tl), w = where(tl, tr.dir, tr.d);
      if(w.st === 'run') return `<span class="pill ok">Running</span> ${esc(w.text)}`; }
    const nx = ss.map(s => departures(s).find(d => d > now())).filter(d => d !== undefined).sort((a, b) => a - b)[0];
    return `<span class="pill bad">Not running now</span> ${nx !== undefined ? 'Next train ' + hm(nx) : 'Finished for today'}`;
  }
  function trainCard(t){
    const ss = scheds(t), s = ss[0];
    return `<div class="card tcard" data-tid="${t.id}"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><h3 style="font-size:24px;font-weight:700">${esc(t.code)}</h3><p style="font-size:16px">${esc(t.name)}</p></div>${lineBadge(t.line)}</div>
      <p style="font-size:16px;margin-top:6px">${s ? esc(s.source) + ' → ' + esc(s.destination) : 'No route yet'}</p>
      ${s ? `<p class="mini">First ${esc(s.first_train)} · Last ${esc(s.last_train)} · every ${s.frequency} min</p>` : ''}
      <p style="margin-top:8px;font-size:15px">${nowText(t)}</p><span class="mod-btn">Where is it? →</span></div>`;
  }
  function between(a, b){
    const rows = [], n = now();
    SCH.forEach((s, si) => {
      if(!running(s)) return; const tl = timeline(s); if(!tl) return;
      ['down', 'up'].forEach(dir => { const L = tl[dir], i = L.names.indexOf(a), j = L.names.indexOf(b); if(i < 0 || j < 0 || j <= i) return;
        departures(s).forEach(d => { if(d + L.offs[i] >= n) rows.push({dep: d + L.offs[i], arr: d + L.offs[j], s, si, dir, d, label: L.label}); }); });
    });
    return rows.sort((x, y) => x.dep - y.dep);
  }
  function betweenRows(rows, a, b){
    return rows.length ? rows.slice(0, 10).map(r => `<div class="card tcard" data-tid="${r.s.train_id}" data-si="${r.si}" data-dir="${r.dir}" data-d="${r.d}" data-a="${esc(a)}" data-b="${esc(b)}" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <div><h3 style="font-size:22px;font-weight:700">${esc(r.s.train_code)} · ${esc(r.s.train_name)}</h3><p class="mini">${lineBadge(r.s.line)} ${esc(r.label)}</p></div>
      <div style="font-size:26px;font-weight:800">${hm(r.dep)} <span style="font-weight:400;font-size:18px">→</span> ${hm(r.arr)}</div><div class="mini">${Math.round(r.arr - r.dep)} min<br>Tap for timetable →</div></div>`).join('')
      : '<div class="card"><p>No direct train after this time. For a journey that needs a change, take one train to the interchange station and change there.</p></div>';
  }
  function renderMain(){
    const names = uniqueNames(), adm = isAdmin();
    view.innerHTML = `<div class="card"><div class="card-title"><div class="title-icon">🚆</div><div style="flex:1"><h2>Find your train</h2><p>Trains between two stations, or tap any train below</p></div>${adm ? '<a class="btn primary" href="add-train.html">+ Add Train</a>' : ''}</div>
      <div class="form-grid"><div class="field"><label>FROM</label><select id="sFrom"></select></div><div class="field"><label>TO</label><select id="sTo"></select></div>
      <div class="field"><label>TIME (change it to check another time)</label><input type="time" id="sTime"></div>
      <div class="field" style="justify-content:flex-end"><div style="display:flex;gap:10px"><button class="btn primary" id="sGo" type="button">Search trains</button><button class="btn ghost" id="sAll" type="button">All trains</button></div></div></div></div>
      <div id="results" style="margin-top:16px"></div>`;
    [$('#sFrom'), $('#sTo')].forEach(sel => names.forEach(n => sel.add(new Option(n, n))));
    $('#sFrom').value = S.a || (names.includes('Guindy') ? 'Guindy' : names[0]); $('#sTo').value = S.b || (names.includes('Alandur') ? 'Alandur' : names[1]);
    $('#sTime').value = clockStr || (pad(new Date().getHours()) + ':' + pad(new Date().getMinutes())); clockStr = $('#sTime').value;
    const refresh = () => { S.a = $('#sFrom').value; S.b = $('#sTo').value; clockStr = $('#sTime').value; renderResults(); };
    $('#sGo').onclick = () => { S.mode = 'between'; refresh(); }; $('#sAll').onclick = () => { S.mode = 'all'; refresh(); };
    $('#sTime').onchange = refresh; $('#sFrom').onchange = $('#sTo').onchange = () => { if(S.mode === 'between') refresh(); };
    renderResults();
  }
  function renderResults(){
    const box = $('#results'); let html;
    if(S.mode === 'between'){
      const p = findPath(S.a, S.b);
      if(!p){ box.innerHTML = '<div class="card"><p>Choose two different stations.</p></div>'; return; }
      const st = stopCount(p);
      html = `<div class="fare-note" style="margin-bottom:14px">${esc(S.a)} → ${esc(S.b)} · <b>${st}</b> stops · fare <b>₹${fareFor(st)}</b>${p.interchange ? ` · ${p.interchange} interchange${p.interchange > 1 ? 's' : ''} on the way` : ''}</div><div style="display:flex;flex-direction:column;gap:14px">${betweenRows(between(S.a, S.b), S.a, S.b)}</div>`;
    } else html = `<div class="tcards">${TR.map(trainCard).join('') || '<div class="card"><p>No trains yet.</p></div>'}</div>`;
    box.innerHTML = html;
    $$('#results .tcard').forEach(c => c.onclick = () => openTrain(+c.dataset.tid, c.dataset));
  }

  /* ---------------- one train: running status + station timetable + trains between stations ---------------- */
  function openTrain(tid, ds){
    const t = TR.find(x => x.id === tid); if(!t) return;
    const ss = scheds(t), s0 = ss[0], tl0 = s0 && timeline(s0); let dir = 'down', d = null, sid = s0 ? SCH.indexOf(s0) : -1;
    if(ds && ds.si !== undefined){ sid = +ds.si; dir = ds.dir; d = +ds.d; }
    else if(tl0){ const b = bestTrip(s0, tl0); dir = b.dir; d = b.d; }
    D = {t, sid, dir, d, a: ds && ds.a || '', b: ds && ds.b || ''};
    window.scrollTo(0, 0); renderTrain();
  }
  function renderTrain(){
    const {t} = D, s = SCH[D.sid], adm = isAdmin();
    let h = `<button class="btn ghost" id="back" type="button">← Back to trains</button>
      <div class="card" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="font-size:30px">${esc(t.code)} · ${esc(t.name)}</h2><p>${lineBadge(t.line)} ${s ? esc(s.route_name) : 'No timetable yet'} ${running(t) ? '' : `<span class="pill warn">${esc(t.status)}</span>`}</p></div>${adm ? '<a class="btn ghost" href="add-train.html">Edit train (Add Train page)</a>' : ''}</div></div>`;
    if(!s){ view.innerHTML = h + `<div class="card" style="margin-top:14px"><p>No timetable has been added for this train yet.${adm ? ' <a href="schedules.html" style="font-weight:800;text-decoration:underline">Add one in Schedules</a>.' : ''}</p></div>`; $('#back').onclick = renderMain; return; }
    const tl = timeline(s); if(!tl){ view.innerHTML = h + '<div class="card"><p>This route has no path.</p></div>'; $('#back').onclick = renderMain; return; }
    const L = tl[D.dir], deps = departures(s), w = where(tl, D.dir, D.d), n = now();
    /* controls */
    h += `<div class="card" style="margin-top:14px"><div class="form-grid">
      ${gScheds(t).length > 1 ? `<div class="field"><label>ROUTE</label><select id="dRoute">${gScheds(t).map(x => `<option value="${SCH.indexOf(x)}" ${SCH.indexOf(x) === D.sid ? 'selected' : ''}>${esc(x.route_name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>DIRECTION</label><select id="dDir"><option value="down" ${D.dir === 'down' ? 'selected' : ''}>${esc(tl.down.label)}</option><option value="up" ${D.dir === 'up' ? 'selected' : ''}>${esc(tl.up.label)}</option></select></div>
      <div class="field"><label>TRIP STARTS AT</label><select id="dTrip">${deps.map(x => `<option value="${x}" ${x === D.d ? 'selected' : ''}>${hm(x)}</option>`).join('')}</select></div>
      <div class="field"><label>TIME NOW (change to test)</label><input type="time" id="dTime" value="${hm(n)}"></div></div></div>`;
    /* running status */
    let status;
    if(!running(t)) status = `<b>${esc(t.status)}</b>: this train is not running. The timetable below is the planned one.`;
    else if(w.st === 'wait') status = `Not started yet. Leaves <b>${esc(L.names[0])}</b> at <b>${hm(D.d)}</b>.`;
    else if(w.st === 'done') status = `This trip is over. It reached <b>${esc(L.names[L.names.length - 1])}</b> at <b>${hm(D.d + tl.total)}</b>.`;
    else status = `<span style="font-size:28px;font-weight:800">${esc(w.text)}</span><div class="hbar" style="height:12px;margin:12px 0"><i style="width:${w.pct}%"></i></div>Left <b>${esc(L.names[0])}</b> at <b>${hm(D.d)}</b>${w.next ? ` · Next station <b>${esc(w.next.name)}</b> at <b>${hm(w.next.at)}</b>` : ''} · Reaches <b>${esc(L.names[L.names.length - 1])}</b> at <b>${hm(D.d + tl.total)}</b>`;
    h += `<div class="card" style="margin-top:14px"><div class="card-title"><div class="title-icon">📡</div><div><h2>Running status</h2><p>Worked out from the timetable at ${hm(n)} (not live GPS)</p></div></div><p style="font-size:18px;color:var(--text)">${status}</p></div>`;
    /* station timetable */
    h += `<div class="card" style="margin-top:14px"><div class="card-title"><div class="title-icon">🕒</div><div><h2>Station timetable</h2><p>First train ${esc(s.first_train)} · last train ${esc(s.last_train)} · every ${s.frequency} min${adm ? ' · <a href="schedules.html" style="font-weight:800;text-decoration:underline">change timings in Schedules</a>' : ''}</p></div></div>
      <div class="table-wrap" style="max-height:560px;overflow:auto"><table class="tt"><tr><th></th><th>Station</th><th>Arrives</th><th>After start</th></tr>${L.names.map((name, i) => {
        const arr = D.d + L.offs[i]; let cls = '', mark = '○';
        if(running(t) && w.st === 'run'){ if(i < w.i) { cls = 'st-passed'; mark = '●'; } else if(i === w.i){ cls = 'st-here'; mark = '🚆'; } }
        else if(w.st === 'done') { cls = 'st-passed'; mark = '●'; }
        const tag = name === D.a ? ' <span class="pill ok">FROM</span>' : name === D.b ? ' <span class="pill ok">TO</span>' : '';
        return `<tr class="${cls}${tag ? ' st-focus' : ''}"><td>${mark}</td><td><b>${esc(name)}</b>${tag}${isInterchange(name) ? ' <span class="mini">⇄ interchange</span>' : ''}${cls === 'st-here' ? ` <span class="pill warn">${w.exact ? 'TRAIN IS HERE' : 'JUST LEFT'}</span>` : ''}</td><td><b>${hm(arr)}</b></td><td>${Math.round(L.offs[i])} min</td></tr>`; }).join('')}</table></div></div>`;
    /* trains between stations on this route */
    const names = tl.down.names;
    h += `<div class="card" style="margin-top:14px"><div class="card-title"><div class="title-icon">⇄</div><div><h2>Trains between stations</h2><p>Pick two stations on this route to see the next trains</p></div></div>
      <div class="form-grid"><div class="field"><label>FROM</label><select id="bFrom">${names.map(x => `<option ${x === (D.a || names[0]) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>TO</label><select id="bTo">${names.map(x => `<option ${x === (D.b || names[names.length - 1]) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
      <div id="bRes" style="display:flex;flex-direction:column;gap:12px;margin-top:14px"></div></div>`;
    view.innerHTML = h;
    $('#back').onclick = renderMain;
    const rr = $('#dRoute'); if(rr) rr.onchange = () => { D.sid = +rr.value; const b = bestTrip(SCH[D.sid], timeline(SCH[D.sid])); D.dir = b.dir; D.d = b.d; renderTrain(); };
    $('#dDir').onchange = e => { D.dir = e.target.value; const b = bestTrip(s, tl); D.d = (b.dir === D.dir) ? b.d : (departures(s).find(x => x > n) ?? deps[deps.length - 1]); renderTrain(); };
    $('#dTrip').onchange = e => { D.d = +e.target.value; renderTrain(); };
    $('#dTime').onchange = e => { clockStr = e.target.value; renderTrain(); };
    const showB = () => {
      D.a = $('#bFrom').value; D.b = $('#bTo').value;
      const rows = D.a === D.b ? [] : between(D.a, D.b);
      $('#bRes').innerHTML = D.a === D.b ? '<p>Choose two different stations.</p>' : betweenRows(rows, D.a, D.b);
      $$('#bRes .tcard').forEach(c => c.onclick = () => openTrain(+c.dataset.tid, c.dataset));
    };
    $('#bFrom').onchange = $('#bTo').onchange = showB; showB();
  }
  const gScheds = t => SCH.filter(s => s.train_id === t.id);

  document.addEventListener('DOMContentLoaded', async () => {
    ensureLogin(); view = $('#view'); if(!view) return;
    try{ [SCH, TR] = await Promise.all([api('GET', '/api/schedules').then(d => d.items), api('GET', '/api/trains').then(d => d.items)]); }
    catch(e){ view.innerHTML = '<div class="card"><p>Could not load trains.</p></div>'; return; }
    renderMain();
  });
})();
