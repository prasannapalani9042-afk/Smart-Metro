/* Dashboard: the SAME page for admin and passenger (admin gets "Manage", passenger gets "View"). */
document.addEventListener('DOMContentLoaded', async () => {
  ensureLogin();
  const adm = isAdmin(), I = k => window.MX_ICONS[k];
  let s, sch, bk;
  try{
    [s, sch, bk] = await Promise.all([api('GET', '/api/summary'), api('GET', '/api/schedules'), api('GET', adm ? '/api/admin/bookings' : '/api/bookings')]);
  }catch(e){ toast('Could not load dashboard data'); return; }
  const stn = uniqueNames().length, books = bk.items, schedules = sch.items;
  $('#dKpis').innerHTML = [
    ['STATIONS', stn, 'Across 3 lines'], ['TRAINS AVAILABLE', `${s.trains_available}/${s.trains}`, 'Ready to run'],
    ['ROUTES', s.routes, 'Defined routes'], ['SCHEDULES', s.schedules, 'Timetable entries']
  ].map(([l, v, m]) => `<div class="card stat"><label>${l}</label><strong>${v}</strong><span class="mini">${m}</span></div>`).join('');
  const verb = adm ? 'Manage' : 'View';
  const mods = [
    [I('station'), 'Stations', 'All stations on the Blue, Green and Yellow lines', `${stn} stations`, 'stations.html', `${verb} Stations`],
    [I('train'), 'Trains', 'Running status, timings and fleet', `${s.trains} trains`, 'trains.html', `${verb} Trains`],
    [I('route'), 'Routes', 'Source, destination and stops', `${s.routes} routes`, 'routes.html', `${verb} Routes`],
    [I('clock'), 'Schedules', 'Train timings and frequency', `${s.schedules} schedules`, 'schedules.html', `${verb} Schedules`],
    [I('ticket'), 'Ticket Booking', 'Book a ticket for a journey', 'Pick date and train', 'ticket.html', 'Book Ticket'],
    [I('rupee'), 'Fare Calculator', 'Fare for any two stations', '₹10 – ₹50', 'fare.html', 'Calculate Fare'],
    [I('history'), 'Booking History', adm ? 'All passenger bookings' : 'Your tickets and cancellations', `${books.length} bookings`, 'history.html', 'View History']
  ];
  $('#dModules').innerHTML = mods.map(([ic, n, ds, cnt, href, btn]) => `<a class="card mod" href="${href}">
    <div class="mod-ic">${ic}</div><h2>${n}</h2><p>${ds}</p><div class="mod-count">${cnt}</div><span class="mod-btn">${btn} →</span></a>`).join('');
  $('#dLive').innerHTML = '<tr><th>Train</th><th>Route</th><th>First</th><th>Last</th><th>Every</th></tr>' +
    (schedules.slice(0, 5).map(t => `<tr><td><b>${esc(t.train_code)}</b></td><td>${esc(t.route_name)}</td><td>${esc(t.first_train)}</td><td>${esc(t.last_train)}</td><td>${t.frequency} min</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">No schedules yet</td></tr>');
  $('#dBkTitle').textContent = adm ? 'Recent bookings' : 'My recent bookings';
  $('#dBkSub').textContent = adm ? 'Latest passenger tickets' : 'Your latest tickets';
  $('#dBook').innerHTML = '<tr><th>Ticket</th><th>Journey</th><th>Date</th><th>Fare</th><th>Status</th></tr>' +
    (books.slice(0, 5).map(b => `<tr><td>${esc(b.ticket_id)}</td><td>${esc(b.source)} → ${esc(b.destination)}${adm ? `<div class="mini">${esc(b.passenger_name)}</div>` : ''}</td>
      <td>${esc(b.travel_date)}</td><td>₹${b.total_fare}</td><td>${statusPill(b.status)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">No bookings yet</td></tr>');
});
