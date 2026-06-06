/* ============================================================
   Search page renderer — filterable grid/list/map search
   ============================================================ */
(function () {
  let currentView = 'grid';
  let drawMode = false;
  let drawnPolygon = null;
  let drawnPoints = [];
  let spMap = null;
  let mapMarkers = [];

  const state = { status: 'all', beds: '', baths: '', priceMin: '', priceMax: '', exposure: '', sort: 'default', q: '' };

  function listings() { return (window.AH && window.AH.LISTINGS) || []; }
  function detail(mls) { return (window.AH_DETAILS || {})[mls] || {}; }
  function parsePrice(s) { const n = parseInt((s || '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; }

  function inPolygon(lat, lng) {
    if (!drawnPoints.length) return true;
    let inside = false;
    for (let i = 0, j = drawnPoints.length - 1; i < drawnPoints.length; j = i++) {
      const [xi, yi] = [drawnPoints[i].lat, drawnPoints[i].lng];
      const [xj, yj] = [drawnPoints[j].lat, drawnPoints[j].lng];
      if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function applyFilters() {
    return listings().filter(l => {
      if (state.status !== 'all' && l.status !== state.status) return false;
      if (state.beds) {
        const bd = parseInt(l.bd, 10);
        const min = state.beds === '3+' ? 3 : parseInt(state.beds, 10);
        if (bd < min) return false;
      }
      if (state.baths && parseInt(l.ba, 10) < parseInt(state.baths, 10)) return false;
      const raw = parsePrice(l.price);
      if (state.priceMin && raw && raw < parseInt(state.priceMin, 10)) return false;
      if (state.priceMax && raw && raw > parseInt(state.priceMax, 10)) return false;
      if (state.exposure) {
        const d = detail(l.mls);
        const expFact = (d.keyFacts || []).find(f => f.label === 'Exposure');
        if (expFact && !expFact.value.toUpperCase().includes(state.exposure.toUpperCase())) return false;
      }
      if (state.q && !(l.addr + l.area + l.mls).toLowerCase().includes(state.q)) return false;
      if (drawnPoints.length) {
        const d = detail(l.mls);
        if (d.lat && d.lng && !inPolygon(d.lat, d.lng)) return false;
      }
      return true;
    });
  }

  function sortedListings(list) {
    const c = [...list];
    if (state.sort === 'price_asc') return c.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    if (state.sort === 'price_desc') return c.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    if (state.sort === 'sqft_desc') return c.sort((a, b) => parseInt((b.sqft||'0').replace(/,/g,''),10) - parseInt((a.sqft||'0').replace(/,/g,''),10));
    if (state.sort === 'sqft_asc') return c.sort((a, b) => parseInt((a.sqft||'0').replace(/,/g,''),10) - parseInt((b.sqft||'0').replace(/,/g,''),10));
    return c;
  }

  function buildCard(l) {
    const ST = { sale: { t: 'For Sale', c: '' }, lease: { t: 'For Lease', c: 'lease' }, sold: { t: 'Sold', c: 'sold' } };
    const s = ST[l.status] || ST.sale;
    const saved = window.AH && AH.isSaved ? AH.isSaved(l.mls) : false;
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `listing.html?mls=${l.mls}`;
    card.style.display = 'block';
    card.innerHTML = `
      <div class="ph">
        <span class="badge ${s.c}">${s.t}</span>
        <button class="heart ${saved ? 'on' : ''}" data-mls="${l.mls}" aria-label="Save listing">
          <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
        </button>
        <img src="${l.img}" loading="lazy" alt="${l.addr}">
      </div>
      <div class="body">
        <div class="price">${l.price}</div>
        <div class="addr">${l.addr}</div>
        <div class="area">${l.area}</div>
        <div class="specs"><span>${l.bd} bd</span><span>${l.ba} ba</span><span>${l.pk} pk</span><span>${l.sqft} sqft</span></div>
      </div>`;
    card.querySelector('.heart').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (window.AH) AH.toggleSave(l.mls, e.currentTarget);
    });
    return card;
  }

  function renderGrid(list) {
    const g = document.getElementById('spGrid'); if (!g) return;
    g.innerHTML = '';
    if (!list.length) {
      g.innerHTML = '<div class="sp-empty">No listings match your filters. <a href="contact.html" style="color:var(--gold)">Contact Ash for off-market options.</a></div>';
      return;
    }
    list.forEach(l => g.appendChild(buildCard(l)));
  }

  function renderMapMarkers(list) {
    if (!spMap || !window.L) return;
    mapMarkers.forEach(m => spMap.removeLayer(m));
    mapMarkers = [];
    const mapList = document.getElementById('spMapList');
    if (mapList) mapList.innerHTML = '';
    const bounds = [];
    list.forEach(l => {
      const d = detail(l.mls);
      if (!d.lat || !d.lng) return;
      bounds.push([d.lat, d.lng]);
      const bg = l.status === 'sold' ? '#a87f43' : l.status === 'lease' ? '#3a655b' : '#14322c';
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${bg};color:#fff;font-size:.66rem;font-family:Jost,sans-serif;padding:.25rem .55rem;border-radius:4px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer">${l.price}</div>`,
        iconAnchor: [30, 22]
      });
      const marker = L.marker([d.lat, d.lng], { icon }).addTo(spMap);
      marker.bindPopup(`<div class="lf-popup"><div class="popup-price">${l.price}</div><div class="popup-addr">${l.addr}</div><div class="popup-specs">${l.bd} bd · ${l.ba} ba · ${l.sqft} sqft</div><a href="listing.html?mls=${l.mls}">View details &rarr;</a></div>`);
      mapMarkers.push(marker);
      if (mapList) {
        const mc = document.createElement('a');
        mc.className = 'sp-map-card';
        mc.href = `listing.html?mls=${l.mls}`;
        mc.innerHTML = `<img src="${l.img}" alt="${l.addr}"><div class="mc-body"><div class="mc-price">${l.price}</div><div class="mc-addr">${l.addr}</div><div class="mc-specs">${l.bd} bd · ${l.ba} ba · ${l.sqft} sqft</div></div>`;
        mapList.appendChild(mc);
      }
    });
    if (bounds.length > 1) spMap.fitBounds(bounds, { padding: [40, 40] });
    else if (bounds.length === 1) spMap.setView(bounds[0], 14);
  }

  function refresh() {
    const filtered = applyFilters();
    const sorted = sortedListings(filtered);
    const count = document.getElementById('spCount');
    if (count) count.textContent = `${sorted.length} listing${sorted.length !== 1 ? 's' : ''} found`;
    renderGrid(sorted);
    if (currentView === 'map') renderMapMarkers(sorted);
    setTimeout(() => {
      document.querySelectorAll('.heart[data-mls]').forEach(h => {
        if (window.AH && AH.isSaved) h.classList.toggle('on', AH.isSaved(h.dataset.mls));
      });
    }, 50);
  }

  function initMap() {
    if (!window.L || spMap) return;
    spMap = L.map('spMap', { scrollWheelZoom: false }).setView([43.7181, -79.3817], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19
    }).addTo(spMap);

    spMap.on('click', e => {
      if (!drawMode) return;
      drawnPoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });
      if (drawnPolygon) spMap.removeLayer(drawnPolygon);
      if (drawnPoints.length >= 2) {
        drawnPolygon = L.polygon(drawnPoints.map(p => [p.lat, p.lng]), {
          color: '#a87f43', fillColor: '#a87f43', fillOpacity: 0.1, weight: 2, dashArray: '6,4'
        }).addTo(spMap);
      }
    });

    spMap.on('dblclick', e => {
      if (drawMode) { e.originalEvent.preventDefault(); finalizeDraw(); }
    });

    renderMapMarkers(sortedListings(applyFilters()));
  }

  function finalizeDraw() {
    drawMode = false;
    const drawBtn = document.getElementById('spDrawBtn');
    const clearBtn = document.getElementById('spClearBtn');
    if (drawBtn) { drawBtn.textContent = 'Draw Area'; drawBtn.classList.remove('drawing'); }
    if (drawnPoints.length >= 3 && spMap && window.L) {
      if (drawnPolygon) spMap.removeLayer(drawnPolygon);
      drawnPolygon = L.polygon(drawnPoints.map(p => [p.lat, p.lng]), {
        color: '#a87f43', fillColor: '#a87f43', fillOpacity: 0.12, weight: 2
      }).addTo(spMap);
      if (clearBtn) clearBtn.style.display = 'inline-block';
      refresh();
    } else {
      drawnPoints = [];
    }
  }

  function setView(view) {
    currentView = view;
    const grid = document.getElementById('spGrid');
    const mapView = document.getElementById('spMapView');
    document.querySelectorAll('#spViewBtns button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'map') {
      if (grid) grid.style.display = 'none';
      if (mapView) mapView.classList.add('active');
      initMap();
      renderMapMarkers(sortedListings(applyFilters()));
    } else {
      if (grid) { grid.style.display = ''; grid.className = `sp-layout ${view}-view`; }
      if (mapView) mapView.classList.remove('active');
    }
  }

  function buildFilters() {
    const row = document.getElementById('spFilterRow');
    if (!row) return;

    function sel(options) {
      const s = document.createElement('select');
      s.style.cssText = 'border:1px solid var(--line);background:var(--cream);padding:.48rem .8rem;font-family:Jost,sans-serif;font-size:.78rem;color:var(--text);border-radius:4px;appearance:none;cursor:pointer;';
      options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); });
      return s;
    }

    /* text search */
    const qi = document.createElement('input'); qi.type = 'text'; qi.placeholder = 'Search address or area…';
    qi.style.cssText = 'border:1px solid var(--line);background:var(--cream);padding:.48rem .8rem;font-family:Jost,sans-serif;font-size:.78rem;color:var(--text);border-radius:4px;width:180px;';
    qi.addEventListener('input', e => { state.q = e.target.value.toLowerCase(); refresh(); });
    row.appendChild(qi);

    /* status */
    const ss = sel([['all','All types'],['sale','For Sale'],['lease','For Lease'],['sold','Sold']]);
    ss.addEventListener('change', e => { state.status = e.target.value; refresh(); });
    row.appendChild(ss);

    /* beds */
    const bs = sel([['','Beds: Any'],['1','1+'],['2','2+'],['3+','3+'],['4','4+']]);
    bs.addEventListener('change', e => { state.beds = e.target.value; refresh(); });
    row.appendChild(bs);

    /* baths */
    const bths = sel([['','Baths: Any'],['1','1+'],['2','2+'],['3','3+']]);
    bths.addEventListener('change', e => { state.baths = e.target.value; refresh(); });
    row.appendChild(bths);

    /* price range */
    const pw = document.createElement('div'); pw.className = 'sp-price-range';
    const minI = document.createElement('input'); minI.type = 'number'; minI.placeholder = 'Min $'; minI.step = '50000';
    minI.style.cssText = 'border:1px solid var(--line);background:var(--cream);padding:.48rem .6rem;font-family:Jost,sans-serif;font-size:.78rem;color:var(--text);border-radius:4px;width:88px;';
    const maxI = document.createElement('input'); maxI.type = 'number'; maxI.placeholder = 'Max $'; maxI.step = '50000'; maxI.style.cssText = minI.style.cssText;
    const sep = document.createElement('span'); sep.textContent = '–';
    minI.addEventListener('input', e => { state.priceMin = e.target.value; refresh(); });
    maxI.addEventListener('input', e => { state.priceMax = e.target.value; refresh(); });
    pw.appendChild(minI); pw.appendChild(sep); pw.appendChild(maxI);
    row.appendChild(pw);

    /* exposure */
    const ex = sel([['','Exposure: Any'],['N','North'],['S','South'],['E','East'],['W','West'],['SW','SW'],['SE','SE'],['NW','NW'],['NE','NE']]);
    ex.addEventListener('change', e => { state.exposure = e.target.value; refresh(); });
    row.appendChild(ex);

    /* draw area */
    const drawBtn = document.createElement('button'); drawBtn.className = 'sp-draw-btn'; drawBtn.id = 'spDrawBtn'; drawBtn.textContent = 'Draw Area';
    drawBtn.onclick = () => {
      drawMode = !drawMode;
      if (drawMode) {
        drawBtn.textContent = 'Click map to draw…'; drawBtn.classList.add('drawing');
        drawnPoints = [];
        if (drawnPolygon && spMap) { spMap.removeLayer(drawnPolygon); drawnPolygon = null; }
        setView('map');
      } else {
        finalizeDraw();
      }
    };
    row.appendChild(drawBtn);

    /* clear draw */
    const clearBtn = document.createElement('button'); clearBtn.className = 'sp-draw-btn'; clearBtn.id = 'spClearBtn'; clearBtn.textContent = 'Clear Area'; clearBtn.style.display = 'none';
    clearBtn.onclick = () => {
      drawnPoints = [];
      if (drawnPolygon && spMap) { spMap.removeLayer(drawnPolygon); drawnPolygon = null; }
      clearBtn.style.display = 'none';
      drawBtn.textContent = 'Draw Area'; drawBtn.classList.remove('drawing');
      drawMode = false;
      refresh();
    };
    row.appendChild(clearBtn);
  }

  function boot() {
    /* parse URL params for initial state */
    const params = new URLSearchParams(location.search);
    if (params.get('status')) state.status = params.get('status');
    if (params.get('beds')) state.beds = params.get('beds');
    if (params.get('q')) state.q = params.get('q').toLowerCase();

    buildFilters();

    const sortEl = document.getElementById('spSort');
    if (sortEl) sortEl.addEventListener('change', e => { state.sort = e.target.value; refresh(); });

    document.querySelectorAll('#spViewBtns button').forEach(btn => {
      btn.onclick = () => setView(btn.dataset.view);
    });

    refresh();
    if (window.AH) AH.track('search_page_viewed', { status: state.status });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
