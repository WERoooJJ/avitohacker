// ===== localStorage wrapper =====
const LS = {
  get k(){ return 'FA_APP_STATE_V3'; }, // bump версия ключа
  load(){ try{ return JSON.parse(localStorage.getItem(this.k)) ?? null }catch{ return null } },
  save(s){ localStorage.setItem(this.k, JSON.stringify(s)) }
};

function state(){ return LS.load(); }
function setState(patch){ const s = Object.assign({}, state(), patch); LS.save(s); return s; }

// ===== helpers =====
function rub(n){ return n.toLocaleString('ru-RU') + ' ₽'; }
function toast(msg){
  const el = document.getElementById('toast');
  if(!el){ alert(msg); return; }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2000);
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

// SHA-256 хеш для таблицы админа (на лету)
async function sha256(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ===== init store =====
function initStore(){
  let s = LS.load();
  if(s) return;

  const names = [
    'Mickeal','Anna','Sergey','Pavel','Nika','Oleg','Lena','Egor','Alina','Roma',
    'Yuliya','Ilya','Den','Maya','Tim','Arsen','Katya','Stepan','Dasha','Zhenya',
    'Nastya','Murat','Aruzhan','Igor','Polina','Kirill','Marina','Sanzhar','Dimitri','Rita',
    'Fedor','Vika','Olesya','Gleb','Omar','Danel','Maks','Sasha','Artur','Ernar',
    'Adil','Mira','Nurlan','Asel','Aruzhan2','Bulat','Amina','Zhanna','Yaroslav','Aigerim'
  ];
  const makePass = ()=>{
    const pool='ABCDEFGHJKLMNPQRSTUVWXabcdefghijkmnpqrstuvwx23456789';
    let p=''; for(let i=0;i<10;i++) p+=pool[Math.floor(Math.random()*pool.length)];
    return p.replace(/^(.{2})/,'Ip'); // чуть «правдоподобней»
  };

  const users = {};
  names.forEach(n=>{
    users[n] = { pass: makePass(), balance: randInt(10_000, 5_000_000), favs: [] };
  });

  // обязательные:
  users['Hacker']   = { pass: '123',                    balance: 1_200_000, favs: [1] };
  users['Vladimir'] = { pass: 'GaGaVladik55782pass',    balance: 0,         favs: [] };

  const ads = {
    1: { id:1, title:'Лифтбек, 3.0 AT', desc:'Состояние отличное. Без ДТП. ПТС оригинал.',
         price: 20_900_000, seller: 'Vladimir', img:null, isSold:false, buyer:null }
  };

  s = {
    currentUser: null,
    users,
    ads,
    admin: { isActive:false, user:null }
  };
  LS.save(s);
}

// ===== session / auth =====
function guardOnIndex(){
  const s = state();
  if(!s.currentUser){
    const m = document.getElementById('auth');
    if(m) m.hidden = false;
  }
}

async function login(u,p){
  const s = state(); const user = s.users[u];
  if(!user || user.pass !== p) return false;
  s.currentUser = u;
  // сброс админ-прав при входе в другого юзера
  Object.values(s.users).forEach(x=>{ if(x.role==='admin') x.role='user'; });
  LS.save(s);
  return true;
}

async function signup(u,p){
  const s = state();
  if(!u || !p) return false;
  if(s.users[u]) return false;
  s.users[u] = { pass:p, balance: randInt(50_000, 500_000), favs: [] };
  s.currentUser = u;
  LS.save(s);
  return true;
}

async function adminRegister(u,p){
  const s = state();
  if(u==='admin' && p==='Admin123'){
    s.admin.isActive = true;
    if(s.currentUser){
      s.users[s.currentUser].role = 'admin';
    }else{
      // если никто не залогинен — создадим админа и залогиним
      s.users['admin'] = { pass:'Admin123', balance:0, favs: [], role:'admin' };
      s.currentUser = 'admin';
    }
    LS.save(s);
    return true;
  }
  return false;
}

function logout(){
  const s = state();
  if(s && s.users[s.currentUser]) s.users[s.currentUser].role = 'user';
  s.currentUser = null; LS.save(s);
}

function current(){ return state().currentUser; }

// ===== views =====
function showView(name){
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  const el = document.getElementById('view-'+name); if(el) el.hidden=false;
  document.querySelectorAll('.nav__links a').forEach(a=>a.classList.toggle('active', a.dataset.view===name));
  if(name==='feed') renderFeed();
  if(name==='fav')  renderFavs();
  if(name==='post') renderMyAds();
}

function mountUI(){
  const s = state(); if(!s) return;
  const user = s.users[s.currentUser]; if(!user) return;
  const uName = document.getElementById('username'); if(uName) uName.textContent = s.currentUser;
  const bal   = document.getElementById('balance'); if(bal)   bal.textContent  = 'Баланс: ' + rub(user.balance);
  if(document.getElementById('feed')) showView('feed');
}

// ===== ads/cards =====
function adCard(ad){
  const s = state(); const me = s.currentUser; const isOwner = ad.seller===me;
  const sold = ad.isSold ? `<span class="badge">Продано → ${escapeHtml(ad.buyer||'-')}</span>` : '';
  const img  = `<div class="thumb">${ad.img?`<img src="${ad.img}" alt="" style="max-width:100%;max-height:100%;border-radius:10px">`:'Фото'}</div>`;
  let actions = '';
  if(!isOwner && !ad.isSold){
    const inFav = (s.users[me].favs||[]).includes(ad.id);
    actions += `<button class="btn btn--ghost" data-act="fav" data-id="${ad.id}">${inFav?'В избранном':'В избранное'}</button>`;
    actions += `<button class="btn" data-act="buy" data-id="${ad.id}">Купить</button>`;
  }
  if(isOwner && !ad.isSold){
    actions += `<button class="btn btn--ghost" data-act="edit" data-id="${ad.id}">Изменить цену</button>`;
  }
  return `
    <article class="card">
      ${img}
      <h3 style="margin:12px 0 6px">${escapeHtml(ad.title)}</h3>
      <p class="muted" style="margin:0 0 8px">${escapeHtml(ad.desc)}</p>
      <div class="row">
        <div class="price">${rub(ad.price)}</div>
        <span class="badge">Продавец: ${escapeHtml(ad.seller)}</span>
      </div>
      <div class="row" style="margin-top:10px">${sold || actions || '<span class="muted">Нет действий</span>'}</div>
    </article>`;
}

function bindCardActions(scope){
  scope.querySelectorAll('[data-act]').forEach(btn=>{
    btn.onclick = ()=>{
      const act=btn.dataset.act, id=Number(btn.dataset.id);
      if(act==='fav') toggleFav(id);
      if(act==='buy') buyAd(id);
      if(act==='edit') editPrice(id);
    };
  });
}

function renderFeed(){
  const wrap = document.getElementById('feed'); const s = state();
  wrap.innerHTML = Object.values(s.ads).map(adCard).join('');
  bindCardActions(wrap);
}
function renderFavs(){
  const wrap = document.getElementById('favList'); const s = state(); const me = s.currentUser;
  const favAds = (s.users[me].favs||[]).map(id=>s.ads[id]).filter(Boolean);
  wrap.innerHTML = favAds.length ? favAds.map(adCard).join('') : `<div class="card"><p class="muted">Пусто. Добавь что-нибудь в избранное.</p></div>`;
  bindCardActions(wrap);
}
function renderMyAds(){
  const wrap = document.getElementById('myAds'); const s = state(); const me = s.currentUser;
  const my = Object.values(s.ads).filter(a=>a.seller===me);
  wrap.innerHTML = my.length ? my.map(adCard).join('') : `<div class="card"><p class="muted">У тебя пока нет объявлений.</p></div>`;
  bindCardActions(wrap);
}

// ===== actions =====
function toggleFav(id){
  const s = state(); const me = s.currentUser; const favs = new Set(s.users[me].favs||[]);
  favs.has(id) ? favs.delete(id) : favs.add(id); s.users[me].favs=[...favs]; LS.save(s);
  toast('Обновлено избранное'); mountUI();
}
function buyAd(id){
  const s = state(); const me = s.currentUser; const u = s.users[me]; const ad = s.ads[id];
  if(ad.isSold) return toast('Уже продано');
  if(u.balance < ad.price) return toast('Недостаточно средств');
  u.balance -= ad.price; ad.isSold=true; ad.buyer=me; LS.save(s);
  const bal = document.getElementById('balance'); if(bal) bal.textContent='Баланс: '+rub(u.balance);
  openWin();
}
function editPrice(id){
  const s = state(); const me = s.currentUser; const ad = s.ads[id];
  if(ad.seller !== me) return toast('Нет прав');
  const v = prompt('Новая цена, ₽ (только число):', ad.price);
  if(v===null) return;
  const n = Number(String(v).replace(/\s|₽/g,''));
  if(!Number.isFinite(n) || n<=0) return toast('Некорректная цена');
  ad.price = Math.round(n); LS.save(s); toast('Цена изменена'); mountUI();
}

// ===== win modal =====
function openWin(){ const w=document.getElementById('win'); if(w) w.hidden=false; }
function closeWin(){ const w=document.getElementById('win'); if(w) w.hidden=true; }
