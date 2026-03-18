import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';

let tables = [], relations = [], tableEls = {}, tableMap = {}, activeKey = null, isContactsHidden = false;
let tableGeom = {};
let getAuthenticatedConfig;

const scriptText = `/**
 * MC ERD Extractor
 * Ejecutar en la consola del navegador estando en Marketing Cloud.
 */
(async function mcErdExtractor() {
  const BASE = location.origin;
  const AG_URL = \`\${BASE}/contactsmeta/fuelapi/contacts-internal/v1/attributeGroups/views/defaultView?$page=1&$pageSize=2000\`;
  console.log('%c[ERD Extractor] Cargando grupos...', 'color:#69a3db;font-weight:bold');
  let agData;
  try {
    const res = await fetch(AG_URL, { credentials: 'include' });
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    agData = await res.json();
  } catch (e) { alert('Error: Asegúrate de estar en Marketing Cloud.'); return; }
  
  const groups = agData.data || []; const schemaID = agData.schemaID; const version = agData.version;
  if (!groups.length) return alert('No se encontraron grupos.');

  const listItems = groups.map((g, i) => \`<label style="display:block;margin:10px 0;cursor:pointer;font-family:Arial;font-size:13px;"><input type="radio" name="egroup" value="\${i}"> \${g.definitionName?.value || g.definitionKey}</label>\`).join('');
  
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:15%;left:50%;transform:translate(-50%,0);background:#fff;padding:25px;z-index:999999;box-shadow:0 0 30px rgba(0,0,0,0.5);max-height:70vh;overflow:auto;border-radius:10px;font-family:Arial;min-width:350px;border:1px solid #69a3db;';
  div.innerHTML = \`<h3 style="margin-top:0;color:#69a3db;font-size:16px;border-bottom:1px solid #eee;padding-bottom:10px;">Selecciona Grupo de Atributos</h3><div style="margin:15px 0;">\${listItems}</div><div style="text-align:right;margin-top:20px;"><button id="btnok" style="padding:8px 20px;background:#69a3db;color:#fff;border:none;cursor:pointer;border-radius:4px;font-weight:bold;">Obtener JSON</button><button id="btnc" style="padding:8px 20px;margin-left:10px;cursor:pointer;background:none;border:1px solid #ccc;border-radius:4px;">Cancelar</button></div>\`;
  document.body.appendChild(div);

  document.getElementById('btnc').onclick = () => div.remove();
  document.getElementById('btnok').onclick = async () => {
    const sel = div.querySelector('input:checked');
    if(!sel) return alert('Por favor, selecciona un grupo.');
    div.innerHTML = '<div style="text-align:center;padding:20px;">⏳ Generando definiciones...</div>';
    const g = groups[sel.value];
    const url = \`\${BASE}/contactsmeta/fuelapi/contacts-internal/v1/attributeGroups/\${g.definitionID}/setDefinitions/views/defaultView?nestedPageSize=1000&$pageSize=1000&$page=1&schemaVersionNumber=\${version}&schemaContextId=\${schemaID}&schemaType=Contacts\`;
    const res = await fetch(url, {credentials:'include'});
    const data = await res.json();
    div.innerHTML = \`<h3 style="color:#28a745;margin-top:0;">✅ ¡JSON Generado!</h3><p style="font-size:13px;">El contenido se ha copiado al portapapeles. Pégalo en el Generador ERD de la app.</p><button id="btnclose" style="width:100%;padding:10px;background:#69a3db;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Entendido</button>\`;
    document.getElementById('btnclose').onclick = () => div.remove();
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(()=>alert('No se pudo copiar automáticamente.'));
  };
})();`;

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.erdScriptToCopy.textContent = scriptText;

    elements.erdCopyScriptBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(scriptText);
        ui.showCustomAlert('Script copiado. Pégalo en la consola de Marketing Cloud.');
    });

    elements.erdGenerateBtn.addEventListener('click', generate);
    
    // Botón de Reset
    elements.erdResetBtn.addEventListener('click', () => {
        elements.erdJsonInput.value = '';
        elements.erdInputZone.classList.remove('hidden');
        elements.erdCanvasZone.classList.add('hidden');
        elements.erdResetBtn.classList.add('hidden');
        elements.erdDownloadCsvBtn.classList.add('hidden');
        elements.erdDownloadImgBtn.classList.add('hidden');
        elements.erdGenerateBtn.parentElement.classList.remove('hidden');
        elements.erdCanvas.querySelectorAll('.erd-tbl').forEach(el => el.remove());
        elements.erdSvgLines.innerHTML = '';
        clearActive();
    });

    elements.erdDownloadImgBtn.addEventListener('click', downloadImage);
    elements.erdDownloadCsvBtn.addEventListener('click', downloadCSV);

    document.addEventListener('keydown', e => { 
        if(e.key === 'Escape' && !elements.erdCanvasZone.classList.contains('hidden')) clearActive(); 
    });
}

