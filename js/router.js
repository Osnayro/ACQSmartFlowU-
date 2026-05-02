
// ============================================================
// SMARTFLOW ROUTER v6.7 (Completo: codos, tees, reductores, reductor+codo)
// Archivo: js/router.js
// ============================================================

const SmartFlowRouter = (function() {
    let _core = null;
    let _catalog = null;
    let _notifyUI = (msg, isErr) => console.log(msg);

    // ------------------------------------------------------------------
    // Helpers geométricos
    // ------------------------------------------------------------------
    const _dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
    const _clonePoint = (p) => ({ x: p.x, y: p.y, z: p.z });
    const _dot = (v1, v2) => v1.x*v2.x + v1.y*v2.y + v1.z*v2.z;
    const _normalize = (v) => {
        const len = Math.hypot(v.x, v.y, v.z);
        if (len === 0) return { dx:1, dy:0, dz:0 };
        return { dx: v.x/len, dy: v.y/len, dz: v.z/len };
    };
    const _subtract = (a,b) => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z });
    const _add = (a,b) => ({ x: a.x+b.x, y: a.y+b.y, z: a.z+b.z });
    const _scale = (v, s) => ({ x: v.x*s, y: v.y*s, z: v.z*s });

    // ------------------------------------------------------------------
    // 1. Creación de malla volumétrica (tubería 3D)
    // ------------------------------------------------------------------
    function createLineMesh(lineData) {
        const points = lineData.points || lineData._cachedPoints;
        if (!points || points.length < 2) return new THREE.Group();
        const vectors = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const diamMM = (parseFloat(lineData.diameter) || 4) * 25.4;
        const radius = Math.max(5, diamMM / 2);
        const curve = new THREE.CatmullRomCurve3(vectors);
        curve.curveType = 'catmullrom';
        curve.tension = 0;
        const tubularSegments = Math.max(32, vectors.length * 8);
        const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 12, false);
        let color = 0x71717a;
        if (lineData.spec && _catalog?.getSpec) {
            const spec = _catalog.getSpec(lineData.spec);
            if (spec?.color) color = spec.color;
        } else if (lineData.material) {
            const mat = lineData.material.toUpperCase();
            if (mat.includes('PPR')) color = 0x7c3aed;
            else if (mat.includes('ACERO')) color = 0x94a3b8;
            else if (mat.includes('HDPE')) color = 0x22c55e;
            else if (mat.includes('PVC')) color = 0xeab308;
        }
        const material = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.3 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { tag: lineData.tag, type: 'line' };
        return mesh;
    }

    // ------------------------------------------------------------------
    // 2. Enrutamiento ortogonal
    // ------------------------------------------------------------------
    function calculateRoute(start, end, axisPriority = ['x', 'z', 'y']) {
        const points = [_clonePoint(start)];
        let current = _clonePoint(start);
        for (let axis of axisPriority) {
            if (Math.abs(current[axis] - end[axis]) > 0.1) {
                current[axis] = end[axis];
                points.push(_clonePoint(current));
            }
        }
        const unique = [];
        for (let i=0; i<points.length; i++) {
            if (i===0 || _dist(points[i], points[i-1]) > 1) unique.push(points[i]);
        }
        return unique;
    }

    // ------------------------------------------------------------------
    // 3. Obtener posición absoluta de un puerto (equipo o línea)
    // ------------------------------------------------------------------
    function getPortPosition(obj, portId) {
        if (!obj) return null;
        if (obj.posX !== undefined) {
            const port = obj.puertos?.find(p => p.id === portId);
            if (!port) return null;
            return {
                x: obj.posX + (port.relX || 0),
                y: obj.posY + (port.relY || 0),
                z: obj.posZ + (port.relZ || 0)
            };
        }
        const pts = obj.points || obj._cachedPoints;
        if (!pts || pts.length === 0) return null;
        if (portId === '0') return _clonePoint(pts[0]);
        if (portId === '1') return _clonePoint(pts[pts.length-1]);
        return null;
    }

    function getPortDirection(obj, portId) {
        if (!obj) return { dx:1, dy:0, dz:0 };
        if (obj.posX !== undefined) {
            const port = obj.puertos?.find(p => p.id === portId);
            if (port && port.orientacion) return port.orientacion;
            return { dx:1, dy:0, dz:0 };
        }
        const pts = obj.points || obj._cachedPoints;
        if (pts && pts.length >= 2) {
            if (portId === '0') return _normalize(_subtract(pts[1], pts[0]));
            if (portId === '1') return _normalize(_subtract(pts[pts.length-1], pts[pts.length-2]));
        }
        return { dx:1, dy:0, dz:0 };
    }

    // ------------------------------------------------------------------
    // 4. Seleccionar codo según material y ángulo
    // ------------------------------------------------------------------
    function findElbowForLine(material, diameter, angleDeg) {
        const mat = material.toUpperCase();
        const is90 = Math.abs(angleDeg-90) < 10;
        const is45 = Math.abs(angleDeg-45) < 10;
        if (!is90 && !is45) return null;
        if (mat.includes('PPR')) return is90 ? 'ELBOW_90_PPR' : 'ELBOW_45_PPR';
        if (mat.includes('HDPE')) return is90 ? 'ELBOW_90_HDPE' : null;
        if (mat.includes('PVC')) return is90 ? 'ELBOW_90_PVC' : null;
        if (mat.includes('ACERO')) return is90 ? 'ELBOW_90_LR_CS' : 'ELBOW_45_CS';
        if (mat.includes('INOX')) return is90 ? 'ELBOW_90_SANITARY' : null;
        return is90 ? 'ELBOW_90_LR_CS' : 'ELBOW_45_CS';
    }

    // ------------------------------------------------------------------
    // 5. Insertar codo en una línea existente
    // ------------------------------------------------------------------
    function insertarCodoEnLinea(lineTag, puntoConexion, angleDeg, esExtremo = true) {
        const db = _core.getDb();
        const linea = db.lines.find(l => l.tag === lineTag);
        if (!linea) return null;
        
        const pts = linea.points || linea._cachedPoints;
        if (!pts || pts.length < 2) return null;
        
        // Calcular parámetro del punto en la línea
        let totalLen = 0, lengths = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const d = _dist(pts[i], pts[i+1]);
            lengths.push(d);
            totalLen += d;
        }
        if (totalLen === 0) return null;
        
        let accum = 0, bestParam = 0;
        for (let i = 0; i < lengths.length; i++) {
            const a = pts[i], b = pts[i+1];
            const ab = _subtract(b, a);
            const ap = _subtract(puntoConexion, a);
            const t = _dot(ap, ab) / (ab.x*ab.x + ab.y*ab.y + ab.z*ab.z || 1);
            if (t >= 0 && t <= 1) {
                bestParam = (accum + t * lengths[i]) / totalLen;
                break;
            }
            accum += lengths[i];
        }
        
        const materialLinea = linea.material || 'PPR';
        const diamLinea = linea.diameter || 4;
        const elbowId = findElbowForLine(materialLinea, diamLinea, angleDeg);
        if (!elbowId) return null;
        
        const compTag = `${elbowId}-${Date.now().slice(-6)}`;
        linea.components = linea.components || [];
        linea.components.push({ type: elbowId, tag: compTag, param: bestParam });
        _core.updateLine(lineTag, { components: linea.components });
        
        const puertoId = `ELBOW-${compTag}`;
        const ref = pts[0];
        linea.puertos = linea.puertos || [];
        linea.puertos.push({
            id: puertoId, label: 'Codo',
            relX: puntoConexion.x - ref.x,
            relY: puntoConexion.y - ref.y,
            relZ: puntoConexion.z - ref.z,
            diametro: diamLinea, status: 'open'
        });
        _core.updateLine(lineTag, { puertos: linea.puertos });
        
        _notifyUI(`Codo ${elbowId} insertado en ${lineTag}`, false);
        return puertoId;
    }

    // ------------------------------------------------------------------
    // 6. Insertar Tee (o Tee reductora) en una línea existente
    // ------------------------------------------------------------------
    function insertarTeeEnLinea(lineTag, puntoConexion, diametroNuevaLinea, forzarTee = false) {
        const db = _core.getDb();
        const linea = db.lines.find(l => l.tag === lineTag);
        if (!linea) return null;
        
        let pts = linea.points || linea._cachedPoints;
        if (!pts || pts.length < 2) return null;
        
        // Calcular parámetro del punto
        let totalLen = 0, lengths = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const d = _dist(pts[i], pts[i+1]);
            lengths.push(d);
            totalLen += d;
        }
        if (totalLen === 0) return null;
        
        let accum = 0, bestParam = 0;
        for (let i = 0; i < lengths.length; i++) {
            const a = pts[i], b = pts[i+1];
            const ab = _subtract(b, a);
            const ap = _subtract(puntoConexion, a);
            const t = _dot(ap, ab) / (ab.x*ab.x + ab.y*ab.y + ab.z*ab.z || 1);
            if (t >= 0 && t <= 1) {
                bestParam = (accum + t * lengths[i]) / totalLen;
                break;
            }
            accum += lengths[i];
        }
        
        const diamLinea = linea.diameter || 4;
        const diffDiam = Math.abs(parseFloat(diametroNuevaLinea) - diamLinea) > 0.1;
        const lineMaterial = (linea.material || 'PPR').toUpperCase();
        
        let componenteId = '';
        if (diffDiam) {
            if (lineMaterial.includes('PPR')) componenteId = 'TEE_REDUCING_PPR';
            else componenteId = 'TEE_REDUCING_CS';
        } else {
            if (lineMaterial.includes('PPR')) componenteId = 'TEE_EQUAL_PPR';
            else if (lineMaterial.includes('HDPE')) componenteId = 'TEE_EQUAL_HDPE';
            else if (lineMaterial.includes('PVC')) componenteId = 'TEE_EQUAL_PVC';
            else componenteId = 'TEE_EQUAL_CS';
        }
        
        let comp = _catalog.getComponent(componenteId);
        if (!comp) comp = _catalog.getComponent('TEE_EQUAL_CS');
        if (!comp) return null;
        
        const compTag = `${componenteId}-${Date.now().slice(-6)}`;
        linea.components = linea.components || [];
        linea.components.push({ type: comp.tipo, tag: compTag, param: bestParam });
        _core.updateLine(lineTag, { components: linea.components });
        
        const puertoId = `TEE-${compTag}`;
        const ref = pts[0];
        linea.puertos = linea.puertos || [];
        linea.puertos.push({
            id: puertoId, label: 'Derivación Tee',
            relX: puntoConexion.x - ref.x,
            relY: puntoConexion.y - ref.y,
            relZ: puntoConexion.z - ref.z,
            diametro: diametroNuevaLinea, status: 'open'
        });
        _core.updateLine(lineTag, { puertos: linea.puertos });
        
        _notifyUI(`Tee ${componenteId} insertado en ${lineTag}`, false);
        return puertoId;
    }

    // ------------------------------------------------------------------
    // 7. Insertar Reductor + Codo en extremo de línea (cuando difieren diámetros)
    // ------------------------------------------------------------------
    function insertarReducerYElbowEnExtremo(lineTag, puntoConexion, diametroNuevo, angleDeg, esExtremoFinal = true) {
        const db = _core.getDb();
        const linea = db.lines.find(l => l.tag === lineTag);
        if (!linea) return null;
        
        const pts = linea.points || linea._cachedPoints;
        if (!pts || pts.length < 2) return null;
        
        const diamLinea = linea.diameter || 4;
        const materialLinea = linea.material || 'PPR';
        const param = esExtremoFinal ? 1.0 : 0.0;
        
        // Reductor
        const reductorId = materialLinea.toUpperCase().includes('PPR') ? 'CONCENTRIC_REDUCER_PPR' : 'CONCENTRIC_REDUCER_CS';
        const reductorComp = _catalog.getComponent(reductorId);
        if (!reductorComp) return null;
        
        // Codo
        const elbowId = findElbowForLine(materialLinea, diamLinea, angleDeg);
        if (!elbowId) return null;
        
        const reductorTag = `${reductorId}-${Date.now().slice(-6)}`;
        const elbowTag = `${elbowId}-${Date.now().slice(-6)}`;
        
        linea.components = linea.components || [];
        linea.components.push({ type: reductorComp.tipo, tag: reductorTag, param: param });
        linea.components.push({ type: elbowId, tag: elbowTag, param: param });
        _core.updateLine(lineTag, { components: linea.components });
        
        const puertoId = `RED-ELBOW-${reductorTag}`;
        const ref = pts[0];
        linea.puertos = linea.puertos || [];
        linea.puertos.push({
            id: puertoId, label: 'Reductor+Codo',
            relX: puntoConexion.x - ref.x,
            relY: puntoConexion.y - ref.y,
            relZ: puntoConexion.z - ref.z,
            diametro: diametroNuevo, status: 'open'
        });
        _core.updateLine(lineTag, { puertos: linea.puertos });
        
        _notifyUI(`Reductor (${reductorId}) + Codo (${elbowId}) insertados en extremo de ${lineTag}`, false);
        return puertoId;
    }

    // ------------------------------------------------------------------
    // 8. Enrutamiento principal (con manejo completo de casos)
    // ------------------------------------------------------------------
    function routeBetweenPorts(fromTag, fromPort, toTag, toPort, diameter = 4, material = 'PPR', spec = 'PPR_PN12_5') {
        const db = _core.getDb();
        const fromObj = db.equipos.find(e => e.tag === fromTag) || db.lines.find(l => l.tag === fromTag);
        let toObj = db.equipos.find(e => e.tag === toTag) || db.lines.find(l => l.tag === toTag);
        
        if (!fromObj || !toObj) {
            _notifyUI("Origen o destino no encontrado", true);
            return null;
        }
        
        let startPos = getPortPosition(fromObj, fromPort);
        if (!startPos) {
            _notifyUI(`Puerto origen ${fromPort} no encontrado`, true);
            return null;
        }
        
        let endPos = null;
        let nuevoPuertoId = toPort;
        const diamNum = parseFloat(diameter) || 4;
        
        // Si el destino es una línea
        if (toObj.points || toObj._cachedPoints) {
            const pts = toObj.points || toObj._cachedPoints;
            if (!pts || pts.length < 2) {
                _notifyUI(`Línea destino ${toTag} sin geometría`, true);
                return null;
            }
            
            const diamLinea = toObj.diameter || 4;
            const diffDiam = Math.abs(diamNum - diamLinea) > 0.1;
            
            // CASO 1: Conexión al extremo INICIO (0)
            if (toPort === '0') {
                endPos = _clonePoint(pts[0]);
                const dirLinea = getPortDirection(toObj, '0');
                const dirConexion = _normalize(_subtract(startPos, endPos));
                const angleRad = Math.acos(Math.min(1, Math.abs(_dot(dirLinea, dirConexion))));
                const angleDeg = angleRad * 180 / Math.PI;
                
                if (angleDeg > 15) {
                    if (diffDiam) {
                        nuevoPuertoId = insertarReducerYElbowEnExtremo(toTag, endPos, diamNum, angleDeg, false);
                    } else {
                        nuevoPuertoId = insertarCodoEnLinea(toTag, endPos, angleDeg, true);
                    }
                }
            } 
            // CASO 2: Conexión al extremo FINAL (1)
            else if (toPort === '1') {
                endPos = _clonePoint(pts[pts.length-1]);
                const dirLinea = getPortDirection(toObj, '1');
                const dirConexion = _normalize(_subtract(startPos, endPos));
                const angleRad = Math.acos(Math.min(1, Math.abs(_dot(dirLinea, dirConexion))));
                const angleDeg = angleRad * 180 / Math.PI;
                
                if (angleDeg > 15) {
                    if (diffDiam) {
                        nuevoPuertoId = insertarReducerYElbowEnExtremo(toTag, endPos, diamNum, angleDeg, true);
                    } else {
                        nuevoPuertoId = insertarCodoEnLinea(toTag, endPos, angleDeg, true);
                    }
                }
            }
            // CASO 3: Puerto específico existente
            else if (toPort && toPort !== '') {
                endPos = getPortPosition(toObj, toPort);
                if (endPos) {
                    nuevoPuertoId = toPort;
                } else {
                    _notifyUI(`Puerto ${toPort} no encontrado en ${toTag}`, true);
                    return null;
                }
            }
            // CASO 4: Punto intermedio (sin puerto específico) -> Insertar Tee o Tee reductora
            else {
                let minDist = Infinity, bestPoint = null;
                for (let i = 0; i < pts.length - 1; i++) {
                    const a = pts[i], b = pts[i+1];
                    const ab = _subtract(b, a);
                    const ap = _subtract(startPos, a);
                    const t = _dot(ap, ab) / (ab.x*ab.x + ab.y*ab.y + ab.z*ab.z || 1);
                    if (t >= 0 && t <= 1) {
                        const proj = { x: a.x + t*ab.x, y: a.y + t*ab.y, z: a.z + t*ab.z };
                        const d = _dist(startPos, proj);
                        if (d < minDist) {
                            minDist = d;
                            bestPoint = proj;
                        }
                    }
                }
                if (!bestPoint) {
                    _notifyUI(`No se pudo encontrar punto de conexión en ${toTag}`, true);
                    return null;
                }
                nuevoPuertoId = insertarTeeEnLinea(toTag, bestPoint, diamNum, true);
                if (!nuevoPuertoId) return null;
                toObj = db.lines.find(l => l.tag === toTag);
                endPos = bestPoint;
            }
        } else {
            // Destino es un equipo
            endPos = getPortPosition(toObj, toPort);
            if (!endPos) {
                _notifyUI(`Puerto ${toPort} no encontrado en equipo ${toTag}`, true);
                return null;
            }
            nuevoPuertoId = toPort;
        }
        
        if (!endPos) {
            _notifyUI("No se pudo obtener posición destino", true);
            return null;
        }
        
        const materialFinal = material || toObj.material || 'PPR';
        const specFinal = spec || toObj.spec || 'PPR_PN12_5';
        
        const points = calculateRoute(startPos, endPos, ['x', 'z', 'y']);
        const newTag = `L-${db.lines.length+1}`;
        const newLine = {
            tag: newTag,
            diameter: diamNum,
            material: materialFinal,
            spec: specFinal,
            points: points,
            _cachedPoints: points,
            waypoints: points.slice(1,-1),
            origin: { objType: fromObj.posX!==undefined ? 'equipment' : 'line', equipTag: fromTag, portId: fromPort },
            destination: { objType: toObj.posX!==undefined ? 'equipment' : 'line', equipTag: toTag, portId: nuevoPuertoId },
            components: []
        };
        
        // Auto-codo en origen (si es línea)
        if ((fromObj.points || fromObj._cachedPoints) && points.length >= 2) {
            const fromDir = getPortDirection(fromObj, fromPort);
            const firstSeg = _normalize(_subtract(points[1], startPos));
            const angleRad = Math.acos(Math.min(1, Math.abs(_dot(fromDir, firstSeg))));
            const angleDeg = angleRad * 180 / Math.PI;
            if (angleDeg > 15) {
                const elbowId = findElbowForLine(materialFinal, diamNum, angleDeg);
                if (elbowId) {
                    newLine.components.push({ type: elbowId, tag: `${elbowId}-${Date.now().slice(-6)}`, param: 0.0 });
                }
            }
        }
        
        _core.addLine(newLine);
        
        const fromPortObj = fromObj.puertos?.find(p=>p.id===fromPort);
        if (fromPortObj) fromPortObj.connectedLine = newTag;
        if (toObj.puertos) {
            const toPortObj = toObj.puertos.find(p=>p.id===nuevoPuertoId);
            if (toPortObj) toPortObj.connectedLine = newTag;
        }
        
        _core.syncPhysicalData();
        _core._saveState();
        _notifyUI(`✅ Ruta ${newTag} creada`, false);
        return newLine;
    }

    // ------------------------------------------------------------------
    // 9. Procesar intersecciones (placeholder)
    // ------------------------------------------------------------------
    function procesarInterseccionesDeLinea(nuevaLinea) {
        // Para implementación futura
    }

    // ------------------------------------------------------------------
    // 10. Inicialización
    // ------------------------------------------------------------------
    function init(core, catalog, notifyFn) {
        _core = core;
        _catalog = catalog;
        if (notifyFn) _notifyUI = notifyFn;
        console.log("✅ Router v6.7 listo (codos, tees, reductores, reductor+codo)");
    }

    return {
        init,
        createLineMesh,
        calculateRoute,
        getPortPosition,
        getPortDirection,
        routeBetweenPorts,
        insertarCodoEnLinea,
        insertarTeeEnLinea,
        insertarReducerYElbowEnExtremo,
        procesarInterseccionesDeLinea
    };
})();
