/* ============================================================
   AshHomes GTA — shared site engine
   Supabase-backed: Auth (email + Google OAuth), saved_listings,
   activity tracking, and leads. UI/UX is unchanged from the
   client-approved design.
   ============================================================ */

window.AH_CONFIG = Object.assign({
  GA4_ID: 'G-XXXXXXXXXX',
  AGENT_EMAIL: 'ashhomesgta@gmail.com',
  AGENT_PHONE: '+14165206525'
}, window.AH_CONFIG || {});

/* ---- Supabase client (loaded from CDN on every page) ---- */
const _SB_URL  = 'https://0ec90b57d6e95fcbda19832f.supabase.co';
const _SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw';

const AH = (() => {
  const BASE = window.SITE_BASE || '';

  /* ---- localStorage fallback (used only for anonymous saves before login) ---- */
  const store = {
    get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch(e){ return d } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)) },
    del(k){ localStorage.removeItem(k) }
  };

  /* ---- session ID (persists for browser session) ---- */
  let _sessionId = sessionStorage.getItem('ah_sid');
  if (!_sessionId) { _sessionId = crypto.randomUUID(); sessionStorage.setItem('ah_sid', _sessionId); }

  /* ---- Supabase ---- */
  let sb = null;
  function getSB(){
    if (sb) return sb;
    if (window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(_SB_URL, _SB_ANON, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    }
    return sb;
  }

  /* ---- in-memory current user ---- */
  let _currentUser = null; // { id, email, name, provider }

  /* ---- LISTINGS DATA ---- */
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

  /* ================================================================
     ACTIVITY TRACKING
     Batches writes and flushes to Supabase every 4 s or on unload.
     ================================================================ */
  let _actQueue = [];
  let _actTimer  = null;

  function track(event, data = {}){
    const rec = {
      ts: new Date().toISOString(),
      event,
      page: location.pathname.split('/').pop() || 'index.html',
      user_email: (_currentUser && _currentUser.email) || null,
      session_id: _sessionId,
      data
    };
    _actQueue.push(rec);
    if (typeof gtag === 'function'){ try{ gtag('event', event, data); }catch(e){} }
    if (!_actTimer) _actTimer = setTimeout(_flushActivity, 4000);
  }

  async function _flushActivity(){
    _actTimer = null;
    if (!_actQueue.length) return;
    const batch = _actQueue.splice(0, _actQueue.length);
    const client = getSB();
    if (!client) return;
    try { await client.from('activity').insert(batch); } catch(e) {}
  }

  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushActivity(); });
  addEventListener('pagehide', _flushActivity);

  /* ================================================================
     LEADS
     Inserts into `leads` table and calls the send-lead edge function
     which handles BoldTrail forwarding and showing-request emails.
     ================================================================ */
  async function lead(type, payload){
    track('lead_submitted', { type, ...payload });

    const { name, email, phone, message, ...rest } = payload;
    const body = {
      type,
      name: name || null,
      email: email || null,
      phone: phone || null,
      message: message || null,
      payload: rest,
      source_page: location.pathname.split('/').pop() || 'index.html'
    };

    try {
      await fetch(`${_SB_URL}/functions/v1/send-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Apikey': _SB_ANON },
        body: JSON.stringify(body)
      });
    } catch(e) {}

    return body;
  }

  /* ================================================================
     AUTH — Supabase email/password + Google OAuth
     ================================================================ */
  function user(){ return _currentUser; }

  async function _upsertProfile(sbUser){
    const client = getSB();
    if (!client || !sbUser) return;
    const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email.split('@')[0];
    const provider = sbUser.app_metadata?.provider || 'email';
    await client.from('profiles').upsert({
      id: sbUser.id,
      name,
      email: sbUser.email,
      provider,
    }, { onConflict: 'id', ignoreDuplicates: false });
    _currentUser = { id: sbUser.id, email: sbUser.email, name, provider };
  }

  async function _mergePendingSaves(){
    /* After login, push any localStorage saves into saved_listings */
    const pending = store.get('ah_saved', []);
    if (!pending.length) return;
    const client = getSB();
    if (!client || !_currentUser) return;
    const rows = pending.map(mls => {
      const l = LISTINGS.find(x => x.mls === mls);
      return { mls, addr: l ? l.addr : null, price: l ? l.price : null };
    });
    try {
      await client.from('saved_listings').upsert(rows, { onConflict: 'user_id,mls', ignoreDuplicates: true });
    } catch(e) {}
    store.del('ah_saved');
    await _loadSaved();
  }

  /* in-memory saved set (always in sync with DB for logged-in users) */
  let _savedSet = new Set(store.get('ah_saved', []));

  async function _loadSaved(){
    const client = getSB();
    if (!client || !_currentUser) {
      _savedSet = new Set(store.get('ah_saved', []));
      return;
    }
    try {
      const { data } = await client.from('saved_listings').select('mls');
      _savedSet = new Set((data || []).map(r => r.mls));
    } catch(e) {}
  }

  async function signUp(name, email, pass){
    const client = getSB();
    if (!client) return {error:'Service unavailable.'};
    const { data, error } = await client.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
    if (error) return {error: error.message};
    if (data.user) { await _upsertProfile(data.user); await _mergePendingSaves(); }
    return {ok:true};
  }

  async function signIn(email, pass){
    const client = getSB();
    if (!client) return {error:'Service unavailable.'};
    const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
    if (error) return {error: error.message};
    if (data.user) { await _upsertProfile(data.user); await _mergePendingSaves(); }
    return {ok:true};
  }

  function signInGoogle(){
    const client = getSB();
    if (!client) { toast('Service unavailable.'); return; }
    client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.href }
    });
  }

  async function signOut(){
    track('sign_out', {email: _currentUser && _currentUser.email});
    await _flushActivity();
    const client = getSB();
    if (client) await client.auth.signOut();
    _currentUser = null;
    _savedSet = new Set();
    refreshAuthUI();
    refreshSavedUI();
    toast('Signed out.');
  }

  /* ================================================================
     SAVED LISTINGS
     ================================================================ */
  function saved(){ return [..._savedSet]; }
  function isSaved(mls){ return _savedSet.has(mls); }

  async function toggleSave(mls, btn){
    const client = getSB();
    if (_savedSet.has(mls)){
      _savedSet.delete(mls);
      track('listing_unsaved', {mls});
      if (_currentUser && client){
        try { await client.from('saved_listings').delete().eq('mls', mls); } catch(e) {}
      } else {
        const s = store.get('ah_saved', []).filter(x => x !== mls);
        store.set('ah_saved', s);
      }
    } else {
      _savedSet.add(mls);
      const l = LISTINGS.find(x => x.mls === mls);
      track('listing_saved', {mls, addr: l && l.addr, price: l && l.price});
      toast('Saved to your list.');
      if (_currentUser && client){
        try {
          await client.from('saved_listings').upsert(
            { mls, addr: l ? l.addr : null, price: l ? l.price : null },
            { onConflict: 'user_id,mls', ignoreDuplicates: true }
          );
        } catch(e) {}
      } else {
        const s = store.get('ah_saved', []);
        if (!s.includes(mls)) { s.push(mls); store.set('ah_saved', s); }
        setTimeout(()=>{ openModal('signup','Create a free account so your saved homes follow you to any device.'); }, 700);
      }
    }
    if(btn) btn.classList.toggle('on', _savedSet.has(mls));
    refreshSavedUI();
  }

  async function sendListToAsh(){
    const s = saved();
    if(!s.length){ toast('Save a few homes first.'); return; }
    const u = user();
    if(!u){ openModal('signup','Sign in so Ash knows who the list is from.'); return; }
    const items = s.map(m => { const l = LISTINGS.find(x => x.mls === m); return l ? `• ${l.addr} — ${l.area} — ${l.price} (MLS ${l.mls})` : `• MLS ${m}`; });
    await lead('showing_request', {
      name: u.name, email: u.email,
      listings: s,
      listings_text: items
    });
    toast('Your list is on its way to Ash.');
  }

  /* ================================================================
     SHARED UI — modal, drawer, toast (structure unchanged)
     ================================================================ */
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

  async function submitAuth(){
    const name  = document.getElementById('amName').value.trim();
    const email = document.getElementById('amEmail').value.trim();
    const pass  = document.getElementById('amPass').value;
    const err   = document.getElementById('amErr');
    const btn   = document.getElementById('amGo');
    if(!email || !pass || (modalMode === 'signup' && !name)){
      err.textContent = 'Please fill in every field.'; err.style.display = 'block'; return;
    }
    btn.disabled = true; btn.textContent = 'Please wait…';
    const r = modalMode === 'signup' ? await signUp(name, email, pass) : await signIn(email, pass);
    btn.disabled = false; btn.textContent = modalMode === 'signup' ? 'Create Account' : 'Sign In';
    if(r.error){ err.textContent = r.error; err.style.display = 'block'; return; }
    closeModal(); refreshAuthUI(); refreshSavedUI();
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

  /* ================================================================
     LISTING RENDER
     ================================================================ */
  function renderListings(gridId = 'grid', filter = 'all', q = '', limit = 0){
    const g = document.getElementById(gridId); if(!g) return;
    g.innerHTML = '';
    let list = LISTINGS.filter(l => (filter === 'all' || l.status === filter) && (l.addr + l.area).toLowerCase().includes(q));
    if(limit) list = list.slice(0, limit);
    list.forEach(l => {
      const s = ST[l.status];
      const card = document.createElement('a');
      card.className = 'card';
      card.href = BASE + 'listing.html?mls=' + l.mls;
      card.style.display = 'block';
      card.innerHTML = `<div class="ph"><span class="badge ${s.c}">${s.t}</span><button class="heart ${isSaved(l.mls)?'on':''}" data-mls="${l.mls}" aria-label="Save listing"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg></button><img src="${l.img}" loading="lazy" alt="${l.addr}"></div><div class="body"><div class="price">${l.price}</div><div class="addr">${l.addr}</div><div class="area">${l.area}</div><div class="specs"><span>${l.bd} bd</span><span>${l.ba} ba</span><span>${l.pk} pk</span><span>${l.sqft} sqft</span></div></div>`;
      card.querySelector('.heart').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleSave(l.mls, e.currentTarget); });
      g.appendChild(card);
    });
    if(!g.children.length) g.innerHTML = '<p style="color:var(--muted);grid-column:1/-1">Nothing matches. Contact Ash for off-market options.</p>';
  }

  /* ================================================================
     FORMS
     ================================================================ */
  function bindLeadForms(){
    document.querySelectorAll('form[data-lead]').forEach(f => {
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const data = {};
        f.querySelectorAll('input,select,textarea').forEach(i => { if(i.name) data[i.name] = i.value; });
        const required = f.querySelectorAll('[required]');
        for(const r of required){ if(!r.value){ toast('Please fill in the required fields.'); r.focus(); return; } }
        await lead(f.dataset.lead, data);
        const ok = f.querySelector('.form-ok');
        if(ok) ok.style.display = 'block';
        f.querySelectorAll('input,textarea').forEach(i => i.value = '');
        toast('Sent. Ash will be in touch shortly.');
      });
    });
  }

  /* ================================================================
     CALCULATORS (unchanged logic)
     ================================================================ */
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
        const ownMonthly=pay + price*0.01/12 + price*0.0066/12;
        const horizon=years*12;
        const rentTotal=rent*horizon*1.025;
        const appreciation=price*(Math.pow(1.03,years)-1);
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

  /* ================================================================
     BOOT
     ================================================================ */
  async function init(){
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

    /* --- Restore auth session from Supabase --- */
    try {
    const client = getSB();
    if (client) {
      const { data: { session } } = await client.auth.getSession();
      if (session && session.user) {
        await _upsertProfile(session.user);
      }

      client.auth.onAuthStateChange((event, session) => {
        (async () => {
          if (session && session.user) {
            await _upsertProfile(session.user);
            if (event === 'SIGNED_IN') {
              await _mergePendingSaves();
              track('sign_in', { method: session.user.app_metadata?.provider || 'email', email: session.user.email });
            }
          } else {
            _currentUser = null;
            _savedSet = new Set();
          }
          refreshAuthUI();
          await _loadSaved();
          refreshSavedUI();
        })();
      });
    }
    } catch(e) { console.warn('Supabase init error:', e); }

    try { await _loadSaved(); } catch(e) {}
    refreshAuthUI();
    refreshSavedUI();
    track('page_view', {title: document.title});
  }

  document.addEventListener('DOMContentLoaded', init);

  return { LISTINGS, renderListings, toggleSave, sendListToAsh, openModal, closeModal, submitAuth,
           signInGoogle, signOut, openDrawer, closeDrawer, track, lead, toast, saved, isSaved, user,
           _store: store };
})();
window.AH = AH;
