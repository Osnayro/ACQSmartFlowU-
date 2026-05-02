
// ============================================================
// SMARTFLOW ROUTER v6.3 (Corregido: puertos virtuales 0/1, inserciones robustas)
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
        // Es una línea: puertos virtuales '0' (inicio) o '1' (fin)
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
    // 5. Insertar accesorio (tee o reductor) en una línea existente
    // ------------------------------------------------------------------
    function insertarAccesorioEnLinea(lineTag, puntoConexion, diametroNuevaLinea, forzarTee = false) {
        const db = _core.getDb();
        const linea = db.lines.find(l => l.tag === lineTag);
        if (!linea) {
            _notifyUI(`Línea ${lineTag} no encontrada`, true);
            return null;
        }

        let pts = linea.points || linea._cachedPoints;
        if (!pts || pts.length < 2) {
            _notifyUI(`Línea ${lineTag} sin geometría`, true);
            return null;
        }

        // Encontrar el punto más cercano en la línea (no insertar aún)
        let minDist = Infinity, bestParam = 0.5;
        let totalLen = 0, lengths = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const d = _dist(pts[i], pts[i+1]);
            lengths.push(d);
            totalLen += d;
        }
        if (totalLen === 0) return null;
        
        let accum = 0;
        for (let i = 0; i < lengths.length; i++) {
            const a = pts[i], b = pts[i+1];
            const ab = _subtract(b, a);
            const ap = _subtract(puntoConexion, a);
            const t = _dot(ap, ab) / (ab.x*ab.x + ab.y*ab.y + ab.z*ab.z || 1);
            if (t >= 0 && t <= 1) {
                const proj = { x: a.x + t*ab.x, y: a.y + t*ab.y, z: a.z + t*ab.z };
                const d = _dist(puntoConexion, proj);
                if (d < minDist) {
                    minDist = d;
                    bestParam = (accum + t * lengths[i]) / totalLen;
                }
            }
            accum += lengths[i];
        }
        
        if (minDist > 500) {
            _notifyUI(`El punto está muy lejos de la línea ${lineTag} (distancia ${minDist.toFixed(0)} mm)`, true);
            return null;
        }
        
        // Determinar tipo de accesorio
        const diamLinea = linea.diameter || 4;
        const diffDiam = Math.abs(diametroNuevaLinea - diamLinea) > 0.1;
        let tipoAccesorio = 'TEE_EQUAL';
        if (diffDiam) tipoAccesorio = 'TEE_REDUCING';
        
        const compEnCatalogo = _catalog.getComponent(tipoAccesorio);
        if (!compEnCatalogo) {
            _notifyUI(`Accesorio ${tipoAccesorio} no encontrado`, true);
            return null;
        }
        
        // Añadir componente a la línea
        const compTag = `${tipoAccesorio}-${Date.now().slice(-6)}`;
        linea.components = linea.components || [];
        linea.components.push({ type: compEnCatalogo.tipo, tag: compTag, param: bestParam });
        _core.updateLine(lineTag, { components: linea.components });
        
        // Generar puerto virtual para conexión
        const puertoId = `ACC-${compTag}`;
        const ref = pts[0];
        linea.puertos = linea.puertos || [];
        linea.puertos.push({
            id: puertoId, label: 'Derivación',
            relX: puntoConexion.x - ref.x,
            relY: puntoConexion.y - ref.y,
            relZ: puntoConexion.z - ref.z,
            diametro: diametroNuevaLinea, status: 'open'
        });
        _core.updateLine(lineTag, { puertos: linea.puertos });
        
        _notifyUI(`Accesorio ${compEnCatalogo.nombre} insertado en ${lineTag} en posición ${(bestParam*100).toFixed(1)}%`, false);
        return puertoId;
    }

    // ------------------------------------------------------------------
    // 6. Enrutamiento entre dos puertos (con auto-codos y reductores)
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
            _notifyUI(`Puerto origen ${fromPort} no encontrado en ${fromTag}`, true);
            return null;
        }
        
        let endPos = null;
        let nuevoPuertoId = toPort;
        let reductorComponent = null;
        
        // Si el destino es una línea y no se especificó puerto válido
        if (toObj.points || toObj._cachedPoints) {
            const pts = toObj.points || toObj._cachedPoints;
            if (!pts || pts.length < 2) {
                _notifyUI("Línea destino sin geometría", true);
                return null;
            }
            
            // Si toPort es null o undefined, o es '0'/'1', usamos esos extremos
            if (!toPort || toPort === '0' || toPort === '1') {
                if (toPort === '0') {
                    endPos = _clonePoint(pts[0]);
                    nuevoPuertoId = '0';
                } else if (toPort === '1') {
                    endPos = _clonePoint(pts[pts.length-1]);
                    nuevoPuertoId = '1';
                } else {
                    // Conectar al punto más cercano de la línea (insertar tee)
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
                        _notifyUI("No se pudo encontrar punto de conexión en la línea", true);
                        return null;
                    }
                    const puertoId = insertarAccesorioEnLinea(toTag, bestPoint, diameter, true);
                    if (!puertoId) return null;
                    nuevoPuertoId = puertoId;
                    toObj = db.lines.find(l => l.tag === toTag);
                    endPos = bestPoint;
                }
            } else {
                // Es un puerto específico de la línea (creado por un accesorio)
                endPos = getPortPosition(toObj, toPort);
                if (!endPos) {
                    _notifyUI(`Puerto destino ${toPort} no encontrado en línea ${toTag}`, true);
                    return null;
                }
                nuevoPuertoId = toPort;
            }
        } else {
            // Destino es un equipo
            endPos = getPortPosition(toObj, toPort);
            if (!endPos) {
                _notifyUI(`Puerto destino ${toPort} no encontrado en equipo ${toTag}`, true);
                return null;
            }
            nuevoPuertoId = toPort;
        }
        
        if (!endPos) {
            _notifyUI("No se pudo obtener posición destino", true);
            return null;
        }
        
        // Herencia de material/especificación
        const materialFinal = material || toObj.material || 'PPR';
        const specFinal = spec || toObj.spec || 'PPR_PN12_5';
        
        // Calcular ruta ortogonal
        const points = calculateRoute(startPos, endPos, ['x', 'z', 'y']);
        const newTag = `L-${db.lines.length+1}`;
        const newLine = {
            tag: newTag,
            diameter: diameter,
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
        if (fromObj.points || fromObj._cachedPoints) {
            try {
                const fromDir = getPortDirection(fromObj, fromPort);
                const firstSeg = _normalize(_subtract(points[1], startPos));
                const angleRad = Math.acos(Math.min(1, Math.abs(_dot(fromDir, firstSeg))));
                const angleDeg = angleRad * 180 / Math.PI;
                if (angleDeg > 15) {
                    const elbowId = findElbowForLine(materialFinal, diameter, angleDeg);
                    if (elbowId) {
                        newLine.components.push({ type: elbowId, tag: `${elbowId}-${Date.now().slice(-6)}`, param: 0.0 });
                    }
                }
            } catch(e) { console.warn("Auto-codo origen:", e); }
        }
        
        // Auto-codo en destino (si es línea)
        if (toObj.points || toObj._cachedPoints) {
            try {
                const toDir = getPortDirection(toObj, nuevoPuertoId);
                const lastSeg = _normalize(_subtract(endPos, points[points.length-2]));
                const angleRad = Math.acos(Math.min(1, Math.abs(_dot(toDir, lastSeg))));
                const angleDeg = angleRad * 180 / Math.PI;
                if (angleDeg > 15) {
                    const elbowId = findElbowForLine(materialFinal, diameter, angleDeg);
                    if (elbowId) {
                        newLine.components.push({ type: elbowId, tag: `${elbowId}-${Date.now().slice(-6)}`, param: 1.0 });
                    }
                }
            } catch(e) { console.warn("Auto-codo destino:", e); }
        }
        
        if (reductorComponent) newLine.components.push(reductorComponent);
        
        _core.addLine(newLine);
        
        // Marcar puertos como conectados
        const fromPortObj = fromObj.puertos?.find(p=>p.id===fromPort);
        if (fromPortObj) fromPortObj.connectedLine = newTag;
        if (toObj.puertos) {
            const toPortObj = toObj.puertos.find(p=>p.id===nuevoPuertoId);
            if (toPortObj) toPortObj.connectedLine = newTag;
        }
        
        _core.syncPhysicalData();
        _core._saveState();
        _notifyUI(`✅ Ruta ${newTag} creada (${fromTag}.${fromPort} → ${toTag}.${nuevoPuertoId})`, false);
        return newLine;
    }

    // ------------------------------------------------------------------
    // 7. Procesar intersecciones (placeholder)
    // ------------------------------------------------------------------
    function procesarInterseccionesDeLinea(nuevaLinea) {
        // Para implementación futura
    }

    // ------------------------------------------------------------------
    // 8. Inicialización
    // ------------------------------------------------------------------
    function init(core, catalog, notifyFn) {
        _core = core;
        _catalog = catalog;
        if (notifyFn) _notifyUI = notifyFn;
        console.log("✅ Router v6.3 listo (puertos virtuales 0/1 corregidos)");
    }

    return {
        init,
        createLineMesh,
        calculateRoute,
        getPortPosition,
        getPortDirection,
        routeBetweenPorts,
        insertarAccesorioEnLinea,
        procesarInterseccionesDeLinea
    };
})();
