
// SmartFlowCommands v9.0 - Léxico bilingüe + Edición de puertos + Waypoints con auto-accesorios
const SmartFlowCommands = (function() {
    let _core = null;
    let _catalog = null;
    let _notifyUI = (msg, isErr) => console.log(msg);

    // Diccionario bilingüe
    const LEX = {
        'crear': 'CREATE', 'create': 'CREATE', '+': 'CREATE',
        'modificar': 'MODIFY', 'editar': 'MODIFY', 'edit': 'MODIFY', '~': 'MODIFY',
        'eliminar': 'DELETE', 'borrar': 'DELETE', 'delete': 'DELETE', '-': 'DELETE',
        'mover': 'MOVE', 'move': 'MOVE', '>': 'MOVE',
        'conectar': 'CONNECT', 'connect': 'CONNECT', '->': 'CONNECT',
        'linea': 'LINEA_WP', 'line': 'LINEA_WP',
        'info': 'INFO', '?': 'INFO', 'informacion': 'INFO',
        'listar': 'LIST', 'list': 'LIST',
        '??': 'LIST_EQUIPOS', '???': 'LIST_LINEAS',
        'ayuda': 'HELP', 'help': 'HELP', 'h': 'HELP',
        'undo': 'UNDO', 'deshacer': 'UNDO', '<<': 'UNDO',
        'redo': 'REDO', 'rehacer': 'REDO', '>>': 'REDO',
        'nodos': 'NODES', 'nodes': 'NODES',
        '.': 'VIEW_ISO', '.t': 'VIEW_TOP', '.f': 'VIEW_FRONT', '.s': 'VIEW_SIDE',
        '!mto': 'EXPORT_MTO', '!pcf': 'EXPORT_PCF', '!pdf': 'EXPORT_PDF',
        '!save': 'SAVE', '!load': 'LOAD',
        '%': 'CREATE_LINE'
    };

    function notify(msg, isErr) {
        if (_notifyUI) _notifyUI(msg, isErr);
        if (typeof SmartFlowAccessibility !== 'undefined' && SmartFlowAccessibility.isVoiceEnabled()) {
            SmartFlowAccessibility.speak(msg);
        }
    }

    function tokenize(cmd) {
        const tokens = [];
        const regex = /(\([^)]+\)|->|@|[\w\-\.]+|[<>+\-~%!?.]+)/g;
        let match;
        while ((match = regex.exec(cmd)) !== null) {
            tokens.push(match[0]);
        }
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
            m = t.match(/^(?:w(?:idth)?|ancho)[=:](\d+\.?\d*)/i);
            if (m) { p.ancho = parseFloat(m[1]); continue; }
            m = t.match(/^(?:n|entradas|entries)[=:](\d+)/i);
            if (m) { p.entradas = parseInt(m[1]); continue; }
            m = t.match(/^(?:sp|spacing|espaciado)[=:](\d+\.?\d*)/i);
            if (m) { p.spacing = parseFloat(m[1]); continue; }
            m = t.match(/^(?:out|salida|output)[=:](\w+)/i);
            if (m) { p.salida = m[1]; continue; }
            // Edición de puertos
            m = t.match(/^pos[=:]\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/i);
            if (m) { p.pos = { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) }; continue; }
            m = t.match(/^dir[=:]\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/i);
            if (m) { p.dir = { dx: parseFloat(m[1]), dy: parseFloat(m[2]), dz: parseFloat(m[3]) }; continue; }
            if (t.match(/^status[=:](\w+)/i)) { p.status = RegExp.$1.toLowerCase(); continue; }
        }
        return p;
    }

    function parseNodeRef(str) {
        const dot = str.indexOf('.');
        if (dot > 0) return { tag: str.substring(0, dot), port: str.substring(dot + 1) };
        const at = str.indexOf('@');
        if (at > 0) return { tag: str.substring(0, at), port: str.substring(at + 1) };
        return { tag: str, port: '1' };
    }

    // Helper para obtener posición de un puerto usando el router
    function getPortWorldPos(tag, portId) {
        const db = _core.getDb();
        const obj = db.equipos.find(e => e.tag === tag) || db.lines.find(l => l.tag === tag);
        if (!obj || typeof SmartFlowRouter === 'undefined') return null;
        return SmartFlowRouter.getPortPosition(obj, portId);
    }

    // Helper para encontrar codo según material y ángulo (replica lógica del router)
    function findElbowForMaterial(material, angleDeg) {
        const mat = (material || '').toUpperCase();
        if (angleDeg < 15) return null;
        const is90 = angleDeg > 60;
        const is45 = angleDeg >= 15 && angleDeg <= 60;
        if (mat.includes('PPR')) return is90 ? 'ELBOW_90_PPR' : (is45 ? 'ELBOW_45_PPR' : null);
        if (mat.includes('HDPE')) return is90 ? 'ELBOW_90_HDPE' : null;
        if (mat.includes('PVC')) return is90 ? 'ELBOW_90_PVC' : null;
        if (mat.includes('ACERO') || mat.includes('CARBONO')) return is90 ? 'ELBOW_90_LR_CS' : (is45 ? 'ELBOW_45_CS' : null);
        if (mat.includes('INOX')) return is90 ? 'ELBOW_90_SANITARY' : null;
        return is90 ? 'ELBOW_90_LR_CS' : (is45 ? 'ELBOW_45_CS' : null);
    }

    function angleBetweenVectors(v1, v2) {
        const dot = v1.dx * v2.dx + v1.dy * v2.dy + v1.dz * v2.dz;
        return Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
    }

    function injectFittingsIntoLine(lineObj) {
        const pts = lineObj._cachedPoints || lineObj.points;
        if (!pts || pts.length < 2) return lineObj;
        const comps = lineObj.components || [];
        for (let i = 1; i < pts.length - 1; i++) {
            const seg1 = { dx: pts[i].x - pts[i-1].x, dy: pts[i].y - pts[i-1].y, dz: pts[i].z - pts[i-1].z };
            const seg2 = { dx: pts[i+1].x - pts[i].x, dy: pts[i+1].y - pts[i].y, dz: pts[i+1].z - pts[i].z };
            const len1 = Math.hypot(seg1.dx, seg1.dy, seg1.dz) || 1;
            const len2 = Math.hypot(seg2.dx, seg2.dy, seg2.dz) || 1;
            const v1 = { dx: seg1.dx/len1, dy: seg1.dy/len1, dz: seg1.dz/len1 };
            const v2 = { dx: seg2.dx/len2, dy: seg2.dy/len2, dz: seg2.dz/len2 };
            const angle = angleBetweenVectors(v1, v2);
            const elbowType = findElbowForMaterial(lineObj.material || 'PPR', angle);
            if (elbowType) {
                comps.push({
                    type: elbowType,
                    tag: `${elbowType}-${Date.now().toString(36)}`,
                    param: i / (pts.length - 1),
                    angle: Math.round(angle)
                });
            }
        }
        lineObj.components = comps;
        return lineObj;
    }

    function executeCommand(cmd) {
        if (!cmd || cmd.startsWith('//')) return false;
        const tokens = tokenize(cmd);
        if (!tokens.length) return false;

        // Detectar flecha primero (puede estar en cualquier posición)
        const arrowIdx = tokens.indexOf('->');
        if (arrowIdx > 0) {
            return handleConnect(tokens, arrowIdx);
        }

        const first = tokens[0].toLowerCase();
        const action = LEX[first] || first.toUpperCase();

        switch (action) {
            case 'CREATE': return handleCreate(tokens);
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
            case 'UNDO': if (_core) _core.undo(); notify('Deshacer'); return true;
            case 'REDO': if (_core) _core.redo(); notify('Rehacer'); return true;
            case 'NODES': return handleNodes(tokens);
            case 'VIEW_ISO': setView('iso'); return true;
            case 'VIEW_TOP': setView('top'); return true;
            case 'VIEW_FRONT': setView('front'); return true;
            case 'VIEW_SIDE': setView('side'); return true;
            case 'EXPORT_MTO': if (typeof SmartFlowIO !== 'undefined') SmartFlowIO.exportMTO(); else notify('IO no disponible', true); return true;
            case 'EXPORT_PCF': if (typeof SmartFlowIO !== 'undefined') SmartFlowIO.exportPCF(); else notify('IO no disponible', true); return true;
            case 'EXPORT_PDF': if (typeof SmartFlowIO !== 'undefined') SmartFlowIO.exportPDF(); else notify('IO no disponible', true); return true;
            case 'SAVE': {
                const state = _core.exportProject();
                localStorage.setItem('smartengp_v2_project', state);
                notify('Proyecto guardado');
                return true;
            }
            case 'LOAD': {
                const data = localStorage.getItem('smartengp_v2_project');
                if (data) {
                    try {
                        const parsed = JSON.parse(data);
                        _core.importState(parsed.data || parsed);
                        notify('Proyecto cargado');
                    } catch (e) { notify('Error al cargar', true); }
                } else { notify('No hay proyecto guardado', true); }
                return true;
            }
        }

        return false;
    }

    function handleCreate(tokens) {
        if (tokens.length < 4) { notify('Uso: + TIPO TAG X,Y,Z [d=DIAM] [h=ALTURA] [m=MATERIAL]', true); return true; }
        const tipo = tokens[1];
        const tag = tokens[2];
        let coords = null, coordIdx = 3;
        for (let i = 3; i < Math.min(tokens.length, 6); i++) {
            coords = extractCoords(tokens[i]);
            if (coords) { coordIdx = i; break; }
        }
        if (!coords) {
            const joined = tokens.slice(3).join('');
            coords = extractCoords(joined);
            coordIdx = tokens.length;
        }
        if (!coords) { notify('Coordenadas inválidas', true); return true; }
        const params = extractParams(tokens.slice(coordIdx + 1));
        const eqDef = _catalog.getEquipment(tipo);
        if (!eqDef) {
            const tipos = _catalog.listEquipmentTypes().join(', ');
            notify(`Tipo "${tipo}" no encontrado. Disponibles: ${tipos}`, true);
            return true;
        }
        const eq = _catalog.createEquipment(tipo, tag, coords.x, coords.y, coords.z, params);
        if (eq) {
            _core.addEquipment(eq);
            if (_core.setSelected) _core.setSelected({ type: 'equipment', obj: eq });
            notify(`${eqDef.nombre} ${tag} creado en (${coords.x},${coords.y},${coords.z})`);
        }
        return true;
    }

    function handleCreateLine(tokens) {
        // % TAG X1,Y1,Z1 X2,Y2,Z2 ... [params]
        if (tokens.length < 4) { notify('Uso: % TAG X1,Y1,Z1 X2,Y2,Z2 [d=DIAM] [m=MATERIAL]', true); return true; }
        const tag = tokens[1];
        const points = [];
        let i = 2;
        while (i < tokens.length) {
            const coord = extractCoords(tokens[i]);
            if (coord) { points.push(coord); i++; }
            else break;
        }
        if (points.length < 2) { notify('Se requieren al menos 2 puntos', true); return true; }
        const params = extractParams(tokens.slice(i));
        let newLine = {
            tag,
            diameter: params.diametro || 4,
            material: params.material || 'PPR',
            spec: params.spec || 'PPR_PN12_5',
            points,
            _cachedPoints: points,
            waypoints: points.slice(1, -1),
            components: []
        };
        newLine = injectFittingsIntoLine(newLine);
        _core.addLine(newLine);
        if (_core.setSelected) _core.setSelected({ type: 'line', obj: newLine });
        notify(`Línea ${tag} creada (${newLine.diameter}" ${newLine.material}, ${points.length} puntos, ${newLine.components.length} accesorios automáticos)`);
        return true;
    }

    function handleLineWithWaypoints(tokens) {
        // LINEA TAG DESDE EQUIPO.PUERTO POR x,y,z x,y,z ... HASTA EQUIPO.PUERTO [params]
        const desdeIdx = tokens.findIndex(t => t.toUpperCase() === 'DESDE');
        const porIdx = tokens.findIndex(t => t.toUpperCase() === 'POR');
        const hastaIdx = tokens.findIndex(t => t.toUpperCase() === 'HASTA');

        if (desdeIdx < 0 || hastaIdx < 0) {
            notify('Uso: LINEA TAG DESDE EQP.PUERTO POR x,y,z ... HASTA EQP.PUERTO [d=DIAM] [m=MAT]', true);
            return true;
        }

        const tag = tokens[1];
        const desdeToken = tokens[desdeIdx + 1];
        const desde = parseNodeRef(desdeToken);
        const hastaToken = tokens[hastaIdx + 1];
        const hasta = parseNodeRef(hastaToken);

        if (!desde.tag || !hasta.tag) {
            notify('Los argumentos DESDE y HASTA deben ser EQUIPO.PUERTO', true);
            return true;
        }

        const startPos = getPortWorldPos(desde.tag, desde.port);
        const endPos = getPortWorldPos(hasta.tag, hasta.port);
        if (!startPos || !endPos) {
            notify('No se pudo obtener la posición de los puertos indicados', true);
            return true;
        }

        const waypoints = [];
        if (porIdx > 0) {
            for (let i = porIdx + 1; i < hastaIdx; i++) {
                const coord = extractCoords(tokens[i]);
                if (coord) waypoints.push(coord);
            }
        }

        const points = [startPos, ...waypoints, endPos];
        const params = extractParams(tokens.slice(hastaIdx + 1));
        const diameter = params.diametro || 4;
        const material = params.material || 'PPR';
        const spec = params.spec || 'PPR_PN12_5';

        let newLine = {
            tag,
            diameter,
            material,
            spec,
            points,
            _cachedPoints: points,
            waypoints,
            components: [],
            origin: { objType: 'equipment', equipTag: desde.tag, portId: desde.port },
            destination: { objType: 'equipment', equipTag: hasta.tag, portId: hasta.port }
        };
        newLine = injectFittingsIntoLine(newLine);

        // Analizar si hay diferencia de diámetros y agregar reductor en el extremo destino
        const db = _core.getDb();
        const toObj = db.equipos.find(e => e.tag === hasta.tag) || db.lines.find(l => l.tag === hasta.tag);
        if (toObj && toObj.puertos) {
            const destPort = toObj.puertos.find(p => p.id === hasta.port);
            if (destPort && Math.abs(diameter - (destPort.diametro || diameter)) > 0.1) {
                newLine.components.push({
                    type: 'CONCENTRIC_REDUCER',
                    tag: `RED-${Date.now().toString(36)}`,
                    param: 0.95,
                    fromDiam: diameter,
                    toDiam: destPort.diametro
                });
            }
        }

        _core.addLine(newLine);
        if (_core.setSelected) _core.setSelected({ type: 'line', obj: newLine });

        // Marcar puertos como conectados
        const fromObj = db.equipos.find(e => e.tag === desde.tag) || db.lines.find(l => l.tag === desde.tag);
        if (fromObj?.puertos) {
            const p = fromObj.puertos.find(p => p.id === desde.port);
            if (p) { p.status = 'connected'; p.connectedLine = newLine.tag; }
        }
        if (toObj?.puertos) {
            const p = toObj.puertos.find(p => p.id === hasta.port);
            if (p) { p.status = 'connected'; p.connectedLine = newLine.tag; }
        }
        _core.syncPhysicalData();
        _core._saveState();

        notify(`Línea ${tag} creada con ${waypoints.length} waypoints y ${newLine.components.length} accesorios automáticos`);
        return true;
    }

    function handleModify(tokens) {
        // ~ TAG [prop=valor] o ~ TAG.PUERTO [prop=valor]
        if (tokens.length < 3) { notify('Uso: ~ TAG [prop=valor] o ~ TAG.PUERTO [pos=x,y,z] [dir=dx,dy,dz] [diam=4]', true); return true; }
        const tagOrRef = tokens[1];
        const dotIdx = tagOrRef.indexOf('.');
        if (dotIdx > 0) {
            // Edición de puerto
            const tag = tagOrRef.substring(0, dotIdx);
            const puertoId = tagOrRef.substring(dotIdx + 1);
            const params = extractParams(tokens.slice(2));
            const cambios = {};
            if (params.pos) cambios.pos = params.pos;
            if (params.dir) cambios.dir = params.dir;
            if (params.diametro !== undefined) cambios.diametro = params.diametro;
            if (params.status) cambios.status = params.status;
            if (Object.keys(cambios).length === 0) { notify('Propiedades de puerto no reconocidas', true); return true; }
            const ok = _core.updatePuerto(tag, puertoId, cambios);
            if (ok) notify(`Puerto ${puertoId} de ${tag} modificado`);
            else notify(`No se pudo modificar el puerto ${puertoId}`, true);
            return true;
        }

        // Modificación de equipo/línea
        const tag = tagOrRef;
        const params = extractParams(tokens.slice(2));
        const db = _core.getDb();
        const eq = db.equipos.find(e => e.tag === tag);
        if (eq) {
            const updates = {};
            if (params.diametro !== undefined) updates.diametro = params.diametro;
            if (params.altura !== undefined) updates.altura = params.altura;
            if (params.largo !== undefined) updates.largo = params.largo;
            if (params.ancho !== undefined) updates.ancho = params.ancho;
            if (params.material) updates.material = params.material;
            if (params.spec) updates.spec = params.spec;
            if (Object.keys(updates).length) {
                _core.updateEquipment(tag, updates);
                notify(`${tag} modificado: ${JSON.stringify(updates)}`);
            } else { notify('Sin cambios para aplicar', true); }
            return true;
        }
        const line = db.lines.find(l => l.tag === tag);
        if (line) {
            const updates = {};
            if (params.diametro !== undefined) updates.diameter = params.diametro;
            if (params.material) updates.material = params.material;
            if (params.spec) updates.spec = params.spec;
            if (Object.keys(updates).length) {
                _core.updateLine(tag, updates);
                notify(`${tag} modificado: ${JSON.stringify(updates)}`);
            } else { notify('Sin cambios para aplicar', true); }
            return true;
        }
        notify(`Elemento ${tag} no encontrado`, true);
        return true;
    }

    function handleDelete(tokens) {
        if (tokens.length < 2) { notify('Uso: - TAG', true); return true; }
        const tag = tokens[1];
        const db = _core.getDb();
        if (db.equipos.some(e => e.tag === tag)) { _core.deleteEquipment(tag); notify(`${tag} eliminado`); return true; }
        if (db.lines.some(l => l.tag === tag)) { _core.deleteLine(tag); notify(`${tag} eliminado`); return true; }
        notify(`${tag} no encontrado`, true);
        return true;
    }

    function handleMove(tokens) {
        if (tokens.length < 3) { notify('Uso: > TAG X,Y,Z', true); return true; }
        const tag = tokens[1];
        const coords = extractCoords(tokens.slice(2).join(''));
        if (!coords) { notify('Coordenadas inválidas', true); return true; }
        const db = _core.getDb();
        if (db.equipos.find(e => e.tag === tag)) {
            _core.updateEquipment(tag, { posX: coords.x, posY: coords.y, posZ: coords.z });
            notify(`${tag} movido a (${coords.x},${coords.y},${coords.z})`);
        } else {
            notify(`Solo se pueden mover equipos. ${tag} no es un equipo.`, true);
        }
        return true;
    }

    function handleConnect(tokens, arrowIdx) {
        const left = tokens.slice(0, arrowIdx).join('');
        const rightTokens = tokens.slice(arrowIdx + 1);
        if (!rightTokens.length) { notify('Falta destino después de ->', true); return true; }
        const from = parseNodeRef(left);
        const rightStr = rightTokens[0];
        const to = parseNodeRef(rightStr);
        if (!from.tag || !to.tag) { notify('Origen o destino inválido', true); return true; }
        const params = extractParams(rightTokens.slice(1));
        if (typeof SmartFlowRouter !== 'undefined') {
            SmartFlowRouter.routeBetweenPorts(
                from.tag, from.port,
                to.tag, to.port,
                params.diametro || 4,
                params.material || 'PPR',
                params.spec || 'PPR_PN12_5'
            );
        } else {
            notify('Router no disponible', true);
        }
        return true;
    }

    function handleInfo(tokens) {
        if (tokens.length < 2) { notify('Uso: ? TAG', true); return true; }
        const tag = tokens[1];
        const db = _core.getDb();
        const eq = db.equipos.find(e => e.tag === tag);
        if (eq) {
            let info = `${eq.tag} | ${eq.tipo} | Pos: (${eq.posX},${eq.posY},${eq.posZ}) | ⌀${eq.diametro || '?'} H=${eq.altura || '?'} | ${eq.material || 'N/D'}`;
            if (eq.puertos) info += ` | Puertos: ${eq.puertos.map(p => `${p.id}(${p.status})`).join(', ')}`;
            notify(info);
            return true;
        }
        const line = db.lines.find(l => l.tag === tag);
        if (line) {
            const pts = line._cachedPoints || [];
            let info = `${line.tag} | ${line.diameter}" ${line.material || 'N/D'} | Puntos: ${pts.length}`;
            if (line.origin) info += ` | De: ${line.origin.equipTag}.${line.origin.portId}`;
            if (line.destination) info += ` | A: ${line.destination.equipTag}.${line.destination.portId}`;
            if (line.components) info += ` | Componentes: ${line.components.length}`;
            notify(info);
            return true;
        }
        notify(`${tag} no encontrado`, true);
        return true;
    }

    function handleList(tokens) {
        const sub = tokens[1] ? tokens[1].toLowerCase() : '';
        if (sub === 'components' || sub === 'componentes') {
            const types = _catalog.listComponentTypes();
            notify(`Componentes disponibles: ${types.sort().join(', ')}`);
        } else if (sub === 'equipment' || sub === 'equipos') {
            listEquipos();
        } else if (sub === 'specs' || sub === 'especificaciones') {
            const specs = _catalog.listSpecs();
            notify(`Especificaciones: ${specs.sort().join(', ')}`);
        } else {
            notify('Use: list equipos | list componentes | list especificaciones');
        }
        return true;
    }

    function listEquipos() {
        const db = _core.getDb();
        const equipos = db.equipos;
        if (equipos.length === 0) { notify('No hay equipos'); return; }
        notify(`Equipos (${equipos.length}): ${equipos.map(e => e.tag).join(', ')}`);
    }

    function listLineas() {
        const db = _core.getDb();
        const lines = db.lines;
        if (lines.length === 0) { notify('No hay líneas'); return; }
        notify(`Líneas (${lines.length}): ${lines.map(l => `${l.tag}(${l.diameter}" ${l.material || '?'})`).join(', ')}`);
    }

    function handleNodes(tokens) {
        if (tokens.length < 2) { notify('Uso: nodos TAG', true); return true; }
        const tag = tokens[1];
        const db = _core.getDb();
        const obj = db.equipos.find(e => e.tag === tag) || db.lines.find(l => l.tag === tag);
        if (!obj) { notify(`${tag} no encontrado`, true); return true; }
        let nodes = [];
        if (obj.posX !== undefined) {
            nodes = (obj.puertos || []).map(p => `${p.id}: ⌀${p.diametro || '?'}" ${p.status}`);
        } else {
            nodes = ['START', 'END'];
            if (obj.puertos) nodes.push(...obj.puertos.filter(p => p.id !== 'START' && p.id !== 'END').map(p => p.id));
        }
        notify(`Nodos de ${tag}: ${nodes.join(', ')}`);
        return true;
    }

    function setView(view) {
        if (typeof SmartFlowRender !== 'undefined') {
            if (view === 'iso' && SmartFlowRender.fitCameraToEquipments) {
                SmartFlowRender.fitCameraToEquipments();
            } else if (SmartFlowRender.setView) {
                SmartFlowRender.setView(view);
            }
            notify(`Vista: ${view}`);
        }
    }

    function showHelp() {
        const help = [
            '═══ SMARTFLOW 3D - COMANDOS ═══',
            'CREAR EQUIPO:',
            '  + TIPO TAG X,Y,Z [d=DIAM] [h=ALTURA] [m=MAT]',
            'CREAR LÍNEA SUELTA (colectores, distribuidores):',
            '  % TAG X1,Y1,Z1 X2,Y2,Z2 ... [d=DIAM] [m=MAT]',
            '  (inyecta codos automáticamente en los quiebres)',
            'CREAR LÍNEA CON WAYPOINTS:',
            '  LINEA TAG DESDE EQP.PUERTO POR x,y,z ... HASTA EQP.PUERTO [d=DIAM] [m=MAT]',
            '  (inyecta codos y reductores automáticos)',
            'CONECTAR:',
            '  TAG1.PUERTO1 -> TAG2.PUERTO2 [d=DIAM] [m=MAT]',
            '  TAG1.PUERTO1 -> LINEA@0.5',
            'MODIFICAR:',
            '  ~ TAG d=3000 m=HDPE',
            '  ~ TAG.PUERTO pos=500,200,0 dir=0,1,0 diam=4 status=open',
            '  > TAG X,Y,Z (mover equipo)',
            'ELIMINAR: - TAG',
            'CONSULTAR: ? TAG  ?? (equipos)  ??? (líneas)  nodos TAG',
            'VISTAS: .  .t  .f  .s',
            'OTROS: <<  >>  h  !mto  !pcf  !pdf  !save  !load'
        ].join('\n');
        notify(help);
    }

    function executeBatch(commandsText) {
        const lines = commandsText.split('\n');
        let executed = 0, failed = 0;
        for (let raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed || trimmed.startsWith('//')) continue;
            if (executeCommand(trimmed)) executed++;
            else { failed++; notify(`No entendí: "${trimmed.substring(0, 50)}"`, true); }
        }
        if (executed + failed > 0) {
            notify(`${executed} comandos ejecutados, ${failed} fallidos`, failed > 0);
        }
    }

    function init(coreInstance, catalogInstance, rendererInstance, notifyFn, renderFn) {
        _core = coreInstance;
        _catalog = catalogInstance;
        _notifyUI = notifyFn;
        console.log("Commands v9.0 bilingüe completo listo");
    }

    return { init, executeCommand, executeBatch };
})();
