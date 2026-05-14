
// ============================================================
// MÓDULO 6: SMARTFLOW ROUTER (Enrutamiento Automático) - v3.2
// Archivo: js/router.js
// Correcciones: Ortogonalidad forzada + Fitting length + Normalización precisa
// ============================================================

const SmartFlowRouter = (function() {
    
    let _core = null;
    let _catalog = null;
    let _notifyUI = (msg, isErr) => console.log(msg);
    let _renderUI = () => {};

    // Constante de tolerancia para comparaciones de ángulo
    const ANGLE_TOLERANCE = 0.9999; // cos(0.81°) ≈ 0.9999 → ±0.8° de margen
    const ORTHOGONAL_TOLERANCE = 0.0175; // sin(1°) ≈ 0.0175 → ±1° para ortogonalidad
    const MIN_ANGLE_FOR_ELBOW = 5; // grados mínimos para insertar codo
    const EXTENSION_DISTANCE = 500; // mm de extensión desde el puerto

    function ensureInitialized() {
        if (!_core && typeof SmartFlowCore !== 'undefined') _core = SmartFlowCore;
        if (!_catalog && typeof SmartFlowCatalog !== 'undefined') _catalog = SmartFlowCatalog;
        if (_core && _catalog) return true;
        return false;
    }

    function speakText(text) {
        if (!window.voiceEnabled) return;
        if (typeof window.speechSynthesis !== 'undefined') {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    }

    function notifyUser(message, isError = false) {
        if (typeof _notifyUI === 'function') _notifyUI(message, isError);
        const statusEl = document.getElementById('statusMsg');
        if (statusEl) {
            statusEl.innerText = message;
            statusEl.style.color = isError ? '#ef4444' : '#00f2ff';
        }
        speakText(message);
    }

    function distance(p1, p2) { return Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z); }
    function addPoints(p1, p2) { return { x: p1.x + p2.x, y: p1.y + p2.y, z: p1.z + p2.z }; }
    function subtractPoints(p1, p2) { return { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z }; }
    function scalePoint(p, factor) { return { x: p.x * factor, y: p.y * factor, z: p.z * factor }; }
    function normalizeVector(v) {
        const len = Math.hypot(v.x, v.y, v.z);
        if (len === 0) return { x: 1, y: 0, z: 0 };
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }
    function dotProduct(v1, v2) { return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z; }
    function crossProduct(v1, v2) {
        return {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
    }
    function projectPointOnSegment(p, a, b) {
        const ab = subtractPoints(b, a);
        const ap = subtractPoints(p, a);
        const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
        if (len2 === 0) return { point: a, t: 0, distance: distance(p, a) };
        let t = dotProduct(ap, ab) / len2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
        return { point: proj, t, distance: distance(p, proj) };
    }

    // ==================== NUEVO: Cálculo de intersección ortogonal ====================
    /**
     * Calcula el punto de intersección entre la extensión de un vector desde un puerto
     * y un plano ortogonal que contiene el punto objetivo.
     * Retorna el punto de quiebre y la distancia del fitting requerida.
     */
    function calculateOrthogonalIntersection(portPos, portDir, targetPos) {
        // Normalizar vectores de entrada
        const dir = normalizeVector(portDir);
        const toTarget = subtractPoints(targetPos, portPos);
        
        // Proyectar el vector hacia el objetivo sobre la dirección del puerto
        const projLength = dotProduct(toTarget, dir);
        
        // Punto de intersección: extendemos a lo largo de la dirección del puerto
        // hasta que se alinee ortogonalmente con el target
        const intersection = addPoints(portPos, scalePoint(dir, projLength));
        
        // Vector desde la intersección hasta el target (debe ser ortogonal a dir)
        const lateralVector = subtractPoints(targetPos, intersection);
        const lateralDir = normalizeVector(lateralVector);
        
        // Verificar ortogonalidad
        const dotCheck = Math.abs(dotProduct(dir, lateralDir));
        const isOrthogonal = dotCheck < ORTHOGONAL_TOLERANCE;
        
        // Calcular ángulo real para diagnóstico
        const angleRad = Math.acos(Math.max(-1, Math.min(1, Math.abs(dotProduct(dir, lateralDir)))));
        const angleDeg = angleRad * 180 / Math.PI;
        
        return {
            intersection,
            lateralVector,
            lateralDir,
            lateralDistance: Math.hypot(lateralVector.x, lateralVector.y, lateralVector.z),
            isOrthogonal,
            angleDeg: 90 - angleDeg, // desviación de 90°
            needsElbow: !isOrthogonal && (Math.abs(90 - angleDeg) > MIN_ANGLE_FOR_ELBOW)
        };
    }

    // ==================== NUEVO: Obtener fitting length del catálogo ====================
    function getFittingLength(componentType, diameter) {
        const catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) return 0;
        
        try {
            const comp = catalog.getComponent(componentType);
            if (!comp) return 0;
            
            // Buscar en dimensiones del componente
            const dims = comp.dimensiones || comp.dimensions;
            if (!dims) return 0;
            
            // Intentar obtener dimensión específica para el diámetro
            const diamKey = `${diameter}"` || `${diameter}`;
            const dimForDiam = dims[diamKey] || dims[diameter] || dims.DEFAULT;
            
            if (dimForDiam && dimForDiam.centerToFace) {
                return dimForDiam.centerToFace; // mm
            }
            
            // Fallback: valores típicos
            const typicalLengths = {
                'ELBOW_90': 38, 'ELBOW_45': 25, 'TEE': 50, 'TEE_EQUAL': 50,
                'TEE_REDUCING': 55, 'CONCENTRIC_REDUCER': 75
            };
            
            for (const [key, val] of Object.entries(typicalLengths)) {
                if (componentType.includes(key)) return val;
            }
        } catch (e) {
            console.warn('Error obteniendo fitting length:', e);
        }
        
        return 50; // default conservador
    }

    function getPortPosition(obj, portId) {
        if (!obj) return null;
        if (obj.posX !== undefined) {
            const puerto = obj.puertos?.find(p => p.id === portId);
            if (!puerto) return null;
            return {
                x: obj.posX + (puerto.relX || puerto.relPos?.x || 0),
                y: obj.posY + (puerto.relY || puerto.relPos?.y || 0),
                z: obj.posZ + (puerto.relZ || puerto.relPos?.z || 0)
            };
        }
        if (obj.pos && obj.pos.x !== undefined) {
            const puerto = obj.puertos?.find(p => p.id === portId);
            if (!puerto) return null;
            return {
                x: obj.pos.x + (puerto.relX || puerto.relPos?.x || 0),
                y: obj.pos.y + (puerto.relY || puerto.relPos?.y || 0),
                z: obj.pos.z + (puerto.relZ || puerto.relPos?.z || 0)
            };
        }
        const pts = obj._cachedPoints || obj.points3D || obj.points;
        if (!pts || pts.length === 0) return null;
        if (obj.puertos) {
            const puerto = obj.puertos.find(p => p.id === portId);
            if (puerto && puerto.pos) return puerto.pos;
        }
        if (portId === '0') return pts[0];
        if (portId === '1') return pts[pts.length - 1];
        return pts[Math.floor(pts.length / 2)];
    }

    function getPortDirection(obj, portId) {
        if (!obj) return { dx: 1, dy: 0, dz: 0 };
        if (obj.posX !== undefined || (obj.pos && obj.pos.x !== undefined)) {
            const puerto = obj.puertos?.find(p => p.id === portId);
            if (puerto) {
                // Prioridad: orientacion, luego dir, luego normal
                if (puerto.orientacion) return puerto.orientacion;
                if (puerto.dir) return puerto.dir;
                if (puerto.normal) return puerto.normal;
            }
            return { dx: 1, dy: 0, dz: 0 };
        }
        const pts = obj._cachedPoints || obj.points3D || obj.points;
        if (pts && pts.length >= 2) {
            if (portId === '0') return normalizeVector(subtractPoints(pts[1], pts[0]));
            if (portId === '1') return normalizeVector(subtractPoints(pts[pts.length - 1], pts[pts.length - 2]));
            return normalizeVector(subtractPoints(pts[1], pts[0]));
        }
        return { dx: 1, dy: 0, dz: 0 };
    }

    // ==================== findComponentInCatalog ====================
    function findComponentInCatalog(desiredType, lineMaterial = 'PPR', fallbackTypes = []) {
        ensureInitialized();
        const catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) { notifyUser('Catálogo no disponible', true); return null; }
        const allTypes = catalog.listComponentTypes();
        
        const materialUpper = lineMaterial.toUpperCase();
        let materialPrefix = '';
        if (materialUpper.includes('PPR')) materialPrefix = 'PPR';
        else if (materialUpper.includes('HDPE')) materialPrefix = 'HDPE';
        else if (materialUpper.includes('PVC')) materialPrefix = 'PVC';
        else if (materialUpper.includes('ACERO') || materialUpper.includes('CARBONO') || materialUpper.includes('CS')) materialPrefix = 'CS';
        else if (materialUpper.includes('INOX')) materialPrefix = 'SS';
        
        const candidates = [];
        if (materialPrefix) {
            candidates.push(`${desiredType}_${materialPrefix}`);
            if (desiredType.includes('REDUCER')) {
                candidates.push(`CONCENTRIC_REDUCER_${materialPrefix}`);
                candidates.push(`ECCENTRIC_REDUCER_${materialPrefix}`);
            }
        }
        candidates.push(desiredType);
        for (let fb of fallbackTypes) {
            if (materialPrefix) candidates.push(`${fb}_${materialPrefix}`);
            candidates.push(fb);
        }
        for (let candidate of candidates) {
            if (allTypes.includes(candidate)) return candidate;
        }
        const baseName = desiredType.split('_')[0];
        for (let type of allTypes) {
            if (type.toUpperCase().includes(baseName) && materialPrefix && type.toUpperCase().includes(materialPrefix)) return type;
        }
        for (let type of allTypes) {
            if (type.toUpperCase().includes(baseName)) return type;
        }
        return null;
    }

    // ==================== findElbowForLine MEJORADA (v3.2) ====================
    function findElbowForLine(material, diameter, angleDeg) {
        const catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) return null;

        // Clasificar el ángulo con tolerancia ampliada
        const is90 = (Math.abs(angleDeg - 90) < 15);
        const is45 = (Math.abs(angleDeg - 45) < 15);
        if (!is90 && !is45) {
            console.warn(`⚠️ Ángulo ${angleDeg.toFixed(1)}° no soportado para codo automático`);
            return null;
        }

        const mat = (material || '').toUpperCase();
        const typeBase = is90 ? 'ELBOW_90' : 'ELBOW_45';
        
        // 1. Intentar búsqueda específica por material
        let suffix = '';
        if (mat.includes('PPR')) suffix = '_PPR';
        else if (mat.includes('HDPE') || mat.includes('PE100')) suffix = '_HDPE';
        else if (mat.includes('PVC')) suffix = '_PVC';
        else if (mat.includes('ACERO') || mat.includes('CARBON') || mat.includes('CS')) suffix = '_LR_CS';
        else if (mat.includes('SANITARY') || mat.includes('INOX') || mat.includes('316L')) suffix = '_SANITARY';
        else if (mat.includes('SS')) suffix = '_LR_SS';

        const specificName = typeBase + suffix;
        const allTypes = catalog.listComponentTypes();

        if (allTypes.includes(specificName)) {
            console.log(`✅ Codo específico: ${specificName} (${angleDeg.toFixed(0)}°)`);
            return specificName;
        }

        // 2. Fallback: Buscar cualquier codo que contenga el ángulo y el material
        const materialFallback = allTypes.find(t => 
            t.includes(typeBase) && suffix && t.toUpperCase().includes(suffix.replace(/_/g, '').substring(0, 2))
        );
        if (materialFallback) {
            console.log(`⚠️ Codo material fallback: ${materialFallback}`);
            return materialFallback;
        }

        // 3. Fallback genérico: cualquier codo con ese ángulo
        const fallback = allTypes.find(t => t.includes(typeBase));
        if (fallback) {
            console.log(`⚠️ Codo genérico: ${fallback}`);
            return fallback;
        }

        console.warn(`❌ No se encontró codo para ${mat} ${angleDeg.toFixed(0)}°`);
        return null;
    }

    function insertarAccesorioEnLinea(lineTag, puntoConexion, diametroNuevaLinea, forzarTee = false) {
        ensureInitialized();
        if (!_core) { notifyUser('Core no inicializado', true); return null; }
        const db = _core.getDb();
        const linea = db.lines.find(l => l.tag === lineTag);
        if (!linea) { notifyUser(`Línea ${lineTag} no encontrada`, true); return null; }

        const pts = linea._cachedPoints || linea.points3D || linea.points;
        if (!pts || pts.length < 2) { notifyUser(`Línea ${lineTag} sin geometría`, true); return null; }

        let lengths = [], totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const d = distance(pts[i], pts[i+1]);
            lengths.push(d);
            totalLen += d;
        }

        let minDist = Infinity, bestSegIdx = 0, bestT = 0;
        for (let i = 0; i < lengths.length; i++) {
            const proj = projectPointOnSegment(puntoConexion, pts[i], pts[i+1]);
            if (proj.distance < minDist) {
                minDist = proj.distance;
                bestSegIdx = i;
                bestT = proj.t;
            }
        }

        let accumBefore = 0;
        for (let i = 0; i < bestSegIdx; i++) accumBefore += lengths[i];
        const param = (accumBefore + bestT * lengths[bestSegIdx]) / totalLen;

        const diamLinea = linea.diameter || 4;
        const diffDiam = Math.abs(diametroNuevaLinea - diamLinea) > 0.1;
        const esExtremo = !forzarTee && ((bestSegIdx === 0 && bestT < 0.1) || (bestSegIdx === lengths.length - 1 && bestT > 0.9));
        const lineMaterial = linea.material || 'PPR';

        let tipoAccesorio = 'TEE';
        let descripcion = 'Tee igual';

        if (esExtremo && diffDiam) {
            tipoAccesorio = 'CONCENTRIC_REDUCER';
            descripcion = `Reductor concéntrico ${diamLinea}"x${diametroNuevaLinea}"`;
        } else if (diffDiam) {
            tipoAccesorio = 'TEE_REDUCING';
            descripcion = `Tee reductora ${diamLinea}"x${diametroNuevaLinea}"`;
        } else {
            tipoAccesorio = 'TEE';
            descripcion = `Tee igual ${diamLinea}"`;
        }

        const compEnCatalogo = findComponentInCatalog(tipoAccesorio, lineMaterial, []);
        if (!compEnCatalogo) {
            notifyUser(`Componente no encontrado: ${tipoAccesorio} (${lineMaterial})`, true);
            return null;
        }

        if (typeof SmartFlowCommands === 'undefined') {
            notifyUser('Módulo de comandos no disponible', true);
            return null;
        }

        const cmd = `edit line ${lineTag} add component ${compEnCatalogo} at ${param.toFixed(3)}`;
        const success = SmartFlowCommands.executeCommand(cmd);
        if (!success) {
            notifyUser(`Comando falló: ${cmd}`, true);
            return null;
        }

        notifyUser(`✅ ${descripcion} (${compEnCatalogo}) insertado en ${lineTag}`, false);

        const lineaActualizada = db.lines.find(l => l.tag === lineTag);
        if (!lineaActualizada || !lineaActualizada.puertos || lineaActualizada.puertos.length === 0) {
            notifyUser('No se generaron puertos', true);
            return null;
        }
        const nuevoPuerto = lineaActualizada.puertos[lineaActualizada.puertos.length - 1];
        return nuevoPuerto.id;
    }

    function procesarInterseccionesDeLinea(nuevaLinea) {
        ensureInitialized();
        if (!_core) return;
        const db = _core.getDb();
        const lineasExistentes = db.lines.filter(l => l.tag !== nuevaLinea.tag);
        if (lineasExistentes.length === 0) return;
        
        const ptsNueva = nuevaLinea._cachedPoints || nuevaLinea.points3D || nuevaLinea.points;
        if (!ptsNueva || ptsNueva.length < 2) return;
        
        const tolerancia = 100;
        for (let lineaExistente of lineasExistentes) {
            const ptsExistente = lineaExistente._cachedPoints || lineaExistente.points3D || lineaExistente.points;
            if (!ptsExistente || ptsExistente.length < 2) continue;
            
            for (let i = 0; i < ptsNueva.length - 1; i++) {
                const a1 = ptsNueva[i], a2 = ptsNueva[i+1];
                for (let j = 0; j < ptsExistente.length - 1; j++) {
                    const b1 = ptsExistente[j], b2 = ptsExistente[j+1];
                    const midNuevo = { x: (a1.x+a2.x)/2, y: (a1.y+a2.y)/2, z: (a1.z+a2.z)/2 };
                    const proj = projectPointOnSegment(midNuevo, b1, b2);
                    if (proj.distance < tolerancia) {
                        const puertoId = insertarAccesorioEnLinea(lineaExistente.tag, proj.point, nuevaLinea.diameter || 4, true);
                        if (puertoId) {
                            nuevaLinea.destination = { objType: 'line', equipTag: lineaExistente.tag, portId: puertoId };
                            if (ptsNueva.length >= 2) {
                                ptsNueva[ptsNueva.length - 1] = proj.point;
                                nuevaLinea._cachedPoints = ptsNueva;
                                nuevaLinea.waypoints = ptsNueva.slice(1, -1);
                            }
                            if (lineaExistente.puertos) {
                                const puerto = lineaExistente.puertos.find(p => p.id === puertoId);
                                if (puerto) puerto.connectedLine = nuevaLinea.tag;
                            }
                            _core.updateLine(nuevaLinea.tag, nuevaLinea);
                            notifyUser(`✅ Conexión automática: ${nuevaLinea.tag} a ${lineaExistente.tag}`, false);
                        }
                        return;
                    }
                }
            }
        }
    }

    // ==================== routeBetweenPorts MEJORADO (v3.2) ====================
    function routeBetweenPorts(fromEquipTag, fromPortId, toEquipTag, toPortId, diameter = 3, material = 'PPR', spec = 'PPR_PN12_5') {
        ensureInitialized();
        if (!_core) { notifyUser('Core no inicializado', true); return null; }
        const db = _core.getDb();
        const fromObj = db.equipos.find(e => e.tag === fromEquipTag) || db.lines.find(l => l.tag === fromEquipTag);
        let toObj = db.equipos.find(e => e.tag === toEquipTag) || db.lines.find(l => l.tag === toEquipTag);

        if (!fromObj) { notifyUser(`Origen ${fromEquipTag} no encontrado`, true); return null; }
        if (!toObj) { notifyUser(`Destino ${toEquipTag} no encontrado`, true); return null; }

        let startPos = getPortPosition(fromObj, fromPortId);
        if (!startPos) { notifyUser(`Puerto origen ${fromPortId} no encontrado`, true); return null; }

        let endPos, nuevoPuertoId = toPortId;
        let reductorComponent = null;

        if (toObj._cachedPoints || toObj.points3D || toObj.points) {
            const pts = toObj._cachedPoints || toObj.points3D || toObj.points;
            if (!pts || pts.length < 2) {
                notifyUser(`La línea ${toEquipTag} no tiene geometría`, true);
                return null;
            }
            
            if (!toPortId || toPortId === '') {
                let minDist = Infinity, bestPoint = pts[0];
                for (let i = 0; i < pts.length - 1; i++) {
                    const proj = projectPointOnSegment(startPos, pts[i], pts[i+1]);
                    if (proj.distance < minDist) { minDist = proj.distance; bestPoint = proj.point; }
                }
                const puertoInsertado = insertarAccesorioEnLinea(toEquipTag, bestPoint, diameter, true);
                if (!puertoInsertado) return null;
                nuevoPuertoId = puertoInsertado;
                toObj = db.lines.find(l => l.tag === toEquipTag);
            } else {
                let puntoConexion;
                if (toPortId === '0') puntoConexion = pts[0];
                else if (toPortId === '1') puntoConexion = pts[pts.length - 1];
                else puntoConexion = getPortPosition(toObj, toPortId);
                
                if (!puntoConexion) { notifyUser(`Puerto destino no encontrado`, true); return null; }

                const esExtremo = (toPortId === '0' || toPortId === '1');
                const diffDiam = Math.abs(diameter - (toObj.diameter || 4)) > 0.1;
                
                if (esExtremo && !diffDiam) {
                    nuevoPuertoId = toPortId;
                } else if (esExtremo && diffDiam) {
                    const puertoInsertado = insertarAccesorioEnLinea(toEquipTag, puntoConexion, diameter, false);
                    if (puertoInsertado) { nuevoPuertoId = puertoInsertado; toObj = db.lines.find(l => l.tag === toEquipTag); }
                    else {
                        const reductorId = findComponentInCatalog('CONCENTRIC_REDUCER', material, []);
                        if (reductorId) {
                            reductorComponent = { type: reductorId, tag: reductorId + '-' + Date.now().toString().slice(-6), param: 1.0 };
                            notifyUser(`⚠️ Reductor añadido a la nueva línea`, false);
                        }
                        nuevoPuertoId = toPortId;
                    }
                } else {
                    const puertoInsertado = insertarAccesorioEnLinea(toEquipTag, puntoConexion, diameter, true);
                    if (!puertoInsertado) return null;
                    nuevoPuertoId = puertoInsertado;
                    toObj = db.lines.find(l => l.tag === toEquipTag);
                }
            }
        }

        endPos = getPortPosition(toObj, nuevoPuertoId);
        if (!endPos) { notifyUser(`Puerto destino no encontrado`, true); return null; }

        // ===== OBTENER VECTORES DE DIRECCIÓN NORMALIZADOS =====
        const startDirRaw = getPortDirection(fromObj, fromPortId);
        const startDir = normalizeVector(startDirRaw);
        
        let endDirRaw, endDir;
        const isEquipoDest = toObj.posX !== undefined || (toObj.pos && toObj.pos.x !== undefined);
        if (isEquipoDest) {
            endDirRaw = getPortDirection(toObj, nuevoPuertoId);
            endDir = normalizeVector(endDirRaw);
        } else {
            // Para líneas, calcular dirección desde el penúltimo punto hacia el último
            const ptsTo = toObj._cachedPoints || toObj.points3D || toObj.points;
            if (ptsTo && ptsTo.length >= 2) {
                endDir = normalizeVector(subtractPoints(ptsTo[ptsTo.length - 1], ptsTo[ptsTo.length - 2]));
            } else {
                endDir = { dx: 1, dy: 0, dz: 0 };
            }
        }

        // ===== NUEVO: Calcular intersección ortogonal para origen =====
        const orthoResultStart = calculateOrthogonalIntersection(startPos, startDir, endPos);
        
        // ===== NUEVO: Calcular intersección ortogonal para destino =====
        const endDirInverted = scalePoint(endDir, -1); // Invertir dirección para el cálculo
        const orthoResultEnd = calculateOrthogonalIntersection(endPos, endDirInverted, startPos);
        
        // ===== CONSTRUIR WAYPOINTS CON LÓGICA ORTOGONAL =====
        const waypoints = [startPos];
        
        // Extender desde el origen en la dirección del puerto
        const extStart = addPoints(startPos, scalePoint(startDir, EXTENSION_DISTANCE));
        
        if (orthoResultStart.isOrthogonal) {
            // Caso ideal: podemos ir directo con un waypoint intermedio
            waypoints.push(extStart);
            waypoints.push(orthoResultStart.intersection);
        } else {
            // Necesitamos un quiebre forzado
            waypoints.push(extStart);
            
            // Punto de quiebre: desde start, avanzar en startDir hasta alinearse
            const breakPoint = orthoResultStart.intersection;
            waypoints.push(breakPoint);
            
            // Desde el quiebre, ir en dirección al destino
            waypoints.push(endPos);
        }
        
        // Filtrar waypoints duplicados o muy cercanos
        let uniqueWaypoints = waypoints.filter((pt, i, arr) => i === 0 || distance(pt, arr[i-1]) > 1);
        
        if (uniqueWaypoints.length < 2) {
            uniqueWaypoints = [startPos, endPos];
        }

        const tag = `L-${db.lines.length + 1}`;
        const nuevaLinea = {
            tag, diameter, material, spec,
            origin: { objType: (fromObj.posX !== undefined || (fromObj.pos && fromObj.pos.x !== undefined)) ? 'equipment' : 'line', equipTag: fromEquipTag, portId: fromPortId },
            destination: { objType: isEquipoDest ? 'equipment' : 'line', equipTag: toEquipTag, portId: nuevoPuertoId },
            waypoints: uniqueWaypoints.slice(1, -1),
            _cachedPoints: [...uniqueWaypoints],
            points3D: [...uniqueWaypoints],
            points: [...uniqueWaypoints],
            components: []
        };

        // ===== AUTO-CODO EN ORIGEN CON FITTING LENGTH (v3.2) =====
        try {
            if (uniqueWaypoints.length >= 3) {
                const seg1Dir = normalizeVector(subtractPoints(uniqueWaypoints[1], uniqueWaypoints[0]));
                const seg2Dir = normalizeVector(subtractPoints(uniqueWaypoints[2], uniqueWaypoints[1]));
                
                const dot = dotProduct(seg1Dir, seg2Dir);
                
                // Usar tolerancia precisa en lugar de < 0.99
                if (Math.abs(dot) < ANGLE_TOLERANCE) {
                    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
                    const angleDeg = angleRad * 180 / Math.PI;
                    
                    if (Math.abs(angleDeg) > MIN_ANGLE_FOR_ELBOW) {
                        const elbowId = findElbowForLine(material, diameter, angleDeg);
                        if (elbowId) {
                            // Obtener fitting length y ajustar el waypoint
                            const fittingLen = getFittingLength(elbowId, diameter);
                            
                            nuevaLinea.components.push({
                                type: elbowId,
                                tag: `${elbowId}-${Math.random().toString(36).substr(2, 5)}`,
                                param: 0.0
                            });
                            
                            // Ajustar el primer segmento restando el fitting length
                            if (fittingLen > 0 && uniqueWaypoints.length >= 2) {
                                const offsetDir = normalizeVector(subtractPoints(uniqueWaypoints[1], uniqueWaypoints[0]));
                                const adjustedPoint = addPoints(uniqueWaypoints[0], scalePoint(offsetDir, Math.max(0, distance(uniqueWaypoints[0], uniqueWaypoints[1]) - fittingLen)));
                                
                                // Solo ajustar si no colapsa el segmento
                                if (distance(uniqueWaypoints[0], adjustedPoint) > 10) {
                                    uniqueWaypoints[0] = adjustedPoint;
                                    nuevaLinea._cachedPoints = [...uniqueWaypoints];
                                    nuevaLinea.points3D = [...uniqueWaypoints];
                                    nuevaLinea.points = [...uniqueWaypoints];
                                }
                            }
                            
                            notifyUser(`✅ Codo ${angleDeg.toFixed(0)}° (${elbowId}) inyectado en origen de ${tag}. Ángulo real: ${angleDeg.toFixed(2)}°`);
                        }
                    }
                }
            }
        } catch (e) { console.warn("Error en codo origen:", e); }

        // ===== AUTO-CODO EN DESTINO CON FITTING LENGTH (v3.2) =====
        try {
            const pts = nuevaLinea._cachedPoints;
            if (pts && pts.length >= 3) {
                const lastIdx = pts.length - 1;
                const segLastDir = normalizeVector(subtractPoints(pts[lastIdx], pts[lastIdx - 1]));
                const segPrevDir = normalizeVector(subtractPoints(pts[lastIdx - 1], pts[lastIdx - 2]));
                
                const dot = dotProduct(segLastDir, segPrevDir);
                
                // Usar tolerancia precisa
                if (Math.abs(dot) < ANGLE_TOLERANCE) {
                    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
                    const angleDeg = angleRad * 180 / Math.PI;
                    
                    if (Math.abs(angleDeg) > MIN_ANGLE_FOR_ELBOW) {
                        const elbowId = findElbowForLine(material, diameter, angleDeg);
                        if (elbowId) {
                            const fittingLen = getFittingLength(elbowId, diameter);
                            
                            nuevaLinea.components.push({
                                type: elbowId,
                                tag: `${elbowId}-${Math.random().toString(36).substr(2, 5)}`,
                                param: 1.0
                            });
                            
                            // Ajustar el último segmento restando el fitting length
                            if (fittingLen > 0 && pts.length >= 2) {
                                const offsetDir = normalizeVector(subtractPoints(pts[lastIdx], pts[lastIdx - 1]));
                                const adjustedPoint = addPoints(pts[lastIdx], scalePoint(offsetDir, -Math.max(0, distance(pts[lastIdx], pts[lastIdx - 1]) - fittingLen)));
                                
                                if (distance(pts[lastIdx], adjustedPoint) > 10) {
                                    pts[lastIdx] = adjustedPoint;
                                    nuevaLinea._cachedPoints = [...pts];
                                    nuevaLinea.points3D = [...pts];
                                    nuevaLinea.points = [...pts];
                                }
                            }
                            
                            notifyUser(`✅ Codo ${angleDeg.toFixed(0)}° (${elbowId}) inyectado en destino de ${tag}. Ángulo real: ${angleDeg.toFixed(2)}°`);
                        }
                    }
                }
            }
        } catch (e) { console.warn("Error en codo destino:", e); }

        if (reductorComponent) {
            nuevaLinea.components.push(reductorComponent);
            notifyUser(`✅ Reductor (${reductorComponent.type}) al final de ${tag}`, false);
        }

        _core.addLine(nuevaLinea);
        if (fromObj.puertos) {
            const pFrom = fromObj.puertos.find(p => p.id === fromPortId);
            if (pFrom) pFrom.connectedLine = tag;
        }
        if (toObj.puertos) {
            const pTo = toObj.puertos.find(p => p.id === nuevoPuertoId);
            if (pTo) pTo.connectedLine = tag;
        }

        if (_core.syncPhysicalData) _core.syncPhysicalData();
        if (_core._saveState) _core._saveState();
        if (_core._saveToHistory) _core._saveToHistory();
        if (typeof _renderUI === 'function') _renderUI();

        if (_core.setSelected) _core.setSelected({ type: 'line', obj: nuevaLinea });

        notifyUser(`✅ Ruta: ${tag} (${fromEquipTag}.${fromPortId} → ${toEquipTag}.${nuevoPuertoId})`, false);
        return nuevaLinea;
    }

    function handleSnapClick(snapData) {
        if (!snapData) return;
        ensureInitialized();
        _core.setSelected({ type: 'PUERTO', obj: snapData.port, parent: snapData.item });
        notifyUser(`Puerto seleccionado: ${snapData.item.tag} - ${snapData.port.id}`);
    }

    function executeCommand(cmdLine) {
        ensureInitialized();
        const parts = cmdLine.trim().split(/\s+/);
        const action = parts[0]?.toLowerCase();
        const args = parts.slice(1);
        switch(action) {
            case 'conectar':
                if (args.length >= 4) routeBetweenPorts(args[0], args[1], args[2], args[3]);
                else notifyUser('Formato: conectar [Origen] [Puerto] [Destino] [Puerto]', true);
                break;
            case 'split':
                if (args.length >= 2) {
                    const lineTag = args[0];
                    const param = parseFloat(args[1]);
                    if (!isNaN(param) && _core.injectAccessory) {
                        _core.injectAccessory(lineTag, param, {
                            tag: 'TEE',
                            generarPuertos: (line, p, d) => _catalog.getComponent('TEE_EQUAL')?.generarPuertos?.({diameter: d}) || []
                        });
                    }
                } else notifyUser('Formato: split [Línea] [Posición 0-1]', true);
                break;
            case 'limpiar':
                if (_core.nuevoProyecto) _core.nuevoProyecto();
                else if (_core.clearProject) _core.clearProject();
                notifyUser('Proyecto limpiado.', false);
                break;
            default:
                notifyUser(`Comando router no reconocido: ${action}`, true);
        }
    }

    function init(coreInstance, catalogInstance, notifyFn, renderFn) {
        _core = coreInstance;
        _catalog = catalogInstance;
        _notifyUI = notifyFn || ((msg, isErr) => console.log(msg));
        _renderUI = renderFn || (() => {});
        console.log('✅ SmartFlow Router v3.2 (ortogonalidad forzada + fitting length + normalización precisa)');
    }

    return {
        init,
        routeBetweenPorts,
        insertarAccesorioEnLinea,
        procesarInterseccionesDeLinea,
        getPortPosition,
        getPortDirection,
        findComponentInCatalog,
        findElbowForLine,
        calculateOrthogonalIntersection,
        getFittingLength,
        handleSnapClick,
        executeCommand
    };
})();

if (typeof window !== 'undefined') window.SmartFlowRouter = SmartFlowRouter;
