/* ============================================================
   Listing detail page renderer — reads ?mls= from URL
   ============================================================ */
(function () {
  const AGENT_PHONE = '+14165206525';

  function mk(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function fmt(n) { return '$' + Math.round(n).toLocaleString(); }

  /* ---- canvas sparkline ---- */
  function drawSparkline(canvas, data) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 560;
    const H = 180;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const vals = data.map(d => d.psf);
    const min = Math.min(...vals) * 0.96;
    const max = Math.max(...vals) * 1.04;
    const pad = { t: 16, r: 16, b: 28, l: 58 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const x = i => pad.l + (i / (data.length - 1)) * pw;
    const y = v => pad.t + (1 - (v - min) / (max - min)) * ph;

    [0, 0.25, 0.5, 0.75, 1].forEach(t => {
      const yy = pad.t + t * ph;
      ctx.strokeStyle = '#e4ddcd'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l + pw, yy); ctx.stroke();
      ctx.fillStyle = '#77837c'; ctx.font = '10px Jost,sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('$' + Math.round(max - t * (max - min)).toLocaleString(), pad.l - 4, yy + 4);
    });

    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
    grad.addColorStop(0, 'rgba(168,127,67,0.22)');
    grad.addColorStop(1, 'rgba(168,127,67,0)');
    ctx.beginPath();
    ctx.moveTo(x(0), y(vals[0]));
    vals.forEach((v, i) => { if (i) ctx.lineTo(x(i), y(v)); });
    ctx.lineTo(x(vals.length - 1), pad.t + ph);
    ctx.lineTo(x(0), pad.t + ph);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.strokeStyle = '#a87f43'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.moveTo(x(0), y(vals[0]));
    vals.forEach((v, i) => { if (i) ctx.lineTo(x(i), y(v)); });
    ctx.stroke();

    vals.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(x(i), y(v), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#a87f43'; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  /* ---- inline rent vs buy ---- */
  function buildRvB(priceRaw) {
    const price = priceRaw && priceRaw > 10000 ? priceRaw : 800000;
    const rentGuess = Math.round(price * 0.004 / 50) * 50;
    const wrap = mk('div', 'ld-rvb');
    wrap.innerHTML = `
      <h3>Rent vs Buy — run the numbers</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.6rem">
        <div>
          <div class="fg"><label>Monthly rent <b id="ldRentL">${fmt(rentGuess)}/mo</b></label><input type="range" id="ldRent" min="1000" max="8000" step="50" value="${rentGuess}"></div>
          <div class="fg"><label>Purchase price <b id="ldPriceL">${fmt(price)}</b></label><input type="range" id="ldRvbPrice" min="400000" max="3000000" step="10000" value="${price}"></div>
          <div class="fg"><label>Down payment <b id="ldDownL">20%</b></label><input type="range" id="ldDown" min="5" max="50" step="1" value="20"></div>
          <div class="fg"><label>Rate <b id="ldRateL">5.19%</b></label><input type="range" id="ldRate" min="2" max="10" step="0.1" value="5.19"></div>
          <div class="fg"><label>Horizon <b id="ldYearsL">10 years</b></label><input type="range" id="ldYears" min="2" max="25" step="1" value="10"></div>
        </div>
        <div class="rvb-result">
          <div class="lbl" style="color:var(--gold-soft)">Estimated advantage</div>
          <div class="big" id="ldRvbResult">—</div>
          <div class="rvb-verdict" id="ldRvbVerdict"></div>
          <div style="margin-top:1.4rem;border-top:1px solid rgba(255,255,255,.15);padding-top:1rem">
            <div style="display:flex;justify-content:space-between;font-size:.82rem;color:#cdd8d3;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.1)">Total rent cost <b style="color:#fff" id="ldRentT">—</b></div>
            <div style="display:flex;justify-content:space-between;font-size:.82rem;color:#cdd8d3;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.1)">Total ownership cost <b style="color:#fff" id="ldOwnT">—</b></div>
            <div style="display:flex;justify-content:space-between;font-size:.82rem;color:#cdd8d3;padding:.4rem 0">Equity built <b style="color:#fff" id="ldEquity">—</b></div>
          </div>
        </div>
      </div>`;

    function calc() {
      const rent = +document.getElementById('ldRent').value;
      const p = +document.getElementById('ldRvbPrice').value;
      const dp = +document.getElementById('ldDown').value;
      const rate = +document.getElementById('ldRate').value;
      const years = +document.getElementById('ldYears').value;
      document.getElementById('ldRentL').textContent = fmt(rent) + '/mo';
      document.getElementById('ldPriceL').textContent = fmt(p);
      document.getElementById('ldDownL').textContent = dp + '%';
      document.getElementById('ldRateL').textContent = rate.toFixed(2) + '%';
      document.getElementById('ldYearsL').textContent = years + ' years';
      const loan = p - p * dp / 100;
      const i = Math.pow(1 + (rate / 100) / 2, 1 / 6) - 1;
      const pay = loan * i / (1 - Math.pow(1 + i, -300));
      const ownMonthly = pay + p * 0.01 / 12 + p * 0.0066 / 12;
      const horizon = years * 12;
      const rentTotal = rent * horizon * 1.025;
      const appreciation = p * (Math.pow(1.03, years) - 1);
      let bal = loan;
      for (let k = 0; k < horizon; k++) bal = bal * (1 + i) - pay;
      const equity = appreciation + (loan - Math.max(bal, 0));
      const diff = rentTotal - (ownMonthly * horizon - equity);
      document.getElementById('ldRvbResult').textContent = diff > 0 ? fmt(diff) : fmt(-diff);
      document.getElementById('ldRvbVerdict').textContent = diff > 0 ? 'Estimated advantage of buying over ' + years + ' years' : 'Estimated advantage of renting over ' + years + ' years';
      document.getElementById('ldRentT').textContent = fmt(rentTotal);
      document.getElementById('ldOwnT').textContent = fmt(ownMonthly * horizon);
      document.getElementById('ldEquity').textContent = fmt(equity);
    }
    wrap.addEventListener('input', calc);
    setTimeout(calc, 0);
    return wrap;
  }

  /* ---- main render ---- */
  function render() {
    const mls = new URLSearchParams(location.search).get('mls');
    const root = document.getElementById('ldRoot');
    if (!root) return;

    const d = (window.AH_DETAILS || {})[mls] || {};
    const b = (window.AH && window.AH.LISTINGS || []).find(l => l.mls === mls) || {};

    if (!d.mls && !b.mls) {
      root.innerHTML = `<section class="section tight"><div class="wrap" style="text-align:center;padding:3rem 1rem">
        <div class="eyebrow">Not found</div><h2 style="font-size:2rem;font-weight:400;margin:.5rem 0 1rem">Listing unavailable</h2>
        <p style="color:var(--muted);margin-bottom:1.6rem">This listing may have been removed or the MLS number is invalid.</p>
        <a href="search.html" class="btn btn-ghost">Browse All Listings</a></div></section>`;
      return;
    }

    const photos = d.photos || (b.img ? [b.img] : ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80']);
    const status = d.status || b.status || 'sale';
    const statusLabel = { sale: 'For Sale', lease: 'For Lease', sold: 'Sold' }[status] || 'For Sale';
    const price = d.price || b.price || '';
    const addr = d.addr || b.addr || '';
    const area = d.area || b.area || '';
    const bd = d.bd || b.bd || '—';
    const ba = d.ba || b.ba || '—';
    const pk = d.pk !== undefined ? d.pk : (b.pk !== undefined ? b.pk : '—');
    const sqft = d.sqft || b.sqft || '—';
    const mlsNum = d.mls || b.mls || mls || '';
    const priceRaw = d.priceRaw || 0;
    const sqftNum = parseInt((sqft || '').replace(/,/g, ''), 10);
    const psf = (priceRaw > 10000 && sqftNum > 0) ? Math.round(priceRaw / sqftNum) : null;

    document.title = `${addr} · ${price} · AshHomes GTA`;

    /* --- header --- */
    const hdr = mk('section', 'section tight');
    hdr.style.paddingBottom = '0';
    hdr.innerHTML = `<div class="wrap">
      <div class="crumbs" style="padding-top:.4rem;margin-bottom:.8rem">
        <a href="index.html">Home</a> &nbsp;/&nbsp; <a href="search.html">Listings</a> &nbsp;/&nbsp; ${addr}
      </div>
      <div class="ld-header">
        <span class="ld-status ${status}">${statusLabel}</span>
        <div class="ld-addr">${addr}</div>
        <div class="ld-area">${area}${d.postalCode ? ' · ' + d.postalCode : ''}</div>
      </div></div>`;
    root.appendChild(hdr);

    /* --- hero: gallery + agent card --- */
    const heroSec = mk('section', 'section tight');
    heroSec.style.paddingTop = '1rem';
    const heroWrap = mk('div', 'wrap');
    const heroGrid = mk('div', 'ld-hero');

    /* gallery */
    const gal = mk('div', 'ld-gallery');
    const mainWrap = mk('div', 'ld-main-img');
    const mainImg = mk('img');
    mainImg.src = photos[0]; mainImg.alt = addr;
    const countBadge = mk('div', 'ld-photo-count', `1 / ${photos.length}`);
    mainWrap.appendChild(mainImg); mainWrap.appendChild(countBadge);
    gal.appendChild(mainWrap);
    if (photos.length > 1) {
      const thumbs = mk('div', 'ld-thumbs');
      photos.forEach((src, i) => {
        const btn = mk('button', i === 0 ? 'active' : '');
        const ti = mk('img'); ti.src = src; ti.alt = `Photo ${i + 1}`;
        btn.appendChild(ti);
        btn.onclick = () => {
          mainImg.src = src;
          countBadge.textContent = `${i + 1} / ${photos.length}`;
          thumbs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', j === i));
        };
        thumbs.appendChild(btn);
      });
      gal.appendChild(thumbs);
    }
    heroGrid.appendChild(gal);

    /* agent card */
    const card = mk('div', 'ld-agent');
    const savedNow = window.AH && AH.isSaved ? AH.isSaved(mlsNum) : false;
    card.innerHTML = `
      <div class="price-big">${price}</div>
      ${psf ? `<div class="price-psf">$${psf.toLocaleString()} / sqft</div>` : ''}
      <div class="specs-row">
        <div><b>${bd}</b><span>Beds</span></div>
        <div><b>${ba}</b><span>Baths</span></div>
        <div><b>${pk}</b><span>Parking</span></div>
        <div><b>${sqft}</b><span>Sqft</span></div>
      </div>
      <button class="btn btn-gold btn-block" id="ldBookBtn" style="margin-bottom:.7rem" data-track="listing_book_showing">Book a Showing</button>
      <button class="btn btn-ghost btn-block" id="ldSaveBtn">${savedNow ? 'Saved — Remove' : 'Save Listing'}</button>
      <div class="agent-row">
        <div class="agent-avatar"><span>A</span></div>
        <div><div class="agent-name">Ash Ahluwalia</div><div class="agent-title">Sales Representative · AshHomes GTA</div></div>
      </div>
      <a href="tel:${AGENT_PHONE}" class="btn btn-line btn-block" style="margin-top:.7rem">Call Ash: 416 520 6525</a>
      <div class="mls-ref">MLS # ${mlsNum}</div>`;

    card.querySelector('#ldSaveBtn').onclick = function () {
      if (window.AH) AH.toggleSave(mlsNum, this);
      this.textContent = (window.AH && AH.isSaved(mlsNum)) ? 'Saved — Remove' : 'Save Listing';
    };

    card.querySelector('#ldBookBtn').onclick = () => {
      const existing = card.querySelector('.ld-book-form');
      if (existing) { existing.remove(); return; }
      const form = mk('div', 'ld-book-form');
      form.style.cssText = 'margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line)';
      form.innerHTML = `
        <div style="font-size:.8rem;color:var(--ink);margin-bottom:.8rem">Request a showing</div>
        <div class="form-ok" style="display:none;color:var(--gold);font-size:.82rem;margin-bottom:.6rem">Sent. Ash will be in touch shortly.</div>
        <input class="inp" id="ldBName" placeholder="Name" style="margin-bottom:.9rem">
        <input class="inp" id="ldBEmail" type="email" placeholder="Email" style="margin-bottom:.9rem">
        <input class="inp" id="ldBPhone" placeholder="Phone (optional)" style="margin-bottom:.9rem">
        <button class="btn btn-gold btn-block" id="ldBSend">Send Request</button>`;
      form.querySelector('#ldBSend').onclick = async () => {
        const name = form.querySelector('#ldBName').value.trim();
        const email = form.querySelector('#ldBEmail').value.trim();
        if (!name || !email) { window.AH && AH.toast('Please enter your name and email.'); return; }
        if (window.AH) await AH.lead('showing_request', { name, email, phone: form.querySelector('#ldBPhone').value, mls: mlsNum, addr, price });
        form.querySelector('.form-ok').style.display = 'block';
        form.querySelector('#ldBSend').style.display = 'none';
      };
      card.insertBefore(form, card.querySelector('.agent-row'));
    };

    heroGrid.appendChild(card);
    heroWrap.appendChild(heroGrid);
    heroSec.appendChild(heroWrap);
    root.appendChild(heroSec);

    /* --- body: main + sidebar --- */
    const bodySec = mk('section', 'section tight alt');
    bodySec.style.paddingTop = '2.4rem';
    const bodyWrap = mk('div', 'wrap');
    const bodyGrid = mk('div', 'ld-body');
    const main = mk('div', 'ld-main');

    /* description */
    if (d.description) {
      const s = mk('div', 'ld-section'); s.style.paddingTop = '0'; s.style.borderTop = 'none';
      s.innerHTML = `<h3>About this property</h3><p style="color:var(--muted);line-height:1.75;max-width:660px">${d.description}</p>`;
      main.appendChild(s);
    }

    /* key facts */
    if (d.keyFacts && d.keyFacts.length) {
      const s = mk('div', 'ld-section');
      s.innerHTML = '<h3>Property details</h3>';
      const dl = mk('dl', 'ld-facts');
      d.keyFacts.forEach(f => { dl.innerHTML += `<div class="fact"><dt>${f.label}</dt><dd>${f.value}</dd></div>`; });
      s.appendChild(dl); main.appendChild(s);
    }

    /* rooms */
    if (d.rooms && d.rooms.length) {
      const s = mk('div', 'ld-section');
      s.innerHTML = `<h3>Room sizes</h3>
        <table class="ld-rooms"><thead><tr><th>Room</th><th>Floor</th><th>Dimensions</th></tr></thead>
        <tbody>${d.rooms.map(r => `<tr><td>${r.name}</td><td>${r.floor}</td><td>${r.dims}</td></tr>`).join('')}</tbody></table>`;
      main.appendChild(s);
    }

    /* amenities */
    if (d.amenities && d.amenities.length) {
      const s = mk('div', 'ld-section');
      s.innerHTML = `<h3>Building amenities</h3><div class="ld-amenities">${d.amenities.map(a => `<span class="chip">${a}</span>`).join('')}</div>`;
      main.appendChild(s);
    }

    /* price history */
    if (d.priceHistory && d.priceHistory.length) {
      const s = mk('div', 'ld-section');
      s.innerHTML = `<h3>Price history</h3><div class="ld-timeline">${d.priceHistory.map(h => `
        <div class="ev"><div class="date">${h.date}</div><div class="ev-name">${h.event}</div><div class="ev-price">${h.price}</div></div>`).join('')}</div>`;
      main.appendChild(s);
    }

    /* psf trend chart */
    if (d.priceSqftHistory && d.priceSqftHistory.length >= 2) {
      const s = mk('div', 'ld-section');
      const lbl = status === 'lease' ? 'Rent / sqft trend — building' : 'Price / sqft trend — neighbourhood';
      s.innerHTML = `<h3>${lbl}</h3><canvas class="ld-chart-canvas" id="ldChart"></canvas>
        <div class="ld-chart-labels">${d.priceSqftHistory.map(p => `<span>${p.month}</span>`).join('')}</div>`;
      main.appendChild(s);
      requestAnimationFrame(() => {
        const c = document.getElementById('ldChart');
        if (c) drawSparkline(c, d.priceSqftHistory);
      });
    }

    /* neighbourhood map */
    if (d.lat && d.lng) {
      const s = mk('div', 'ld-section');
      s.innerHTML = `<h3>Neighbourhood map</h3><div id="ldMap"></div>`;
      main.appendChild(s);
      requestAnimationFrame(() => {
        if (!window.L) return;
        const map = L.map('ldMap', { scrollWheelZoom: false }).setView([d.lat, d.lng], 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19
        }).addTo(map);
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#a87f43;color:#fff;font-size:.68rem;font-family:Jost,sans-serif;padding:.28rem .6rem;border-radius:4px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.28)">${price}</div>`,
          iconAnchor: [36, 26]
        });
        L.marker([d.lat, d.lng], { icon }).addTo(map).bindPopup(`<b>${addr}</b><br>${area}`);
      });
    }

    /* schools */
    if (d.schools && d.schools.length) {
      const s = mk('div', 'ld-section');
      s.innerHTML = `<h3>Nearby schools</h3>
        <ul class="ld-schools">${d.schools.map(sc => `
          <li><div><div class="sname">${sc.name}</div><div class="stype">${sc.type}</div></div><div class="sdist">${sc.distance}</div></li>`).join('')}</ul>`;
      main.appendChild(s);
    }

    /* rent vs buy */
    const rvbSec = mk('div', 'ld-section');
    rvbSec.appendChild(buildRvB(priceRaw));
    main.appendChild(rvbSec);

    bodyGrid.appendChild(main);
    bodyGrid.appendChild(mk('div', 'ld-sidebar'));
    bodyWrap.appendChild(bodyGrid);
    bodySec.appendChild(bodyWrap);
    root.appendChild(bodySec);

    /* --- similar listings --- */
    const simSec = mk('section', 'section');
    const simWrap = mk('div', 'wrap');
    simWrap.innerHTML = `<div class="lhead"><div><div class="eyebrow">More listings</div><h2 style="font-size:clamp(1.8rem,3vw,2.6rem);font-weight:400;margin-top:.4rem">Similar properties</h2></div></div>`;
    const simGrid = mk('div', 'ld-similar');
    const all = (window.AH && window.AH.LISTINGS) || [];
    const candidates = all.filter(l => l.mls !== mlsNum);
    const sameStatus = candidates.filter(l => l.status === status);
    const similar = (sameStatus.length >= 3 ? sameStatus : [...sameStatus, ...candidates.filter(l => l.status !== status)]).slice(0, 3);
    const ST = { sale: { t: 'For Sale', c: '' }, lease: { t: 'For Lease', c: 'lease' }, sold: { t: 'Sold', c: 'sold' } };
    similar.forEach(l => {
      const s = ST[l.status] || ST.sale;
      const a = mk('a', 'card'); a.href = `listing.html?mls=${l.mls}`; a.style.display = 'block';
      a.innerHTML = `<div class="ph"><span class="badge ${s.c}">${s.t}</span><img src="${l.img}" loading="lazy" alt="${l.addr}"></div>
        <div class="body"><div class="price">${l.price}</div><div class="addr">${l.addr}</div><div class="area">${l.area}</div>
        <div class="specs"><span>${l.bd} bd</span><span>${l.ba} ba</span><span>${l.sqft} sqft</span></div></div>`;
      simGrid.appendChild(a);
    });
    simWrap.appendChild(simGrid);
    const ctaDiv = mk('div'); ctaDiv.style.cssText = 'text-align:center;margin-top:2rem';
    ctaDiv.innerHTML = `<a href="search.html" class="btn btn-ghost">View All Listings</a>`;
    simWrap.appendChild(ctaDiv);
    simSec.appendChild(simWrap);
    root.appendChild(simSec);

    if (window.AH) AH.track('listing_viewed', { mls: mlsNum, addr, price, status });
  }

  document.addEventListener('DOMContentLoaded', render);
})();
