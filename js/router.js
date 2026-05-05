
// ============================================================
// MÓDULO 6: SMARTFLOW ROUTER v3.0 – Inserción visual de accesorios + distancias cortas
// Archivo: js/router.js
// ============================================================

const SmartFlowRouter = (function() {
    
    let _core = null;
    let _catalog = null;
    let _notifyUI = (msg, isErr) => console.log(msg);
    let _renderUI = () => {};

    function ensureInitialized() {
        if (!_core && typeof SmartFlowCore !== 'undefined') _core = SmartFlowCore;
        if (!_catalog && typeof SmartFlowCatalog !== 'undefined') _catalog = SmartFlowCatalog;
        return !!(_core && _catalog);
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

    // -------------------- UTILIDADES GEOMÉTRICAS --------------------
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
        const pts = obj._cachedPoints || obj.points3D || obj.points;
        if (!pts || pts.length === 0) return null;
        if (obj.puertos) {
            const puerto = obj.puertos.find(p => p.id === portId);
            if (puerto && puerto.pos) return puerto.pos;
        }
        if (portId === '0') return pts[0];
        if (portId === '1') return pts[pts.length - 1];
        return null;
    }

    function getPortDirection(obj, portId) {
        if (!obj) return { dx: 1, dy: 0, dz: 0 };
        if (obj.posX !== undefined) {
            const puerto = obj.puertos?.find(p => p.id === portId);
            if (puerto && puerto.orientacion) return puerto.orientacion;
            return { dx: 1, dy: 0, dz: 0 };
        }
        const pts = obj._cachedPoints || obj.points3D || obj.points;
        if (pts && pts.length >= 2) {
            if (portId === '0') return normalizeVector(subtractPoints(pts[1], pts[0]));
            if (portId === '1') return normalizeVector(subtractPoints(pts[pts.length - 1], pts[pts.length - 2]));
            return { dx: pts[1].x - pts[0].x, dy: pts[1].y - pts[0].y, dz: pts[1].z - pts[0].z };
        }
        return { dx: 1, dy: 0, dz: 0 };
    }

    // -------------------- BÚSQUEDA DE COMPONENTES --------------------
    function findElbowForLine(material, angleDeg) {
        const mat = material.toUpperCase();
        const is90 = (Math.abs(angleDeg - 90) < 10);
        const is45 = (Math.abs(angleDeg - 45) < 10);
        if (!is90 && !is45) return null;
        const catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) return null;
        if (mat.includes('PPR')) return is90 ? 'ELBOW_90_PPR' : 'ELBOW_45_PPR';
        if (mat.includes('HDPE')) return is90 ? 'ELBOW_90_HDPE' : null;
        if (mat.includes('PVC')) return is90 ? 'ELBOW_90_PVC' : null;
        if (mat.includes('ACERO') || mat.includes('CARBONO')) return is90 ? 'ELBOW_90_LR_CS' : 'ELBOW_45_CS';
        if (mat.includes('INOX')) return is90 ? 'ELBOW_90_SANITARY' : null;
        return is90 ? 'ELBOW_90_LR_CS' : 'ELBOW_45_CS';
    }

    function findComponentInCatalog(desiredType, lineMaterial) {
        ensureInitialized();
        const catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) return null;
        const allTypes = catalog.listComponentTypes();
        const mat = lineMaterial.toUpperCase();
        let prefix = '';
        if (mat.includes('PPR')) prefix = 'PPR';
        else if (mat.includes('HDPE')) prefix = 'HDPE';
        else if (mat.includes('PVC')) prefix = 'PVC';
        else if (mat.includes('ACERO') || mat.includes('CARBONO')) prefix = 'CS';
        else if (mat.includes('INOX')) prefix = 'SS';

        // Construir posibles nombres
        const candidates = [];
        if (prefix) candidates.push(desiredType + '_' + prefix);
        candidates.push(desiredType); // sin prefijo
        for (const c of candidates) {
            if (allTypes.includes(c)) return c;
        }
        // Búsqueda parcial
        for (const t of allTypes) {
            if (t.includes(desiredType.split('_')[0])) return t;
        }
        return null;
    }

    // -------------------- INSERCIÓN DE ACCESORIO (CORREGIDA Y CON COMPONENTE VISUAL) --------------------
    function insertarAccesorioEnLinea(lineTag, puntoConexion, diametroNuevaLinea, forzarTee = false) {
        ensureInitialized();
        if (!_core) { notifyUser('Core no inicializado', true); return null; }
        const db = _core.getDb();
        const linea = db.lines.find(l => l.tag === lineTag);
        if (!linea) { notifyUser(`Línea ${lineTag} no encontrada`, true); return null; }

        const pts = linea._cachedPoints || linea.points3D || linea.points;
        if (!pts || pts.length < 2) { notifyUser(`Línea ${lineTag} sin geometría`, true); return null; }

        // Calcular parámetro más cercano
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

        const compId = findComponentInCatalog(tipoAccesorio, lineMaterial);
        if (!compId) {
            notifyUser(`No se encontró componente para ${tipoAccesorio} en material ${lineMaterial}`, true);
            return null;
        }

        const compDef = _catalog.getComponent(compId);
        if (!compDef || !compDef.generarPuertos) {
            notifyUser(`El componente ${compId} no tiene generador de puertos`, true);
            return null;
        }

        // Inyectar puertos (lógica original del Core)
        const accesorioDef = { tag: compId, generarPuertos: compDef.generarPuertos };
        const result = _core.injectAccessory(lineTag, param, accesorioDef);
        if (!result) {
            notifyUser(`No se pudo insertar ${compId} en ${lineTag}`, true);
            return null;
        }

        // ***** NUEVO: Agregar componente visual a la línea *****
        const lineaActualizada = db.lines.find(l => l.tag === lineTag);
        if (lineaActualizada) {
            if (!lineaActualizada.components) lineaActualizada.components = [];
            lineaActualizada.components.push({
                type: compId,
                tag: compId + '-' + Date.now().toString().slice(-6),
                param: param
            });
            _core.updateLine(lineTag, { components: lineaActualizada.components });
            notifyUser(`✅ ${descripcion} (${compId}) insertado y visible en ${lineTag}`, false);
        }

        // Devolver el nuevo puerto (el último añadido)
        if (!lineaActualizada || !lineaActualizada.puertos) return null;
        const nuevoPuerto = lineaActualizada.puertos[lineaActualizada.puertos.length - 1];
        return nuevoPuerto.id;
    }

    // -------------------- ENRUTAMIENTO PRINCIPAL --------------------
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

        // --- Manejo de destino en línea ---
        if (toObj._cachedPoints || toObj.points3D || toObj.points) {
            const pts = toObj._cachedPoints || toObj.points3D || toObj.points;
            if (!pts || pts.length < 2) {
                notifyUser(`La línea ${toEquipTag} no tiene geometría`, true);
                return null;
            }

            if (!toPortId || toPortId === '') {
                // Autodetectar punto más cercano
                let minDist = Infinity, bestPoint = pts[0];
                for (let i = 0; i < pts.length - 1; i++) {
                    const proj = projectPointOnSegment(startPos, pts[i], pts[i+1]);
                    if (proj.distance < minDist) {
                        minDist = proj.distance;
                        bestPoint = proj.point;
                    }
                }
                const puertoInsertado = insertarAccesorioEnLinea(toEquipTag, bestPoint, diameter, true);
                if (!puertoInsertado) return null;
                nuevoPuertoId = puertoInsertado;
                toObj = db.lines.find(l => l.tag === toEquipTag);
            } else if (toPortId === '0' || toPortId === '1') {
                nuevoPuertoId = toPortId;
            } else {
                // Punto intermedio paramétrico
                const param = parseFloat(toPortId);
                if (isNaN(param) || param < 0 || param > 1) {
                    notifyUser('Puerto de línea no válido', true);
                    return null;
                }
                let lengths = [], totalLen = 0;
                for (let i = 0; i < pts.length - 1; i++) {
                    const d = distance(pts[i], pts[i+1]);
                    lengths.push(d);
                    totalLen += d;
                }
                const targetLen = totalLen * param;
                let accum = 0, segIdx = 0, t = 0;
                for (let i = 0; i < lengths.length; i++) {
                    if (accum + lengths[i] >= targetLen || i === lengths.length - 1) {
                        segIdx = i;
                        t = (targetLen - accum) / (lengths[i] || 1);
                        break;
                    }
                    accum += lengths[i];
                }
                const pA = pts[segIdx], pB = pts[segIdx + 1];
                const puntoConexion = {
                    x: pA.x + (pB.x - pA.x) * t,
                    y: pA.y + (pB.y - pA.y) * t,
                    z: pA.z + (pB.z - pA.z) * t
                };

                const diffDiam = Math.abs(diameter - (toObj.diameter || 4)) > 0.1;
                const puertoInsertado = insertarAccesorioEnLinea(toEquipTag, puntoConexion, diameter, !diffDiam);
                if (!puertoInsertado) return null;
                nuevoPuertoId = puertoInsertado;
                toObj = db.lines.find(l => l.tag === toEquipTag);
            }
        }

        endPos = getPortPosition(toObj, nuevoPuertoId);
        if (!endPos) { notifyUser(`No se pudo obtener la posición del puerto destino`, true); return null; }

        // --- Generar waypoints de la nueva línea ---
        const startDir = normalizeVector(getPortDirection(fromObj, fromPortId));
        const extStart = 500;
        const p1 = addPoints(startPos, scalePoint(startDir, extStart));

        let endDir, extEnd = 500;
        if (toObj.posX !== undefined) {
            endDir = normalizeVector(getPortDirection(toObj, nuevoPuertoId));
        } else {
            const vecHaciaDestino = subtractPoints(endPos, p1);
            if (Math.abs(vecHaciaDestino.x) > Math.abs(vecHaciaDestino.z)) {
                endDir = { dx: Math.sign(vecHaciaDestino.x), dy: 0, dz: 0 };
            } else {
                endDir = { dx: 0, dy: 0, dz: Math.sign(vecHaciaDestino.z) };
            }
            extEnd = 0;
        }
        const p4 = addPoints(endPos, scalePoint(endDir, extEnd));

        const distDirecta = Math.hypot(p4.x - p1.x, p4.y - p1.y, p4.z - p1.z);
        const waypoints = [p1];

        if (distDirecta < 500) {
            waypoints.push(p4);
        } else {
            if (Math.abs(p1.y - p4.y) > 10) {
                waypoints.push({ x: p4.x, y: p1.y, z: p1.z });
                waypoints.push({ x: p4.x, y: p1.y, z: p4.z });
                waypoints.push({ x: p4.x, y: p4.y, z: p4.z });
            } else {
                waypoints.push({ x: p4.x, y: p1.y, z: p1.z });
                waypoints.push({ x: p4.x, y: p1.y, z: p4.z });
            }
            waypoints.push(p4);
        }

        let uniqueWaypoints = waypoints.filter((pt, i, arr) => i === 0 || distance(pt, arr[i-1]) > 1);
        if (uniqueWaypoints.length < 2) uniqueWaypoints = [p1, p4];

        const tag = `L-${db.lines.length + 1}`;
        const nuevaLinea = {
            tag, diameter, material, spec,
            origin: { objType: fromObj.posX !== undefined ? 'equipment' : 'line', equipTag: fromEquipTag, portId: fromPortId },
            destination: { objType: toObj.posX !== undefined ? 'equipment' : 'line', equipTag: toEquipTag, portId: nuevoPuertoId },
            waypoints: uniqueWaypoints.slice(1, -1),
            _cachedPoints: [...uniqueWaypoints],
            components: []
        };

        // --- Auto‑codos en extremos ---
        try {
            if (uniqueWaypoints.length >= 2 && !fromObj.posX && (fromPortId === '0' || fromPortId === '1')) {
                const fromPortDir = getPortDirection(fromObj, fromPortId);
                const secondPoint = uniqueWaypoints[1];
                if (secondPoint) {
                    const newStartDir = normalizeVector(subtractPoints(secondPoint, startPos));
                    const angleRad = Math.acos(Math.min(1, Math.abs(dotProduct(fromPortDir, newStartDir))));
                    const angleDeg = angleRad * 180 / Math.PI;
                    if (angleDeg > 15) {
                        const elbowId = findElbowForLine(material, angleDeg);
                        if (elbowId) {
                            nuevaLinea.components.push({
                                type: elbowId,
                                tag: elbowId + '-' + Date.now().toString().slice(-6),
                                param: 0.0
                            });
                        }
                    }
                }
            }
            if (uniqueWaypoints.length >= 2 && !toObj.posX && (nuevoPuertoId === '0' || nuevoPuertoId === '1')) {
                const toPortDir = getPortDirection(toObj, nuevoPuertoId);
                const secondLastPoint = uniqueWaypoints[uniqueWaypoints.length - 2];
                if (secondLastPoint) {
                    const lastSegDir = normalizeVector(subtractPoints(endPos, secondLastPoint));
                    const angleRad = Math.acos(Math.min(1, Math.abs(dotProduct(toPortDir, lastSegDir))));
                    const angleDeg = angleRad * 180 / Math.PI;
                    if (angleDeg > 15) {
                        const elbowId = findElbowForLine(material, angleDeg);
                        if (elbowId) {
                            nuevaLinea.components.push({
                                type: elbowId,
                                tag: elbowId + '-' + Date.now().toString().slice(-6),
                                param: 1.0
                            });
                        }
                    }
                }
            }
        } catch (e) {}

        _core.addLine(nuevaLinea);

        if (fromObj.puertos) {
            const pFrom = fromObj.puertos.find(p => p.id === fromPortId);
            if (pFrom) pFrom.connectedLine = tag;
        }
        if (toObj.puertos) {
            const pTo = toObj.puertos.find(p => p.id === nuevoPuertoId);
            if (pTo) pTo.connectedLine = tag;
        }

        _core.syncPhysicalData();
        _core._saveState();
        if (typeof _renderUI === 'function') _renderUI();
        _core.setSelected({ type: 'line', obj: nuevaLinea });

        notifyUser(`✅ Ruta creada: ${tag} (${fromEquipTag}.${fromPortId} → ${toEquipTag}.${nuevoPuertoId})`, false);
        return nuevaLinea;
    }

    function init(coreInstance, catalogInstance, notifyFn, renderFn) {
        _core = coreInstance;
        _catalog = catalogInstance;
        _notifyUI = notifyFn || ((msg, isErr) => console.log(msg));
        _renderUI = renderFn || (() => {});
        console.log('SmartFlow Router v3.0 listo (inserción visual + distancias cortas)');
    }

    return {
        init,
        routeBetweenPorts,
        insertarAccesorioEnLinea,
        getPortPosition,
        getPortDirection
    };
})();

if (typeof window !== 'undefined') window.SmartFlowRouter = SmartFlowRouter;