export function view() {
    elements.erdSfmcLink.onclick = (e) => {
        e.preventDefault();
        const stack = elements.stackKeyInput?.value?.match(/s\d+/i)?.[0]?.toLowerCase() || 'sX';
        const url = `https://mc.${stack}.marketingcloudapps.com/contactsmeta/fuelapi/contacts-internal/v1/attributeGroups/`;
        window.electronAPI.openExternalLink(url); 
    };
}

function getClientName() {
    const name = document.getElementById('clientName')?.value || 'Client';
    return name.replace(/[^a-z0-9]/gi, '_');
}

// ═══════════════════════════════════════════════════════════
// LÓGICA MATEMÁTICA Y PARSEO
// ═══════════════════════════════════════════════════════════
function parseJSON(raw) {
  const j = JSON.parse(raw);
  const entities = Array.isArray(j) ? j : (j.data && Array.isArray(j.data) ? j.data : null);
  if (!entities) throw new Error('Formato no reconocido.');

  const hideContacts = elements.erdChkHideContacts.checked;
  const CONTACT_KEY_ATTR_ID = "d801c9a6-f02d-e711-80dc-1402ec819dd8";

  const byId = {}, fmap = {};
  for (const e of entities) {
    const id = e.definitionID;
    const nm = e.definitionName?.value || e.fullyQualifiedName || e.definitionKey || 'Unknown';
    const fields = (e.valueDefinitions || []).map(f => ({
      id: f.definitionID, key: f.definitionKey, dataType: f.dataType,
      isPK: !!f.isPrimaryKey, isFK: false, isRef: false, isContactLinked: false
    }));
    byId[id] = { id, name: nm, fields, rels: e.relationships || [] };
  }

  let hasContactsRel = false;
  for (const e of entities) {
    const t = byId[e.definitionID];
    if (!t || !e.relationships) continue;
    for (const r of e.relationships) {
      if (r.isGroupToSetRelationship && r.leftRelationshipReferenceType === "CustomerData") {
        hasContactsRel = true;
        if (r.relationshipAttributes) {
          for (const a of r.relationshipAttributes) {
            const f = t.fields.find(x => x.id === a.rightAttributeID);
            if (f) f.isContactLinked = true;
          }
        }
      }
    }
  }

  if (!hideContacts && hasContactsRel) {
    byId["root_contacts_sfmc"] = {
      id: "root_contacts_sfmc", name: "Contacts",
      fields: [{ id: CONTACT_KEY_ATTR_ID, key: "Contact Key", dataType: "System", isPK: true, isFK: false, isRef: false, isContactLinked: false }],
      rels: []
    };
  }

  for (const t of Object.values(byId)) for (const f of t.fields) fmap[f.id] = { t, f };

  const relationsArr = [], seen = new Set();
  for (const t of Object.values(byId)) {
    for (const rel of t.rels) {
      if (!rel.relationshipAttributes) continue;
      const lc = rel.leftItem?.cardinality  || 'One';
      const rc = rel.rightItem?.cardinality || 'One';
      for (const a of rel.relationshipAttributes) {
        const L = fmap[a.leftAttributeID], R = fmap[a.rightAttributeID];
        if (!L || !R || L.t.id === R.t.id) continue;
        L.f.isFK = true; R.f.isRef = true;
        const k = [L.t.id, L.f.id, R.t.id, R.f.id].join('|');
        if (seen.has(k)) continue; seen.add(k);
        const [fTbl, fFld, fCard, tTbl, tFld, tCard] =
          (rc === 'One' || lc === 'Many')
            ? [L.t.id, L.f.id, lc, R.t.id, R.f.id, rc]
            : [R.t.id, R.f.id, rc, L.t.id, L.f.id, lc];
        relationsArr.push({ fTbl, fFld, fCard, tTbl, tFld, tCard });
      }
    }
  }

  const inv = new Set([...relationsArr.map(r => r.fTbl), ...relationsArr.map(r => r.tTbl)]);
  const tablesArr = Object.values(byId).filter(t => inv.has(t.id) || t.fields.some(f => f.isPK || f.isFK || f.isRef || f.isContactLinked));
  
  for (const t of tablesArr) {
    t.fields = t.fields.filter(f => f.isPK || f.isFK || f.isRef || f.isContactLinked);
  }
  return { tablesArr, relationsArr, hideContacts };
}

