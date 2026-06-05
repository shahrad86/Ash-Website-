/* ============================================================
   AshHomes GTA — shared site engine
   Front-end demo implementation. Bolt: replace the storage
   layer (localStorage) with Supabase as described in
   BOLT-INSTRUCTIONS.md — do NOT change any UI/UX behaviour.
   ============================================================ */

window.AH_CONFIG = Object.assign({
  GA4_ID: 'G-XXXXXXXXXX',                 // TODO: real GA4 Measurement ID
  BOLDTRAIL_WEBHOOK: '',                  // TODO: BoldTrail (kvCORE) lead webhook / API endpoint
  AGENT_EMAIL: 'ashhomesgta@gmail.com',
  AGENT_PHONE: '+14165206500'
}, window.AH_CONFIG || {});

const AH = (() => {
  const BASE = window.SITE_BASE || '';
  const store = {
    get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch(e){ return d } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)) }
  };

  /* ---------------- LISTINGS DATA ---------------- */
  const LISTINGS = [
    {price:"$1,319,000",addr:"PH02, 181 Sterling Road",area:"Bloordale, Toronto",bd:"3",ba:2,pk:1,sqft:"900",mls:"C13140044",status:"sale",img:"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=700&q=70"},
    {price:"$1,069,000",addr:"WL08, 80 Marine Parade Dr",area:"Mimico, Etobicoke",bd:"1+1",ba:2,pk:2,sqft:"939",mls:"W13009586",status:"sale",img:"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=700&q=70"},
    {price:"$749,900",addr:"2011, 18 Yonge St",area:"Harbourfront, Toronto",bd:"2",ba:2,pk:1,sqft:"854",mls:"C12961322",status:"sale",img:"https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=700&q=70"},
    {price:"$1,299,000",addr:"6108, 7 Grenville St",area:"Bay Street Corridor",bd:"3",ba:3,pk:1,sqft:"1,200",mls:"C12867172",status:"sale",img:"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=70"},
    {price:"$3,200/mo",addr:"1204, 5 Buttermill Ave",area:"Vaughan Metropolitan",bd:"2",ba:2,pk:1,sqft:"760",mls:"N12771005",status:"lease",img:"https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=700&q=70"},
    {price:"$2,650/mo",addr:"812, 30 Shore Breeze Dr",area:"Humber Bay, Etobicoke",bd:"1",ba:1,pk:1,sqft:"610",mls:"W12690221",status:"lease",img:"https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=700&q=70"},
    {price:"$1,180,000",addr:"42 Maple Crest Way",area:"Markham",bd:"4",ba:3,pk:2,sqft:"2,100",mls:"N12554310",status:"sold",img:"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=700&q=70"},
    {price:"$915,000",addr:"7 Birchwood Lane",area:"Scarborough",bd:"3",ba:2,pk:2,sqft:"1,640",mls:"E12440998",status:"sold",img:"https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=700&q=70"}
  ];
  const ST = {sale:{t:"For Sale",c:""},lease:{t:"For Lease",c:"lease"},sold:{t:"Sold",c:"sold"}};

  /* ---------------- ACTIVITY TRACKING ----------------
     Every meaningful interaction is recorded. Bolt: mirror each
     track() call to the `activity` table in Supabase. */
  function track(event, data = {}){
    const log = store.get('ah_activity', []);
    log.push({
      ts: new Date().toISOString(),
      event,
      page: location.pathname.split('/').pop() || 'index.html',
      user: (user() && user().email) || 'anonymous',
      data
    });
    if(log.length > 4000) log.splice(0, log.length - 4000);
    store.set('ah_activity', log);
    if(typeof gtag === 'function'){ try{ gtag('event', event, data); }catch(e){} }
  }

  /* ---------------- LEADS ----------------
     Single funnel for every form on the site.
     Bolt: 1) insert into `leads` table  2) POST to BoldTrail. */
  function lead(type, payload){
    const leads = store.get('ah_leads', []);
    const rec = { ts: new Date().toISOString(), type, ...payload };
    leads.push(rec); store.set('ah_leads', leads);
    track('lead_submitted', { type, ...payload });
    if(window.AH_CONFIG.BOLDTRAIL_WEBHOOK){
      try{
        fetch(window.AH_CONFIG.BOLDTRAIL_WEBHOOK, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(rec)
        });
      }catch(e){}
    }
    return rec;
  }

  /* ---------------- AUTH (demo) ----------------
     Bolt: replace with Supabase Auth (email/password + Google
     OAuth). Keep this exact modal UI. */
  function user(){ return store.get('ah_user', null); }
  function users(){ return store.get('ah_users', []); }

  function signUp(name, email, pass){
    const all = users();
    if(all.find(u => u.email === email)) return {error:'An account with this email already exists. Sign in instead.'};
    const u = {name, email, pass, provider:'email', joined:new Date().toISOString()};
    all.push(u); store.set('ah_users', all); store.set('ah_user', {name, email, provider:'email'});
    track('sign_up', {method:'email', email});
    return {ok:true};
  }
  function signIn(email, pass){
    const u = users().find(u => u.email === email && u.pass === pass);
    if(!u) return {error:'Email or password doesn’t match. Try again or create an account.'};
    store.set('ah_user', {name:u.name, email:u.email, provider:'email'});
    track('sign_in', {method:'email', email});
    return {ok:true};
  }
  function signInGoogle(){
    // DEMO ONLY — Bolt: replace with supabase.auth.signInWithOAuth({provider:'google'})
    const email = prompt('Google Sign-In (demo)\n\nEnter the Google email to simulate:');
    if(!email) return;
    const name = email.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const all = users();
    if(!all.find(u => u.email === email)){ all.push({name, email, provider:'google', joined:new Date().toISOString()}); store.set('ah_users', all); }
    store.set('ah_user', {name, email, provider:'google'});
    track('sign_in', {method:'google', email});
    closeModal(); refreshAuthUI(); toast(`Welcome, ${name.split(' ')[0]}.`);
  }
  function signOut(){
    track('sign_out', {email: user() && user().email});
    localStorage.removeItem('ah_user');
    refreshAuthUI(); toast('Signed out.');
  }

  /* ---------------- SAVED LISTINGS ---------------- */
  function saved(){ return store.get('ah_saved', []); }
  function isSaved(mls){ return saved().includes(mls); }
  function toggleSave(mls, btn){
    let s = saved();
    if(s.includes(mls)){
      s = s.filter(x => x !== mls);
      track('listing_unsaved', {mls});
    }else{
      s.push(mls);
      const l = LISTINGS.find(x => x.mls === mls);
      track('listing_saved', {mls, addr: l && l.addr, price: l && l.price});
      toast('Saved to your list.');
      if(!user()) setTimeout(()=>{ openModal('signup','Create a free account so your saved homes follow you to any device.'); }, 700);
    }
    store.set('ah_saved', s);
    if(btn) btn.classList.toggle('on', s.includes(mls));
    refreshSavedUI();
  }
  function sendListToAsh(){
    const s = saved();
    if(!s.length){ toast('Save a few homes first.'); return; }
    const u = user();
    if(!u){ openModal('signup','Sign in so Ash knows who the list is from.'); return; }
    const items = s.map(m => { const l = LISTINGS.find(x => x.mls === m); return l ? `• ${l.addr} — ${l.area} — ${l.price} (MLS ${l.mls})` : `• MLS ${m}`; });
    lead('showing_request', {name:u.name, email:u.email, listings:s});
    location.href = `mailto:${window.AH_CONFIG.AGENT_EMAIL}?subject=${encodeURIComponent('Showing request from '+u.name)}&body=${encodeURIComponent(`Hi Ash,\n\nI'd love to book showings for these homes:\n\n${items.join('\n')}\n\nThanks,\n${u.name}\n${u.email}`)}`;
    toast('Your list is on its way to Ash.');
  }

  /* ---------------- SHARED UI (modal, drawer, toast) ---------------- */
  function injectShell(){
    const shell = document.createElement('div');
    shell.innerHTML = `
    <div class="modal" id="ahModal">
      <div class="veil" onclick="AH.closeModal()"></div>
      <div class="box">
        <button class="x" onclick="AH.closeModal()">&times;</button>
        <div class="eyebrow">My AshHomes</div>
        <h3 id="amTitle">Welcome back</h3>
        <div class="sub" id="amSub">Sign in to save homes and book showings.</div>
        <div class="mer" id="amErr"></div>
        <button class="gbtn" onclick="AH.signInGoogle()">
          <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41.4 35.2 44 30 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
          Continue with Google
        </button>
        <div class="or">or</div>
        <div class="fg" id="amNameW" style="display:none"><input class="inp" id="amName" placeholder="Full name"></div>
        <div class="fg"><input class="inp" id="amEmail" type="email" placeholder="Email"></div>
        <div class="fg"><input class="inp" id="amPass" type="password" placeholder="Password"></div>
        <button class="btn btn-gold btn-block" id="amGo" onclick="AH.submitAuth()">Sign In</button>
        <div class="mtoggle" id="amTog">New here? <a onclick="AH.openModal('signup')">Create a free account</a></div>
      </div>
    </div>
    <div class="drawer" id="ahDrawer">
      <div class="dhead"><h3>Saved homes</h3><button onclick="AH.closeDrawer()">&times;</button></div>
      <div class="dbody" id="ahDrawerBody"></div>
      <div class="dfoot">
        <p>Ready to see them in person? Send your list to Ash and he'll arrange the showings.</p>
        <button class="btn btn-gold btn-block" onclick="AH.sendListToAsh()">Send List to Ash</button>
      </div>
    </div>
    <div class="toast" id="ahToast"></div>`;
    document.body.appendChild(shell);
  }

  let modalMode = 'signin';
  function openModal(mode = 'signin', subtitle){
    modalMode = mode;
    const m = document.getElementById('ahModal');
    document.getElementById('amErr').style.display = 'none';
    document.getElementById('amNameW').style.display = mode === 'signup' ? 'block' : 'none';
    document.getElementById('amTitle').textContent = mode === 'signup' ? 'Create your account' : 'Welcome back';
    document.getElementById('amSub').textContent = subtitle || (mode === 'signup' ? 'Save homes, build your showing list, and get market updates.' : 'Sign in to save homes and book showings.');
    document.getElementById('amGo').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
    document.getElementById('amTog').innerHTML = mode === 'signup'
      ? 'Already have an account? <a onclick="AH.openModal(\'signin\')">Sign in</a>'
      : 'New here? <a onclick="AH.openModal(\'signup\')">Create a free account</a>';
    m.classList.add('open');
    track('auth_modal_opened', {mode});
  }
  function closeModal(){ document.getElementById('ahModal').classList.remove('open'); }
  function submitAuth(){
    const name = document.getElementById('amName').value.trim();
    const email = document.getElementById('amEmail').value.trim();
    const pass = document.getElementById('amPass').value;
    const err = document.getElementById('amErr');
    if(!email || !pass || (modalMode === 'signup' && !name)){ err.textContent = 'Please fill in every field.'; err.style.display = 'block'; return; }
    const r = modalMode === 'signup' ? signUp(name, email, pass) : signIn(email, pass);
    if(r.error){ err.textContent = r.error; err.style.display = 'block'; return; }
    closeModal(); refreshAuthUI();
    toast(modalMode === 'signup' ? 'Account created. Welcome!' : 'Welcome back.');
  }

  function openDrawer(){ refreshSavedUI(); document.getElementById('ahDrawer').classList.add('open'); track('saved_drawer_opened', {count: saved().length}); }
  function closeDrawer(){ document.getElementById('ahDrawer').classList.remove('open'); }

  let toastT;
  function toast(msg){
    const t = document.getElementById('ahToast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove('show'), 2600);
  }

  function refreshSavedUI(){
    document.querySelectorAll('[data-saved-count]').forEach(el => {
      const n = saved().length;
      el.textContent = n; el.style.display = n ? 'grid' : 'none';
    });
    const body = document.getElementById('ahDrawerBody');
    if(!body) return;
    const s = saved();
    body.innerHTML = s.length ? s.map(m => {
      const l = LISTINGS.find(x => x.mls === m);
      if(!l) return `<div class="ditem"><div class="di"><b>MLS ${m}</b><span>Saved from MLS search</span></div><button class="rm" onclick="AH.toggleSave('${m}')">&times;</button></div>`;
      return `<div class="ditem"><img src="${l.img}" alt=""><div class="di"><b>${l.price}</b><span>${l.addr}</span><span>${l.area}</span></div><button class="rm" onclick="AH.toggleSave('${l.mls}')">&times;</button></div>`;
    }).join('') : '<div class="dempty">No saved homes yet.<br>Tap the heart on any listing.</div>';
    document.querySelectorAll('.heart[data-mls]').forEach(h => h.classList.toggle('on', isSaved(h.dataset.mls)));
  }

  function refreshAuthUI(){
    const u = user();
    document.querySelectorAll('[data-auth-slot]').forEach(el => {
      el.innerHTML = u
        ? `<a style="font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;cursor:default">Hi, ${u.name.split(' ')[0]}</a> <a onclick="AH.signOut()" style="font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);cursor:pointer">Sign out</a>`
        : `<a onclick="AH.openModal('signin')" style="font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Sign In</a>`;
    });
  }

  /* ---------------- LISTING RENDER ---------------- */
  function renderListings(gridId = 'grid', filter = 'all', q = '', limit = 0){
    const g = document.getElementById(gridId); if(!g) return;
    g.innerHTML = '';
    let list = LISTINGS.filter(l => (filter === 'all' || l.status === filter) && (l.addr + l.area).toLowerCase().includes(q));
    if(limit) list = list.slice(0, limit);
    list.forEach(l => {
      const s = ST[l.status];
      g.insertAdjacentHTML('beforeend',
        `<div class="card"><div class="ph"><span class="badge ${s.c}">${s.t}</span><button class="heart ${isSaved(l.mls)?'on':''}" data-mls="${l.mls}" onclick="AH.toggleSave('${l.mls}',this)" aria-label="Save listing"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg></button><img src="${l.img}" loading="lazy" alt="${l.addr}"></div><div class="body"><div class="price">${l.price}</div><div class="addr">${l.addr}</div><div class="area">${l.area}</div><div class="specs"><span>${l.bd} bd</span><span>${l.ba} ba</span><span>${l.pk} pk</span><span>${l.sqft} sqft</span></div></div></div>`);
    });
    if(!g.innerHTML) g.innerHTML = '<p style="color:var(--muted);grid-column:1/-1">Nothing matches. Contact Ash for off-market options.</p>';
  }

  /* ---------------- FORMS ---------------- */
  function bindLeadForms(){
    document.querySelectorAll('form[data-lead]').forEach(f => {
      f.addEventListener('submit', e => {
        e.preventDefault();
        const data = {};
        f.querySelectorAll('input,select,textarea').forEach(i => { if(i.name) data[i.name] = i.value; });
        const required = f.querySelectorAll('[required]');
        for(const r of required){ if(!r.value){ toast('Please fill in the required fields.'); r.focus(); return; } }
        lead(f.dataset.lead, data);
        const ok = f.querySelector('.form-ok');
        if(ok) ok.style.display = 'block';
        f.querySelectorAll('input,textarea').forEach(i => i.value = '');
        toast('Sent. Ash will be in touch shortly.');
      });
    });
  }

  /* ---------------- CALCULATORS ---------------- */
  const fmt = n => '$' + Math.round(n).toLocaleString();
  function initCalcs(){
    const $ = id => document.getElementById(id);
    if($('mPrice')){
      const calcMort = () => {
        const price=+$('mPrice').value, dp=+$('mDown').value, rate=+$('mRate').value, years=+$('mAmort').value;
        const down=price*dp/100, base=price-down;
        let cmhc=0;
        if(dp<20){ let p=dp<10?0.04:dp<15?0.031:0.028; cmhc=base*p; }
        const loan=base+cmhc;
        const i=Math.pow(1+(rate/100)/2,1/6)-1, n=years*12;
        const pay=loan*i/(1-Math.pow(1+i,-n));
        $('mPriceL').textContent=fmt(price); $('mDownL').textContent=dp+'%, '+fmt(down);
        $('mRateL').textContent=rate.toFixed(2)+'%'; $('mAmortL').textContent=years+' years';
        $('mResult').textContent=fmt(pay); $('mLoan').textContent=fmt(loan);
        $('mInt').textContent=fmt(pay*n-loan); $('mCmhc').textContent=fmt(cmhc);
      };
      ['mPrice','mDown','mRate','mAmort'].forEach(id=>$(id).addEventListener('input',calcMort)); calcMort();
    }
    if($('lPrice')){
      const ltt = p => { let t=Math.min(p,55000)*0.005; if(p>55000)t+=(Math.min(p,250000)-55000)*0.01; if(p>250000)t+=(Math.min(p,400000)-250000)*0.015; if(p>400000)t+=(Math.min(p,2000000)-400000)*0.02; if(p>2000000)t+=(p-2000000)*0.025; return t; };
      const calcLTT = () => {
        const p=+$('lPrice').value, isTO=$('lLoc').value==='toronto', ftb=$('lFtb').checked;
        const prov=ltt(p), mun=isTO?ltt(p):0;
        let reb=0; if(ftb){ reb+=Math.min(prov,4000); if(isTO)reb+=Math.min(mun,4475); }
        $('lPriceL').textContent=fmt(p); $('lProv').textContent=fmt(prov);
        $('lMun').textContent=isTO?fmt(mun):'$0'; $('lReb').textContent='-'+fmt(reb);
        $('lResult').textContent=fmt(prov+mun-reb);
      };
      ['lPrice','lLoc','lFtb'].forEach(id=>$(id).addEventListener('input',calcLTT)); calcLTT();
    }
    if($('rRent')){
      const calcRvB = () => {
        const rent=+$('rRent').value, price=+$('rPrice').value, dp=+$('rDown').value, rate=+$('rRate').value, years=+$('rYears').value;
        const down=price*dp/100, loan=price-down;
        const i=Math.pow(1+(rate/100)/2,1/6)-1, n=300;
        const pay=loan*i/(1-Math.pow(1+i,-n));
        const ownMonthly=pay + price*0.01/12 + price*0.0066/12;            // + property tax ~1%/yr + maintenance
        const horizon=years*12;
        const rentTotal=rent*horizon*1.025;                                 // modest rent growth
        const appreciation=price*(Math.pow(1.03,years)-1);                  // 3%/yr appreciation
        let bal=loan; const mi=i;
        for(let k=0;k<horizon;k++){ bal=bal*(1+mi)-pay; }
        const principalPaid=loan-Math.max(bal,0);
        const ownNet=(ownMonthly*horizon)-(appreciation+principalPaid);
        const diff=rentTotal-ownNet;
        $('rRentL').textContent=fmt(rent)+'/mo'; $('rPriceL').textContent=fmt(price);
        $('rDownL').textContent=dp+'%, '+fmt(down); $('rRateL').textContent=rate.toFixed(2)+'%';
        $('rYearsL').textContent=years+' years';
        $('rResult').textContent=diff>0?fmt(diff):fmt(-diff);
        $('rVerdict').textContent=diff>0?'Estimated advantage of buying over '+years+' years':'Estimated advantage of renting over '+years+' years';
        $('rRentT').textContent=fmt(rentTotal); $('rOwnT').textContent=fmt(ownMonthly*horizon);
        $('rEquity').textContent=fmt(appreciation+principalPaid);
      };
      ['rRent','rPrice','rDown','rRate','rYears'].forEach(id=>$(id).addEventListener('input',calcRvB)); calcRvB();
    }
    document.querySelectorAll('.ctabs button[data-calc]').forEach(b => b.onclick = () => {
      document.querySelectorAll('.ctabs button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('[id^=calc-]').forEach(p => p.style.display = 'none');
      const panel = document.getElementById('calc-' + b.dataset.calc);
      if(panel) panel.style.display = 'grid';
      track('calculator_viewed', {calc: b.dataset.calc});
    });
  }

  /* ---------------- BOOT ---------------- */
  function init(){
    injectShell();

    const nav = document.getElementById('nav');
    if(nav) addEventListener('scroll', () => nav.classList.toggle('shrink', scrollY > 30));
    const mob = document.getElementById('mobnav');
    const burger = document.getElementById('burger');
    if(burger && mob){
      burger.onclick = () => mob.classList.add('open');
      const x = document.getElementById('mobx'); if(x) x.onclick = () => mob.classList.remove('open');
      mob.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mob.classList.remove('open')));
    }

    const io = new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }), {threshold:.12});
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    const yr = document.getElementById('yr'); if(yr) yr.textContent = new Date().getFullYear();

    document.querySelectorAll('[data-track]').forEach(el => el.addEventListener('click', () => track('cta_click', {cta: el.dataset.track})));

    bindLeadForms();
    initCalcs();
    refreshAuthUI();
    refreshSavedUI();
    track('page_view', {title: document.title});
  }

  document.addEventListener('DOMContentLoaded', init);

  return { LISTINGS, renderListings, toggleSave, sendListToAsh, openModal, closeModal, submitAuth,
           signInGoogle, signOut, openDrawer, closeDrawer, track, lead, toast, saved, user,
           _store: store };
})();
