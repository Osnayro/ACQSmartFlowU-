
// ============================================================
// SMARTFLOW COMMANDS v6.3 (Completo: edición de puertos mejorada)
// Archivo: js/commands.js
// ============================================================

const SmartFlowCommands = (function() {
    let _core = null;
    let _catalog = null;
    let _render = null;
    let _notifyUI = (msg, isErr) => console.log(msg);
    let _renderUI = () => {};

    // -------------------- DICCIONARIO DE INTENCIONES --------------------
    const IntentDictionary = {
        'crear': 'create', 'nuevo': 'create', 'añadir': 'create', 'instalar': 'create', 'pon': 'create', 'crea': 'create',
        'create': 'create', 'add': 'create',
        'conectar': 'connect', 'unir': 'connect', 'enlazar': 'connect', 'link': 'connect', 'vincula': 'connect', 'junta': 'connect', 'une': 'connect',
        'connect': 'connect',
        'ruta': 'route', 'route': 'route',
        'eliminar': 'delete', 'borrar': 'delete', 'quitar': 'delete', 'suprimir': 'delete', 'quita': 'delete', 'elimina': 'delete', 'limpiar': 'delete',
        'delete': 'delete', 'remove': 'delete',
        'editar': 'edit', 'modificar': 'edit', 'cambiar': 'edit', 'ajustar': 'edit', 'cambia': 'edit',
        'edit': 'edit', 'set': 'edit', 'update': 'edit', 'mover': 'edit', 'move': 'edit',
        'establecer': 'edit', 'spec': 'edit', 'diametro': 'edit',
        'listar': 'list', 'lista': 'list', 'list': 'list', 'inventory': 'list', 'showall': 'list',
        'auditar': 'audit', 'revisar': 'audit', 'verificar': 'audit', 'validar': 'audit', 'audita': 'audit', 'status': 'audit',
        'audit': 'audit', 'check': 'audit',
        'bom': 'bom', 'mto': 'bom', 'generar': 'bom', 'generate': 'bom',
        'ayuda': 'help', 'help': 'help', 'comandos': 'help', '?': 'help', 'h': 'help',
        'deshacer': 'undo', 'undo': 'undo',
        'rehacer': 'redo', 'redo': 'redo',
        'info': 'info', 'información': 'info', 'informacion': 'info', 'detalles': 'info', 'ver': 'info', 'describe': 'info',
        'tap': 'tap', 'derivar': 'tap',
        'split': 'split', 'dividir': 'split', 'romper': 'split'
    };

    function getIntent(w) { return IntentDictionary[w?.toLowerCase()] || null; }

    function normalizeCommand(cmd) {
        const p = cmd.trim().split(/\s+/);
        if (p.length && getIntent(p[0])) p[0] = getIntent(p[0]);
        return p.join(' ');
    }

    function extractCoords(str) {
        const m = str.match(/\((-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)\)/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : null;
    }

    function extractValue(parts, keys) {
        for (let i=0; i<parts.length; i++) {
            if (keys.includes(parts[i].toLowerCase()) && i+1 < parts.length) return parts[i+1];
        }
        return null;
    }

    function notifyWithVoice(msg, isErr=false) {
        if (_notifyUI) _notifyUI(msg, isErr);
        const st = document.getElementById('statusMsg');
        if (st) { st.innerText = msg; st.style.color = isErr ? '#ef4444' : '#00f2ff'; }
        if (typeof SmartFlowAccessibility !== 'undefined' && SmartFlowAccessibility.isVoiceEnabled && SmartFlowAccessibility.isVoiceEnabled())
            SmartFlowAccessibility.speak(msg);
    }

    // ========== INFO ==========
    function parseInfo(cmd) {
        const p = cmd.trim().split(/\s+/);
        if (p[0] !== 'info') return false;
        if (p.length<2) { notifyWithVoice("Uso: info line|equipment|component [TAG]", true); return true; }
        const type=p[1].toLowerCase(), tag=p[2];
        if (!tag) { notifyWithVoice("Especifique tag", true); return true; }
        if (type==='line'||type==='línea'||type==='linea') return infoLine(tag);
        if (type==='equipment'||type==='equipo') return infoEquipment(tag);
        if (type==='component'||type==='componente') return infoComponent(tag);
        notifyWithVoice("Tipo debe ser line, equipment o component", true);
        return true;
    }
    function infoLine(tag) {
        const l = _core.getDb().lines.find(l=>l.tag===tag);
        if(!l) { notifyWithVoice(`Línea ${tag} no encontrada`, true); return true; }
        notifyWithVoice(`Línea ${tag} | Diámetro: ${l.diameter||'?'}" | Material: ${l.material||'N/D'} | Puntos: ${(l.points||l._cachedPoints)?.length||0} | Comp: ${l.components?.length||0}`, false);
        return true;
    }
    function infoEquipment(tag) {
        const e = _core.getDb().equipos.find(e=>e.tag===tag);
        if(!e) { notifyWithVoice(`Equipo ${tag} no encontrado`, true); return true; }
        notifyWithVoice(`Equipo ${tag} | Tipo: ${e.tipo} | Material: ${e.material||'N/D'} | Pos: (${e.posX},${e.posY},${e.posZ}) | Puertos: ${e.puertos?.map(p=>p.id).join(',')||'ninguno'}`, false);
        return true;
    }
    function infoComponent(tag) {
        for(let line of _core.getDb().lines) {
            const c = line.components?.find(c=>c.tag===tag);
            if(c) { notifyWithVoice(`Componente ${tag} | Tipo: ${c.type} | Línea: ${line.tag} | Parámetro: ${c.param}`, false); return true; }
        }
        notifyWithVoice(`Componente ${tag} no encontrado`, true);
        return true;
    }

    // ========== CREATE ==========
    function parseCreate(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0]!=='create') return false;
        const tipo=parts[1], tag=parts[2];
        if (parts[3]!=='at') return false;
        let coordStr='';
        for(let i=4;i<parts.length;i++) { coordStr+=parts[i]; if(parts[i].includes(')')) break; }
        const coords = coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
        if(!coords) return false;
        const x=parseFloat(coords[1]), y=parseFloat(coords[2]), z=parseFloat(coords[3]);
        let params={};
        for(let i=5;i<parts.length;i++) {
            let key=parts[i];
            if(key==='diam'||key==='diametro') params.diametro=parseFloat(parts[++i]);
            else if(key==='height'||key==='altura') params.altura=parseFloat(parts[++i]);
            else if(key==='largo') params.largo=parseFloat(parts[++i]);
            else if(key==='material') params.material=parts[++i].toUpperCase();
            else if(key==='spec') params.spec=parts[++i];
        }
        const def = _catalog.getEquipment(tipo);
        if(!def) { notifyWithVoice(`Tipo desconocido: ${tipo}`, true); return true; }
        const equipo = _catalog.createEquipment(tipo, tag, x, y, z, params);
        if(equipo) { _core.addEquipment(equipo); _core.setSelected({type:'equipment', obj:equipo}); notifyWithVoice(`Equipo ${tag} creado`, false); }
        return true;
    }

    function parseCreateLine(cmd) {
        const parts = cmd.split(/\s+/);
        if(parts[0]!=='create' || parts[1]!=='line') return false;
        const tag=parts[2];
        let diameter=4, material='PPR', spec='PPR_PN12_5', points=[], i=3;
        while(i<parts.length) {
            if(parts[i]==='diameter'||parts[i]==='diametro') diameter=parseFloat(parts[++i]);
            else if(parts[i]==='material') material=parts[++i].toUpperCase();
            else if(parts[i]==='spec') spec=parts[++i];
            else if(parts[i]==='route'||parts[i]==='ruta') {
                i++;
                while(i<parts.length) {
                    const m = parts[i].match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                    if(m) points.push({x:parseFloat(m[1]),y:parseFloat(m[2]),z:parseFloat(m[3])});
                    else break;
                    i++;
                }
                continue;
            }
            i++;
        }
        if(points.length<2) { notifyWithVoice("Se requieren al menos 2 puntos", true); return true; }
        const newLine = { tag, diameter, material, spec, points:_deepClone(points), _cachedPoints:_deepClone(points), waypoints:points.slice(1,-1), components:[] };
        _core.addLine(newLine);
        _core.setSelected({type:'line', obj:newLine});
        notifyWithVoice(`Línea ${tag} creada`, false);
        if(typeof SmartFlowRouter !== 'undefined' && SmartFlowRouter.procesarInterseccionesDeLinea) SmartFlowRouter.procesarInterseccionesDeLinea(newLine);
        return true;
    }

    function parseCreateManifold(cmd) {
        const parts = cmd.split(/\s+/);
        if(parts[0]!=='create' || parts[1]!=='manifold') return false;
        let idx=2, tag=parts[idx++];
        if(parts[idx]!=='at') return false; idx++;
        const coords = parts[idx++].match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
        if(!coords) return false;
        const x=parseFloat(coords[1]), y=parseFloat(coords[2]), z=parseFloat(coords[3]);
        let numEntradas=2, spacing=3000, outputPos='center', diametro=4, material='PPR', spec='PPR_PN12_5';
        while(idx<parts.length) {
            const key=parts[idx++].toLowerCase();
            if(key==='entries'||key==='entradas') numEntradas=parseInt(parts[idx++]);
            else if(key==='spacing'||key==='espaciado') spacing=parseFloat(parts[idx++]);
            else if(key==='output'||key==='salida') outputPos=parts[idx++].toLowerCase();
            else if(key==='diameter'||key==='diametro') diametro=parseFloat(parts[idx++]);
            else if(key==='material') material=parts[idx++].toUpperCase();
            else if(key==='spec') spec=parts[idx++];
        }
        const colector = { tag, tipo:'colector', posX:x, posY:y, posZ:z, diametro, altura:0, largo:(numEntradas-1)*spacing, material, spec, num_entradas:numEntradas, spacing, salida_pos:outputPos, diametro_entrada:diametro, diametro_salida:diametro };
        const def = _catalog.getEquipment('colector');
        colector.puertos = def.generarPuertos(colector);
        _core.addEquipment(colector);
        _core.setSelected({type:'equipment', obj:colector});
        notifyWithVoice(`Colector ${tag} creado`, false);
        return true;
    }

    // ========== CONNECT y ROUTE (delegan en Router) ==========
    function parseConnect(cmd) {
        const parts = cmd.split(/\s+/);
        if(parts[0]!=='connect' && parts[0]!=='conectar') return false;
        const from=parts[1], fromPort=parts[2];
        if(parts[3]!=='to' && parts[3]!=='a') return false;
        const to=parts[4];
        let toPort=parts[5]||null;
        let diam=4, mat='PPR', sp='PPR_PN12_5';
        if(toPort && isNaN(parseFloat(toPort)) && toPort!=='0' && toPort!=='1' && !/^[A-Z]/i.test(toPort[0])) toPort=null;
        for(let i=6;i<parts.length;i++) {
            if(parts[i]==='diameter'||parts[i]==='diametro') diam=parseFloat(parts[++i]);
            else if(parts[i]==='material') mat=parts[++i].toUpperCase();
            else if(parts[i]==='spec') sp=parts[++i];
        }
        if(typeof SmartFlowRouter !== 'undefined' && SmartFlowRouter.routeBetweenPorts)
            SmartFlowRouter.routeBetweenPorts(from, fromPort, to, toPort, diam, mat, sp);
        else notifyWithVoice("Router no disponible", true);
        return true;
    }

    function parseRoute(cmd) {
        const parts = cmd.split(/\s+/);
        if(parts[0]!=='route' && parts[0]!=='ruta') return false;
        if(parts[1]!=='from' && parts[1]!=='desde') return false;
        const from=parts[2], fromPort=parts[3];
        if(parts[4]!=='to' && parts[4]!=='a' && parts[4]!=='hasta') return false;
        const to=parts[5];
        let toPort=null, next=6;
        if(next<parts.length && !parts[next].startsWith('diam') && parts[next]!=='material') toPort=parts[next++];
        let diam=4, mat='PPR', sp='PPR_PN12_5';
        for(let i=next;i<parts.length;i++) {
            if(parts[i]==='diameter'||parts[i]==='diametro') diam=parseFloat(parts[++i]);
            else if(parts[i]==='material') mat=parts[++i].toUpperCase();
            else if(parts[i]==='spec') sp=parts[++i];
        }
        if(typeof SmartFlowRouter !== 'undefined') SmartFlowRouter.routeBetweenPorts(from, fromPort, to, toPort, diam, mat, sp);
        else notifyWithVoice("Router no disponible", true);
        return true;
    }

    // ========== DELETE ==========
    function parseDelete(cmd) {
        const p=cmd.split(/\s+/);
        if(p[0]!=='delete' && p[0]!=='eliminar') return false;
        const type=p[1], tag=p[2];
        if(type==='equipment'||type==='equipo') { _core.deleteEquipment(tag); notifyWithVoice(`Equipo ${tag} eliminado`, false); return true; }
        if(type==='line'||type==='línea') { _core.deleteLine(tag); notifyWithVoice(`Línea ${tag} eliminada`, false); return true; }
        return false;
    }

    // ========== EDIT (mejorado para puertos) ==========
    function parseEditCommand(cmd) {
        const parts = cmd.split(/\s+/);
        if(parts[0]!=='edit' && parts[0]!=='editar') return false;
        if(parts[1]==='equipment' || parts[1]==='equipo') {
            const tag=parts[2], action=parts[3];
            if(action==='move' || action==='mover') {
                const coords=extractCoords(cmd);
                if(coords) { _core.updateEquipment(tag, {posX:coords.x, posY:coords.y, posZ:coords.z}); notifyWithVoice(`Equipo ${tag} movido`, false); }
                else notifyWithVoice("Coordenadas inválidas", true);
                return true;
            }
            else if(action==='set' || action==='establecer') {
                if(parts[4]==='puerto') {
                    const puertoId=parts[5];
                    let newPos=null, newDir=null, newDiam=null;
                    for(let i=6;i<parts.length;i++) {
                        const tok=parts[i].toLowerCase();
                        if(tok==='pos' && i+1<parts.length) {
                            let coordStr='', j=i+1;
                            while(j<parts.length && !parts[j].startsWith('dir') && !parts[j].startsWith('diam') && !parts[j].startsWith('diametro')) { coordStr+=parts[j]; if(parts[j].includes(')')) break; j++; }
                            const m=coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                            if(m) newPos={x:parseFloat(m[1]), y:parseFloat(m[2]), z:parseFloat(m[3])};
                        }
                        else if(tok==='dir' && i+1<parts.length) {
                            let dirStr='', j=i+1;
                            while(j<parts.length && !parts[j].startsWith('pos') && !parts[j].startsWith('diam') && !parts[j].startsWith('diametro')) { dirStr+=parts[j]; if(parts[j].includes(')')) break; j++; }
                            const m=dirStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                            if(m) newDir={dx:parseFloat(m[1]), dy:parseFloat(m[2]), dz:parseFloat(m[3])};
                        }
                        else if((tok==='diam'||tok==='diametro') && i+1<parts.length) { newDiam=parseFloat(parts[i+1]); if(isNaN(newDiam)) newDiam=null; }
                    }
                    let ok=false;
                    if(newPos) { _core.updatePuerto(tag, puertoId, {pos:newPos}); notifyWithVoice(`Puerto ${puertoId} posición actualizada`, false); ok=true; }
                    if(newDir) { _core.updatePuerto(tag, puertoId, {dir:newDir}); notifyWithVoice(`Puerto ${puertoId} dirección actualizada`, false); ok=true; }
                    if(newDiam) { _core.updatePuerto(tag, puertoId, {diametro:newDiam}); notifyWithVoice(`Puerto ${puertoId} diámetro ${newDiam}"`, false); ok=true; }
                    if(!ok) notifyWithVoice("No se especificó pos, dir o diam", true);
                    return true;
                }
                else { notifyWithVoice("Uso: edit equipment [tag] set puerto [id] pos (x,y,z) dir (dx,dy,dz) diam [valor]", true); return true; }
            }
        }
        else if(parts[1]==='line' || parts[1]==='línea') {
            const tag=parts[2], action=parts[3];
            if(action==='set' && parts[4]==='material') { _core.updateLine(tag, {material:parts[5].toUpperCase()}); notifyWithVoice(`Material de ${tag} cambiado`, false); return true; }
            if(action==='set' && (parts[4]==='diameter'||parts[4]==='diametro')) { _core.updateLine(tag, {diameter:parseFloat(parts[5])}); notifyWithVoice(`Diámetro de ${tag} cambiado`, false); return true; }
            if(action==='add' && (parts[4]==='waypoint'||parts[4]==='punto')) {
                const wp=extractCoords(cmd);
                if(wp) {
                    const line = _core.getDb().lines.find(l=>l.tag===tag);
                    if(line) { let pts=line.points||line._cachedPoints||[]; pts.push(wp); _core.updateLine(tag,{points:pts,_cachedPoints:pts}); notifyWithVoice(`Waypoint añadido a ${tag}`, false); }
                } else notifyWithVoice("Coordenadas no válidas", true);
                return true;
            }
            if(action==='add' && (parts[4]==='component'||parts[4]==='componente')) {
                const compType=parts[5]; let pos=0.5; const atIdx=parts.indexOf('at')!==-1?parts.indexOf('at'):parts.indexOf('en'); if(atIdx!==-1) pos=parseFloat(parts[atIdx+1]);
                const line = _core.getDb().lines.find(l=>l.tag===tag);
                if(line) {
                    const compDef=_catalog.getComponent(compType);
                    if(!compDef){ notifyWithVoice(`Componente desconocido: ${compType}`, true); return true; }
                    const comp={ type:compDef.tipo, tag:`${compType}-${Date.now().slice(-6)}`, param:pos };
                    line.components=line.components||[];
                    line.components.push(comp);
                    _core.updateLine(tag,{components:line.components});
                    notifyWithVoice(`${compDef.nombre} añadido a ${tag}`, false);
                }
                return true;
            }
        }
        return false;
    }

    // ========== LIST ==========
    function parseListComponents(cmd) { if(cmd.trim().toLowerCase()==='list components') { notifyWithVoice("Componentes: "+_catalog.listComponentTypes().join(', '), false); return true; } return false; }
    function parseListEquipment(cmd) { if(cmd.trim().toLowerCase()==='list equipment') { notifyWithVoice("Equipos: "+_catalog.listEquipmentTypes().join(', '), false); return true; } return false; }
    function parseListSpecs(cmd) { if(cmd.trim().toLowerCase()==='list specs') { notifyWithVoice("Especificaciones: "+_catalog.listSpecs().join(', '), false); return true; } return false; }

    // ========== BOM ==========
    function parseBOM(cmd) { if(cmd.trim().toLowerCase()==='bom' || cmd.trim().toLowerCase()==='mto') { generateBOM(); return true; } return false; }
    function generateBOM() {
        const db=_core.getDb();
        let items=[];
        db.equipos.forEach(eq=>items.push([eq.tag, eq.tipo, 1]));
        db.lines.forEach(line=>{
            let len=0; const pts=line.points||line._cachedPoints;
            if(pts) for(let i=0;i<pts.length-1;i++) len+=Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y, pts[i+1].z-pts[i].z);
            items.push([line.tag, `Tubería ${line.diameter}"`, (len/1000).toFixed(2)+" m"]);
            if(line.components) line.components.forEach(c=>items.push([c.tag, c.type, 1]));
        });
        let csv="Tag,Descripción,Cantidad\n";
        items.forEach(i=>csv+=`${i[0]},${i[1]},${i[2]}\n`);
        const blob=new Blob([csv],{type:'text/csv'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=`BOM_${Date.now()}.csv`;
        a.click();
        notifyWithVoice(`BOM generado con ${items.length} ítems`, false);
    }

    // ========== AUDIT ==========
    function parseAudit(cmd) { if(cmd.trim().toLowerCase()==='audit') { const report=_core.auditModel(); notifyWithVoice(report, false); return true; } return false; }

    // ========== HELP ==========
    function parseHelp(cmd) {
        if(cmd.trim().toLowerCase()!=='help' && cmd.trim().toLowerCase()!=='ayuda') return false;
        notifyWithVoice("Comandos: create, connect, route, delete, edit, list, info, bom, audit, undo, redo, help, tap, split", false);
        return true;
    }

    // ========== TAP ==========
    function parseTap(cmd) {
        const parts=cmd.trim().split(/\s+/);
        if(parts[0]!=='tap') return false;
        if(parts.length<6 || parts[3]!=='to') { notifyWithVoice("Uso: tap [Equipo] [Puerto] to [Línea] [Posición 0-1] [diam D] [material M]", true); return true; }
        const fromEquip=parts[1], fromPort=parts[2];
        const toLine=parts[4];
        const pos=parseFloat(parts[5]);
        if(isNaN(pos) || pos<0 || pos>1) { notifyWithVoice("Posición debe ser 0-1", true); return true; }
        let diam=4, mat='PPR', sp='PPR_PN12_5';
        for(let i=6;i<parts.length;i++) {
            if(parts[i]==='diameter'||parts[i]==='diametro') diam=parseFloat(parts[++i]);
            else if(parts[i]==='material') mat=parts[++i].toUpperCase();
            else if(parts[i]==='spec') sp=parts[++i];
        }
        const db=_core.getDb();
        const fromObj=db.equipos.find(e=>e.tag===fromEquip);
        if(!fromObj) { notifyWithVoice(`Equipo ${fromEquip} no encontrado`, true); return true; }
        const nz=fromObj.puertos?.find(p=>p.id===fromPort);
        if(!nz) { notifyWithVoice(`Puerto ${fromPort} no encontrado`, true); return true; }
        const startPos={ x:fromObj.posX+(nz.relX||0), y:fromObj.posY+(nz.relY||0), z:fromObj.posZ+(nz.relZ||0) };
        const toObj=db.lines.find(l=>l.tag===toLine);
        if(!toObj || !(toObj.points||toObj._cachedPoints)) { notifyWithVoice(`Línea ${toLine} no válida`, true); return true; }
        if(typeof SmartFlowRouter === 'undefined' || !SmartFlowRouter.insertarAccesorioEnLinea) { notifyWithVoice("Router no disponible", true); return true; }
        const pts=toObj.points||toObj._cachedPoints;
        let totalLen=0, lengths=[];
        for(let i=0;i<pts.length-1;i++) { const d=Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y, pts[i+1].z-pts[i].z); lengths.push(d); totalLen+=d; }
        const target=totalLen*pos;
        let accum=0, segIdx=0, t=0;
        for(let i=0;i<lengths.length;i++) { if(accum+lengths[i]>=target || i===lengths.length-1) { segIdx=i; t=(target-accum)/(lengths[i]||1); break; } accum+=lengths[i]; }
        const pA=pts[segIdx], pB=pts[segIdx+1];
        const punto={ x:pA.x+(pB.x-pA.x)*t, y:pA.y+(pB.y-pA.y)*t, z:pA.z+(pB.z-pA.z)*t };
        const portId = SmartFlowRouter.insertarAccesorioEnLinea(toLine, punto, diam, true);
        if(!portId) { notifyWithVoice("No se pudo insertar accesorio", true); return true; }
        const newTag = `L-${db.lines.length+1}`;
        const newLine = { tag:newTag, diameter:diam, material:mat, spec:sp, points:[startPos, punto], _cachedPoints:[startPos, punto], origin:{objType:'equipment', equipTag:fromEquip, portId:fromPort}, destination:{objType:'line', equipTag:toLine, portId:portId}, components:[] };
        _core.addLine(newLine);
        nz.connectedLine = newTag;
        const toObjUpd=db.lines.find(l=>l.tag===toLine);
        if(toObjUpd?.puertos) { const p=toObjUpd.puertos.find(p=>p.id===portId); if(p) p.connectedLine = newTag; }
        _core.syncPhysicalData(); _core._saveState();
        notifyWithVoice(`Derivación ${newTag} creada`, false);
        return true;
    }

    // ========== SPLIT ==========
    function parseSplit(cmd) {
        const parts=cmd.trim().split(/\s+/);
        if(parts[0]!=='split' && parts[0]!=='dividir') return false;
        const lineTag=parts[1];
        const coords=extractCoords(cmd);
        if(!lineTag || !coords) { notifyWithVoice("Uso: split [línea] at (x,y,z)", true); return true; }
        const type = extractValue(parts, ['type','tipo']) || 'TEE_EQUAL';
        notifyWithVoice(`Dividiendo línea ${lineTag}...`, false);
        if(!_core.splitLine) { notifyWithVoice("splitLine no disponible", true); return true; }
        const result = _core.splitLine(lineTag, coords, {type});
        if(result) { _core.setSelected({type:'COMPONENTE', obj:result.componente, parent:result.linea}); notifyWithVoice("Línea dividida", false); }
        else notifyWithVoice(`No se pudo dividir en (${coords.x},${coords.y},${coords.z})`, true);
        return true;
    }

    // ========== IMPORT PCF (delegado) ==========
    function importPCF(content) {
        if(typeof SmartFlowIO !== 'undefined' && SmartFlowIO.importPCF) SmartFlowIO.importPCF(content);
        else notifyWithVoice("Importación PCF delegada a IO, módulo no disponible", true);
        return true;
    }

    // ========== EJECUCIÓN ==========
    function executeCommand(cmd) {
        if(!cmd || cmd.startsWith('//')) return false;
        const norm=normalizeCommand(cmd);
        const t=norm.trim();
        if(parseCreateLine(t)) return true;
        if(parseCreateManifold(t)) return true;
        if(parseCreate(t)) return true;
        if(parseConnect(t)) return true;
        if(parseRoute(t)) return true;
        if(parseDelete(t)) return true;
        if(parseEditCommand(t)) return true;
        if(parseListComponents(t)) return true;
        if(parseListEquipment(t)) return true;
        if(parseListSpecs(t)) return true;
        if(parseBOM(t)) return true;
        if(parseAudit(t)) return true;
        if(parseHelp(t)) return true;
        if(parseInfo(t)) return true;
        if(parseTap(t)) return true;
        if(parseSplit(t)) return true;
        if(t==='undo'||t==='deshacer') { _core.undo(); return true; }
        if(t==='redo'||t==='rehacer') { _core.redo(); return true; }
        notifyWithVoice(`Comando no reconocido: "${cmd}"`, true);
        return false;
    }

    function executeBatch(text) {
        const lines=text.split('\n');
        let ok=0, fail=0;
        for(let l of lines) {
            const t=l.trim();
            if(!t || t.startsWith('//')) continue;
            if(executeCommand(t)) ok++;
            else fail++;
        }
        notifyWithVoice(`${ok} comandos OK, ${fail} fallidos`, fail>0);
        return ok;
    }

    function init(core, catalog, render, notifyFn, renderFn) {
        _core=core; _catalog=catalog; _render=render; if(notifyFn) _notifyUI=notifyFn; if(renderFn) _renderUI=renderFn;
        console.log("✅ SmartFlowCommands v6.3 listo (edición de puertos mejorada)");
    }

    // helper deepClone
    function _deepClone(obj) { try { return structuredClone(obj); } catch(e) { return JSON.parse(JSON.stringify(obj)); } }

    return { init, executeCommand, executeBatch, importPCF };
})();
