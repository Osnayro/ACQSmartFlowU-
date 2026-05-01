
// ============================================================
// MÓDULO 4: SMARTFLOW COMMANDS (Intent Engine + Legacy) - v5.3 FULL
// Archivo: js/commands.js
// ============================================================

const SmartFlowCommands = (function() {
    
    let _core = null;
    let _catalog = null;
    let _renderer = null;
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

    function getIntent(word) {
        if (!word) return null;
        return IntentDictionary[word.toLowerCase()] || null;
    }

    function normalizeCommand(cmd) {
        const parts = cmd.trim().split(/\s+/);
        if (parts.length === 0) return cmd;
        const intent = getIntent(parts[0]);
        if (intent) { parts[0] = intent; return parts.join(' '); }
        return cmd;
    }

    // -------------------- UTILIDADES DE EXTRACCIÓN FLEXIBLE --------------------
    function extractCoords(str) {
        const m = str.match(/\((-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)\)/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : null;
    }

    function extractValue(parts, keys) {
        if (!Array.isArray(parts)) return null;
        for (let i = 0; i < parts.length; i++) {
            if (keys.includes(parts[i].toLowerCase()) && i + 1 < parts.length) {
                return parts[i + 1];
            }
        }
        return null;
    }

    // -------------------- NOTIFICACIÓN MEJORADA (VOZ + VISUAL) --------------------
    function notifyWithVoice(message, isError = false) {
        if (typeof _notifyUI === 'function') _notifyUI(message, isError);
        const statusEl = document.getElementById('statusMsg');
        if (statusEl) {
            statusEl.innerText = message;
            statusEl.style.color = isError ? '#ef4444' : '#00f2ff';
        }
        if (typeof SmartFlowAccessibility !== 'undefined' && SmartFlowAccessibility.isVoiceEnabled()) {
            SmartFlowAccessibility.speak(message);
        }
    }

    // ==================== COMANDOS INFO ====================
    function parseInfo(cmd) {
        const parts = cmd.trim().split(/\s+/);
        if (parts[0] !== 'info') return false;
        if (parts.length < 2) {
            notifyWithVoice("Uso: info line [TAG] | info equipment [TAG] | info component [TAG]", true);
            return true;
        }
        const type = parts[1].toLowerCase();
        const tag = parts[2];
        if (!tag) { notifyWithVoice(`Especifique el tag del ${type}`, true); return true; }
        if (type === 'line' || type === 'línea' || type === 'linea') return infoLine(tag);
        if (type === 'equipment' || type === 'equipo') return infoEquipment(tag);
        if (type === 'component' || type === 'componente') return infoComponent(tag);
        notifyWithVoice(`Tipo desconocido: ${type}. Use line, equipment o component`, true);
        return true;
    }

    function infoLine(tag) {
        if (!_core) { notifyWithVoice("Error: Core no inicializado", true); return true; }
        const db = _core.getDb();
        const line = db.lines.find(l => l.tag === tag);
        if (!line) { notifyWithVoice(`Línea ${tag} no encontrada`, true); return true; }
        const pts = line._cachedPoints || line.points3D;
        const numPuntos = pts ? pts.length : 0;
        let origen = "Ninguno", destino = "Ninguno";
        if (line.origin) {
            const obj = db.equipos.find(e => e.tag === line.origin.equipTag) || db.lines.find(l => l.tag === line.origin.equipTag);
            origen = `${line.origin.equipTag}.${line.origin.portId} (${obj?.tipo || 'line'})`;
        }
        if (line.destination) {
            const obj = db.equipos.find(e => e.tag === line.destination.equipTag) || db.lines.find(l => l.tag === line.destination.equipTag);
            destino = `${line.destination.equipTag}.${line.destination.portId} (${obj?.tipo || 'line'})`;
        }
        const msg = `📋 Línea ${tag} | Diámetro: ${line.diameter || '?'}" | Material: ${line.material || 'N/D'} | Spec: ${line.spec || 'N/D'} | Puntos: ${numPuntos} | Componentes: ${line.components?.length || 0} | Origen: ${origen} | Destino: ${destino}`;
        notifyWithVoice(msg, false);
        return true;
    }

    function infoEquipment(tag) {
        if (!_core) { notifyWithVoice("Error: Core no inicializado", true); return true; }
        const db = _core.getDb();
        const eq = db.equipos.find(e => e.tag === tag);
        if (!eq) { notifyWithVoice(`Equipo ${tag} no encontrado`, true); return true; }
        const tipo = eq.tipo;
        const material = eq.material || 'N/D';
        const pos = `(${eq.posX}, ${eq.posY}, ${eq.posZ})`;
        const dimensiones = `Diam: ${eq.diametro || 'N/D'} Altura: ${eq.altura || 'N/D'}`;
        const puertos = eq.puertos ? eq.puertos.map(p => p.id).join(', ') : 'Ninguno';
        const msg = `📋 Equipo ${tag} | Tipo: ${tipo} | Material: ${material} | Posición: ${pos} | ${dimensiones} | Puertos: ${puertos}`;
        notifyWithVoice(msg, false);
        return true;
    }

    function infoComponent(tag) {
        if (!_core) { notifyWithVoice("Error: Core no inicializado", true); return true; }
        const db = _core.getDb();
        let foundComp = null, foundLine = null;
        for (let line of db.lines) {
            if (line.components) {
                const comp = line.components.find(c => c.tag === tag);
                if (comp) { foundComp = comp; foundLine = line; break; }
            }
        }
        if (!foundComp) { notifyWithVoice(`Componente ${tag} no encontrado`, true); return true; }
        const tipo = foundComp.type;
        const descripcion = foundComp.description || 'Sin descripción';
        const posParam = foundComp.param ? `Parámetro: ${foundComp.param.toFixed(2)}` : '';
        const msg = `📋 Componente ${tag} | Tipo: ${tipo} | Descripción: ${descripcion} | Pertenece a línea: ${foundLine.tag} | ${posParam}`;
        notifyWithVoice(msg, false);
        return true;
    }

    // --- CREATE (CON SINCRONIZACIÓN AL PANEL) ---
    function parseCreate(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0] !== 'create') return false;
        const tipo = parts[1]; const tag = parts[2];
        if (parts[3] !== 'at') return false;
        let coordStr = '';
        for (let i = 4; i < parts.length; i++) { coordStr += parts[i]; if (parts[i].includes(')')) break; }
        const coords = coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
        if (!coords) return false;
        const x = parseFloat(coords[1]), y = parseFloat(coords[2]), z = parseFloat(coords[3]);
        let params = {};
        for (let i = 5; i < parts.length; i++) {
            let key = parts[i];
            if (key === 'diam' || key === 'diametro') params.diametro = parseFloat(parts[++i]);
            else if (key === 'height' || key === 'altura') params.altura = parseFloat(parts[++i]);
            else if (key === 'largo') params.largo = parseFloat(parts[++i]);
            else if (key === 'material') params.material = parts[++i].toUpperCase();
            else if (key === 'spec') params.spec = parts[++i];
        }
        const equipoDef = _catalog.getEquipment(tipo);
        if (!equipoDef) { notifyWithVoice(`Tipo de equipo desconocido: ${tipo}`, true); return true; }
        const equipo = _catalog.createEquipment(tipo, tag, x, y, z, params);
        if (equipo) {
            _core.addEquipment(equipo);
            if (_core.setSelected) _core.setSelected({ type: 'equipment', obj: equipo });
            notifyWithVoice(`Equipo ${tag} (${equipoDef.nombre}) creado`, false);
        }
        return true;
    }

    function parseCreateLine(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0] !== 'create' || parts[1] !== 'line') return false;
        const tag = parts[2];
        let diameter = 4, material = 'PPR', spec = 'PPR_PN12_5', points = [], i = 3;
        while (i < parts.length) {
            if (parts[i] === 'diameter' || parts[i] === 'diametro') diameter = parseFloat(parts[++i]);
            else if (parts[i] === 'material') material = parts[++i].toUpperCase();
            else if (parts[i] === 'spec') spec = parts[++i];
            else if (parts[i] === 'route' || parts[i] === 'ruta') {
                i++;
                while (i < parts.length) {
                    const coordStr = parts[i];
                    const m = coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                    if (m) points.push({ x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) });
                    else break;
                    i++;
                }
                continue;
            }
            i++;
        }
        if (points.length < 2) { notifyWithVoice("Error: Se requieren al menos 2 puntos", true); return true; }
        const nuevaLinea = { tag, diameter, material, spec, _cachedPoints: points, waypoints: points.slice(1, -1), components: [] };
        _core.addLine(nuevaLinea);
        if (_core.setSelected) _core.setSelected({ type: 'line', obj: nuevaLinea });
        notifyWithVoice(`Línea ${tag} creada`, false);
        if (typeof SmartFlowRouter !== 'undefined' && SmartFlowRouter.procesarInterseccionesDeLinea) {
            SmartFlowRouter.procesarInterseccionesDeLinea(nuevaLinea);
        }
        _renderUI();
        return true;
    }

    function parseCreateManifold(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0] !== 'create' || parts[1] !== 'manifold') return false;
        let idx = 2; const tag = parts[idx++];
        if (parts[idx] !== 'at') return false; idx++;
        const coords = parts[idx++].match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
        if (!coords) return false;
        const x = parseFloat(coords[1]), y = parseFloat(coords[2]), z = parseFloat(coords[3]);
        let numEntradas = 2, spacing = 3000, outputPos = 'center', diametro = 4, material = 'PPR', spec = 'PPR_PN12_5';
        while (idx < parts.length) {
            const key = parts[idx++].toLowerCase();
            if (key === 'entries' || key === 'entradas') numEntradas = parseInt(parts[idx++]);
            else if (key === 'spacing' || key === 'espaciado') spacing = parseFloat(parts[idx++]);
            else if (key === 'output' || key === 'salida') outputPos = parts[idx++].toLowerCase();
            else if (key === 'diameter' || key === 'diametro') diametro = parseFloat(parts[idx++]);
            else if (key === 'material') material = parts[idx++].toUpperCase();
            else if (key === 'spec') spec = parts[idx++];
        }
        const colector = { tag, tipo: 'colector', posX: x, posY: y, posZ: z, diametro, altura: 0, largo: (numEntradas - 1) * spacing, material, spec, num_entradas: numEntradas, spacing, salida_pos: outputPos, diametro_entrada: diametro, diametro_salida: diametro };
        const def = _catalog.getEquipment('colector');
        colector.puertos = def.generarPuertos(colector);
        _core.addEquipment(colector);
        if (_core.setSelected) _core.setSelected({ type: 'equipment', obj: colector });
        notifyWithVoice(`Colector ${tag} creado`, false);
        return true;
    }

    // --- Helper para encontrar codo según material ---
    function findElbowForLine(material, diameter, angleDeg) {
        const mat = material.toUpperCase();
        const is90 = (Math.abs(angleDeg - 90) < 10);
        const is45 = (Math.abs(angleDeg - 45) < 10);
        if (!is90 && !is45) return null;

        if (mat.includes('PPR')) {
            return is90 ? 'ELBOW_90_PPR' : 'ELBOW_45_PPR';
        } else if (mat.includes('HDPE')) {
            return is90 ? 'ELBOW_90_HDPE' : null;
        } else if (mat.includes('PVC')) {
            return is90 ? 'ELBOW_90_PVC' : null;
        } else if (mat.includes('ACERO')) {
            return is90 ? 'ELBOW_90_LR_CS' : 'ELBOW_45_CS';
        } else if (mat.includes('INOXIDABLE') || mat.includes('INOX')) {
            return is90 ? 'ELBOW_90_SANITARY' : null;
        }
        return is90 ? 'ELBOW_90_LR_CS' : 'ELBOW_45_CS';
    }

    // --- CONNECT (con herencia, auto‑codo siempre, y detección inteligente de puerto omitido) ---
    function parseConnect(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0] !== 'connect' && parts[0] !== 'conectar') return false;
        const fromEquip = parts[1], fromNozzle = parts[2];
        if (parts[3] !== 'to' && parts[3] !== 'a') return false;
        const toEquip = parts[4];
        let toNozzleRaw = parts[5];
        let diameter = 4, material = 'PPR', spec = 'PPR_PN12_5';
        // Detectar si el siguiente token después del destino parece un parámetro en lugar de un puerto
        if (toNozzleRaw && isNaN(parseFloat(toNozzleRaw)) && toNozzleRaw !== '0' && toNozzleRaw !== '1' && !/^[A-Za-z]/.test(toNozzleRaw?.[0]||'')) {
            // es un parámetro; no se especificó puerto → forzamos a vacío
            toNozzleRaw = '';
        }
        for (let i = 6; i < parts.length; i++) {
            if (parts[i] === 'diameter' || parts[i] === 'diametro') diameter = parseFloat(parts[++i]);
            else if (parts[i] === 'material') material = parts[++i].toUpperCase();
            else if (parts[i] === 'spec') spec = parts[++i];
        }

        const db = _core.getDb();
        const fromObj = db.equipos.find(e => e.tag === fromEquip) || db.lines.find(l => l.tag === fromEquip);
        const toObj = db.equipos.find(e => e.tag === toEquip) || db.lines.find(l => l.tag === toEquip);
        if (!fromObj || !toObj) { notifyWithVoice("Objeto no encontrado", true); return true; }

        // --- ORIGEN: manejar puertos virtuales 0/1 en líneas ---
        let startPos = null;
        let fromDiameter = 4;
        if (fromObj._cachedPoints && (fromNozzle === '0' || fromNozzle === '1')) {
            const pts = fromObj._cachedPoints;
            if (pts && pts.length >= 2) {
                startPos = fromNozzle === '0' ? { ...pts[0] } : { ...pts[pts.length - 1] };
                fromDiameter = fromObj.diameter || 4;
            } else {
                notifyWithVoice("La línea origen no tiene geometría válida", true);
                return true;
            }
        } else {
            const nzFrom = fromObj.puertos?.find(n => n.id === fromNozzle);
            if (!nzFrom) { notifyWithVoice("Puerto origen no encontrado", true); return true; }
            fromDiameter = nzFrom.diametro || 4;
            if (typeof SmartFlowRouter !== 'undefined' && SmartFlowRouter.getPortPosition) {
                startPos = SmartFlowRouter.getPortPosition(fromObj, fromNozzle);
            } else {
                const basePos = fromObj.posX !== undefined ? { x: fromObj.posX, y: fromObj.posY, z: fromObj.posZ } : (fromObj._cachedPoints ? fromObj._cachedPoints[0] : {x:0, y:0, z:0});
                startPos = {
                    x: basePos.x + (nzFrom.relX || 0),
                    y: basePos.y + (nzFrom.relY || 0),
                    z: basePos.z + (nzFrom.relZ || 0)
                };
            }
        }
        if (!startPos) { notifyWithVoice("No se pudo obtener la posición del puerto origen", true); return true; }

        const isFromLine = fromObj._cachedPoints || fromObj.points3D;
        const isLine = toObj._cachedPoints || toObj.points3D;

        // --- AUTO‑DETECCIÓN DEL PUNTO MÁS CERCANO SI NO SE ESPECIFICÓ PUERTO ---
        if (isLine && (!toNozzleRaw || toNozzleRaw === '')) {
            const pts = toObj._cachedPoints || toObj.points3D;
            if (!pts || pts.length < 2) {
                notifyWithVoice("La línea destino no tiene geometría", true);
                return true;
            }
            let minDist = Infinity, bestPoint = pts[0];
            let lengths = [];
            let totalLen = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
                lengths.push(d);
                totalLen += d;
            }
            if (totalLen === 0) {
                notifyWithVoice("La línea destino tiene longitud cero", true);
                return true;
            }
            let accum = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i+1];
                const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
                const ap = { x: startPos.x - a.x, y: startPos.y - a.y, z: startPos.z - a.z };
                const len2 = ab.x*ab.x + ab.y*ab.y + ab.z*ab.z;
                let t = 0;
                if (len2 !== 0) {
                    t = (ap.x*ab.x + ap.y*ab.y + ap.z*ab.z) / len2;
                    t = Math.max(0, Math.min(1, t));
                }
                const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
                const dist = Math.hypot(startPos.x - proj.x, startPos.y - proj.y, startPos.z - proj.z);
                if (dist < minDist) {
                    minDist = dist;
                    bestPoint = proj;
                }
                accum += lengths[i];
            }

            if (typeof SmartFlowRouter === 'undefined' || typeof SmartFlowRouter.insertarAccesorioEnLinea !== 'function') {
                notifyWithVoice("Router no disponible", true);
                return true;
            }

            const puertoId = SmartFlowRouter.insertarAccesorioEnLinea(toEquip, bestPoint, diameter, true);
            if (!puertoId) {
                notifyWithVoice("No se pudo insertar el accesorio automáticamente. Verifique que el catálogo tenga el componente adecuado.", true);
                return true;
            }

            const endPos = bestPoint;
            const newTag = `L-${(db.lines?.length || 0) + 1}`;
            const newComponents = [];

            // --- AUTO‑CODO EN ORIGEN (extremo de línea) ---
            if (isFromLine && (fromNozzle === '0' || fromNozzle === '1')) {
                const ptsFrom = fromObj._cachedPoints || fromObj.points3D;
                if (ptsFrom && ptsFrom.length >= 2) {
                    let lineDir;
                    if (fromNozzle === '0') {
                        lineDir = { dx: ptsFrom[1].x - ptsFrom[0].x, dy: ptsFrom[1].y - ptsFrom[0].y, dz: ptsFrom[1].z - ptsFrom[0].z };
                    } else {
                        const n = ptsFrom.length;
                        lineDir = { dx: ptsFrom[n-1].x - ptsFrom[n-2].x, dy: ptsFrom[n-1].y - ptsFrom[n-2].y, dz: ptsFrom[n-1].z - ptsFrom[n-2].z };
                    }
                    const len = Math.hypot(lineDir.dx, lineDir.dy, lineDir.dz) || 1;
                    lineDir = { dx: lineDir.dx/len, dy: lineDir.dy/len, dz: lineDir.dz/len };

                    const newStartDir = {
                        dx: endPos.x - startPos.x,
                        dy: endPos.y - startPos.y,
                        dz: endPos.z - startPos.z
                    };
                    const newLen = Math.hypot(newStartDir.dx, newStartDir.dy, newStartDir.dz) || 1;
                    const newDir = { dx: newStartDir.dx/newLen, dy: newStartDir.dy/newLen, dz: newStartDir.dz/newLen };

                    const dot = Math.abs(lineDir.dx*newDir.dx + lineDir.dy*newDir.dy + lineDir.dz*newDir.dz);
                    const angleRad = Math.acos(Math.min(1, dot));
                    const angleDeg = angleRad * 180 / Math.PI;

                    if (angleDeg > 15) {
                        const elbowId = findElbowForLine(material, diameter, angleDeg);
                        if (elbowId) {
                            newComponents.push({
                                type: elbowId,
                                tag: elbowId + '-' + Date.now().toString().slice(-6),
                                param: 0.0
                            });
                            notifyWithVoice(`✅ Codo ${angleDeg.toFixed(0)}° (${elbowId}) insertado al inicio de ${newTag}`, false);
                        }
                    }
                }
            }

            const nuevaLinea = {
                tag: newTag, diameter, material, spec,
                origin: { objType: isFromLine ? 'line' : 'equipment', equipTag: fromEquip, portId: fromNozzle },
                destination: { objType: 'line', equipTag: toEquip, portId: puertoId },
                waypoints: [],
                _cachedPoints: [startPos, endPos],
                components: newComponents
            };
            _core.addLine(nuevaLinea);
            if (_core.setSelected) _core.setSelected({ type: 'line', obj: nuevaLinea });
            const nzFrom = fromObj.puertos?.find(n => n.id === fromNozzle);
            if (nzFrom) nzFrom.connectedLine = newTag;
            const toObjUpd = db.lines.find(l => l.tag === toEquip);
            if (toObjUpd?.puertos) {
                const p = toObjUpd.puertos.find(p => p.id === puertoId);
                if (p) p.connectedLine = newTag;
            }
            _core.syncPhysicalData(); _core._saveState(); _renderUI();
            notifyWithVoice(`✅ Conectado ${fromEquip}.${fromNozzle} a ${toEquip} en el punto más cercano`, false);
            return true;
        }

        const numPos = parseFloat(toNozzleRaw);
        const isNumeric = !isNaN(numPos) && isFinite(numPos);
        let posRelativa = isNumeric ? Math.min(1, Math.max(0, numPos)) : null;

        // Herencia de diámetro, material y spec desde el objeto destino si no se especificaron explícitamente
        if (isLine && toObj.diameter && !parts.slice(6).some(p => p === 'diameter' || p === 'diametro')) {
            diameter = toObj.diameter;
        }
        if (!parts.slice(6).some(p => p === 'material')) {
            if (toObj.material) material = toObj.material;
            if (toObj.spec) spec = toObj.spec;
        }

        // Si la posición numérica del destino es un extremo, la tratamos como puerto virtual
        if (isLine && posRelativa !== null && (posRelativa <= 0.01 || posRelativa >= 0.99)) {
            toNozzleRaw = posRelativa <= 0.01 ? '0' : '1';
            posRelativa = null;
        }

        const newTag = `L-${(db.lines?.length || 0) + 1}`;
        let endPos = null;
        let newComponents = [];
        let nzTo = null;

        // Obtener diámetro de destino
        let toDiameter = diameter;
        if (isLine && (toNozzleRaw === '0' || toNozzleRaw === '1')) {
            toDiameter = toObj.diameter || 4;
        } else if (toObj.puertos) {
            const port = toObj.puertos.find(p => p.id === toNozzleRaw);
            if (port) toDiameter = port.diametro || 4;
        }

        if (isLine && posRelativa !== null) {
            // Conexión a punto intermedio: se inserta Tee
            if (typeof SmartFlowRouter === 'undefined' || typeof SmartFlowRouter.insertarAccesorioEnLinea !== 'function') {
                notifyWithVoice("Router no disponible", true);
                return true;
            }
            const pts = toObj._cachedPoints || toObj.points3D;
            if (!pts || pts.length < 2) { notifyWithVoice("Geometría inválida", true); return true; }
            let totalLen = 0, lengths = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
                lengths.push(d); totalLen += d;
            }
            const targetLen = totalLen * posRelativa;
            let accum = 0, segIdx = 0, t = 0;
            for (let i = 0; i < lengths.length; i++) {
                if (accum + lengths[i] >= targetLen || i === lengths.length - 1) {
                    segIdx = i; t = (targetLen - accum) / (lengths[i] || 1); break;
                }
                accum += lengths[i];
            }
            const pA = pts[segIdx], pB = pts[segIdx + 1];
            const punto = { x: pA.x + (pB.x - pA.x) * t, y: pA.y + (pB.y - pA.y) * t, z: pA.z + (pB.z - pA.z) * t };
            const puertoId = SmartFlowRouter.insertarAccesorioEnLinea(toEquip, punto, diameter, true);
            if (!puertoId) { notifyWithVoice("No se pudo insertar el accesorio", true); return true; }
            endPos = punto;
            const toObjUpd = db.lines.find(l => l.tag === toEquip);
            if (toObjUpd?.puertos) {
                nzTo = toObjUpd.puertos.find(p => p.id === puertoId);
            }

            // --- AUTO‑CODO EN ORIGEN (extremo de línea) ---
            if (isFromLine && (fromNozzle === '0' || fromNozzle === '1')) {
                const ptsFrom = fromObj._cachedPoints || fromObj.points3D;
                if (ptsFrom && ptsFrom.length >= 2) {
                    let lineDir;
                    if (fromNozzle === '0') {
                        lineDir = { dx: ptsFrom[1].x - ptsFrom[0].x, dy: ptsFrom[1].y - ptsFrom[0].y, dz: ptsFrom[1].z - ptsFrom[0].z };
                    } else {
                        const n = ptsFrom.length;
                        lineDir = { dx: ptsFrom[n-1].x - ptsFrom[n-2].x, dy: ptsFrom[n-1].y - ptsFrom[n-2].y, dz: ptsFrom[n-1].z - ptsFrom[n-2].z };
                    }
                    const len = Math.hypot(lineDir.dx, lineDir.dy, lineDir.dz) || 1;
                    lineDir = { dx: lineDir.dx/len, dy: lineDir.dy/len, dz: lineDir.dz/len };

                    const newStartDir = {
                        dx: endPos.x - startPos.x,
                        dy: endPos.y - startPos.y,
                        dz: endPos.z - startPos.z
                    };
                    const newLen = Math.hypot(newStartDir.dx, newStartDir.dy, newStartDir.dz) || 1;
                    const newDir = { dx: newStartDir.dx/newLen, dy: newStartDir.dy/newLen, dz: newStartDir.dz/newLen };

                    const dot = Math.abs(lineDir.dx*newDir.dx + lineDir.dy*newDir.dy + lineDir.dz*newDir.dz);
                    const angleRad = Math.acos(Math.min(1, dot));
                    const angleDeg = angleRad * 180 / Math.PI;

                    if (angleDeg > 15) {
                        const elbowId = findElbowForLine(material, diameter, angleDeg);
                        if (elbowId) {
                            newComponents.push({
                                type: elbowId,
                                tag: elbowId + '-' + Date.now().toString().slice(-6),
                                param: 0.0
                            });
                            notifyWithVoice(`✅ Codo ${angleDeg.toFixed(0)}° (${elbowId}) insertado al inicio de ${newTag}`, false);
                        }
                    }
                }
            }

            const nuevaLinea = {
                tag: newTag, diameter, material, spec,
                origin: { objType: isFromLine ? 'line' : 'equipment', equipTag: fromEquip, portId: fromNozzle },
                destination: { objType: 'line', equipTag: toEquip, portId: puertoId },
                waypoints: [],
                _cachedPoints: [startPos, endPos],
                components: newComponents
            };
            _core.addLine(nuevaLinea);
            if (_core.setSelected) _core.setSelected({ type: 'line', obj: nuevaLinea });
            const nzFrom = fromObj.puertos?.find(n => n.id === fromNozzle);
            if (nzFrom) nzFrom.connectedLine = newTag;
            if (nzTo) nzTo.connectedLine = newTag;
            _core.syncPhysicalData(); _core._saveState(); _renderUI();
            notifyWithVoice(`✅ Conectado ${fromEquip}.${fromNozzle} a ${toEquip} en ${posRelativa.toFixed(2)}`, false);
            return true;
        } else {
            // Conexión a puerto concreto o extremo de línea
            if (isLine && (toNozzleRaw === '0' || toNozzleRaw === '1')) {
                const pts = toObj._cachedPoints || toObj.points3D;
                if (!pts || pts.length < 2) { notifyWithVoice("La línea destino no tiene geometría", true); return true; }
                if (toNozzleRaw === '0') endPos = { ...pts[0] };
                else endPos = { ...pts[pts.length - 1] };
            } else {
                if (!toObj.puertos) toObj.puertos = [];
                nzTo = toObj.puertos?.find(n => n.id === toNozzleRaw);
                if (!nzTo) { notifyWithVoice("Puerto destino no encontrado", true); return true; }

                if (typeof SmartFlowRouter !== 'undefined' && SmartFlowRouter.getPortPosition) {
                    endPos = SmartFlowRouter.getPortPosition(toObj, toNozzleRaw);
                } else {
                    const basePos = toObj.posX !== undefined ? { x: toObj.posX, y: toObj.posY, z: toObj.posZ } : (toObj._cachedPoints ? toObj._cachedPoints[0] : {x:0, y:0, z:0});
                    endPos = {
                        x: basePos.x + (nzTo.relX || 0),
                        y: basePos.y + (nzTo.relY || 0),
                        z: basePos.z + (nzTo.relZ || 0)
                    };
                }
            }

            // --- MANEJO DE DIFERENCIA DE DIÁMETROS ---
            if (isFromLine && (fromNozzle === '0' || fromNozzle === '1')) {
                const diffDiam = Math.abs(fromDiameter - diameter) > 0.1;
                if (diffDiam) {
                    const puertoInsertado = SmartFlowRouter.insertarAccesorioEnLinea(fromEquip, startPos, diameter, false);
                    if (!puertoInsertado) {
                        const reductorId = (material.toUpperCase().includes('PPR')) ? 'CONCENTRIC_REDUCER_PPR' : 'CONCENTRIC_REDUCER_CS';
                        newComponents.push({
                            type: reductorId,
                            tag: reductorId + '-' + Date.now().toString().slice(-6),
                            param: 0.0
                        });
                        notifyWithVoice(`⚠️ No se pudo insertar reductor en ${fromEquip}. Se añadirá al inicio de ${newTag}`, false);
                    }
                }
            }
            if (isLine && (toNozzleRaw === '0' || toNozzleRaw === '1')) {
                const diffDiam = Math.abs(toDiameter - diameter) > 0.1;
                if (diffDiam) {
                    const puertoInsertado = SmartFlowRouter.insertarAccesorioEnLinea(toEquip, endPos, diameter, false);
                    if (!puertoInsertado) {
                        const reductorId = (material.toUpperCase().includes('PPR')) ? 'CONCENTRIC_REDUCER_PPR' : 'CONCENTRIC_REDUCER_CS';
                        newComponents.push({
                            type: reductorId,
                            tag: reductorId + '-' + Date.now().toString().slice(-6),
                            param: 1.0
                        });
                        notifyWithVoice(`⚠️ No se pudo insertar reductor en ${toEquip}. Se añadirá al final de ${newTag}`, false);
                    }
                }
            }

            // --- AUTO‑CODO EN ORIGEN (extremo de línea) ---
            if (isFromLine && (fromNozzle === '0' || fromNozzle === '1')) {
                const ptsFrom = fromObj._cachedPoints || fromObj.points3D;
                if (ptsFrom && ptsFrom.length >= 2) {
                    let lineDir;
                    if (fromNozzle === '0') {
                        lineDir = { dx: ptsFrom[1].x - ptsFrom[0].x, dy: ptsFrom[1].y - ptsFrom[0].y, dz: ptsFrom[1].z - ptsFrom[0].z };
                    } else {
                        const n = ptsFrom.length;
                        lineDir = { dx: ptsFrom[n-1].x - ptsFrom[n-2].x, dy: ptsFrom[n-1].y - ptsFrom[n-2].y, dz: ptsFrom[n-1].z - ptsFrom[n-2].z };
                    }
                    const len = Math.hypot(lineDir.dx, lineDir.dy, lineDir.dz) || 1;
                    lineDir = { dx: lineDir.dx/len, dy: lineDir.dy/len, dz: lineDir.dz/len };

                    const newStartDir = {
                        dx: endPos.x - startPos.x,
                        dy: endPos.y - startPos.y,
                        dz: endPos.z - startPos.z
                    };
                    const newLen = Math.hypot(newStartDir.dx, newStartDir.dy, newStartDir.dz) || 1;
                    const newDir = { dx: newStartDir.dx/newLen, dy: newStartDir.dy/newLen, dz: newStartDir.dz/newLen };

                    const dot = Math.abs(lineDir.dx*newDir.dx + lineDir.dy*newDir.dy + lineDir.dz*newDir.dz);
                    const angleRad = Math.acos(Math.min(1, dot));
                    const angleDeg = angleRad * 180 / Math.PI;

                    if (angleDeg > 15) {
                        const elbowId = findElbowForLine(material, diameter, angleDeg);
                        if (elbowId) {
                            newComponents.push({
                                type: elbowId,
                                tag: elbowId + '-' + Date.now().toString().slice(-6),
                                param: 0.0
                            });
                            notifyWithVoice(`✅ Codo ${angleDeg.toFixed(0)}° (${elbowId}) insertado al inicio de ${newTag}`, false);
                        }
                    }
                }
            }

            // --- AUTO‑CODO EN DESTINO (extremo de línea) ---
            if (isLine && (toNozzleRaw === '0' || toNozzleRaw === '1')) {
                const pts = toObj._cachedPoints || toObj.points3D;
                if (pts && pts.length >= 2) {
                    let lineDir;
                    if (toNozzleRaw === '0') {
                        lineDir = { dx: pts[1].x - pts[0].x, dy: pts[1].y - pts[0].y, dz: pts[1].z - pts[0].z };
                    } else {
                        const n = pts.length;
                        lineDir = { dx: pts[n-1].x - pts[n-2].x, dy: pts[n-1].y - pts[n-2].y, dz: pts[n-1].z - pts[n-2].z };
                    }
                    const len = Math.hypot(lineDir.dx, lineDir.dy, lineDir.dz) || 1;
                    lineDir = { dx: lineDir.dx/len, dy: lineDir.dy/len, dz: lineDir.dz/len };

                    const newArriveDir = {
                        dx: endPos.x - startPos.x,
                        dy: endPos.y - startPos.y,
                        dz: endPos.z - startPos.z
                    };
                    const newLen = Math.hypot(newArriveDir.dx, newArriveDir.dy, newArriveDir.dz) || 1;
                    const newDir = { dx: newArriveDir.dx/newLen, dy: newArriveDir.dy/newLen, dz: newArriveDir.dz/newLen };

                    const dot = Math.abs(lineDir.dx*newDir.dx + lineDir.dy*newDir.dy + lineDir.dz*newDir.dz);
                    const angleRad = Math.acos(Math.min(1, dot));
                    const angleDeg = angleRad * 180 / Math.PI;

                    if (angleDeg > 15) {
                        const elbowId = findElbowForLine(material, diameter, angleDeg);
                        if (elbowId) {
                            newComponents.push({
                                type: elbowId,
                                tag: elbowId + '-' + Date.now().toString().slice(-6),
                                param: 1.0
                            });
                            notifyWithVoice(`✅ Codo ${angleDeg.toFixed(0)}° (${elbowId}) insertado al final de ${newTag}`, false);
                        }
                    }
                }
            }

            const nuevaLinea = {
                tag: newTag, diameter, material, spec,
                origin: { objType: isFromLine ? 'line' : 'equipment', equipTag: fromEquip, portId: fromNozzle },
                destination: { objType: isLine ? 'line' : 'equipment', equipTag: toEquip, portId: toNozzleRaw },
                waypoints: [],
                _cachedPoints: [startPos, endPos],
                components: newComponents
            };
            _core.addLine(nuevaLinea);
            if (_core.setSelected) _core.setSelected({ type: 'line', obj: nuevaLinea });
            const nzFrom = fromObj.puertos?.find(n => n.id === fromNozzle);
            if (nzFrom) nzFrom.connectedLine = newTag;
            if (nzTo) nzTo.connectedLine = newTag;
            _core.syncPhysicalData(); _core._saveState(); _renderUI();
            notifyWithVoice(`✅ Conectado ${fromEquip}.${fromNozzle} a ${toEquip}.${toNozzleRaw}`, false);
            return true;
        }
    }

    // --- ROUTE (COMANDO) ---
    function parseRoute(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0] !== 'route' && parts[0] !== 'ruta') return false;
        if (parts[1] !== 'from' && parts[1] !== 'desde') return false;
        const fromEquip = parts[2], fromNozzle = parts[3];
        if (parts[4] !== 'to' && parts[4] !== 'a' && parts[4] !== 'hasta') return false;
        const toEquip = parts[5];
        let toNozzle = null, nextIdx = 6;
        if (nextIdx < parts.length && !parts[nextIdx].startsWith('diam') && parts[nextIdx] !== 'material' && parts[nextIdx] !== 'spec') {
            toNozzle = parts[nextIdx]; nextIdx++;
        }
        let diameter = 3, material = 'PPR', spec = 'PPR_PN12_5';
        for (let i = nextIdx; i < parts.length; i++) {
            if (parts[i] === 'diameter' || parts[i] === 'diametro') diameter = parseFloat(parts[++i]);
            else if (parts[i] === 'material') material = parts[++i].toUpperCase();
            else if (parts[i] === 'spec') spec = parts[++i];
        }
        if (typeof SmartFlowRouter !== 'undefined') {
            SmartFlowRouter.routeBetweenPorts(fromEquip, fromNozzle, toEquip, toNozzle, diameter, material, spec);
        } else {
            notifyWithVoice("Módulo Router no disponible.", true);
        }
        return true;
    }

    // --- DELETE ---
    function parseDelete(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0] !== 'delete' && parts[0] !== 'eliminar') return false;
        const type = parts[1], tag = parts[2];
        if (type === 'equipment' || type === 'equipo') {
            const db = _core.getDb();
            const index = db.equipos.findIndex(e => e.tag === tag);
            if (index === -1) { notifyWithVoice(`Equipo ${tag} no encontrado`, true); return true; }
            db.equipos.splice(index, 1);
            db.lines = db.lines.filter(line => !((line.origin && line.origin.equipTag === tag) || (line.destination && line.destination.equipTag === tag)));
            _core._saveState(); notifyWithVoice(`Equipo ${tag} eliminado`, false); _renderUI();
            return true;
        } else if (type === 'line' || type === 'línea') {
            const db = _core.getDb();
            const index = db.lines.findIndex(l => l.tag === tag);
            if (index === -1) { notifyWithVoice(`Línea ${tag} no encontrada`, true); return true; }
            db.lines.splice(index, 1);
            db.equipos.forEach(eq => { if (eq.puertos) eq.puertos.forEach(p => { if (p.connectedLine === tag) delete p.connectedLine; }); });
            db.lines.forEach(l => { if (l.puertos) l.puertos.forEach(p => { if (p.connectedLine === tag) delete p.connectedLine; }); });
            _core._saveState(); notifyWithVoice(`Línea ${tag} eliminada`, false); _renderUI();
            return true;
        }
        return false;
    }

    // --- EDIT (COMPLETO con transición automática de materiales, flag nt y notificaciones legibles) ---
    function parseEditCommand(cmd) {
        const parts = cmd.split(/\s+/);
        if (parts[0] !== 'edit' && parts[0] !== 'editar') return false;
        if (parts[1] === 'equipment' || parts[1] === 'equipo') {
            const tag = parts[2], action = parts[3];
            if (action === 'move' || action === 'mover') {
                let coordStr = '';
                for (let i = 4; i < parts.length; i++) { coordStr += parts[i]; if (parts[i].includes(')')) break; }
                const m = coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                if (m) {
                    const x = parseFloat(m[1]), y = parseFloat(m[2]), z = parseFloat(m[3]);
                    _core.updateEquipment(tag, { posX: x, posY: y, posZ: z });
                    notifyWithVoice(`Equipo ${tag} movido`, false);
                    return true;
                }
            } else if (action === 'set' || action === 'establecer') {
                if (parts[4] === 'puerto') {
                    const puertoId = parts[5], subParam = parts[6];
                    if (subParam === 'diam' || subParam === 'diametro') {
                        const nuevoDiam = parseFloat(parts[7]);
                        if (!isNaN(nuevoDiam)) { _core.updatePuerto(tag, puertoId, { diametro: nuevoDiam }); notifyWithVoice(`Puerto ${puertoId} diámetro ${nuevoDiam}"`, false); return true; }
                    } else if (subParam === 'pos' || subParam === 'posicion') {
                        let coordStr = '';
                        for (let i = 7; i < parts.length; i++) { coordStr += parts[i]; if (parts[i].includes(')')) break; }
                        const m = coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                        if (m) { const x = parseFloat(m[1]), y = parseFloat(m[2]), z = parseFloat(m[3]); _core.updatePuerto(tag, puertoId, { pos: { x, y, z } }); notifyWithVoice(`Puerto ${puertoId} posición actualizada`, false); return true; }
                    } else if (subParam === 'dir' || subParam === 'direccion') {
                        let coordStr = '';
                        for (let i = 7; i < parts.length; i++) { coordStr += parts[i]; if (parts[i].includes(')')) break; }
                        const m = coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                        if (m) { const x = parseFloat(m[1]), y = parseFloat(m[2]), z = parseFloat(m[3]); _core.updatePuerto(tag, puertoId, { dir: { dx: x, dy: y, dz: z } }); notifyWithVoice(`Puerto ${puertoId} dirección actualizada`, false); return true; }
                    }
                }
            }
        } else if (parts[1] === 'line' || parts[1] === 'línea') {
            const tag = parts[2], action = parts[3];
            if (action === 'set' || action === 'establecer') {
                const property = parts[4], value = parts[5];
                if (property === 'material') { _core.updateLine(tag, { material: value.toUpperCase() }); notifyWithVoice(`Línea ${tag} material ${value}`, false); return true; }
                else if (property === 'diameter' || property === 'diametro') { _core.updateLine(tag, { diameter: parseFloat(value) }); notifyWithVoice(`Línea ${tag} diámetro ${value}"`, false); return true; }
                else if (property === 'spec') { _core.updateLine(tag, { spec: value }); notifyWithVoice(`Línea ${tag} especificación ${value}`, false); return true; }
            } else if ((action === 'add' || action === 'añadir') && (parts[4] === 'waypoint' || parts[4] === 'punto')) {
                let coordStr = '';
                for (let i = 5; i < parts.length; i++) { coordStr += parts[i]; if (parts[i].includes(')')) break; }
                const m = coordStr.match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
                if (m) {
                    const wp = { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
                    const db = _core.getDb(); const line = db.lines.find(l => l.tag === tag);
                    if (line) {
                        if (!line.waypoints) line.waypoints = [];
                        let after = -1; const afterIdx = parts.indexOf('after') !== -1 ? parts.indexOf('after') : parts.indexOf('despues');
                        if (afterIdx !== -1) after = parseInt(parts[afterIdx + 1]) - 1;
                        if (after >= 0 && after < line.waypoints.length) line.waypoints.splice(after + 1, 0, wp);
                        else line.waypoints.push(wp);
                        _core.updateLine(tag, { waypoints: line.waypoints }); _core.syncPhysicalData();
                        notifyWithVoice(`Waypoint añadido a ${tag}`, false); return true;
                    }
                }
            } else if ((action === 'remove' || action === 'quitar') && (parts[4] === 'waypoint' || parts[4] === 'punto')) {
                const idx = parseInt(parts[5]) - 1;
                const db = _core.getDb(); const line = db.lines.find(l => l.tag === tag);
                if (line && line.waypoints && idx >= 0 && idx < line.waypoints.length) {
                    line.waypoints.splice(idx, 1); _core.updateLine(tag, { waypoints: line.waypoints }); _core.syncPhysicalData();
                    notifyWithVoice(`Waypoint ${idx + 1} eliminado de ${tag}`, false); return true;
                }
            } else if ((action === 'add' || action === 'añadir') && (parts[4] === 'component' || parts[4] === 'componente')) {
                const compType = parts[5];
                let position = 0.5; const atIdx = parts.indexOf('at') !== -1 ? parts.indexOf('at') : parts.indexOf('en');
                if (atIdx !== -1) position = parseFloat(parts[atIdx + 1]);
                // Detectar flag nt (no transition) en los argumentos restantes
                const suppressTransition = parts.slice(atIdx !== -1 ? atIdx + 2 : 6).some(p => p === 'nt' || p === 'notransition');
                const db = _core.getDb(); const line = db.lines.find(l => l.tag === tag);
                if (line) {
                    const compDef = _catalog.getComponent(compType);
                    if (!compDef) { notifyWithVoice(`Componente desconocido: ${compType}`, true); return true; }

                    // ---- TRANSICIÓN AUTOMÁTICA DE MATERIALES (suprimible con nt) ----
                    const lineMaterial = (line.material || 'PPR').toUpperCase();
                    const compMaterial = (compDef.material || '').toUpperCase();
                    if (compMaterial && lineMaterial !== compMaterial && !suppressTransition) {
                        const transition = _catalog.getTransitionAccessories(lineMaterial, compMaterial, line.diameter);
                        if (transition) {
                            if (transition.left) {
                                const leftCompDef = _catalog.getComponent(transition.left);
                                if (leftCompDef) {
                                    const leftPos = Math.max(0, position - 0.05);
                                    const leftTag = `${transition.left}-${Date.now().toString().slice(-8)}`;
                                    const leftComp = { type: leftCompDef.tipo, tag: leftTag, param: leftPos };
                                    if (!line.components) line.components = [];
                                    line.components.push(leftComp);
                                    if (leftCompDef.generarPuertos) {
                                        const nuevosPuertos = leftCompDef.generarPuertos(line, leftPos, line.diameter);
                                        if (!line.puertos) line.puertos = [];
                                        nuevosPuertos.forEach((p, idx) => { p.id = `${leftTag}_${idx}`; line.puertos.push(p); });
                                    }
                                    notifyWithVoice(`Adaptador ${leftCompDef.nombre} insertado`, false);
                                }
                            }
                            if (transition.right) {
                                const rightCompDef = _catalog.getComponent(transition.right);
                                if (rightCompDef) {
                                    const rightPos = Math.min(1, position + 0.05);
                                    const rightTag = `${transition.right}-${Date.now().toString().slice(-8)}`;
                                    const rightComp = { type: rightCompDef.tipo, tag: rightTag, param: rightPos };
                                    if (!line.components) line.components = [];
                                    line.components.push(rightComp);
                                    if (rightCompDef.generarPuertos) {
                                        const nuevosPuertos = rightCompDef.generarPuertos(line, rightPos, line.diameter);
                                        if (!line.puertos) line.puertos = [];
                                        nuevosPuertos.forEach((p, idx) => { p.id = `${rightTag}_${idx}`; line.puertos.push(p); });
                                    }
                                    notifyWithVoice(`Adaptador ${rightCompDef.nombre} insertado`, false);
                                }
                            }
                        } else {
                            if (!suppressTransition) {
                                notifyWithVoice(`Advertencia: No se encontró adaptador para transición ${lineMaterial} → ${compMaterial}`, true);
                            }
                        }
                    }

                    // --- INSERTAR COMPONENTE PRINCIPAL ---
                    const comp = { type: compDef.tipo, tag: `${compType}-${Date.now().toString().slice(-6)}`, param: position };
                    if (!line.components) line.components = [];
                    line.components.push(comp);
                    if (compDef.generarPuertos) {
                        const nuevosPuertos = compDef.generarPuertos(line, position, line.diameter);
                        if (!nuevosPuertos || nuevosPuertos.length === 0) {
                            notifyWithVoice(`Error: El componente ${compDef.nombre} no generó puertos válidos`, true);
                            console.warn('Generación de puertos fallida para', compType, 'parámetros:', line, position, line.diameter);
                            return true;
                        }
                        if (!line.puertos) line.puertos = [];
                        nuevosPuertos.forEach((p, idx) => { p.id = `${comp.tag}_${idx}`; line.puertos.push(p); });
                        _core.updateLine(tag, { components: line.components, puertos: line.puertos });
                        notifyWithVoice(`${compDef.nombre} añadido a ${tag} con puertos lógicos`, false);
                    } else {
                        _core.updateLine(tag, { components: line.components });
                        notifyWithVoice(`${compDef.nombre} añadido a ${tag}`, false);
                    }
                    _renderUI(); return true;
                }
            }
        }
        return false;
    }

    // --- LIST ---
    function parseListComponents(cmd) { if (cmd.trim().toLowerCase() !== 'list components' && cmd.trim().toLowerCase() !== 'listar componentes') return false; const types = _catalog.listComponentTypes(); let msg = "Componentes disponibles:\n"; types.sort().forEach(t => { const comp = _catalog.getComponent(t); if (comp) msg += `  ${t} - ${comp.nombre || 'Sin descripción'}\n`; }); notifyWithVoice(msg, false); return true; }
    function parseListSpecs(cmd) { if (cmd.trim().toLowerCase() !== 'list specs' && cmd.trim().toLowerCase() !== 'listar especificaciones') return false; const specs = _catalog.listSpecs(); let msg = "Especificaciones disponibles:\n"; specs.sort().forEach(s => { const spec = _catalog.getSpec(s); if (spec) msg += `  ${s}: ${spec.material || ''} ${spec.norma || ''}\n`; else msg += `  ${s}\n`; }); notifyWithVoice(msg, false); return true; }
    function parseListEquipment(cmd) { if (cmd.trim().toLowerCase() !== 'list equipment' && cmd.trim().toLowerCase() !== 'listar equipos') return false; const types = _catalog.listEquipmentTypes(); let msg = "Equipos disponibles:\n"; types.sort().forEach(t => { const eq = _catalog.getEquipment(t); if (eq) msg += `  ${t} - ${eq.nombre || 'Sin descripción'}\n`; }); notifyWithVoice(msg, false); return true; }

    // --- BOM ---
    function parseBOM(cmd) { const trimmed = cmd.trim().toLowerCase(); if (trimmed === 'bom' || trimmed === 'mto' || trimmed === 'generate bom' || trimmed === 'generar bom') { generateBOM(); return true; } return false; }
    function generateBOM() {
        if (!_core) { notifyWithVoice("Error: Core no inicializado", true); return; }
        const db = _core.getDb(); const lines = db.lines || []; const equipos = db.equipos || []; let items = [];
        equipos.forEach(eq => items.push({ tipo: 'EQUIPO', tag: eq.tag, descripcion: `${eq.tipo} ${eq.material || ''}`, cantidad: 1, unidad: 'Und' }));
        const pipeMap = new Map();
        lines.forEach(line => {
            const pts = line._cachedPoints || line.points3D; if (!pts || pts.length < 2) return;
            let length = 0; for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            const lengthM = length / 1000; const key = `${line.diameter}"-${line.material || 'PPR'}-${line.spec || 'STD'}`;
            if (pipeMap.has(key)) pipeMap.get(key).length += lengthM;
            else pipeMap.set(key, { tipo: 'TUBERIA', diametro: line.diameter, material: line.material || 'PPR', spec: line.spec || 'STD', length: lengthM });
        });
        for (const [key, data] of pipeMap.entries()) items.push({ tipo: 'TUBERIA', tag: '', descripcion: `Tubo ${data.material} ${data.diametro}" ${data.spec}`, cantidad: data.length.toFixed(2), unidad: 'm' });
        const compMap = new Map();
        lines.forEach(line => { if (line.components) line.components.forEach(comp => { const key = `${comp.type}-${line.diameter}"`; compMap.set(key, (compMap.get(key) || 0) + 1); }); });
        for (const [key, count] of compMap.entries()) { const [type, diam] = key.split('-'); items.push({ tipo: 'COMPONENTE', tag: '', descripcion: `${type} ${diam}`, cantidad: count, unidad: 'Und' }); }
        let csv = 'Tipo,Tag,Descripción,Cantidad,Unidad\n';
        items.forEach(item => csv += `${item.tipo},${item.tag},${item.descripcion},${item.cantidad},${item.unidad}\n`);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `BOM_${window.currentProjectName || 'Proyecto'}_${Date.now()}.csv`; a.click();
        notifyWithVoice(`BOM generado con ${items.length} líneas.`, false);
    }

    // --- AUDIT ---
    function parseAudit(cmd) { const trimmed = cmd.trim().toLowerCase(); if (trimmed === 'audit' || trimmed === 'auditar' || trimmed === 'audit model' || trimmed === 'auditar modelo') { if (_core && _core.auditModel) _core.auditModel(); else notifyWithVoice("Auditoría no disponible.", true); return true; } return false; }

    // --- HELP ---
    function parseHelp(cmd) {
        const lower = cmd.toLowerCase(); if (lower !== 'help' && lower !== 'ayuda') return false;
        let ayuda = "═══════════════════════════════════════════════════════════\n              SMARTFLOW PRO - COMANDOS DISPONIBLES\n═══════════════════════════════════════════════════════════\n\n";
        ayuda += "CREACIÓN:\n  create/crear [tipo] [tag] at (x,y,z) [diam/diametro N] [height/altura N]\n  create line [tag] route/ruta (x1,y1,z1) ... [autofit false]\n  create manifold [tag] at (x,y,z) entries/entradas N spacing/espaciado D\n\n";
        ayuda += "CONEXIÓN:\n  connect/conectar [origen] [puerto] to/a [destino] [puerto o 0-1] [diametro N]\n  route/ruta desde [origen] [puerto] a/hasta [destino] [puerto-opcional] [diametro N]\n\n";
        ayuda += "INFORMACIÓN:\n  info line/línea [TAG]\n  info equipment/equipo [TAG]\n  info component/componente [TAG]\n\n";
        ayuda += "ELIMINACIÓN:\n  delete/eliminar equipment/equipo [tag]\n  delete/eliminar line/línea [tag]\n\n";
        ayuda += "EDICIÓN:\n  edit/editar equipment/equipo [tag] move/mover to (x,y,z)\n  edit/editar equipment/equipo [tag] set/establecer puerto [id] pos/posicion (x,y,z)\n  edit/editar line/línea [tag] set/establecer material [M]\n  edit/editar line/línea [tag] add/añadir component/componente [tipo] at/en [0-1] [nt]\n  (consulte 'help' para lista completa)\n\n";
        ayuda += "NUEVOS COMANDOS:\n  tap/derivar [Equipo] [Puerto] to [Línea] [Posición 0-1]\n  split/dividir [Línea] at (x,y,z) [type TEE_EQUAL]\n\n";
        ayuda += "REPORTES:\n  bom | mto | generate bom\n  audit/auditar\n\n";
        ayuda += "OTROS:\n  undo/deshacer | redo/rehacer | help/ayuda\n═══════════════════════════════════════════════════════════\n";
        notifyWithVoice(ayuda, false); return true;
    }

    // --- TAP (CORREGIDO) ---
    function parseTap(cmd) {
        const parts = cmd.trim().split(/\s+/);
        if (parts[0] !== 'tap') return false;
        if (parts.length < 6 || parts[3] !== 'to') { notifyWithVoice("Uso: tap [Equipo] [Puerto] to [Línea] [Posición 0-1] [diametro D] [material M]", true); return true; }
        const fromEquip = parts[1], fromNozzle = parts[2];
        const toLine = parts[4];
        const posRaw = parts[5]; const pos = parseFloat(posRaw);
        if (isNaN(pos) || pos < 0 || pos > 1) { notifyWithVoice("La posición debe ser un número entre 0 y 1", true); return true; }
        let diameter = 4, material = 'PPR', spec = 'PPR_PN12_5';
        for (let i = 6; i < parts.length; i++) {
            if (parts[i] === 'diameter' || parts[i] === 'diametro') diameter = parseFloat(parts[++i]);
            else if (parts[i] === 'material') material = parts[++i].toUpperCase();
            else if (parts[i] === 'spec') spec = parts[++i];
        }
        if (!_core || !_catalog) { notifyWithVoice("Core o Catálogo no inicializados", true); return true; }
        const db = _core.getDb();
        const fromObj = db.equipos.find(e => e.tag === fromEquip);
        if (!fromObj) { notifyWithVoice(`Equipo origen "${fromEquip}" no encontrado`, true); return true; }
        const nzFrom = fromObj.puertos?.find(n => n.id === fromNozzle);
        if (!nzFrom) { notifyWithVoice(`Puerto "${fromNozzle}" no encontrado en ${fromEquip}`, true); return true; }

        let startPos = null;
        if (typeof SmartFlowRouter !== 'undefined' && SmartFlowRouter.getPortPosition) {
            startPos = SmartFlowRouter.getPortPosition(fromObj, fromNozzle);
        } else {
            startPos = {
                x: fromObj.posX + (nzFrom.relX || 0),
                y: fromObj.posY + (nzFrom.relY || 0),
                z: fromObj.posZ + (nzFrom.relZ || 0)
            };
        }
        if (!startPos) { notifyWithVoice("No se pudo obtener la posición del puerto origen", true); return true; }

        const toObj = db.lines.find(l => l.tag === toLine);
        if (!toObj || !(toObj._cachedPoints || toObj.points3D)) { notifyWithVoice(`Línea destino "${toLine}" no encontrada o no válida`, true); return true; }
        if (typeof SmartFlowRouter === 'undefined' || typeof SmartFlowRouter.insertarAccesorioEnLinea !== 'function') { notifyWithVoice("Módulo Router no disponible.", true); return true; }
        const pts = toObj._cachedPoints || toObj.points3D;
        let totalLen = 0, lengths = [];
        for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z); lengths.push(d); totalLen += d; }
        const targetLen = totalLen * pos;
        let accum = 0, segIdx = 0, t = 0;
        for (let i = 0; i < lengths.length; i++) { if (accum + lengths[i] >= targetLen || i === lengths.length - 1) { segIdx = i; t = (targetLen - accum) / (lengths[i] || 1); break; } accum += lengths[i]; }
        const pA = pts[segIdx], pB = pts[segIdx + 1];
        const puntoConexion = { x: pA.x + (pB.x - pA.x) * t, y: pA.y + (pB.y - pA.y) * t, z: pA.z + (pB.z - pA.z) * t };
        const puertoId = SmartFlowRouter.insertarAccesorioEnLinea(toLine, puntoConexion, diameter, true);
        if (!puertoId) { notifyWithVoice("No se pudo insertar el accesorio automáticamente.", true); return true; }
        const newTag = `L-${(db.lines?.length || 0) + 1}`;
        const nuevaLinea = { 
            tag: newTag, diameter, material, spec, 
            origin: { objType: 'equipment', equipTag: fromEquip, portId: fromNozzle }, 
            destination: { objType: 'line', equipTag: toLine, portId: puertoId }, 
            waypoints: [], 
            _cachedPoints: [startPos, puntoConexion]
        };
        _core.addLine(nuevaLinea);
        if (_core.setSelected) _core.setSelected({ type: 'line', obj: nuevaLinea });
        nzFrom.connectedLine = newTag;
        const toObjUpd = db.lines.find(l => l.tag === toLine);
        if (toObjUpd?.puertos) { const p = toObjUpd.puertos.find(p => p.id === puertoId); if (p) p.connectedLine = newTag; }
        _core.syncPhysicalData(); _core._saveState(); _renderUI();
        notifyWithVoice(`✅ Derivación creada: ${newTag} (${fromEquip}.${fromNozzle} → ${toLine} en ${pos.toFixed(2)})`, false);
        return true;
    }

    // --- SPLIT ---
    function parseSplit(cmd) {
        const parts = cmd.trim().split(/\s+/);
        if (parts[0] !== 'split' && parts[0] !== 'dividir' && parts[0] !== 'romper') return false;
        const lineTag = parts[1];
        const coords = extractCoords(cmd);
        if (!lineTag || !coords) { notifyWithVoice("Uso: split [línea] at (x,y,z). Tip: Puedes usar Ctrl+Clic en el modelo.", true); return true; }
        const type = extractValue(parts, ['type', 'tipo']) || 'TEE_EQUAL';
        notifyWithVoice(`Dividiendo línea ${lineTag} e insertando ${type}...`);
        const result = _core.splitLine(lineTag, coords, { type });
        if (result) {
            if (_core.setSelected) _core.setSelected({ type: 'COMPONENTE', obj: result.componente, parent: result.linea });
        } else {
            notifyWithVoice(`Error: El punto (${coords.x}, ${coords.y}) está muy lejos de la línea ${lineTag}`, true);
        }
        return true;
    }

    // ==================== IMPORTACIÓN PCF COMPLETA ====================
    const skeyToInternal = {
        'TANK': { type: 'equipment', internal: 'tanque_v' },
        'PUMP': { type: 'equipment', internal: 'bomba' },
        'VESS': { type: 'equipment', internal: 'tanque_v' },
        'STRA': { type: 'pipe', internal: 'PIPE' },
        'VALV': { type: 'component', internal: 'GATE_VALVE' },
        'VAGF': { type: 'component', internal: 'GATE_VALVE' },
        'VGLF': { type: 'component', internal: 'GLOBE_VALVE' },
        'VBAL': { type: 'component', internal: 'BALL_VALVE' },
        'VBAF': { type: 'component', internal: 'BUTTERFLY_VALVE' },
        'VCFF': { type: 'component', internal: 'CHECK_VALVE' },
        'ELBW': { type: 'component', internal: 'ELBOW_90_LR' },
        'ELL4': { type: 'component', internal: 'ELBOW_45' },
        'ELLL': { type: 'component', internal: 'ELBOW_90_LR' },
        'ELLS': { type: 'component', internal: 'ELBOW_90_SR' },
        'TEES': { type: 'component', internal: 'TEE_EQUAL' },
        'TEER': { type: 'component', internal: 'TEE_REDUCING' },
        'CROS': { type: 'component', internal: 'CROSS' },
        'FLWN': { type: 'component', internal: 'WELD_NECK_FLANGE' },
        'FLSO': { type: 'component', internal: 'SLIP_ON_FLANGE' },
        'FLBL': { type: 'component', internal: 'BLIND_FLANGE' },
        'CAPF': { type: 'component', internal: 'CAP' },
        'REDC': { type: 'component', internal: 'CONCENTRIC_REDUCER' },
        'REDE': { type: 'component', internal: 'ECCENTRIC_REDUCER' },
        'INSI': { type: 'component', internal: 'PRESSURE_GAUGE' },
        'INPG': { type: 'component', internal: 'PRESSURE_GAUGE' },
        'INTG': { type: 'component', internal: 'TEMPERATURE_GAUGE' },
        'INFM': { type: 'component', internal: 'FLOW_METER' },
        'INLV': { type: 'component', internal: 'LEVEL_SWITCH_RANA' }
    };

    function importPCF(fileContent) {
        if (!_core) { notifyWithVoice("Error: Core no inicializado.", true); return; }
        const lines = fileContent.split('\n');
        let currentLine = null, puntos = [], componentes = [];
        const equiposMap = new Map(), lineasMap = new Map();
        let currentComponent = null;

        function processAccumulatedComponent() {
            if (!currentComponent || !currentComponent.skey) return;
            const mapping = skeyToInternal[currentComponent.skey];
            if (mapping) {
                if (mapping.type === 'equipment') {
                    const pos = currentComponent.pos || {x:0, y:0, z:0};
                    const tag = currentComponent.itemCode || `${mapping.internal}_${equiposMap.size + 1}`;
                    if (!equiposMap.has(tag)) {
                        const equipo = _catalog.createEquipment(mapping.internal, tag, pos.x, pos.y, pos.z, {
                            diametro: currentComponent.diameter || 1000,
                            altura: currentComponent.height || 1500,
                            material: currentComponent.material || 'PPR'
                        });
                        if (equipo) { equiposMap.set(tag, equipo); _core.addEquipment(equipo); }
                    }
                } else if (mapping.type === 'component' && currentLine) {
                    componentes.push({
                        type: mapping.internal,
                        tag: currentComponent.itemCode || `${mapping.internal}_${componentes.length + 1}`,
                        param: 0.5,
                        description: currentComponent.description,
                        material: currentComponent.material
                    });
                }
            }
            currentComponent = null;
        }

        function finalizeLine() {
            if (currentLine && puntos.length >= 2) {
                if (!currentLine.tag) currentLine.tag = `L-${(lineasMap.size + 1)}`;
                currentLine._cachedPoints = puntos;
                currentLine.components = componentes;
                _core.addLine(currentLine);
                lineasMap.set(currentLine.tag, currentLine);
            }
            currentLine = null; puntos = []; componentes = [];
        }

        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('!') || line.length === 0) continue;
            const parts = line.split(/\s+/);
            const firstWord = parts[0];

            const newBlockWords = ['PIPE', 'VALVE', 'TEE', 'TANK', 'PUMP', 'INSTRUMENT', 'ELBOW', 'FLANGE', 'STRA'];
            if (newBlockWords.includes(firstWord)) {
                processAccumulatedComponent();
                if (firstWord === 'PIPE' || firstWord === 'STRA') {
                    finalizeLine();
                    currentLine = { tag: '', diameter: 4, material: 'PPR', spec: 'PPR_PN12_5' };
                    puntos = []; componentes = [];
                } else {
                    currentComponent = { type: firstWord };
                }
                continue;
            }

            if (line.startsWith('END-POINT')) {
                if (parts.length >= 7) {
                    const p1 = { x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) };
                    const p2 = { x: parseFloat(parts[4]), y: parseFloat(parts[5]), z: parseFloat(parts[6]) };
                    const diam = parts.length >= 8 ? parseFloat(parts[7]) : null;
                    if (currentLine) {
                        if (puntos.length === 0) puntos.push(p1);
                        puntos.push(p2);
                        if (diam && !currentLine.diameter) currentLine.diameter = diam / 25.4;
                    }
                    if (currentComponent) {
                        currentComponent.pos = p1;
                        if (diam) currentComponent.diameter = diam;
                    }
                }
            } else if (line.startsWith('PCF_ELEM_SKEY')) {
                const skey = parts[1]?.replace(/'/g, '') || '';
                if (currentComponent) currentComponent.skey = skey;
                else if (currentLine) currentLine.skey = skey;
            } else if (line.startsWith('ITEM-CODE')) {
                const code = line.substring(line.indexOf('ITEM-CODE') + 9).trim().replace(/'/g, '');
                if (currentComponent) currentComponent.itemCode = code;
                else if (currentLine) currentLine.tag = code;
            } else if (line.startsWith('DESCRIPTION')) {
                const desc = line.substring(line.indexOf('DESCRIPTION') + 11).trim().replace(/'/g, '');
                if (currentComponent) currentComponent.description = desc;
            } else if (line.startsWith('MATERIAL')) {
                const mat = parts[1]?.replace(/'/g, '') || '';
                if (currentComponent) currentComponent.material = mat;
                else if (currentLine) currentLine.material = mat;
            } else if (line.startsWith('HEIGHT')) {
                if (currentComponent) currentComponent.height = parseFloat(parts[1]);
            } else if (line.startsWith('DIAMETER')) {
                if (currentComponent) currentComponent.diameter = parseFloat(parts[1]);
            } else if (line.startsWith('PIPING-SPEC')) {
                const spec = parts.slice(1).join(' ').replace(/'/g, '');
                if (currentLine) currentLine.spec = spec;
            }
        }

        processAccumulatedComponent();
        finalizeLine();

        _core.syncPhysicalData();
        _core._saveState();
        _renderUI();
        notifyWithVoice(`✅ PCF importado: ${equiposMap.size} equipos, ${lineasMap.size} líneas.`, false);
        return true;
    }

    // ==================== EJECUCIÓN DE COMANDOS ====================
    function executeCommand(cmd) {
        if (!cmd || cmd.startsWith('//')) return false;
        const normalized = normalizeCommand(cmd);
        const trimmed = normalized.trim();
        if (parseCreateLine(trimmed)) return true;
        if (parseCreateManifold(trimmed)) return true;
        if (parseCreate(trimmed)) return true;
        if (parseConnect(trimmed)) return true;
        if (parseRoute(trimmed)) return true;
        if (parseDelete(trimmed)) return true;
        if (parseEditCommand(trimmed)) return true;
        if (parseListComponents(trimmed)) return true;
        if (parseListSpecs(trimmed)) return true;
        if (parseListEquipment(trimmed)) return true;
        if (parseBOM(trimmed)) return true;
        if (parseAudit(trimmed)) return true;
        if (parseHelp(trimmed)) return true;
        if (parseInfo(trimmed)) return true;
        if (parseTap(trimmed)) return true;
        if (parseSplit(trimmed)) return true;
        if (trimmed === 'undo' || trimmed === 'deshacer') { if (_core) _core.undo(); _renderUI(); return true; }
        if (trimmed === 'redo' || trimmed === 'rehacer') { if (_core) _core.redo(); _renderUI(); return true; }
        return false;
    }

    function executeBatch(commandsText) {
        const lines = commandsText.split('\n');
        let executed = 0, failed = 0;
        for (let raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed || trimmed.startsWith('//')) continue;
            if (executeCommand(trimmed)) executed++;
            else { failed++; notifyWithVoice(`No entendí: "${trimmed.substring(0, 50)}..."`, true); }
        }
        _renderUI();
        notifyWithVoice(`${executed} comandos ejecutados, ${failed} fallidos`, failed > 0);
        return executed;
    }

    function init(coreInstance, catalogInstance, rendererInstance, notifyFn, renderFn) {
        _core = coreInstance; _catalog = catalogInstance; _renderer = rendererInstance;
        _notifyUI = notifyFn; _renderUI = renderFn;
    }

    return { init, executeCommand, executeBatch, importPCF };
})();
