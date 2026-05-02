
// SmartFlowCommands v8.0 - Léxico bilingüe
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
            case 'MODIFY': return handleModify(tokens);
            case 'DELETE': return handleDelete(tokens);
            case 'MOVE': return handleMove(tokens);
            case 'CONNECT': return handleConnect(tokens, arrowIdx);
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
        // + TIPO TAG X,Y,Z [params]
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
        const newLine = {
            tag,
            diameter: params.diametro || 4,
            material: params.material || 'PPR',
            spec: params.spec || 'PPR_PN12_5',
            points,
            _cachedPoints: points,
            waypoints: points.slice(1, -1),
            components: []
        };
        _core.addLine(newLine);
        if (_core.setSelected) _core.setSelected({ type: 'line', obj: newLine });
        notify(`Línea ${tag} creada (${newLine.diameter}" ${newLine.material}, ${points.length} puntos)`);
        return true;
    }

    function handleModify(tokens) {
        // ~ TAG prop=valor ...
        if (tokens.length < 3) { notify('Uso: ~ TAG d=3000 m=PPR', true); return true; }
        const tag = tokens[1];
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
        // - TAG
        if (tokens.length < 2) { notify('Uso: - TAG', true); return true; }
        const tag = tokens[1];
        const db = _core.getDb();
        if (db.equipos.some(e => e.tag === tag)) { _core.deleteEquipment(tag); notify(`${tag} eliminado`); return true; }
        if (db.lines.some(l => l.tag === tag)) { _core.deleteLine(tag); notify(`${tag} eliminado`); return true; }
        notify(`${tag} no encontrado`, true);
        return true;
    }

    function handleMove(tokens) {
        // > TAG X,Y,Z
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
        // TAG1.PUERTO1 -> TAG2.PUERTO2 [params]
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
        // ? TAG
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
            'CREAR:',
            '  + TIPO TAG X,Y,Z [d=DIAM] [h=ALTURA] [m=MAT]',
            '  % TAG X1,Y1,Z1 X2,Y2,Z2 [d=DIAM] [m=MAT]',
            'CONECTAR:',
            '  TAG1.PUERTO1 -> TAG2.PUERTO2 [d=DIAM] [m=MAT]',
            '  TAG1.PUERTO1 -> LINEA@0.5',
            'MODIFICAR:',
            '  ~ TAG d=3000 m=HDPE',
            '  > TAG X,Y,Z (mover equipo)',
            'ELIMINAR:',
            '  - TAG',
            'CONSULTAR:',
            '  ? TAG (info)  ?? (equipos)  ??? (líneas)',
            '  nodos TAG (ver puertos)',
            'VISTAS: . .t .f .s',
            'OTROS: << >> h !mto !pcf !pdf !save !load'
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
        console.log("Commands v8.0 bilingüe listo");
    }

    return { init, executeCommand, executeBatch };
})();