function layout(tabs, rels) {
  const N = tabs.length; if (!N) return;
  const idx = {}; tabs.forEach((t, i) => idx[t.id] = i);
  const estH = (t) => 35 + t.fields.length * 20; 
  const CW = 220, GX = 90, GY = 35; 

  const ch = Array.from({length:N}, ()=>[]); 
  const pa = Array.from({length:N}, ()=>[]);
  const deg = new Array(N).fill(0);

  for (const r of rels) {
    const f = idx[r.fTbl], t = idx[r.tTbl];
    if (f===undefined||t===undefined) continue;
    if (!ch[t].includes(f)) ch[t].push(f); 
    if (!pa[f].includes(t)) pa[f].push(t); 
    deg[f]++; deg[t]++;
  }

  const isolated = [], connected = [];
  for(let i=0; i<N; i++) { if(deg[i]===0) isolated.push(i); else connected.push(i); }

  let maxL = -1;
  const lnodes = [];
  
  if (connected.length > 0) {
    const layer = new Array(N).fill(0);
    const q = connected.filter(i => pa[i].length === 0);
    if (q.length === 0) q.push(connected[0]); 
    let head = 0, loopGuard = 0;
    while(head < q.length && loopGuard < N * N) {
      loopGuard++;
      const u = q[head++];
      for (const v of ch[u]) {
        if (layer[v] < layer[u] + 1) {
          layer[v] = layer[u] + 1;
          if (!q.includes(v)) q.push(v);
        }
      }
    }
    maxL = Math.max(...connected.map(i => layer[i]));
    for(let i=0; i<=maxL; i++) lnodes.push([]);
    for (const i of connected) lnodes[layer[i]].push(i);
    const pos = new Array(N).fill(0);
    for (let l=0; l<=maxL; l++) lnodes[l].forEach((n,i)=>pos[n]=i);
    function bary(nl, nbFn) {
      if(nl.length <= 1) return;
      const sc = nl.map(n=>{
        const nb = nbFn(n);
        return { n, s: nb.length ? nb.reduce((a,x)=>a+pos[x],0)/nb.length : pos[n] };
      });
      sc.sort((a,b)=>a.s - b.s);
      sc.forEach(({n},i)=>pos[n]=i);
      nl.splice(0, nl.length, ...sc.map(x=>x.n));
    }
    for (let p=0; p<6; p++){
      for (let l=1; l<=maxL; l++) bary(lnodes[l], n=>pa[n]);
      for (let l=maxL-1; l>=0; l--) bary(lnodes[l], n=>ch[n]);
    }
  }

  let maxY = 40;
  if (connected.length > 0) {
    const colHeights = lnodes.map(nodes => nodes.reduce((sum, n) => sum + estH(tabs[n]), 0) + Math.max(0, nodes.length - 1) * GY);
    const maxColH = Math.max(...colHeights);
    for (let l=0; l<=maxL; l++) {
      const nodes = lnodes[l];
      let currentY = 40 + (maxColH - colHeights[l]) / 2;
      nodes.forEach(n => {
        tabs[n].x = 40 + l * (CW + GX);
        tabs[n].y = currentY;
        currentY += estH(tabs[n]) + GY;
      });
    }
    maxY = maxColH + 80; 
  }
  if (isolated.length > 0) {
    const isoStartY = maxY;
    const cols = Math.max(1, Math.floor(1000 / (CW + GX)) || 3);
    let curR = 0, curC = 0, rowMaxH = 0;
    isolated.forEach(n => {
      tabs[n].x = 40 + curC * (CW + GX);
      tabs[n].y = isoStartY + curR;
      const h = estH(tabs[n]);
      rowMaxH = Math.max(rowMaxH, h);
      curC++;
      if (curC >= cols) { curC = 0; curR += rowMaxH + GY; rowMaxH = 0; }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// GEOMETRÍA Y DIBUJO
// ═══════════════════════════════════════════════════════════
function buildGeom() {
  for (const t of tables) {
    const el = tableEls[t.id]; if (!el) continue;
    const fieldRelY = {};
    el.querySelectorAll('.frow').forEach(row => {
      fieldRelY[row.dataset.fid] = row.offsetTop + row.offsetHeight / 2;
    });
    tableGeom[t.id] = { w: el.offsetWidth, h: el.offsetHeight, fieldRelY };
  }
}

function fieldAbsY(tid, fid) {
  const t = tableMap[tid]; const g = tableGeom[tid];
  if (!t || !g) return 0;
  return t.y + (g.fieldRelY[fid] ?? g.h / 2);
}

function exitPt(tid, fid, tcx, tcy) {
  const t = tableMap[tid]; const g = tableGeom[tid];
  if (!t || !g) return {x:0,y:0};
  const bx = { l:t.x, r:t.x+g.w, top:t.y, bot:t.y+g.h, cx:t.x+g.w/2 };
  const fy = Math.max(bx.top+6, Math.min(bx.bot-6, fieldAbsY(tid,fid)));
  const dx = tcx - bx.cx, dy = tcy - (t.y+g.h/2);
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx>0 ? bx.r : bx.l, y: fy };
  else return { x: bx.cx, y: dy>0 ? bx.bot : bx.top };
}

function tCenter(tid) {
  const t = tableMap[tid]; const g = tableGeom[tid];
  if (!t||!g) return {cx:0,cy:0};
  return { cx: t.x+g.w/2, cy: t.y+g.h/2 };
}

// ═══════════════════════════════════════════════════════════
// INTERFAZ Y RENDER
// ═══════════════════════════════════════════════════════════
function generate() {
  const raw = elements.erdJsonInput.value.trim();
  if (!raw) return ui.showCustomAlert('Pega el JSON extraído primero.');
  try {
    const p = parseJSON(raw); 
    tables = p.tablesArr; relations = p.relationsArr; isContactsHidden = p.hideContacts;
    if (!tables.length) return ui.showCustomAlert('No se encontraron entidades.');
    
    elements.erdInputZone.classList.add('hidden');
    elements.erdGenerateBtn.parentElement.classList.add('hidden');
    elements.erdCanvasZone.classList.remove('hidden');
    elements.erdResetBtn.classList.remove('hidden');
    elements.erdDownloadCsvBtn.classList.remove('hidden');
    elements.erdDownloadImgBtn.classList.remove('hidden');
    
    renderERD();
  } catch(e) { ui.showCustomAlert(e.message); }
}

function renderERD() {
  elements.erdCanvas.querySelectorAll('.erd-tbl').forEach(el => el.remove());
  tableEls = {}; tableMap = {};
  for (const t of tables) {
    tableMap[t.id] = t;
    const el = document.createElement('div');
    el.className = 'erd-tbl'; el.dataset.tableId = t.id;
    el.style.cssText = 'left:0;top:0;visibility:hidden;';
    const pk = t.fields.filter(f => f.isPK);
    const fk = t.fields.filter(f => f.isFK && !f.isPK && !f.isRef);
    const rf = t.fields.filter(f => f.isRef && !f.isPK && !f.isFK);
    const ckOnly = t.fields.filter(f => f.isContactLinked && !f.isPK && !f.isFK && !f.isRef);
    el.innerHTML = `
      <div class="tbl-hdr"><span class="tbl-name" title="${t.name}">${t.name}</span><span class="tbl-badge">${t.fields.length} col</span></div>
      <div class="tbl-fields">
        ${[...pk.map(f=>frow(t,f,'pk')), ...fk.map(f=>frow(t,f,'fk')), ...rf.map(f=>frow(t,f,'ref')), ...ckOnly.map(f=>frow(t,f,'ck-only'))].join('')}
      </div>`;
    makeDraggable(el, t);
    elements.erdCanvas.appendChild(el);
    tableEls[t.id] = el;
    el.querySelectorAll('.frow').forEach(row => row.addEventListener('click', e => { e.stopPropagation(); onFClick(row); }));
  }
  elements.erdCanvas.onclick = clearActive;
  requestAnimationFrame(() => {
    layout(tables, relations);
    for (const t of tables) {
      const el = tableEls[t.id];
      el.style.left = t.x + 'px'; el.style.top = t.y + 'px'; el.style.visibility = 'visible';
    }
    requestAnimationFrame(() => { buildGeom(); resizeSVG(); draw(); });
  });
}

function frow(t, f, type) {
  const ckTag = f.isContactLinked ? `<span class="ftag ck" title="Vinculado a Contacts">🔑 CK</span>` : '';
  let mainTag = '';
  if (type === 'pk') mainTag = '<span class="ftag pk">PK</span>';
  else if (type === 'fk') mainTag = '<span class="ftag fk">FK</span>';
  else if (type === 'ref') mainTag = '<span class="ftag ref">REF</span>';
  return `<div class="frow ${type}" data-table-id="${t.id}" data-fid="${f.id}">
            ${ckTag}${mainTag}<span class="fname" title="${f.key}">${f.key}</span><span class="ftype">${f.dataType}</span>
          </div>`;
}

function resizeSVG() {
  let W = elements.erdWrap.clientWidth || 800, H = elements.erdWrap.clientHeight || 600;
  for (const t of tables) {
    const g = tableGeom[t.id]; if(!g) continue;
    W = Math.max(W, t.x + g.w + 100); H = Math.max(H, t.y + g.h + 100);
  }
  elements.erdCanvas.style.width = W + 'px'; elements.erdCanvas.style.height = H + 'px';
  elements.erdSvgLines.style.width = W + 'px'; elements.erdSvgLines.style.height = H + 'px';
  elements.erdSvgLines.setAttribute('width', W); elements.erdSvgLines.setAttribute('height', H);
  elements.erdSvgLines.setAttribute('viewBox', `0 0 ${W} ${H}`);
}

function mkMarkers(svg) {
  if (svg.querySelector('defs')) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  [['m-idle','#558ac7'],['m-act','#e67e22'],['m-dim','#c8d8ea']].forEach(([id,c])=>{
    const m = document.createElementNS('http://www.w3.org/2000/svg','marker');
    m.setAttribute('id',id); m.setAttribute('viewBox','0 0 10 10');
    m.setAttribute('refX','9'); m.setAttribute('refY','5');
    m.setAttribute('markerWidth','7'); m.setAttribute('markerHeight','7'); m.setAttribute('orient','auto');
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d','M1 1 L9 5 L1 9'); p.setAttribute('fill','none'); p.setAttribute('stroke',c); p.setAttribute('stroke-width','1.5');
    m.appendChild(p); defs.appendChild(m);
  });
  svg.appendChild(defs);
}

function draw(ak) {
  const svg = elements.erdSvgLines;
  svg.innerHTML = ''; mkMarkers(svg);
  for (const r of relations) {
    const cF = tCenter(r.fTbl), cT = tCenter(r.tTbl);
    const pA = exitPt(r.fTbl,r.fFld,cT.cx,cT.cy), pB = exitPt(r.tTbl,r.tFld,cF.cx,cF.cy);
    const isAct = ak && (ak === `${r.fTbl}|${r.fFld}` || ak === `${r.tTbl}|${r.tFld}`);
    const isDim = !!ak && !isAct;
    const stroke = isAct?'#e67e22':isDim?'#c8d8ea':'#558ac7', sw = isAct?2.5:1.4, op = isDim?0.15:0.85;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    const mx = (pA.x+pB.x)/2;
    path.setAttribute('d',`M${pA.x},${pA.y} C${mx},${pA.y} ${mx},${pB.y} ${pB.x},${pB.y}`);
    path.setAttribute('stroke',stroke); path.setAttribute('stroke-width',sw);
    path.setAttribute('fill','none'); path.setAttribute('opacity',op);
    if (!isAct) path.setAttribute('stroke-dasharray','5 3');
    path.setAttribute('marker-end', `url(#${isAct?'m-act':isDim?'m-dim':'m-idle'})`);
    svg.appendChild(path);
  }
}

function onFClick(row) {
  const tid = row.dataset.tableId, fid = row.dataset.fid, k = `${tid}|${fid}`;
  if (activeKey === k) { clearActive(); return; }
  clearActive(); activeKey = k;
  row.classList.add('act');
  const rels = relations.filter(r => (r.fTbl === tid && r.fFld === fid) || (r.tTbl === tid && r.tFld === fid));
  for (const r of rels) {
    const oT = r.fTbl === tid ? r.tTbl : r.fTbl, oF = r.fTbl === tid ? r.tFld : r.fFld;
    tableEls[oT]?.classList.add('hl');
    tableEls[oT]?.querySelector(`[data-fid="${oF}"]`)?.classList.add('tgt');
  }
  draw(k); showTT(tid, fid, rels);
}

function clearActive() {
  activeKey = null; elements.erdTooltip.classList.add('hidden');
  document.querySelectorAll('.frow.act, .frow.tgt').forEach(r => r.classList.remove('act','tgt'));
  document.querySelectorAll('.erd-tbl.hl').forEach(e => e.classList.remove('hl'));
  draw();
}

function showTT(tid, fid, rels) {
  const t = tables.find(x => x.id === tid), f = t?.fields.find(x => x.id === fid); if(!f) return;
  const tt = elements.erdTooltip;
  elements.erdTtTtl.textContent = `${t.name}.${f.key}`;
  const tags = [];
  if (f.isContactLinked) tags.push('<strong style="color:#f39c12">🔑 CK</strong>');
  if (f.isPK) tags.push('<strong style="color:#e67e22">PK</strong>');
  if (f.isFK) tags.push('<strong style="color:#28a745">FK</strong>');
  if (f.isRef) tags.push('<strong style="color:#9b59b6">REF</strong>');
  elements.erdTtTyp.innerHTML = `<strong>Tipo:</strong> ${f.dataType}${tags.length ? ' · ' + tags.join(' · ') : ''}`;
  
  if (rels.length || (f.isContactLinked && isContactsHidden)) {
    let html = rels.map(r => {
      const isF = r.fTbl === tid;
      const oT = tables.find(x => x.id === (isF ? r.tTbl : r.fTbl));
      const oF = oT?.fields.find(x => x.id === (isF ? r.tFld : r.fFld));
      return `<span style="color:${isF ? '#28a745' : '#9b59b6'}">${isF ? '→' : '←'}</span> <strong>${oT?.name ?? '?'}</strong>.<em>${oF?.key ?? '?'}</em>`;
    }).join('<br>');
    if (f.isContactLinked && isContactsHidden && !rels.some(r => r.tTbl === 'root_contacts_sfmc' || r.fTbl === 'root_contacts_sfmc')) {
        html += `<br><span style="color:#f39c12">→</span> <strong>Contacts</strong>.<em>Contact Key</em>`;
    }
    elements.erdTtRel.innerHTML = html;
  } else {
    elements.erdTtRel.innerHTML = '<em style="color:#6c757d">Sin relaciones directas</em>';
  }
  tt.classList.remove('hidden');
  const tableRect = tableEls[tid].getBoundingClientRect();
  tt.style.left = `${tableRect.left + (tableRect.width / 2) - (tt.offsetWidth / 2)}px`;
  tt.style.top = `${tableRect.top - tt.offsetHeight - 10}px`;
}

function makeDraggable(el, t) {
  let sX,sY,sL,sT,on=false;
  el.onmousedown = e => {
    if (e.target.closest('.frow') || e.button !== 0) return;
    on = true; sX = e.clientX; sY = e.clientY; sL = t.x; sT = t.y;
    el.classList.add('dragging'); e.preventDefault();
  };
  window.onmousemove = e => {
    if (!on) return;
    t.x = Math.max(0, sL + (e.clientX - sX)); t.y = Math.max(0, sT + (e.clientY - sY));
    el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
    draw(activeKey); elements.erdTooltip.classList.add('hidden');
  };
  window.onmouseup = () => { if (!on) return; on = false; el.classList.remove('dragging'); resizeSVG(); draw(activeKey); };
}

// ═══════════════════════════════════════════════════════════
// EXPORTACIÓN
// ═══════════════════════════════════════════════════════════
async function downloadImage() {
  ui.blockUI('Generando imagen...');
  setTimeout(async () => {
    try {
      const canvas = elements.erdCanvas;
      const wrap = elements.erdWrap;
      const ov = wrap.style.overflow; wrap.style.overflow = 'visible';
      
      const shot = await html2canvas(canvas, {
        backgroundColor: '#f0f6fc', scale: 2, useCORS: true,
        scrollX: -window.scrollX, scrollY: -window.scrollY,
        width: canvas.scrollWidth, height: canvas.scrollHeight
      });
      
      wrap.style.overflow = ov;
      const a = document.createElement('a'); 
      a.download = `ERD_${getClientName()}.png`; a.href = shot.toDataURL('image/png'); a.click();
    } catch(e) { ui.showCustomAlert('Error: ' + e.message); } finally { ui.unblockUI(); }
  }, 100);
}

async function downloadCSV() {
  try {
    let csv = 'Tabla_Origen,Campo_Origen,Cardinalidad_Origen,Tabla_Destino,Campo_Destino,Cardinalidad_Destino\n';
    for (const r of relations) {
      const fT = tableMap[r.fTbl]?.name || r.fTbl;
      const fF = tableMap[r.fTbl]?.fields.find(x => x.id === r.fFld)?.key || r.fFld;
      const tT = tableMap[r.tTbl]?.name || r.tTbl;
      const tF = tableMap[r.tTbl]?.fields.find(x => x.id === r.tFld)?.key || r.tFld;
      csv += `"${fT}","${fF}","${r.fCard}","${tT}","${tF}","${r.tCard}"\n`;
    }
    window.electronAPI.saveCsvFile({ content: "\uFEFF" + csv, defaultName: `ERD_${getClientName()}.csv` });
  } catch(e) { ui.showCustomAlert(e.message); }
}