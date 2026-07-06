import elements from '../ui/dom-elements.js';
import * as ui from '../ui/ui-helpers.js';
import * as mcApiService from '../api/mc-api-service.js';
import * as logger from '../ui/logger.js';
import { escapeHtml } from '../ui/format-utils.js';

let tables = [], relations = [], tableEls = {}, tableMap = {}, activeKey = null, isContactsHidden = false;
let tableGeom = {};
let getAuthenticatedConfig;

// Datos del modelo de atributos cargados por API
let setsById = {};        // setId -> setItem (de attributeSetDefinitions)
let groupsById = {};      // groupId -> { id, name, setIds: [setId] }
let sortedGroups = [];    // grupos ordenados por nombre, para el listado
let selectedGroupId = null;
let loadedClient = null;  // cliente cuyos datos están cargados (para evitar recargas)

export function init(dependencies) {
    getAuthenticatedConfig = dependencies.getAuthenticatedConfig;

    elements.erdGenerateBtn.addEventListener('click', generate);

    elements.erdRefreshGroupsBtn.addEventListener('click', () => loadModel(true));

    elements.erdGroupSearch.addEventListener('input', () => renderGroupList());

    if (elements.erdHideSystem) elements.erdHideSystem.addEventListener('change', () => renderGroupList());

    // Botón de Reset → vuelve a la selección de grupo
    elements.erdResetBtn.addEventListener('click', () => {
        elements.erdSelectionZone.classList.remove('hidden');
        elements.erdCanvasZone.classList.add('hidden');
        elements.erdResetBtn.classList.add('hidden');
        elements.erdDownloadCsvBtn.classList.add('hidden');
        elements.erdDownloadImgBtn.classList.add('hidden');
        elements.erdGenerateBtn.classList.remove('hidden');
        elements.erdRefreshGroupsBtn.classList.remove('hidden');
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

export async function view() {
    // Reset visual a la pantalla de selección
    elements.erdSelectionZone.classList.remove('hidden');
    elements.erdCanvasZone.classList.add('hidden');
    elements.erdResetBtn.classList.add('hidden');
    elements.erdDownloadCsvBtn.classList.add('hidden');
    elements.erdDownloadImgBtn.classList.add('hidden');
    elements.erdGenerateBtn.classList.remove('hidden');
    elements.erdRefreshGroupsBtn.classList.remove('hidden');

    const clientName = document.getElementById('clientName')?.value || '';
    // Recargar solo si cambió de cliente o no hay datos
    if (loadedClient !== clientName || sortedGroups.length === 0) {
        await loadModel(false);
    } else {
        renderGroupList();
    }
}

// ═══════════════════════════════════════════════════════════
// CARGA DEL MODELO POR API
// Flujo: schema (id) → grupos del schema (nombres) → attribute sets (tablas).
// La pertenencia set→grupo sale de relationships[].leftItem (AttributeGroup).
// ═══════════════════════════════════════════════════════════
async function loadModel(force) {
    const clientName = document.getElementById('clientName')?.value || '';
    if (!clientName) {
        ui.showCustomAlert('Selecciona un cliente primero.');
        return;
    }
    if (!force && loadedClient === clientName && sortedGroups.length > 0) {
        renderGroupList();
        return;
    }

    ui.blockUI('Cargando grupos de atributos...');
    logger.startLogBuffering();
    try {
        mcApiService.setLogger(logger);
        const apiConfig = await getAuthenticatedConfig();

        logger.logMessage('Consultando Attribute Groups (schema + grupos) y Attribute Sets de Contact Builder...');
        const [groupsRaw, setsRaw] = await Promise.all([
            mcApiService.fetchAttributeGroups(apiConfig).catch(() => []),
            mcApiService.fetchAttributeSetDefinitions(apiConfig)
        ]);
        logger.logMessage(`Recibidos ${groupsRaw.length} grupos y ${setsRaw.length} attribute sets.`);

        buildModel(groupsRaw, setsRaw);
        logger.logMessage(`Grupos con entidades: ${sortedGroups.length}.`);

        loadedClient = clientName;
        selectedGroupId = null;
        elements.erdGenerateBtn.disabled = true;
        renderGroupList();
    } catch (e) {
        logger.logMessage(`Error al cargar el modelo de atributos: ${e.message}`);
        ui.showCustomAlert('Error al cargar el modelo de atributos: ' + e.message);
    } finally {
        ui.unblockUI();
        logger.endLogBuffering();
    }
}

/**
 * Indexa sets y grupos. El nombre del grupo viene de attributeGroups (campo `name`),
 * y la pertenencia de cada set se deduce de su relación AttributeGroup.
 */
function buildModel(groupsRaw, setsRaw) {
    setsById = {};
    groupsById = {};

    // Info de grupo por id (nombre + si es de sistema)
    const groupInfoById = {};
    for (const g of (groupsRaw || [])) {
        if (g && g.id != null) {
            groupInfoById[String(g.id)] = {
                name: g.name || g.fullyQualifiedName || g.key || String(g.id),
                system: !!g.isSystemDefined
            };
        }
    }

    for (const set of (setsRaw || [])) {
        const sid = String(set.id);
        setsById[sid] = set;
        const gids = new Set();
        for (const rel of (set.relationships || [])) {
            if (rel.leftItem?.relationshipType === 'AttributeGroup' && rel.leftItem.identifier != null) {
                gids.add(String(rel.leftItem.identifier));
            }
        }
        for (const gid of gids) {
            if (!groupsById[gid]) {
                const info = groupInfoById[gid];
                groupsById[gid] = {
                    id: gid,
                    name: info?.name || `Grupo ${gid.slice(0, 8)}`,
                    system: info?.system || false,
                    setIds: []
                };
            }
            groupsById[gid].setIds.push(sid);
        }
    }

    sortedGroups = Object.values(groupsById)
        .filter(g => g.setIds.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function renderGroupList() {
    if (sortedGroups.length === 0) {
        elements.erdGroupList.innerHTML = '<div style="padding:16px; color:#6c757d; text-align:center;">No se han encontrado grupos de atributos. Pulsa "Refrescar".</div>';
        return;
    }

    const q = (elements.erdGroupSearch.value || '').toLowerCase().trim();
    const hideSystem = elements.erdHideSystem?.checked;
    const list = sortedGroups.filter(g =>
        (!q || g.name.toLowerCase().includes(q)) &&
        (!hideSystem || !g.system)
    );

    if (list.length === 0) {
        elements.erdGroupList.innerHTML = '<div style="padding:16px; color:#6c757d; text-align:center;">Ningún grupo coincide con el filtro.</div>';
        return;
    }

    elements.erdGroupList.innerHTML = list.map(g => {
        const n = g.setIds.length;
        const sel = g.id === selectedGroupId;
        const badge = g.system
            ? '<span class="badge badge-neutral">Sistema</span>'
            : '<span class="badge badge-info">Usuario</span>';
        return `
        <div class="erd-group-item" data-group-id="${g.id}" style="display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border-radius:6px; cursor:pointer; border:1px solid ${sel ? 'var(--sf-blue)' : 'var(--sf-border)'}; margin-bottom:6px;${sel ? ' background:#e8f3fc;' : ''}">
            <div style="flex:1;">
                <div style="display:flex; align-items:center; gap:8px;"><span style="font-weight:bold; color:#333; font-size:0.88rem;">${escapeHtml(g.name)}</span>${badge}</div>
                <div style="font-size:0.72rem; color:#6c757d; margin-top:2px;">${n} ${n === 1 ? 'entidad' : 'entidades'}</div>
            </div>
        </div>`;
    }).join('');

    elements.erdGroupList.querySelectorAll('.erd-group-item').forEach(el => {
        el.addEventListener('click', () => {
            selectedGroupId = el.dataset.groupId;
            elements.erdGenerateBtn.disabled = false;
            elements.erdGroupList.querySelectorAll('.erd-group-item').forEach(i => {
                i.style.background = '';
                i.style.borderColor = '#e2e8f0';
            });
            el.style.background = '#e8f3fc';
            el.style.borderColor = '#69a3db';
        });
    });
}

/**
 * Transforma un attribute set del endpoint público al formato que consume parseEntities.
 */
function setToEntity(set) {
    return {
        definitionID: set.id,
        definitionName: { value: set.name?.value || set.fullyQualifiedName || set.key || 'Sin nombre' },
        fullyQualifiedName: set.fullyQualifiedName,
        definitionKey: set.key,
        valueDefinitions: (set.attributes || []).map(a => ({
            definitionID: a.id,
            definitionKey: a.name?.value || a.key || a.id,
            dataType: a.dataType,
            isPrimaryKey: !!a.isPrimaryKey
        })),
        relationships: (set.relationships || []).map(r => ({
            isGroupToSetRelationship: r.leftItem?.relationshipType === 'AttributeGroup',
            leftRelationshipReferenceType: r.leftRelationshipReferenceType,
            leftItem: r.leftItem,
            rightItem: r.rightItem,
            relationshipAttributes: r.relationshipAttributes
        }))
    };
}

function getClientName() {
    const name = document.getElementById('clientName')?.value || 'Client';
    return name.replace(/[^a-z0-9]/gi, '_');
}

// ═══════════════════════════════════════════════════════════
// LÓGICA MATEMÁTICA Y PARSEO
// ═══════════════════════════════════════════════════════════
function parseEntities(entities) {
  if (!entities || !entities.length) throw new Error('Formato no reconocido.');

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
      // Relación grupo→set hacia Contacts: el lado izquierdo es Contacts (Contact Key)
      // y el derecho es la tabla. Siempre debe apuntar tabla(FK) → Contacts(PK).
      const isContactsRel = rel.isGroupToSetRelationship && rel.leftRelationshipReferenceType === 'CustomerData';
      const lc = rel.leftItem?.cardinality  || 'One';
      const rc = rel.rightItem?.cardinality || 'One';
      for (const a of rel.relationshipAttributes) {
        const L = fmap[a.leftAttributeID], R = fmap[a.rightAttributeID];
        if (!L || !R || L.t.id === R.t.id) continue;

        if (isContactsRel) {
          // R = campo de la tabla (FK) → L = Contacts.Contact Key (PK)
          R.f.isFK = true;
          const ck = ['ck', R.t.id, R.f.id, L.t.id, L.f.id].join('|');
          if (seen.has(ck)) continue; seen.add(ck);
          relationsArr.push({ fTbl: R.t.id, fFld: R.f.id, fCard: 'Many', tTbl: L.t.id, tFld: L.f.id, tCard: 'One' });
          continue;
        }

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
  const group = groupsById[selectedGroupId];
  if (!group) return ui.showCustomAlert('Selecciona un grupo de atributos primero.');
  try {
    // Sets del grupo + las tablas relacionadas (set-to-set), aunque estén en otro grupo,
    // para que ninguna relación se quede sin su otro extremo.
    const ids = new Set(group.setIds.map(String));
    for (const sid of group.setIds) {
      const set = setsById[sid];
      for (const rel of (set?.relationships || [])) {
        if (rel.leftItem?.relationshipType === 'AttributeSet' && rel.rightItem?.relationshipType === 'AttributeSet') {
          const a = String(rel.leftItem.identifier), b = String(rel.rightItem.identifier);
          if (setsById[a]) ids.add(a);
          if (setsById[b]) ids.add(b);
        }
      }
    }
    const entities = [...ids].map(id => setsById[id]).filter(Boolean).map(setToEntity);
    const p = parseEntities(entities);
    tables = p.tablesArr; relations = p.relationsArr; isContactsHidden = p.hideContacts;
    if (!tables.length) return ui.showCustomAlert('Este grupo no tiene entidades con relaciones para diagramar.');

    elements.erdSelectionZone.classList.add('hidden');
    elements.erdCanvasZone.classList.remove('hidden');
    elements.erdResetBtn.classList.remove('hidden');
    elements.erdDownloadCsvBtn.classList.remove('hidden');
    elements.erdDownloadImgBtn.classList.remove('hidden');
    elements.erdGenerateBtn.classList.add('hidden');
    elements.erdRefreshGroupsBtn.classList.add('hidden');

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
  el.addEventListener('mousedown', e => {
    if (e.target.closest('.frow') || e.button !== 0) return;
    on = true; sX = e.clientX; sY = e.clientY; sL = t.x; sT = t.y;
    el.classList.add('dragging'); e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!on) return;
    t.x = Math.max(0, sL + (e.clientX - sX)); t.y = Math.max(0, sT + (e.clientY - sY));
    el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
    draw(activeKey); elements.erdTooltip.classList.add('hidden');
  });
  document.addEventListener('mouseup', () => { if (!on) return; on = false; el.classList.remove('dragging'); resizeSVG(); draw(activeKey); });
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