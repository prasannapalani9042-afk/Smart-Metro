/* MetroX icon set: real metro-train style SVG icons (no emoji). */
(function(){
  const S=(p)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS={
    /* front view of a metro train: body, windscreen, head-lights, bogie, rails */
    train:S('<rect x="5" y="2.5" width="14" height="15.5" rx="4.2"/><rect x="7.6" y="5.2" width="8.8" height="5.2" rx="1.3"/><path d="M5 12.6h14"/><circle cx="8.9" cy="15.2" r=".9" fill="currentColor"/><circle cx="15.1" cy="15.2" r=".9" fill="currentColor"/><path d="M8.4 18l-2.2 3.5M15.6 18l2.2 3.5M7.2 21.5h9.6"/>'),
    home:S('<path d="M3.5 11 12 3.8l8.5 7.2"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/>'),
    station:S('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'),
    route:S('<circle cx="5.5" cy="18" r="2.3"/><circle cx="18.5" cy="6" r="2.3"/><path d="M7.8 18h6.2a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6.2"/>'),
    lines:S('<path d="M3 7h18M3 17h18"/><circle cx="7" cy="7" r="2.2" fill="#fff"/><circle cx="17" cy="7" r="2.2" fill="#fff"/><circle cx="12" cy="17" r="2.2" fill="#fff"/><path d="M12 7v10"/>'),
    clock:S('<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.6 2.2"/>'),
    rupee:S('<path d="M7 5.5h10M7 10h10"/><path d="M7 5.5h3.5a3.6 3.6 0 0 1 0 7H7l8 6.5"/>'),
    ticket:S('<path d="M3 8.5a2 2 0 0 0 0 7V18h18v-2.5a2 2 0 0 1 0-7V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2.2"/>'),
    heart:S('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>'),
    history:S('<path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4.2l2.8 1.8"/>'),
    chart:S('<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="11" width="3" height="6" rx=".6"/><rect x="12.5" y="7" width="3" height="10" rx=".6"/><rect x="17" y="13" width="2.6" height="4" rx=".6"/>'),
    pin:S('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    live:S('<path d="M5 12a7 7 0 0 1 14 0"/><path d="M8.2 12a3.8 3.8 0 0 1 7.6 0"/><circle cx="12" cy="12.2" r="1.2" fill="currentColor"/><path d="M8 21l4-6 4 6"/>')
  };
  const BY_FILE={'index':'home','route':'route','lines':'lines','fare':'rupee','travel-time':'clock','live-train':'live','nearby':'pin','ticket':'ticket',
    'favorites':'heart','history':'history','admin-dashboard':'station','stations':'station','trains':'train','add-train':'train','routes':'route','schedules':'clock','reports':'chart'};
  window.MX_ICONS=ICONS;
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('.nav a').forEach(a=>{
      const f=(a.getAttribute('href')||'').split('/').pop().replace('.html','');
      const i=a.querySelector('i'); if(i&&ICONS[BY_FILE[f]]) i.innerHTML=ICONS[BY_FILE[f]];
    });
    document.querySelectorAll('.brandmark,.mark').forEach(m=>m.innerHTML=ICONS.train);
    document.querySelectorAll('.hero-icon').forEach(m=>m.innerHTML=ICONS.train);
    document.querySelectorAll('.title-icon').forEach(m=>{ if(!m.querySelector('svg')) m.innerHTML=ICONS.train; });
  });
  /* build badge: lets you see at a glance that the NEW version is running */
  document.addEventListener('DOMContentLoaded',()=>{
    const b=document.createElement('div'); b.textContent='Version 5.1 · 13 Oct 2026';
    b.style.cssText='position:fixed;left:10px;bottom:8px;z-index:50;font:600 12px Arial,sans-serif;color:#0b2a5b;background:rgba(255,255,255,.88);padding:4px 10px;border-radius:999px;pointer-events:none';
    document.body.appendChild(b);
  });
  /* favicon */
  const l=document.createElement('link'); l.rel='icon';
  l.href='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1457b8"/><g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3.5" width="12" height="13" rx="3.6"/><rect x="8.2" y="6" width="7.6" height="4.4" rx="1"/><path d="M8.6 16.5 7 20M15.4 16.5 17 20"/></g></svg>');
  document.head.appendChild(l);
})();
