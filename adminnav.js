/* MetroX: builds the menu for the logged in role (admin or passenger). */
(function(){
  let u=null; try{ u=JSON.parse(localStorage.getItem('metroSession')||'null'); }catch(e){}
  if(!u) return;
  const admin=u.role==='admin';
  if(admin) document.documentElement.classList.add('is-admin');
  document.addEventListener('DOMContentLoaded',()=>{
    const nav=document.querySelector('.nav'); if(!nav) return;
    const inAdmin=location.pathname.includes('/admin/');
    const root=f=>(inAdmin?'../':'')+f, adm=f=>(inAdmin?'':'admin/')+f;
    const common=[
      [root('index.html'),'Dashboard'],[root('stations.html'),'Stations'],[root('trains.html'),'Trains'],[root('routes.html'),'Routes'],
      [root('schedules.html'),'Schedules'],[root('ticket.html'),'Ticket Booking'],[root('fare.html'),'Fare Calculator'],[root('history.html'),'Booking History']
    ];
    const items=admin?[common[0],common[1],common[2],[root('add-train.html'),'Add Train'],...common.slice(3),[adm('reports.html'),'Reports']]:common;
    nav.innerHTML=items.map(([h,t])=>`<a href="${h}"><i></i>${t}</a>`).join('');
  });
})();
