
// SmartFlowCommands v9.1 - Léxico bilingüe + Lenguaje natural (sin signos)
const SmartFlowCommands = (function() {
    let _core = null;
    let _catalog = null;
    let _notifyUI = (msg, isErr) => console.log(msg);

    // Diccionario bilingüe (incluye palabras clave para todos los comandos)
    const LEX = {
        // Crear
        'crear': 'CREATE', 'create': 'CREATE', '+': 'CREATE',
        // Modificar
        'modificar': 'MODIFY', 'editar': 'MODIFY', 'edit': 'MODIFY', '~': 'MODIFY',
        // Eliminar
        'eliminar': 'DELETE', 'borrar': 'DELETE', 'delete': 'DELETE', '-': 'DELETE',
        // Mover
        'mover': 'MOVE', 'move': 'MOVE', '>': 'MOVE',
        // Conectar
        'conectar': 'CONNECT', 'connect': 'CONNECT',
        // Línea con waypoints
        'linea': 'LINEA_WP', 'line': 'LINEA_WP',
        // Info
        'info': 'INFO', '?': 'INFO', 'informacion': 'INFO',
        // Listar
        'listar': 'LIST', 'list': 'LIST',
        '??': 'LIST_EQUIPOS', '???': 'LIST_LINEAS',
        // Ayuda
        'ayuda': 'HELP', 'help': 'HELP', 'h': 'HELP',
        // Deshacer/Rehacer
        'undo': 'UNDO', 'deshacer': 'UNDO', '<<': 'UNDO',
        'redo': 'REDO', 'rehacer': 'REDO', '>>': 'REDO',
        // Nodos
        'nodos': 'NODES', 'nodes': 'NODES',
        // Vistas
        'vista': 'VIEW', 'view': 'VIEW',
        'isometrico': 'VIEW_ISO', 'iso': 'VIEW_ISO',
        'top': 'VIEW_TOP', 'planta': 'VIEW_TOP',
        'front': 'VIEW_FRONT', 'frontal': 'VIEW_FRONT',
        'side': 'VIEW_SIDE', 'lateral': 'VIEW_SIDE',
        '.': 'VIEW_ISO', '.t': 'VIEW_TOP', '.f': 'VIEW_FRONT', '.s': 'VIEW_SIDE',
        // Exportar
        'exportar': 'EXPORT', 'export': 'EXPORT',
        '!mto': 'EXPORT_MTO', '!pcf': 'EXPORT_PCF', '!pdf': 'EXPORT_PDF',
        // Guardar/Cargar
        'guardar': 'SAVE', '!save': 'SAVE',
        'cargar': 'LOAD', '!load': 'LOAD',
        // Línea suelta
        '%': 'CREATE_LINE',
        'ruta': 'CREATE_LINE'
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

    // Extrae coordenadas (con o sin paréntesis)
    function extractCoords(str) {
        const m = str.match(/\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : null;
    }

    // Extrae parámetros (d=, h=, m=, s=, pos=, dir=, status=...)
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
            m = t.match(/^pos[=:]\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/i);
            if (m) { p.pos = { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) }; continue; }
            m = t.match(/^dir[=:]\(?\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)\s*\)?/i);
            if (m) { p.dir = { dx: parseFloat(m[1]), dy: parseFloat(m[2]), dz: parseFloat(m[3]) }; continue; }
            if (t.match(/^status[=:](\w+)/i)) { p.status = RegExp.$1.toLowerCase(); continue; }
        }
        return p;
    }

    // Analiza una referencia de nodo: TAG.PUERTO o TAG@POS
    function parseNodeRef(str) {
        const dot = str.indexOf('.');
        if (dot > 0) return { tag: str.substring(0, dot), port: str.substring(dot + 1) };
        const at = str.indexOf('@');
        if (at > 0) return { tag: str.substring(0, at), port: str.substring(at + 1) };
        return { tag: str, port: '1' };
    }

    // Obtiene la posición mundial de un puerto (usando router)
    function getPortWorldPos(tag, portId) {
        const db = _core.getDb();
        const obj = db.equipos.find(e => e.tag === tag) || db.lines.find(l => l.tag === tag);
        if (!obj || typeof SmartFlowRouter === 'undefined') return null;
        return SmartFlowRouter.getPortPosition(obj, portId);
    }

    // Encuentra codo según material y ángulo
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

    // Ángulo entre dos vectores normalizados
    function angleBetweenVectors(v1, v2) {
        const dot = v1.dx * v2.dx + v1.dy * v2.dy + v1.dz * v2.dz;
        return Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
    }

    // Inyecta codos automáticos en los quiebres de una línea
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

    // ==================== EJECUCIÓN PRINCIPAL ====================
    function executeCommand(cmd) {
        if (!cmd || cmd.startsWith('//')) return false;
        const tokens = tokenize(cmd);
        if (!tokens.length) return false;

        // Detectar flecha para conexión (compatibilidad)
        let arrowIdx = tokens.indexOf('->');
        if (arrowIdx < 0) {
            // Buscar palabra de enlace 'a' o 'to'
            const aIdx = tokens.findIndex(t => t.toLowerCase() === 'a' || t.toLowerCase() === 'to');
            if (aIdx > 0 && aIdx < tokens.length - 1) {
                const left = tokens.slice(0, aIdx).join('');
                const right = tokens.slice(aIdx + 1).join(' ');
                if (left.includes('.') || right.includes('.')) {
                    arrowIdx = aIdx;
                }
            }
        }
        if (arrowIdx > 0) {
            return handleConnect(tokens, arrowIdx);
        }

        const first = tokens[0].toLowerCase();
        const action = LEX[first] || first.toUpperCase();

        // Si es "crear linea", redirigir a CREATE_LINE (ruta)
        if (action === 'CREATE' && tokens.length >= 3 && (tokens[1].toLowerCase() === 'linea' || tokens[1].toLowerCase() === 'line')) {
            return handleCreateLineFromCreate(tokens);
        }

        switch (action) {
            case 'CREATE': return handleCreateEquipo(tokens);
            case 'CREATE_LINE': return handleCreateLine(tokens);
            case 'LINEA_WP': return handleLineWithWaypoints(tokens);
            case 'MODIFY': return handleModify(tokens);
            case 'DELETE': return handleDelete(tokens);
            case 'MOVE': return handleMove(tokens);
            case 'CONNECT':
                // Si llegó con 'conectar' pero sin 'a' ni '->', asumir estructura directa
                if (tokens.length >= 3) {
                    const left = tokens[1];
                    const right = tokens.slice(2).join('');
                    if (left.includes('.') && right.includes('.')) {
                        return handleConnect(['', left, 'a', right], 2);
                    }
                }
                notify('Formato de conexión. Use: conectar ORIGEN a DESTINO', true);
                return true;
            case 'INFO': return handleInfo(tokens);
            case 'LIST': return handleList(tokens);
            case 'LIST_EQUIPOS': listEquipos(); return true;
            case 'LIST_LINEAS': listLineas(); return true;
            case 'HELP': showHelp(); return true;
            case 'UNDO': if (_core) _core.undo(); notify('Deshacer'); return true;
            case 'REDO': if (_core) _core.redo(); notify('Rehacer'); return true;
            case 'NODES': return handleNodes(tokens);
            case 'VIEW':
                // Manejar "vista top", "vista front", etc.
                if (tokens.length >= 2) {
                    const sub = tokens[1].toLowerCase();
                    if (sub === 'iso' || sub === 'isometrico') setView('iso');
                    else if (sub === 'top' || sub === 'planta') setView('top');
                    else if (sub === 'front' || sub === 'frontal') setView('front');
                    else if (sub === 'side' || sub === 'lateral') setView('side');
                    else notify('Vista no reconocida. Use: vista iso|top|front|side', true);
                } else {
                    setView('iso');
                }
                return true;
            case 'VIEW_ISO': setView('iso'); return true;
            case 'VIEW_TOP': setView('top'); return true;
            case 'VIEW_FRONT': setView('front'); return true;
            case 'VIEW_SIDE': setView('side'); return true;
            case 'EXPORT':
                if (tokens.length >= 2) {
                    const type = tokens[1].toLowerCase();
                    if (type === 'mto') { if (typeof SmartFlowIO !== 'undefined') SmartFlowIO.exportMTO(); else notify('IO no disponible', true); }
                    else if (type === 'pcf') { if (typeof SmartFlowIO !== 'undefined') SmartFlowIO.exportPCF(); else notify('IO no disponible', true); }
                    else if (type === 'pdf') { if (typeof SmartFlowIO !== 'undefined') SmartFlowIO.exportPDF(); else notify('IO no disponible', true); }
                    else notify('Exportación no reconocida. Use: exportar mto|pcf|pdf', true);
                } else notify('Especifique: exportar mto|pcf|pdf', true);
                return true;
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

    // -------------------- HANDLERS DE COMANDOS --------------------
    function handleCreateEquipo(tokens) {
        // crear TIPO TAG en X,Y,Z [params]
        // Quitar 'crear' y buscar 'en' o 'at'
        const enIdx = tokens.findIndex(t => t.toLowerCase() === 'en' || t.toLowerCase() === 'at');
        if (enIdx < 0) {
            notify('Formato: crear TIPO TAG en X,Y,Z [d=DIAM] [h=ALTURA] [m=MATERIAL]', true);
            return true;
        }
        const tipo = tokens[1];
        const tag = tokens[2];
        const coordTokens = tokens.slice(enIdx + 1);
        const coordStr = coordTokens.join('');
        const coords = extractCoords(coordStr);
        if (!coords) { notify('Coordenadas inválidas', true); return true; }
        const params = extractParams(coordTokens.slice(1));
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

    function handleCreateLineFromCreate(tokens) {
        // crear linea TAG ruta X1,Y1,Z1 X2,Y2,Z2 ... [params]
        // tokens[0] = crear, tokens[1] = linea, tokens[2] = TAG, tokens[3] = ruta (opcional)
        let tagIdx = 2;
        if (tokens[2].toLowerCase() === 'ruta') tagIdx = 3;
        if (tagIdx >= tokens.length) { notify('Falta tag de línea', true); return true; }
        const tag = tokens[tagIdx];
        const rutaIdx = tokens.findIndex(t => t.toLowerCase() === 'ruta');
        const points = [];
        let startIdx = rutaIdx >= 0 ? rutaIdx + 1 : tagIdx + 1;
        let i = startIdx;
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

    function handleCreateLine(tokens) {
        // % TAG X1,Y1,Z1 X2,Y2,Z2 ... [params]   o   ruta TAG X1,Y1,Z1 ...
        let tagIdx = 1;
        if (tokens[0] === '%') tagIdx = 1;
        else if (tokens[0].toLowerCase() === 'ruta') tagIdx = 1;
        else { notify('Formato: % TAG X1,Y1,Z1 ...', true); return true; }
        if (tokens.length < tagIdx + 2) { notify('Uso: % TAG X1,Y1,Z1 X2,Y2,Z2 [d=DIAM] [m=MATERIAL]', true); return true; }
        const tag = tokens[tagIdx];
        const points = [];
        let i = tagIdx + 1;
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
        // linea TAG desde EQP.PUERTO por x,y,z ... hasta EQP.PUERTO [params]
        const desdeIdx = tokens.findIndex(t => t.toLowerCase() === 'desde');
        const porIdx = tokens.findIndex(t => t.toLowerCase() === 'por');
        const hastaIdx = tokens.findIndex(t => t.toLowerCase() === 'hasta');

        if (desdeIdx < 0 || hastaIdx < 0) {
            notify('Uso: linea TAG desde EQP.PUERTO por x,y,z ... hasta EQP.PUERTO [d=DIAM] [m=MAT]', true);
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

        // Reductor si hay diferencia de diámetros
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
        // modificar TAG [prop=valor]   o   modificar TAG.PUERTO [pos=, dir=, diam=]
        if (tokens.length < 3) { notify('Uso: modificar TAG [prop=valor] o modificar TAG.PUERTO [pos=x,y,z] [dir=dx,dy,dz] [diam=4]', true); return true; }
        const tagOrRef = tokens[1];
        const dotIdx = tagOrRef.indexOf('.');
        if (dotIdx > 0) {
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
        // eliminar TAG
        if (tokens.length < 2) { notify('Uso: eliminar TAG', true); return true; }
        const tag = tokens[1];
        const db = _core.getDb();
        if (db.equipos.some(e => e.tag === tag)) { _core.deleteEquipment(tag); notify(`${tag} eliminado`); return true; }
        if (db.lines.some(l => l.tag === tag)) { _core.deleteLine(tag); notify(`${tag} eliminado`); return true; }
        notify(`${tag} no encontrado`, true);
        return true;
    }

    function handleMove(tokens) {
        // mover TAG a X,Y,Z
        const aIdx = tokens.findIndex(t => t.toLowerCase() === 'a' || t.toLowerCase() === 'to');
        if (aIdx < 0) { notify('Uso: mover TAG a X,Y,Z', true); return true; }
        const tag = tokens[1];
        const coordStr = tokens.slice(aIdx + 1).join('');
        const coords = extractCoords(coordStr);
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
        const leftSide = tokens.slice(0, arrowIdx);
        const rightSide = tokens.slice(arrowIdx + 1);
        if (!rightSide.length) { notify('Falta destino después de la palabra de enlace', true); return true; }
        const left = parseNodeRef(leftSide.join(''));
        const right = parseNodeRef(rightSide[0]);
        if (!left.tag || !right.tag) { notify('Origen o destino inválido', true); return true; }
        const params = extractParams(rightSide.slice(1));
        if (typeof SmartFlowRouter !== 'undefined') {
            SmartFlowRouter.routeBetweenPorts(
                left.tag, left.port,
                right.tag, right.port,
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
        if (tokens.length < 2) { notify('Uso: info TAG', true); return true; }
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
        } else if (sub === 'líneas' || sub === 'lineas') {
            listLineas();
        } else if (sub === 'specs' || sub === 'especificaciones') {
            const specs = _catalog.listSpecs();
            notify(`Especificaciones: ${specs.sort().join(', ')}`);
        } else {
            notify('Use: listar equipos | listar lineas | listar componentes | listar especificaciones');
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
            '  crear TIPO TAG en X,Y,Z [d=DIAM] [h=ALTURA] [m=MAT]',
            'CREAR LÍNEA SUELTA (colectores, distribuidores):',
            '  crear linea TAG ruta X1,Y1,Z1 X2,Y2,Z2 ... [d=DIAM] [m=MAT]',
            '  (inyecta codos automáticamente en los quiebres)',
            'CREAR LÍNEA CON WAYPOINTS:',
            '  linea TAG desde EQP.PUERTO por x,y,z ... hasta EQP.PUERTO [d=DIAM] [m=MAT]',
            '  (inyecta codos y reductores automáticos)',
            'CONECTAR:',
            '  conectar EQP1.PUERTO1 a EQP2.PUERTO2 [d=DIAM] [m=MAT]',
            '  EQP1.PUERTO1 a LINEA@0.5',
            'MODIFICAR:',
            '  modificar TAG d=3000 m=HDPE',
            '  modificar TAG.PUERTO pos=500,200,0 dir=0,1,0 diam=4 status=open',
            'MOVER:',
            '  mover TAG a X,Y,Z',
            'ELIMINAR: eliminar TAG',
            'CONSULTAR: info TAG  listar equipos  listar lineas  nodos TAG',
            'VISTAS: vista iso  vista top  vista front  vista side',
            'OTROS: deshacer  rehacer  ayuda  exportar mto/pcf/pdf  guardar  cargar'
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
        console.log("Commands v9.1 lenguaje natural listo");
    }

    return { init, executeCommand, executeBatch };
})();
