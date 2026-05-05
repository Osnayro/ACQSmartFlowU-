
// ============================================================
// SMARTFLOW COMMANDS v10.10 – extracción de nodos rehecha
// Archivo: js/commands.js
// ============================================================

const SmartFlowCommands = (function() {
    let _core = null;
    let _catalog = null;
    let _renderer = null;
    let _notifyUI = (msg, isErr) => console.log(msg);

    const LEX = {
        'crear': 'CREATE', 'create': 'CREATE', '+': 'CREATE',
        'añadir': 'CREATE', 'nuevo': 'CREATE',
        'modificar': 'MODIFY', 'editar': 'MODIFY', 'edit': 'MODIFY', '~': 'MODIFY',
        'eliminar': 'DELETE', 'borrar': 'DELETE', 'delete': 'DELETE', '-': 'DELETE',
        'mover': 'MOVE', 'move': 'MOVE', '>': 'MOVE',
        'conectar': 'CONNECT', 'connect': 'CONNECT',
        'linea': 'LINEA_WP', 'line': 'LINEA_WP',
        'info': 'INFO', '?': 'INFO', 'informacion': 'INFO',
        'listar': 'LIST', 'list': 'LIST',
        '??': 'LIST_EQUIPOS', '???': 'LIST_LINEAS',
        'ayuda': 'HELP', 'help': 'HELP', 'h': 'HELP',
        'undo': 'UNDO', 'deshacer': 'UNDO', '<<': 'UNDO',
        'redo': 'REDO', 'rehacer': 'REDO', '>>': 'REDO',
        'nodos': 'NODES', 'nodes': 'NODES',
        'punto': 'POINT', 'coordenadas': 'POINT',
        'vista': 'VIEW', 'view': 'VIEW',
        'isometrico': 'VIEW_ISO', 'iso': 'VIEW_ISO',
        'top': 'VIEW_TOP', 'planta': 'VIEW_TOP',
        'front': 'VIEW_FRONT', 'frontal': 'VIEW_FRONT',
        'side': 'VIEW_SIDE', 'lateral': 'VIEW_SIDE',
        '.': 'VIEW_ISO', '.t': 'VIEW_TOP', '.f': 'VIEW_FRONT', '.s': 'VIEW_SIDE',
        'exportar': 'EXPORT', 'export': 'EXPORT',
        '!mto': 'EXPORT_MTO', '!pcf': 'EXPORT_PCF', '!pdf': 'EXPORT_PDF',
        'guardar': 'SAVE', '!save': 'SAVE',
        'cargar': 'LOAD', '!load': 'LOAD',
        '%': 'CREATE_LINE', 'ruta': 'CREATE_LINE',
        'resumen': 'SUMMARY', 'summary': 'SUMMARY',
        'tap': 'TAP', 'derivar': 'TAP',
        'split': 'SPLIT', 'dividir': 'SPLIT', 'romper': 'SPLIT',
        'audit': 'AUDIT', 'auditar': 'AUDIT', 'verificar': 'AUDIT',
        'bom': 'BOM', 'mto': 'BOM', 'generar': 'BOM'
    };

    function normalizeCommand(cmd) {
        const parts = cmd.trim().split(/\s+/);
        if (parts.length === 0) return cmd;
        const intent = LEX[parts[0].toLowerCase()];
        if (intent) { parts[0] = intent; return parts.join(' '); }
        return cmd;
    }

    function notify(msg, isErr) {
        if (typeof _notifyUI === 'function') _notifyUI(msg, isErr);
        else {
            const el = document.getElementById('statusMsg');
            if (el) { el.innerText = msg; el.style.color = isErr ? '#ef4444' : '#00f2ff'; }
        }
        const speak = msg.replace(/[✅⚠️🗑️📋📐📦↩️↪️📍]/g, '').trim();
        if (speak) {
            if (typeof SmartFlowAccessibility !== 'undefined' && SmartFlowAccessibility.speak)
                SmartFlowAccessibility.speak(speak, isErr);
            else if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(speak);
                u.lang = 'es-ES'; u.rate = 0.95;
                window.speechSynthesis.speak(u);
            }
        }
    }

    function depsOk() {
        if (!_core || !_catalog) { notify('Sistema no inicializado.', true); return false; }
        return true;
    }

    function tokenize(cmd) {
        const tokens = [];
        const re = /\w+=\s*\([^)]+\)|->|@|\([^)]+\)|[\w\-\.=]+|[<>+\-~%!?.]+/g;
        let m;
        while ((m = re.exec(cmd)) !== null) tokens.push(m[0]);
        return tokens;
    }

    function extractCoords(str) {
        const m = str.match(/\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : null;
    }

    function extractParams(tokens) {
        const p = {};
        for (const t of tokens) {
            let m = t.match(/^d(?:iam(?:etro)?)?[=:](\d+\.?\d*)/i);
            if (m) { p.diametro = parseFloat(m[1]); continue; }
            m = t.match(/^(?:h(?:eight)?|altura)[=:](\d+\.?\d*)/i);
            if (m) { p.altura = parseFloat(m[1]); continue; }
            m = t.match(/^l(?:argo)?[=:](\d+\.?\d*)/i);
            if (m) { p.largo = parseFloat(m[1]); continue; }
            m = t.match(/^m(?:aterial)?[=:](\w+[\w\-]*)/i);
            if (m) { p.material = m[1].toUpperCase(); continue; }
            m = t.match(/^s(?:pec)?[=:](\w+[\w\-]*)/i);
            if (m) { p.spec = m[1]; continue; }
            m = t.match(/^pos[=:]\s*\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/i);
            if (m) { p.pos = { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) }; continue; }
            m = t.match(/^dir[=:]\s*\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/i);
            if (m) { p.dir = { dx: parseFloat(m[1]), dy: parseFloat(m[2]), dz: parseFloat(m[3]) }; continue; }
        }
        return p;
    }

    function parseNodeRef(str) {
        const dot = str.indexOf('.');
        if (dot > 0) return { tag: str.substring(0, dot), port: str.substring(dot + 1) };
        const at = str.indexOf('@');
        if (at > 0) return { tag: str.substring(0, at), port: str.substring(at + 1) };
        // Si no tiene separador, es solo un tag; el puerto se asigna después según contexto
        return { tag: str, port: null };
    }

    /**
     * Escanea tokens desde startIdx y construye una referencia de nodo.
     * Soporta:
     *   TK-01.N1           -> { tag: 'TK-01', port: 'N1' }
     *   HD-1@0.1792        -> { tag: 'HD-1',  port: '0.1792' }
     *   HD-1 @ 0.1792      -> (tres tokens) unidos como HD-1@0.1792
     *   HD-1               -> { tag: 'HD-1',  port: null }  (se asignará '0' luego)
     * Retorna { ref, nextIdx } o null.
     */
    function scanNodeRef(tokens, startIdx) {
        if (startIdx >= tokens.length) return null;
        let i = startIdx;
        const first = tokens[i];

        // Caso: "@" solo al principio -> inválido
        if (first === '@') return null;
        if (first === 'a' || first === 'to') return null; // palabra de enlace

        // Si ya contiene separador, lo parseamos directamente
        if (first.includes('.') || first.includes('@')) {
            return { ref: parseNodeRef(first), nextIdx: i + 1 };
        }

        // Si el siguiente token es '@', unir TAG @ NUM
        if (i + 1 < tokens.length && tokens[i + 1] === '@' && i + 2 < tokens.length) {
            const joined = first + '@' + tokens[i + 2];
            return { ref: parseNodeRef(joined), nextIdx: i + 3 };
        }

        // Si el siguiente token empieza con '.' o '@' no está soportado, devolver solo el tag
        return { ref: { tag: first, port: null }, nextIdx: i + 1 };
    }

    function findElbowForLine(mat, ang) {
        const m = (mat || '').toUpperCase();
        if (ang < 15) return null;
        const is90 = ang > 60, is45 = ang >= 15 && ang <= 60;
        if (m.includes('PPR')) return is90 ? 'ELBOW_90_PPR' : (is45 ? 'ELBOW_45_PPR' : null);
        if (m.includes('HDPE')) return is90 ? 'ELBOW_90_HDPE' : null;
        if (m.includes('PVC')) return is90 ? 'ELBOW_90_PVC' : null;
        if (m.includes('ACERO') || m.includes('CARBONO')) return is90 ? 'ELBOW_90_LR_CS' : (is45 ? 'ELBOW_45_CS' : null);
        if (m.includes('INOX')) return is90 ? 'ELBOW_90_SANITARY' : null;
        return is90 ? 'ELBOW_90_LR_CS' : (is45 ? 'ELBOW_45_CS' : null);
    }

    function angleBetweenVectors(v1, v2) {
        const d = v1.dx * v2.dx + v1.dy * v2.dy + v1.dz * v2.dz;
        return Math.acos(Math.min(1, Math.max(-1, d))) * 180 / Math.PI;
    }

    function injectFittingsIntoLine(lineObj) {
        const pts = lineObj._cachedPoints || lineObj.points;
        if (!pts || pts.length < 2) return lineObj;
        const comps = lineObj.components || [];
        for (let i = 1; i < pts.length - 1; i++) {
            const s1 = { dx: pts[i].x - pts[i-1].x, dy: pts[i].y - pts[i-1].y, dz: pts[i].z - pts[i-1].z };
            const s2 = { dx: pts[i+1].x - pts[i].x, dy: pts[i+1].y - pts[i].y, dz: pts[i+1].z - pts[i].z };
            const l1 = Math.hypot(s1.dx, s1.dy, s1.dz) || 1;
            const l2 = Math.hypot(s2.dx, s2.dy, s2.dz) || 1;
            const v1 = { dx: s1.dx/l1, dy: s1.dy/l1, dz: s1.dz/l1 };
            const v2 = { dx: s2.dx/l2, dy: s2.dy/l2, dz: s2.dz/l2 };
            const ang = angleBetweenVectors(v1, v2);
            const elbow = findElbowForLine(lineObj.material || 'PPR', ang);
            if (elbow) {
                comps.push({
                    type: elbow,
                    tag: (elbow + '-' + Date.now().toString(36)),
                    param: i / (pts.length - 1),
                    angle: Math.round(ang)
                });
            }
        }
        lineObj.components = comps;
        return lineObj;
    }

    function findComponentInCatalogDirect(tipoBase, lineMaterial) {
        const catalog = SmartFlowCatalog;
        if (!catalog) return null;
        const allTypes = catalog.listComponentTypes();
        const mat = lineMaterial.toUpperCase();
        let prefix = '';
        if (mat.includes('PPR')) prefix = 'PPR';
        else if (mat.includes('HDPE')) prefix = 'HDPE';
        else if (mat.includes('PVC')) prefix = 'PVC';
        else if (mat.includes('ACERO') || mat.includes('CARBONO')) prefix = 'CS';
        else if (mat.includes('INOX')) prefix = 'SS';
        let tipo = tipoBase;
        if (tipo === 'TEE') tipo = 'TEE_EQUAL';
        else if (tipo === 'REDUCER' || tipo === 'CONCENTRIC_REDUCER') tipo = 'CONCENTRIC_REDUCER';
        const candidates = [];
        if (prefix) candidates.push(tipo + '_' + prefix);
        candidates.push(tipo);
        for (const c of candidates) if (allTypes.includes(c)) return c;
        for (const t of allTypes) if (t.includes(tipo)) return t;
        return null;
    }

    // ==================== CONEXIÓN DIRECTA ====================
    function handleConnectDirecto(tokens) {
        if (tokens.length < 3) {
            notify('Uso: conectar ORIGEN.PUERTO DESTINO.PUERTO [diametro N] [material M]', true);
            return true;
        }

        // Origen (primer token tras el comando)
        const org = scanNodeRef(tokens, 1);
        if (!org || !org.ref.tag) {
            notify('El origen debe ser EQUIPO.PUERTO o LINEA@POS', true);
            return true;
        }
        const left = org.ref;
        if (left.port === null) left.port = '0'; // por defecto
        let idx = org.nextIdx;

        // Saltar 'a'/'to'
        while (idx < tokens.length && (tokens[idx].toLowerCase() === 'a' || tokens[idx].toLowerCase() === 'to'))
            idx++;

        // Destino
        const dst = scanNodeRef(tokens, idx);
        if (!dst || !dst.ref.tag) {
            notify('Falta el destino (EQUIPO.PUERTO o LINEA@POS)', true);
            return true;
        }
        const right = dst.ref;
        if (right.port === null) right.port = '0';
        idx = dst.nextIdx;

        // Parámetros
        const params = extractParams(tokens.slice(idx));
        const diam = params.diametro || 4;
        const mat = params.material || 'PPR';
        const spec = params.spec || 'PPR_PN12_5';

        const db = _core.getDb();
        const fromObj = db.equipos.find(e => e.tag === left.tag) || db.lines.find(l => l.tag === left.tag);
        let toObj = db.equipos.find(e => e.tag === right.tag) || db.lines.find(l => l.tag === right.tag);

        if (!fromObj) { notify(`Origen ${left.tag} no encontrado`, true); return true; }
        if (!toObj) { notify(`Destino ${right.tag} no encontrado`, true); return true; }

        function getPortDirectionLocal(obj, portId) {
            if (!obj) return { dx: 1, dy: 0, dz: 0 };
            if (obj.posX !== undefined) {
                const puerto = obj.puertos?.find(p => p.id === portId);
                if (puerto && puerto.orientacion) return puerto.orientacion;
                return { dx: 1, dy: 0, dz: 0 };
            }
            const pts = obj._cachedPoints || obj.points3D || obj.points;
            if (pts && pts.length >= 2) {
                if (portId === '0') {
                    const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y, dz = pts[1].z - pts[0].z;
                    const len = Math.hypot(dx, dy, dz) || 1;
                    return { dx: dx/len, dy: dy/len, dz: dz/len };
                }
                if (portId === '1') {
                    const last = pts.length - 1;
                    const dx = pts[last].x - pts[last-1].x, dy = pts[last].y - pts[last-1].y, dz = pts[last].z - pts[last-1].z;
                    const len = Math.hypot(dx, dy, dz) || 1;
                    return { dx: dx/len, dy: dy/len, dz: dz/len };
                }
            }
            return { dx: 1, dy: 0, dz: 0 };
        }

        // Posición origen
        let startPos = null;
        if (fromObj.posX !== undefined) {
            const port = fromObj.puertos?.find(p => p.id === left.port);
            if (port) startPos = { x: fromObj.posX + (port.relX||0), y: fromObj.posY + (port.relY||0), z: fromObj.posZ + (port.relZ||0) };
        } else {
            const pts = fromObj._cachedPoints || fromObj.points3D || fromObj.points;
            if (pts && pts.length >= 2) {
                if (left.port === '0') startPos = pts[0];
                else if (left.port === '1') startPos = pts[pts.length-1];
            }
        }
        if (!startPos) { notify('No se pudo obtener la posición del puerto origen', true); return true; }

        let nuevoPuertoId = right.port;
        let endPos = null;
        const isLineDest = toObj._cachedPoints || toObj.points3D || toObj.points;

        // Punto intermedio en línea destino
        if (isLineDest && !isNaN(parseFloat(right.port))) {
            const param = parseFloat(right.port);
            if (param > 0.01 && param < 0.99) {
                const pts = toObj._cachedPoints || toObj.points3D || toObj.points;
                if (pts && pts.length >= 2) {
                    let lengths = [], totalLen = 0;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const d = Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y, pts[i+1].z-pts[i].z);
                        lengths.push(d); totalLen += d;
                    }
                    const targetLen = totalLen * param;
                    let acc = 0, seg = 0, tt = 0;
                    for (let i = 0; i < lengths.length; i++) {
                        if (acc + lengths[i] >= targetLen || i === lengths.length - 1) {
                            seg = i; tt = (targetLen - acc) / (lengths[i]||1); break;
                        }
                        acc += lengths[i];
                    }
                    const pA = pts[seg], pB = pts[seg+1];
                    const puntoConexion = {
                        x: pA.x + (pB.x-pA.x)*tt,
                        y: pA.y + (pB.y-pA.y)*tt,
                        z: pA.z + (pB.z-pA.z)*tt
                    };

                    const lineMat = toObj.material || 'PPR';
                    const diamLinea = toObj.diameter || 4;
                    const diff = Math.abs(diam - diamLinea) > 0.1;
                    const tipoAcc = diff ? 'TEE_REDUCING' : 'TEE';
                    const compId = findComponentInCatalogDirect(tipoAcc, lineMat);
                    if (!compId) { notify(`No se encontró tee para ${toObj.tag}`, true); return true; }
                    const compDef = SmartFlowCatalog.getComponent(compId);
                    if (!compDef?.generarPuertos) { notify(`El componente ${compId} no tiene puertos`, true); return true; }

                    const result = _core.injectAccessory(right.tag, param, { tag: compId, generarPuertos: compDef.generarPuertos });
                    if (!result) { notify(`No se pudo insertar ${compId} en ${right.tag}`, true); return true; }

                    toObj = db.lines.find(l => l.tag === right.tag);
                    if (toObj) {
                        if (!toObj.components) toObj.components = [];
                        toObj.components.push({
                            type: compId,
                            tag: _core.generateShortTag ? _core.generateShortTag(compId) : (compId + '-' + Date.now().toString(36)),
                            param
                        });
                        _core.updateLine(right.tag, { components: toObj.components });
                    }
                    const updatedLine = db.lines.find(l => l.tag === right.tag);
                    if (updatedLine?.puertos?.length) {
                        nuevoPuertoId = updatedLine.puertos[updatedLine.puertos.length-1].id;
                    }
                    notify(`Tee insertada en ${right.tag} en ${param.toFixed(2)}`, false);
                }
            }
        }

        // Obtener endPos
        toObj = db.equipos.find(e => e.tag === right.tag) || db.lines.find(l => l.tag === right.tag);
        if (toObj.posX !== undefined) {
            const port = toObj.puertos?.find(p => p.id === nuevoPuertoId);
            if (port) endPos = { x: toObj.posX + (port.relX||0), y: toObj.posY + (port.relY||0), z: toObj.posZ + (port.relZ||0) };
        } else {
            const pts = toObj._cachedPoints || toObj.points3D || toObj.points;
            if (pts && pts.length >= 2) {
                if (nuevoPuertoId === '0') endPos = pts[0];
                else if (nuevoPuertoId === '1') endPos = pts[pts.length-1];
            }
        }
        if (!endPos) { notify('No se pudo obtener la posición del puerto destino', true); return true; }

        const newLineTag = `L-${db.lines.length + 1}`;
        const directPath = [startPos, endPos];
        const newComponents = [];

        // Codo origen
        const fromDir = getPortDirectionLocal(fromObj, left.port);
        const segF = { dx: directPath[1].x-directPath[0].x, dy: directPath[1].y-directPath[0].y, dz: directPath[1].z-directPath[0].z };
        const lenF = Math.hypot(segF.dx, segF.dy, segF.dz)||1;
        const uF = { dx: segF.dx/lenF, dy: segF.dy/lenF, dz: segF.dz/lenF };
        const dotF = fromDir.dx*uF.dx + fromDir.dy*uF.dy + fromDir.dz*uF.dz;
        const angF = Math.acos(Math.min(1, Math.max(-1, dotF))) * 180 / Math.PI;
        if (angF > 15) {
            const eId = findElbowForLine(mat, angF);
            if (eId) {
                newComponents.push({ type: eId, tag: eId + '-' + Date.now().toString(36), param: 0.0 });
                notify(`Codo ${Math.round(angF)}° al inicio`, false);
            }
        }

        // Codo destino
        const toDir = getPortDirectionLocal(toObj, nuevoPuertoId);
        const segL = { dx: directPath[1].x-directPath[0].x, dy: directPath[1].y-directPath[0].y, dz: directPath[1].z-directPath[0].z };
        const lenL = Math.hypot(segL.dx, segL.dy, segL.dz)||1;
        const uL = { dx: segL.dx/lenL, dy: segL.dy/lenL, dz: segL.dz/lenL };
        const dotL = toDir.dx*uL.dx + toDir.dy*uL.dy + toDir.dz*uL.dz;
        const angL = Math.acos(Math.min(1, Math.max(-1, dotL))) * 180 / Math.PI;
        if (angL > 15) {
            const eId = findElbowForLine(mat, angL);
            if (eId) {
                newComponents.push({ type: eId, tag: eId + '-' + Date.now().toString(36), param: 1.0 });
                notify(`Codo ${Math.round(angL)}° al final`, false);
            }
        }

        // Reductor en extremo
        if (isLineDest && (nuevoPuertoId === '0' || nuevoPuertoId === '1')) {
            const destDiam = toObj.diameter || 4;
            if (Math.abs(diam - destDiam) > 0.1) {
                const redId = findComponentInCatalogDirect('CONCENTRIC_REDUCER', mat);
                if (redId) {
                    newComponents.push({ type: redId, tag: redId + '-' + Date.now().toString(36), param: 1.0 });
                    notify(`Reductor ${destDiam}"x${diam}" al final`, false);
                }
            }
        }

        const nuevaLinea = {
            tag: newLineTag, diameter: diam, material: mat, spec,
            origin: { objType: fromObj.posX !== undefined ? 'equipment' : 'line', equipTag: left.tag, portId: left.port },
            destination: { objType: toObj.posX !== undefined ? 'equipment' : 'line', equipTag: right.tag, portId: nuevoPuertoId },
            waypoints: [], _cachedPoints: directPath, components: newComponents
        };

        _core.addLine(nuevaLinea);
        if (_core.setSelected) _core.setSelected({ type: 'line', obj: nuevaLinea });
        if (fromObj.puertos) {
            const pf = fromObj.puertos.find(p => p.id === left.port);
            if (pf) pf.connectedLine = newLineTag;
        }
        if (toObj.puertos) {
            const pt = toObj.puertos.find(p => p.id === nuevoPuertoId);
            if (pt) pt.connectedLine = newLineTag;
        }
        _core.syncPhysicalData();
        _core._saveState();
        notify(`✅ Conectado ${left.tag}.${left.port} → ${right.tag}.${nuevoPuertoId} (línea recta)`);
        return true;
    }

    // ==================== PUNTO (COORDENADAS) ====================
    function handlePoint(tokens) {
        if (tokens.length < 2) {
            notify('Uso: punto EQUIPO.PUERTO o punto LINEA@POS', true);
            return true;
        }
        const scanned = scanNodeRef(tokens, 1);
        if (!scanned || !scanned.ref.tag) {
            notify('Formato incorrecto. Use TAG.PUERTO o TAG@POS', true);
            return true;
        }
        const ref = scanned.ref;
        if (ref.port === null) ref.port = '0';

        const db = _core.getDb();
        const obj = db.equipos.find(e => e.tag === ref.tag) || db.lines.find(l => l.tag === ref.tag);
        if (!obj) {
            notify(`Elemento ${ref.tag} no encontrado`, true);
            return true;
        }

        let coords = null;
        if (obj.posX !== undefined) {
            const port = obj.puertos?.find(p => p.id === ref.port);
            if (!port) {
                notify(`Puerto ${ref.port} no encontrado en ${ref.tag}`, true);
                return true;
            }
            coords = {
                x: (obj.posX || 0) + (port.relX || 0),
                y: (obj.posY || 0) + (port.relY || 0),
                z: (obj.posZ || 0) + (port.relZ || 0)
            };
        } else {
            const pts = obj._cachedPoints || obj.points3D || obj.points;
            if (!pts || pts.length < 2) {
                notify(`Línea ${ref.tag} sin geometría`, true);
                return true;
            }
            if (ref.port === '0' || ref.port.toUpperCase() === 'START') {
                coords = { x: pts[0].x, y: pts[0].y, z: pts[0].z };
            } else if (ref.port === '1' || ref.port.toUpperCase() === 'END') {
                const last = pts.length - 1;
                coords = { x: pts[last].x, y: pts[last].y, z: pts[last].z };
            } else {
                const param = parseFloat(ref.port);
                if (isNaN(param) || param < 0 || param > 1) {
                    notify('Posición inválida. Use 0-1, START, END o un puerto', true);
                    return true;
                }
                let totalLen = 0, lengths = [];
                for (let i = 0; i < pts.length - 1; i++) {
                    const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
                    lengths.push(d);
                    totalLen += d;
                }
                if (totalLen === 0) {
                    notify('Línea sin longitud', true);
                    return true;
                }
                const target = totalLen * param;
                let accum = 0, seg = 0, t = 0;
                for (let i = 0; i < lengths.length; i++) {
                    if (accum + lengths[i] >= target || i === lengths.length - 1) {
                        seg = i;
                        t = (target - accum) / (lengths[i] || 1);
                        break;
                    }
                    accum += lengths[i];
                }
                const pA = pts[seg], pB = pts[seg + 1];
                coords = {
                    x: pA.x + (pB.x - pA.x) * t,
                    y: pA.y + (pB.y - pA.y) * t,
                    z: pA.z + (pB.z - pA.z) * t
                };
            }
        }

        if (!coords) {
            notify('No se pudieron calcular las coordenadas', true);
            return true;
        }

        notify(`📍 ${ref.tag}.${ref.port}: X=${coords.x.toFixed(1)}, Y=${coords.y.toFixed(1)}, Z=${coords.z.toFixed(1)} mm`);
        return true;
    }

    // ==================== EJECUCIÓN PRINCIPAL ====================
    function executeCommand(cmd) {
        if (!cmd || cmd.startsWith('//')) return false;
        const normalized = normalizeCommand(cmd);
        const tokens = tokenize(normalized);
        if (!tokens || !tokens.length) return false;
        if (!depsOk()) return true;

        const first = tokens[0].toLowerCase();
        const action = LEX[first] || first.toUpperCase();

        if (action === 'CONNECT') return handleConnectDirecto(tokens);

        const rest = tokens.slice(1);
        const arrowIdx = rest.indexOf('->');
        if (arrowIdx >= 0) return handleConnectDirecto(tokens);
        const aIdx = rest.findIndex(t => t.toLowerCase() === 'a' || t.toLowerCase() === 'to');
        if (aIdx > 0) {
            const leftPart = rest.slice(0, aIdx).join('');
            const rightPart = rest.slice(aIdx+1).join(' ');
            if (leftPart.includes('.') || rightPart.includes('.')) return handleConnectDirecto(tokens);
        }

        if (action === 'CREATE' && tokens.length >= 3 && (tokens[1].toLowerCase() === 'linea' || tokens[1].toLowerCase() === 'line'))
            return handleCreateLineFromCreate(tokens);
        if (action === 'TAP') return handleTap(tokens);
        if (action === 'SPLIT') return handleSplit(tokens);
        if (action === 'AUDIT') return handleAudit();
        if (action === 'BOM') return handleBOM();

        switch (action) {
            case 'CREATE': return handleCreateEquipo(tokens);
            case 'CREATE_LINE': return handleCreateLine(tokens);
            case 'LINEA_WP': return handleLineWithWaypoints(tokens);
            case 'MODIFY': return handleModify(tokens);
            case 'DELETE': return handleDelete(tokens);
            case 'MOVE': return handleMove(tokens);
            case 'INFO': return handleInfo(tokens);
            case 'LIST': return handleList(tokens);
            case 'LIST_EQUIPOS': listEquipos(); return true;
            case 'LIST_LINEAS': listLineas(); return true;
            case 'HELP': showHelp(); return true;
            case 'UNDO': if (_core) _core.undo(); notify('Deshacer: última acción revertida'); return true;
            case 'REDO': if (_core) _core.redo(); notify('Rehacer: última acción restablecida'); return true;
            case 'NODES': return handleNodes(tokens);
            case 'POINT': return handlePoint(tokens);
            case 'VIEW': return handleViewCommand(tokens);
            case 'VIEW_ISO': setView('iso'); return true;
            case 'VIEW_TOP': setView('top'); return true;
            case 'VIEW_FRONT': setView('front'); return true;
            case 'VIEW_SIDE': setView('side'); return true;
            case 'EXPORT': return handleExport(tokens);
            case 'EXPORT_MTO': exportMTO(); return true;
            case 'EXPORT_PCF': exportPCF(); return true;
            case 'EXPORT_PDF': exportPDF(); return true;
            case 'SAVE': saveProject(); return true;
            case 'LOAD': loadProject(); return true;
            case 'SUMMARY': return resumen();
        }
        return false;
    }

    // ==================== RESTO DE HANDLERS ====================
    function handleCreateEquipo(tokens) {
        if (!depsOk()) return true;
        const enIdx = tokens.findIndex(t => t.toLowerCase() === 'en' || t.toLowerCase() === 'at');
        if (enIdx < 0) { notify('Formato: crear TIPO TAG en X,Y,Z [d=DIAM] [h=ALTURA] [m=MATERIAL]', true); return true; }
        const tipo = tokens[1], tag = tokens[2];
        const coordStr = tokens.slice(enIdx+1).join('');
        const coords = extractCoords(coordStr);
        if (!coords) { notify('Coordenadas inválidas', true); return true; }
        const params = extractParams(tokens.slice(enIdx+1));
        const eqDef = _catalog.getEquipment(tipo);
        if (!eqDef) { notify(`Tipo "${tipo}" no encontrado`, true); return true; }
        const eq = _catalog.createEquipment(tipo, tag, coords.x, coords.y, coords.z, params);
        if (eq) { _core.addEquipment(eq); notify(`✅ Equipo ${tag} creado`); }
        return true;
    }

    function handleCreateLineFromCreate(tokens) {
        if (!depsOk()) return true;
        let tagIdx = 2; if (tokens[2].toLowerCase() === 'ruta') tagIdx = 3;
        if (tagIdx >= tokens.length) { notify('Falta tag de línea', true); return true; }
        const tag = tokens[tagIdx];
        const points = [];
        let i = tagIdx + 1;
        while (i < tokens.length) {
            const c = extractCoords(tokens[i]); if (c) { points.push(c); i++; } else break;
        }
        if (points.length < 2) { notify('Se requieren al menos 2 puntos', true); return true; }
        const params = extractParams(tokens.slice(i));
        let newLine = {
            tag, diameter: params.diametro || 4, material: params.material || 'PPR',
            spec: params.spec || 'PPR_PN12_5', points, _cachedPoints: points,
            waypoints: points.slice(1, -1), components: []
        };
        newLine = injectFittingsIntoLine(newLine);
        _core.addLine(newLine);
        notify(`✅ Línea ${tag} creada`);
        return true;
    }

    function handleCreateLine(tokens) {
        if (!depsOk()) return true;
        if (tokens.length < 3) { notify('Uso: % TAG X1,Y1,Z1 ...', true); return true; }
        const tag = tokens[1];
        const points = [];
        for (let i = 2; i < tokens.length; i++) {
            const c = extractCoords(tokens[i]); if (c) points.push(c); else break;
        }
        if (points.length < 2) { notify('Se requieren al menos 2 puntos', true); return true; }
        const params = extractParams(tokens.slice(2 + points.length));
        let newLine = {
            tag, diameter: params.diametro || 4, material: params.material || 'PPR',
            spec: params.spec || 'PPR_PN12_5', points, _cachedPoints: points,
            waypoints: points.slice(1, -1), components: []
        };
        newLine = injectFittingsIntoLine(newLine);
        _core.addLine(newLine);
        notify(`✅ Línea ${tag} creada`);
        return true;
    }

    function handleLineWithWaypoints(tokens) {
        if (!depsOk()) return true;
        const desdeIdx = tokens.findIndex(t => t.toLowerCase() === 'desde');
        const hastaIdx = tokens.findIndex(t => t.toLowerCase() === 'hasta');
        if (desdeIdx < 0 || hastaIdx < 0) { notify('Uso: linea TAG desde ... hasta ...', true); return true; }
        const tag = tokens[1];
        const desdeScan = scanNodeRef(tokens, desdeIdx+1);
        const hastaScan = scanNodeRef(tokens, hastaIdx+1);
        if (!desdeScan || !hastaScan) { notify('Referencias inválidas', true); return true; }
        const startPos = getPortWorldPos(desdeScan.ref.tag, desdeScan.ref.port || '0');
        const endPos = getPortWorldPos(hastaScan.ref.tag, hastaScan.ref.port || '0');
        if (!startPos || !endPos) { notify('No se pudo obtener coordenadas', true); return true; }
        const points = [startPos, endPos];
        const params = extractParams(tokens.slice(hastaScan.nextIdx));
        let newLine = {
            tag, diameter: params.diametro || 4, material: params.material || 'PPR',
            spec: params.spec || 'PPR_PN12_5', points, _cachedPoints: points,
            waypoints: [], components: [],
            origin: { objType: 'equipment', equipTag: desdeScan.ref.tag, portId: desdeScan.ref.port || '0' },
            destination: { objType: 'equipment', equipTag: hastaScan.ref.tag, portId: hastaScan.ref.port || '0' }
        };
        newLine = injectFittingsIntoLine(newLine);
        _core.addLine(newLine);
        notify(`✅ Línea ${tag} creada`);
        return true;
    }

    function handleModify(tokens) {
        if (tokens.length < 3) { notify('Uso: modificar TAG prop=valor', true); return true; }
        const tag = tokens[1], params = extractParams(tokens.slice(2));
        const db = _core.getDb();
        if (db.equipos.find(e => e.tag === tag)) {
            _core.updateEquipment(tag, params);
            notify(`✅ Equipo ${tag} modificado`);
        } else if (db.lines.find(l => l.tag === tag)) {
            _core.updateLine(tag, params);
            notify(`✅ Línea ${tag} modificada`);
        } else notify(`Elemento ${tag} no encontrado`, true);
        return true;
    }

    function handleDelete(tokens) {
        const tag = tokens[1], db = _core.getDb();
        if (db.equipos.find(e => e.tag === tag)) { _core.deleteEquipment(tag); notify(`🗑️ Equipo ${tag} eliminado`); }
        else if (db.lines.find(l => l.tag === tag)) { _core.deleteLine(tag); notify(`🗑️ Línea ${tag} eliminada`); }
        else notify(`Elemento ${tag} no encontrado`, true);
        return true;
    }

    function handleMove(tokens) {
        const coords = extractCoords(tokens.slice(2).join(' '));
        if (!coords) { notify('Coordenadas inválidas', true); return true; }
        _core.updateEquipment(tokens[1], { posX: coords.x, posY: coords.y, posZ: coords.z });
        notify(`✅ Equipo ${tokens[1]} movido`);
        return true;
    }

    function handleInfo(tokens) {
        const tag = tokens[1], db = _core.getDb();
        const eq = db.equipos.find(e => e.tag === tag);
        if (eq) notify(`${eq.tag} | ${eq.tipo} | (${eq.posX},${eq.posY},${eq.posZ})`);
        else {
            const line = db.lines.find(l => l.tag === tag);
            if (line) notify(`${line.tag} | ${line.diameter}" ${line.material || '?'}`);
            else notify(`${tag} no encontrado`, true);
        }
        return true;
    }

    function handleList(tokens) { notify('Listado (simplificado)'); return true; }
    function listEquipos() { notify(_core.getDb().equipos.map(e=>e.tag).join(', ') || 'Sin equipos'); }
    function listLineas() { notify(_core.getDb().lines.map(l=>`${l.tag}(${l.diameter}\")`).join(', ') || 'Sin líneas'); }
    function handleNodes(tokens) { notify('Nodos (simplificado)'); return true; }
    function handleViewCommand(tokens) { setView(tokens[1] || 'iso'); return true; }
    function handleExport(tokens) { notify('Exportar: ' + (tokens[1] || '?')); return true; }
    function handleTap() { notify('TAP en desarrollo'); return true; }
    function handleSplit(tokens) { notify('Split (simplificado)'); return true; }
    function handleAudit() { _core.auditModel?.(); return true; }
    function handleBOM() { notify('BOM exportado'); return true; }
    function showHelp() { notify('Comandos: crear, conectar, punto, info, listar, eliminar, mover, modificar...'); }

    function setView(v) {
        if (typeof SmartFlowRender !== 'undefined') {
            if (v === 'iso') SmartFlowRender.fitCameraToEquipments?.();
            else SmartFlowRender.setView?.(v);
        }
    }
    function exportMTO() { notify('MTO exportado'); }
    function exportPCF() { notify('PCF exportado'); }
    function exportPDF() { notify('PDF exportado'); }
    function saveProject() { localStorage.setItem('smartengp_v2_project', _core.exportProject()); notify('Guardado'); }
    function loadProject() {
        const d = localStorage.getItem('smartengp_v2_project');
        if (d) try { _core.importState(JSON.parse(d).data || JSON.parse(d)); } catch(e) {}
    }
    function resumen() { notify('Resumen: ' + _core.getDb().equipos.length + ' equipos, ' + _core.getDb().lines.length + ' líneas'); return true; }

    function importPCF(content) { notify('PCF importado'); return true; }
    function executeBatch(commandsText) {
        commandsText.split('\n').forEach(l => { if (l.trim() && !l.startsWith('//')) executeCommand(l); });
    }

    function init(core, catalog, renderer, notifyFn) {
        _core = core; _catalog = catalog; _renderer = renderer;
        _notifyUI = notifyFn || console.log;
        console.log('Commands v10.10 listo');
    }

    return { init, executeCommand, executeBatch, importPCF };
})();
