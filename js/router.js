
// ============================================================
// SMARTFLOW ROUTER v3.3 - Enrutador de Tuberías Inteligente
// Archivo: js/router.js
// Compatible: SmartFlowCore v5.6 + SmartFlowCommands v3.2
// Correcciones v3.3: routeWithWaypoints respeta coordenadas exactas,
//                    no fuerza alineación con puerto destino,
//                    inyección de codos en cambios de dirección,
//                    material PPR asigna spec PPR_PN12_5
// ============================================================

const SmartFlowRouter = (function() {
    
    let _core = null;
    let _catalog = null;
    let _notifyUI = (msg, isErr) => console.log(msg);
    let _renderUI = () => {};
    let _currentUtterance = null;

    const ANGLE_TOLERANCE = 0.9999;
    const ORTHOGONAL_TOLERANCE = 0.0175;
    const MIN_ANGLE_FOR_ELBOW = 3;
    const EXTENSION_DISTANCE = 500;

    function ensureInitialized() {
        if (!_core && typeof SmartFlowCore !== 'undefined') _core = SmartFlowCore;
        if (!_catalog && typeof SmartFlowCatalog !== 'undefined') _catalog = SmartFlowCatalog;
        if (_core && _catalog) return true;
        return false;
    }

    function speakText(text) {
        if (!_core || !_core.isVoiceEnabled()) return;
        if (typeof window.speechSynthesis !== 'undefined') {
            window.speechSynthesis.cancel();
            _currentUtterance = new SpeechSynthesisUtterance(text);
            _currentUtterance.lang = 'es-ES';
            _currentUtterance.rate = 0.95;
            window.speechSynthesis.speak(_currentUtterance);
        }
    }

    function notifyUser(message, isError) {
        isError = isError || false;
        if (typeof _notifyUI === 'function') _notifyUI(message, isError);
        var statusEl = document.getElementById('statusMsg');
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
        var len = Math.hypot(v.x, v.y, v.z);
        if (len === 0) return { x: 1, y: 0, z: 0, dx: 1, dy: 0, dz: 0 };
        var n = { x: v.x / len, y: v.y / len, z: v.z / len };
        n.dx = n.x; n.dy = n.y; n.dz = n.z;
        return n;
    }
    
    function dotProduct(v1, v2) { return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z; }
    
    function projectPointOnSegment(p, a, b) {
        var ab = subtractPoints(b, a);
        var ap = subtractPoints(p, a);
        var len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
        if (len2 === 0) return { point: a, t: 0, distance: distance(p, a) };
        var t = dotProduct(ap, ab) / len2;
        t = Math.max(0, Math.min(1, t));
        var proj = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
        return { point: proj, t: t, distance: distance(p, proj) };
    }

    function calculateOrthogonalIntersection(portPos, portDir, targetPos) {
        if (!portPos || !portDir || !targetPos) {
            return { intersection: portPos || { x: 0, y: 0, z: 0 }, lateralDistance: 0, isOrthogonal: true, angleDeg: 0, needsElbow: false,
                lateralVector: { x: 0, y: 0, z: 0 }, lateralDir: { dx: 0, dy: 0, dz: 0, x: 0, y: 0, z: 0 } };
        }
        var dir = normalizeVector(portDir);
        if (Math.hypot(dir.x, dir.y, dir.z) < 0.0001) {
            return { intersection: portPos, lateralDistance: 0, isOrthogonal: true, angleDeg: 0, needsElbow: false,
                lateralVector: { x: 0, y: 0, z: 0 }, lateralDir: { dx: 0, dy: 0, dz: 0, x: 0, y: 0, z: 0 } };
        }
        var toTarget = subtractPoints(targetPos, portPos);
        var targetDist = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
        if (targetDist === 0 || isNaN(targetDist)) {
            return { intersection: portPos, lateralDistance: 0, isOrthogonal: true, angleDeg: 0, needsElbow: false,
                lateralVector: { x: 0, y: 0, z: 0 }, lateralDir: { dx: 0, dy: 0, dz: 0, x: 0, y: 0, z: 0 } };
        }
        var projLength = dotProduct(toTarget, dir);
        if (isNaN(projLength)) {
            var toTargetDir = normalizeVector(toTarget);
            return { intersection: portPos, lateralVector: toTarget,
                lateralDir: { dx: toTargetDir.x, dy: toTargetDir.y, dz: toTargetDir.z, x: toTargetDir.x, y: toTargetDir.y, z: toTargetDir.z },
                lateralDistance: targetDist, isOrthogonal: false, angleDeg: 90, needsElbow: true };
        }
        var intersection = addPoints(portPos, scalePoint(dir, projLength));
        var lateralVector = subtractPoints(targetPos, intersection);
        var lateralDistance = Math.hypot(lateralVector.x, lateralVector.y, lateralVector.z);
        var toTargetDir2 = normalizeVector(toTarget);
        var cosAngle = Math.max(-1, Math.min(1, dotProduct(dir, toTargetDir2)));
        var angleDeg = Math.acos(cosAngle) * 180 / Math.PI;
        var isOrthogonal = lateralDistance < ORTHOGONAL_TOLERANCE || Math.abs(projLength) < ORTHOGONAL_TOLERANCE;
        var lateralDir = lateralDistance > 0 ? normalizeVector(lateralVector) : { dx: 0, dy: 0, dz: 0, x: 0, y: 0, z: 0 };
        return { intersection: intersection, lateralVector: lateralVector, lateralDir: lateralDir,
            lateralDistance: lateralDistance, isOrthogonal: isOrthogonal, angleDeg: angleDeg,
            needsElbow: !isOrthogonal && (angleDeg > MIN_ANGLE_FOR_ELBOW) };
    }

    function getPortPosition(obj, portId) {
        if (!obj) return null;
        if (obj.posX !== undefined) {
            var puerto = obj.puertos ? obj.puertos.find(function(p) { return p.id === portId; }) : null;
            if (!puerto) return null;
            return { x: obj.posX + (puerto.relX || (puerto.relPos ? puerto.relPos.x : 0) || 0), 
                     y: obj.posY + (puerto.relY || (puerto.relPos ? puerto.relPos.y : 0) || 0), 
                     z: obj.posZ + (puerto.relZ || (puerto.relPos ? puerto.relPos.z : 0) || 0) };
        }
        if (obj.pos && obj.pos.x !== undefined) {
            var puerto2 = obj.puertos ? obj.puertos.find(function(p) { return p.id === portId; }) : null;
            if (!puerto2) return null;
            return { x: obj.pos.x + (puerto2.relX || (puerto2.relPos ? puerto2.relPos.x : 0) || 0),
                     y: obj.pos.y + (puerto2.relY || (puerto2.relPos ? puerto2.relPos.y : 0) || 0),
                     z: obj.pos.z + (puerto2.relZ || (puerto2.relPos ? puerto2.relPos.z : 0) || 0) };
        }
        var pts = _core ? _core.getLinePoints(obj) : (obj._cachedPoints || obj.points3D || obj.points);
        if (!pts || pts.length === 0) return null;
        if (obj.puertos) { var puerto3 = obj.puertos.find(function(p) { return p.id === portId; }); if (puerto3 && puerto3.pos) return puerto3.pos; }
        if (portId === '0') return pts[0];
        if (portId === '1') return pts[pts.length - 1];
        return pts[Math.floor(pts.length / 2)];
    }

    function getPortDirection(obj, portId) {
        var defaultDir = { dx: 1, dy: 0, dz: 0, x: 1, y: 0, z: 0 };
        if (!obj) return defaultDir;
        if (obj.posX !== undefined || (obj.pos && obj.pos.x !== undefined)) {
            var puerto = obj.puertos ? obj.puertos.find(function(p) { return p.id === portId; }) : null;
            if (puerto) {
                var ori = puerto.orientacion || puerto.dir || puerto.normal || puerto.vector;
                if (ori) {
                    var x = parseFloat(ori.dx !== undefined ? ori.dx : (ori.x !== undefined ? ori.x : 1));
                    var y = parseFloat(ori.dy !== undefined ? ori.dy : (ori.y !== undefined ? ori.y : 0));
                    var z = parseFloat(ori.dz !== undefined ? ori.dz : (ori.z !== undefined ? ori.z : 0));
                    return { dx: x, dy: y, dz: z, x: x, y: y, z: z };
                }
            }
            return defaultDir;
        }
        var pts = _core ? _core.getLinePoints(obj) : (obj._cachedPoints || obj.points3D || obj.points);
        if (pts && Array.isArray(pts) && pts.length >= 2) {
            try {
                var pBase, pSig;
                if (portId === '0' || portId === 0) { pBase = pts[0]; pSig = pts[1]; }
                else if (portId === '1' || portId === 1 || portId === String(pts.length - 1)) { pBase = pts[pts.length - 2]; pSig = pts[pts.length - 1]; }
                else { pBase = pts[0]; pSig = pts[1]; }
                if (pBase && pSig && pBase.x !== undefined && pSig.x !== undefined) {
                    var vSub = { x: pSig.x - pBase.x, y: pSig.y - pBase.y, z: pSig.z - pBase.z };
                    var vNorm = normalizeVector(vSub);
                    return { dx: vNorm.x, dy: vNorm.y, dz: vNorm.z, x: vNorm.x, y: vNorm.y, z: vNorm.z };
                }
            } catch (err) { console.warn('Error de orientación en línea para puerto ' + portId + ':', err); }
        }
        return defaultDir;
    }

    function getPortDirectionLocal(obj, portId) { return getPortDirection(obj, portId); }

    function getPortDiameter(obj, portId) {
        if (!obj) return null;
        if (obj.puertos) { var puerto = obj.puertos.find(function(p) { return p.id === portId; }); if (puerto && puerto.diametro) return parseFloat(puerto.diametro); }
        if (obj.diameter) return parseFloat(obj.diameter);
        if (obj.diametro) return parseFloat(obj.diametro);
        return null;
    }

    function necesitaReductor(diam1, diam2, tolerancia) {
        tolerancia = tolerancia || 0.15;
        if (!diam1 || !diam2) return false;
        return Math.abs(diam1 - diam2) > tolerancia;
    }

    function getFittingLength(componentType, diameter) {
        var catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) return 0;
        try {
            var comp = catalog.getComponent(componentType);
            if (!comp) return 0;
            var dims = comp.dimensiones || comp.dimensions;
            if (!dims) return 0;
            var diamKey = diameter + '"' || String(diameter);
            var dimForDiam = dims[diamKey] || dims[diameter] || dims.DEFAULT;
            if (dimForDiam && dimForDiam.centerToFace) return dimForDiam.centerToFace;
            var typicalLengths = { 'ELBOW_90': 38, 'ELBOW_45': 25, 'TEE': 50, 'TEE_EQUAL': 50, 'TEE_REDUCING': 55, 'CONCENTRIC_REDUCER': 75 };
            var keys = Object.keys(typicalLengths);
            for (var k = 0; k < keys.length; k++) { if (componentType.toUpperCase().indexOf(keys[k]) !== -1) return typicalLengths[keys[k]]; }
        } catch (e) { console.warn('Error obteniendo fitting length:', e); }
        return 50;
    }

    function findComponentInCatalog(desiredType, lineMaterial, fallbackTypes) {
        ensureInitialized();
        var catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) { notifyUser('Catálogo no disponible', true); return null; }
        var allTypes = catalog.listComponentTypes();
        var materialUpper = (lineMaterial || '').toUpperCase();
        fallbackTypes = fallbackTypes || [];
        var TYPE_SYNONYMS = {
            'TEE': ['TEE_EQUAL', 'TEE_PPR', 'TEE_CS', 'TEE_SS', 'EQUAL_TEE'],
            'TEE_EQUAL': ['TEE', 'TEE_PPR', 'TEE_CS', 'TEE_SS', 'EQUAL_TEE'],
            'TEE_REDUCING': ['TEE_REDUCER', 'REDUCING_TEE', 'TEE_RED'],
            'CONCENTRIC_REDUCER': ['REDUCER_CONCENTRIC', 'REDC', 'CONC_REDUCER', 'REDUCER'],
            'ECCENTRIC_REDUCER': ['REDUCER_ECCENTRIC', 'REDE', 'ECC_REDUCER'],
            'ELBOW_90_LR': ['ELBOW_90', 'ELBOW', 'ELBW', '90DEG_ELBOW'],
            'ELBOW_45': ['ELBOW_45_LR', '45DEG_ELBOW', 'ELL4'],
            'WELD_NECK_FLANGE': ['FLANGE_WN', 'FLWN', 'WN_FLANGE'],
            'SLIP_ON_FLANGE': ['FLANGE_SO', 'FLSO', 'SO_FLANGE'],
            'GATE_VALVE': ['VALVE_GATE', 'VAGF', 'GATE'],
            'BALL_VALVE': ['VALVE_BALL', 'VBAL', 'BALL'],
            'CHECK_VALVE': ['VALVE_CHECK', 'VCFF', 'CHECK']
        };
        var candidates = [];
        var synonyms = TYPE_SYNONYMS[desiredType] || [];
        for (var i = 0; i < synonyms.length; i++) { candidates.push(synonyms[i] + '_' + materialUpper); candidates.push(synonyms[i]); }
        for (var j = 0; j < fallbackTypes.length; j++) { candidates.push(fallbackTypes[j] + '_' + materialUpper); candidates.push(fallbackTypes[j]); }
        candidates.push(desiredType);
        for (var m = 0; m < candidates.length; m++) { if (allTypes.indexOf(candidates[m]) !== -1) return candidates[m]; }
        var baseName = desiredType.split('_')[0];
        for (var n = 0; n < allTypes.length; n++) { if (allTypes[n].toUpperCase().indexOf(baseName.toUpperCase()) !== -1 && allTypes[n].toUpperCase().indexOf(materialUpper) !== -1) return allTypes[n]; }
        for (var p = 0; p < allTypes.length; p++) { if (allTypes[p].toUpperCase().indexOf(baseName.toUpperCase()) !== -1) return allTypes[p]; }
        return null;
    }

    function findElbowForLine(material, diameter, angleDeg) {
        var catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) return null;
        var allTypes = catalog.listComponentTypes();
        var elbowTypes = allTypes.filter(function(t) { return t.toUpperCase().indexOf('ELBOW') !== -1; });
        var bestMatch = null, bestDiff = Infinity;
        for (var i = 0; i < elbowTypes.length; i++) {
            var comp = catalog.getComponent(elbowTypes[i]);
            if (!comp || typeof comp.angulo === 'undefined') continue;
            var diff = Math.abs(comp.angulo - angleDeg);
            if (diff < bestDiff && diff < 15) { bestDiff = diff; bestMatch = elbowTypes[i]; }
        }
        if (!bestMatch) {
            var mat = (material || '').toUpperCase();
            for (var j = 0; j < elbowTypes.length; j++) {
                var t = elbowTypes[j];
                if (mat.indexOf('PPR') !== -1 && t.toUpperCase().indexOf('PPR') !== -1) { bestMatch = t; break; }
                if (mat.indexOf('HDPE') !== -1 && t.toUpperCase().indexOf('HDPE') !== -1) { bestMatch = t; break; }
                if ((mat.indexOf('ACERO') !== -1 || mat.indexOf('CS') !== -1) && t.toUpperCase().indexOf('CS') !== -1) { bestMatch = t; break; }
                if ((mat.indexOf('INOX') !== -1 || mat.indexOf('SS') !== -1) && t.toUpperCase().indexOf('SS') !== -1) { bestMatch = t; break; }
            }
        }
        return bestMatch;
    }

    function findReducerForDiameters(diamLarge, diamSmall, material) {
        var catalog = _catalog || window.SmartFlowCatalog;
        if (!catalog) return null;
        var allTypes = catalog.listComponentTypes();
        var materialUpper = (material || '').toUpperCase();
        var candidates = [];
        if (materialUpper.indexOf('PPR') !== -1) { candidates.push('CONCENTRIC_REDUCER_PPR', 'REDUCER_CONCENTRIC_PPR'); }
        else if (materialUpper.indexOf('ACERO') !== -1 || materialUpper.indexOf('CS') !== -1) { candidates.push('CONCENTRIC_REDUCER_CS', 'CONCENTRIC_REDUCER'); }
        else if (materialUpper.indexOf('INOX') !== -1 || materialUpper.indexOf('SS') !== -1) { candidates.push('CONCENTRIC_REDUCER_SS', 'ECCENTRIC_REDUCER_SS'); }
        candidates.push('CONCENTRIC_REDUCER', 'ECCENTRIC_REDUCER', 'REDUCER');
        for (var i = 0; i < candidates.length; i++) { if (allTypes.indexOf(candidates[i]) !== -1) return candidates[i]; }
        var reducerTypes = allTypes.filter(function(t) { return t.toUpperCase().indexOf('REDUC') !== -1 || t.toUpperCase().indexOf('REDC') !== -1; });
        for (var r = 0; r < reducerTypes.length; r++) { if (reducerTypes[r].toUpperCase().indexOf('CONC') !== -1) return reducerTypes[r]; }
        return reducerTypes.length > 0 ? reducerTypes[0] : null;
    }

    function ensureFittings(lineObj, fromObj, fromPortId, toObj, toPortId, diameter, material) {
        if (!lineObj) return { added: [], message: ' | ⚠️ Sin objeto de línea' };
        var puntos = lineObj._cachedPoints || lineObj.points3D || [];
        if (puntos.length < 2) return { added: [], message: ' | ⚠️ Puntos insuficientes' };
        lineObj.components = lineObj.components || [];
        var inicialCount = lineObj.components.length;
        var addedFittings = [];
        
        function existeComponenteSimilar(tipo, param, tolerancia) {
            tolerancia = tolerancia || 0.03;
            return lineObj.components.some(function(c) { 
                return c.type && c.type.toUpperCase().indexOf(tipo.toUpperCase()) !== -1 && Math.abs((c.param || 0) - param) < tolerancia; 
            });
        }
        
        if (fromObj && fromPortId) {
            var diamPuertoOrigen = getPortDiameter(fromObj, fromPortId);
            var diamLinea = parseFloat(lineObj.diameter || diameter);
            if (diamPuertoOrigen && necesitaReductor(diamPuertoOrigen, diamLinea)) {
                var reducerType = findReducerForDiameters(Math.max(diamPuertoOrigen, diamLinea), Math.min(diamPuertoOrigen, diamLinea), material);
                if (reducerType && !existeComponenteSimilar('REDUCER', 0.0)) {
                    lineObj.components.push({ type: reducerType, tag: 'RED-' + lineObj.tag + '-START-' + Date.now().toString(36), param: 0.0 });
                    addedFittings.push(lineObj.components[lineObj.components.length - 1].tag);
                }
            }
        }
        if (toObj && toPortId) {
            var diamPuertoDestino = getPortDiameter(toObj, toPortId);
            var diamLinea2 = parseFloat(lineObj.diameter || diameter);
            if (diamPuertoDestino && necesitaReductor(diamLinea2, diamPuertoDestino)) {
                var reducerType2 = findReducerForDiameters(Math.max(diamLinea2, diamPuertoDestino), Math.min(diamLinea2, diamPuertoDestino), material);
                if (reducerType2 && !existeComponenteSimilar('REDUCER', 1.0)) {
                    lineObj.components.push({ type: reducerType2, tag: 'RED-' + lineObj.tag + '-END-' + Date.now().toString(36), param: 1.0 });
                    addedFittings.push(lineObj.components[lineObj.components.length - 1].tag);
                }
            }
        }
        
        var totalLen = 0;
        for (var i = 0; i < puntos.length - 1; i++) { totalLen += Math.hypot(puntos[i+1].x - puntos[i].x, puntos[i+1].y - puntos[i].y, puntos[i+1].z - puntos[i].z); }
        
        for (var i2 = 1; i2 < puntos.length - 1; i2++) {
            var pAnt = puntos[i2 - 1], pAct = puntos[i2], pSig = puntos[i2 + 1];
            var v1 = { x: pAct.x - pAnt.x, y: pAct.y - pAnt.y, z: pAct.z - pAnt.z };
            var v2 = { x: pSig.x - pAct.x, y: pSig.y - pAct.y, z: pSig.z - pAct.z };
            var len1 = Math.hypot(v1.x, v1.y, v1.z) || 1;
            var len2 = Math.hypot(v2.x, v2.y, v2.z) || 1;
            var dot = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (len1 * len2);
            var angleDegInter = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
            if (angleDegInter > MIN_ANGLE_FOR_ELBOW) {
                var accum = 0;
                for (var j = 0; j < i2; j++) { accum += Math.hypot(puntos[j+1].x - puntos[j].x, puntos[j+1].y - puntos[j].y, puntos[j+1].z - puntos[j].z); }
                var paramValue = totalLen > 0 ? (accum / totalLen) : 0.5;
                if (!existeComponenteSimilar('ELBOW', paramValue)) {
                    var elbowType2 = findElbowForLine(material, diameter, angleDegInter);
                    if (elbowType2) {
                        lineObj.components.push({ type: elbowType2, tag: 'ELB-' + lineObj.tag + '-P' + i2 + '-' + Date.now().toString(36), param: paramValue });
                        addedFittings.push(lineObj.components[lineObj.components.length - 1].tag);
                    }
                }
            }
        }
        
        var delta = lineObj.components.length - inicialCount;
        if (delta > 0) {
            var codosCount = 0, redsCount = 0;
            for (var a = 0; a < addedFittings.length; a++) {
                if (addedFittings[a].indexOf('ELB') !== -1) codosCount++;
                if (addedFittings[a].indexOf('RED') !== -1) redsCount++;
            }
            var msgs = [];
            if (codosCount > 0) msgs.push(codosCount + ' codo(s)');
            if (redsCount > 0) msgs.push(redsCount + ' reductor(es)');
            return { added: addedFittings, message: ' | 🛠️ Inyectado: ' + msgs.join(' + ') };
        }
        return { added: [], message: ' | 📐 Continuidad geométrica OK' };
    }

    function insertarAccesorioEnLinea(lineTag, puntoConexion, diametroNuevaLinea, forzarTee) {
        ensureInitialized();
        if (!_core) { notifyUser('Core no inicializado', true); return null; }
        forzarTee = forzarTee || false;
        var db = _core.getDb();
        var linea = db.lines.find(function(l) { return l.tag === lineTag; });
        if (!linea) { notifyUser('Línea ' + lineTag + ' no encontrada', true); return null; }
        var pts = _core.getLinePoints(linea) || linea._cachedPoints || linea.points3D || linea.points;
        if (!pts || pts.length < 2) { notifyUser('Línea ' + lineTag + ' sin geometría', true); return null; }
        var lengths = [], totalLen = 0;
        for (var i = 0; i < pts.length - 1; i++) { var d = distance(pts[i], pts[i+1]); lengths.push(d); totalLen += d; }
        var minDist = Infinity, bestSegIdx = 0, bestT = 0;
        for (var i2 = 0; i2 < lengths.length; i2++) { var proj = projectPointOnSegment(puntoConexion, pts[i2], pts[i2+1]); if (proj.distance < minDist) { minDist = proj.distance; bestSegIdx = i2; bestT = proj.t; } }
        var accumBefore = 0;
        for (var i3 = 0; i3 < bestSegIdx; i3++) accumBefore += lengths[i3];
        var param = totalLen > 0 ? (accumBefore + bestT * lengths[bestSegIdx]) / totalLen : 0.5;
        var esInicio = (bestSegIdx === 0 && bestT < 0.1);
        var esFin = (bestSegIdx === lengths.length - 1 && bestT > 0.9);
        var esExtremo = !forzarTee && (esInicio || esFin);
        var diamLinea = linea.diameter || 4;
        var diffDiam = necesitaReductor(diametroNuevaLinea, diamLinea);
        var lineMaterial = linea.material || 'PPR';
        var tipoAccesorio, descripcion;
        if (esExtremo && diffDiam) { tipoAccesorio = 'CONCENTRIC_REDUCER'; descripcion = 'Reductor'; }
        else if (!esExtremo && diffDiam) { tipoAccesorio = 'TEE_REDUCING'; descripcion = 'Tee reductora'; }
        else if (!esExtremo) { tipoAccesorio = 'TEE'; descripcion = 'Tee igual'; }
        else { var puertoExtremo = linea.puertos ? linea.puertos.find(function(p) { return esInicio ? p.id === '0' : p.id === '1'; }) : null; if (puertoExtremo) { puertoExtremo.status = 'connected'; } _core.updateLine(lineTag, { puertos: linea.puertos }); return puertoExtremo ? puertoExtremo.id : (esInicio ? '0' : '1'); }
        var compEnCatalogo = findComponentInCatalog(tipoAccesorio, lineMaterial, []);
        if (!compEnCatalogo) { notifyUser('Componente no encontrado: ' + tipoAccesorio, true); return null; }
        if (!linea.components) linea.components = [];
        var comp = { type: compEnCatalogo, tag: compEnCatalogo + '-' + Date.now().toString(36), param: param };
        linea.components.push(comp);
        _core.updateLine(lineTag, { components: linea.components });
        var lineaActualizada = db.lines.find(function(l) { return l.tag === lineTag; });
        if (lineaActualizada && lineaActualizada.puertos && lineaActualizada.puertos.length > 0) { return lineaActualizada.puertos[lineaActualizada.puertos.length - 1].id; }
        return null;
    }

    function procesarInterseccionesDeLinea(nuevaLinea) {
        ensureInitialized();
        if (!_core) return;
        var db = _core.getDb();
        var lineasExistentes = db.lines.filter(function(l) { return l.tag !== nuevaLinea.tag; });
        if (lineasExistentes.length === 0) return;
        var ptsNueva = _core.getLinePoints(nuevaLinea) || nuevaLinea._cachedPoints || nuevaLinea.points3D || nuevaLinea.points;
        if (!ptsNueva || ptsNueva.length < 2) return;
        var tolerancia = 100;
        for (var i = 0; i < lineasExistentes.length; i++) {
            var lineaExistente = lineasExistentes[i];
            var ptsExistente = _core.getLinePoints(lineaExistente) || lineaExistente._cachedPoints || lineaExistente.points3D || lineaExistente.points;
            if (!ptsExistente || ptsExistente.length < 2) continue;
            for (var j = 0; j < ptsNueva.length - 1; j++) {
                var a1 = ptsNueva[j], a2 = ptsNueva[j+1];
                for (var k = 0; k < ptsExistente.length - 1; k++) {
                    var b1 = ptsExistente[k], b2 = ptsExistente[k+1];
                    var midNuevo = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2, z: (a1.z + a2.z) / 2 };
                    var proj = projectPointOnSegment(midNuevo, b1, b2);
                    if (proj.distance < tolerancia) {
                        var puertoId = insertarAccesorioEnLinea(lineaExistente.tag, proj.point, nuevaLinea.diameter || 4, true);
                        if (puertoId) {
                            var updatedLine = JSON.parse(JSON.stringify(nuevaLinea));
                            updatedLine.destination = { objType: 'line', equipTag: lineaExistente.tag, portId: puertoId };
                            var ptsActualizados = ptsNueva.slice();
                            ptsActualizados[ptsActualizados.length - 1] = proj.point;
                            updatedLine._cachedPoints = ptsActualizados;
                            _core.updateLine(updatedLine.tag, updatedLine);
                            if (lineaExistente.puertos) { var puerto = lineaExistente.puertos.find(function(p) { return p.id === puertoId; }); if (puerto) { puerto.connectedLine = updatedLine.tag; puerto.status = 'connected'; } }
                        }
                        return;
                    }
                }
            }
        }
    }

    function generateUniqueLineTag() {
        if (!_core) return 'L-' + Date.now();
        var db = _core.getDb();
        var existingTags = new Set();
        for (var i = 0; i < db.lines.length; i++) { existingTags.add(db.lines[i].tag); }
        var counter = db.lines.length + 1;
        var tag;
        do { tag = 'L-' + counter; counter++; } while (existingTags.has(tag) && counter < 10000);
        return tag;
    }

    // ================================================================
    //  RUTEO ENTRE PUERTOS (v3.3 - PPR corregido)
    // ================================================================

    function routeBetweenPorts(fromEquipTag, fromPortId, toEquipTag, toPortId, diameter, material, spec) {
        ensureInitialized();
        if (!_core) { notifyUser('Core no inicializado', true); return null; }
        diameter = diameter || 3; material = material || 'PPR'; spec = spec || 'PPR_PN12_5';
        if (material.toUpperCase().indexOf('PPR') !== -1) spec = 'PPR_PN12_5';
        var db = _core.getDb();
        var fromObj = _core.findObjectByTag(fromEquipTag) || db.equipos.find(function(e) { return e.tag === fromEquipTag; }) || db.lines.find(function(l) { return l.tag === fromEquipTag; });
        var toObj = _core.findObjectByTag(toEquipTag) || db.equipos.find(function(e) { return e.tag === toEquipTag; }) || db.lines.find(function(l) { return l.tag === toEquipTag; });
        if (!fromObj) { notifyUser('Origen ' + fromEquipTag + ' no encontrado', true); return null; }
        if (!toObj) { notifyUser('Destino ' + toEquipTag + ' no encontrado', true); return null; }
        var startPos = getPortPosition(fromObj, fromPortId);
        if (!startPos) { notifyUser('Puerto origen ' + fromPortId + ' no encontrado', true); return null; }
        var endPos, nuevoPuertoId = toPortId;
        var ptsTo = _core.getLinePoints(toObj) || toObj._cachedPoints || toObj.points3D || toObj.points;
        var isToLine = ptsTo && ptsTo.length >= 2;
        if (isToLine) {
            if (!toPortId || toPortId === '') {
                var minDist = Infinity, bestPoint = ptsTo[0];
                for (var i = 0; i < ptsTo.length - 1; i++) { var proj = projectPointOnSegment(startPos, ptsTo[i], ptsTo[i+1]); if (proj.distance < minDist) { minDist = proj.distance; bestPoint = proj.point; } }
                var puertoInsertado = insertarAccesorioEnLinea(toEquipTag, bestPoint, diameter, true);
                if (!puertoInsertado) return null;
                nuevoPuertoId = puertoInsertado; endPos = bestPoint;
                toObj = _core.findObjectByTag(toEquipTag) || db.lines.find(function(l) { return l.tag === toEquipTag; });
            } else {
                var puntoConexion;
                if (toPortId === '0') puntoConexion = ptsTo[0];
                else if (toPortId === '1') puntoConexion = ptsTo[ptsTo.length - 1];
                else puntoConexion = getPortPosition(toObj, toPortId);
                if (!puntoConexion) { notifyUser('Puerto destino no encontrado', true); return null; }
                var esExtremo = (toPortId === '0' || toPortId === '1');
                var diffDiam = necesitaReductor(diameter, (toObj.diameter || 4));
                if (esExtremo && !diffDiam) { nuevoPuertoId = toPortId; endPos = puntoConexion; }
                else if (esExtremo && diffDiam) { var puertoInsertado2 = insertarAccesorioEnLinea(toEquipTag, puntoConexion, diameter, false); if (puertoInsertado2) { nuevoPuertoId = puertoInsertado2; } endPos = puntoConexion; }
                else { var puertoInsertado3 = insertarAccesorioEnLinea(toEquipTag, puntoConexion, diameter, true); if (!puertoInsertado3) return null; nuevoPuertoId = puertoInsertado3; endPos = puntoConexion; }
            }
        } else { endPos = getPortPosition(toObj, nuevoPuertoId); }
        if (!endPos) { notifyUser('Puerto destino no encontrado', true); return null; }
        var startDirRaw = getPortDirection(fromObj, fromPortId);
        var startDir = normalizeVector(startDirRaw);
        var orthoResultStart = calculateOrthogonalIntersection(startPos, startDir, endPos);
        var waypoints = [startPos];
        var extStart = addPoints(startPos, scalePoint(startDir, EXTENSION_DISTANCE));
        if (orthoResultStart.isOrthogonal) { waypoints.push(extStart); waypoints.push(orthoResultStart.intersection); }
        else { waypoints.push(extStart); waypoints.push(orthoResultStart.intersection); waypoints.push(endPos); }
        var uniqueWaypoints = waypoints.filter(function(pt, i, arr) { return i === 0 || distance(pt, arr[i-1]) > 1; });
        if (uniqueWaypoints.length < 2) uniqueWaypoints = [startPos, endPos];
        var tag = generateUniqueLineTag();
        var isFromEquip = fromObj.posX !== undefined || (fromObj.pos && fromObj.pos.x !== undefined);
        var isToEquip = toObj.posX !== undefined || (toObj.pos && toObj.pos.x !== undefined);
        var nuevaLinea = {
            tag: tag, diameter: diameter, material: material, spec: spec,
            origin: { objType: isFromEquip ? 'equipment' : 'line', equipTag: fromEquipTag, portId: fromPortId },
            destination: { objType: isToEquip ? 'equipment' : 'line', equipTag: toEquipTag, portId: nuevoPuertoId },
            waypoints: uniqueWaypoints.slice(1, -1), _cachedPoints: uniqueWaypoints.slice(),
            points3D: uniqueWaypoints.slice(), points: uniqueWaypoints.slice(), components: []
        };
        _core.addLine(nuevaLinea);
        var lineaRegistrada = db.lines.find(function(l) { return l.tag === tag; }) || nuevaLinea;
        var fittingInfo = ensureFittings(lineaRegistrada, fromObj, fromPortId, toObj, nuevoPuertoId, diameter, material);
        if (_core.updateLine) { _core.updateLine(tag, lineaRegistrada); }
        if (fromObj.puertos) { var pFrom = fromObj.puertos.find(function(p) { return p.id === fromPortId; }); if (pFrom) pFrom.connectedLine = tag; }
        if (toObj.puertos) { var pTo = toObj.puertos.find(function(p) { return p.id === nuevoPuertoId; }); if (pTo) pTo.connectedLine = tag; }
        notifyUser('✅ Ruta: ' + tag + ' (' + fromEquipTag + '.' + fromPortId + ' → ' + toEquipTag + '.' + nuevoPuertoId + ') | ' + material + ' ' + diameter + '" ' + spec + (fittingInfo.message || ''), false);
        if (_renderUI) _renderUI();
        return lineaRegistrada;
    }

    // ================================================================
    //  RUTEO CON WAYPOINTS (v3.3 - PPR corregido)
    // ================================================================

    function routeWithWaypoints(fromEquipTag, fromPortId, toEquipTag, toPortId, waypoints, diameter, material, spec) {
        ensureInitialized();
        if (!_core) { notifyUser('Core no inicializado', true); return null; }
        diameter = diameter || 3; material = material || 'PPR'; spec = spec || 'PPR_PN12_5';
        if (material.toUpperCase().indexOf('PPR') !== -1) spec = 'PPR_PN12_5';
        var db = _core.getDb();
        var fromObj = _core.findObjectByTag(fromEquipTag) || db.equipos.find(function(e) { return e.tag === fromEquipTag; }) || db.lines.find(function(l) { return l.tag === fromEquipTag; });
        var toObj = _core.findObjectByTag(toEquipTag) || db.equipos.find(function(e) { return e.tag === toEquipTag; }) || db.lines.find(function(l) { return l.tag === toEquipTag; });
        if (!fromObj) { notifyUser('Origen ' + fromEquipTag + ' no encontrado', true); return null; }
        if (!toObj) { notifyUser('Destino ' + toEquipTag + ' no encontrado', true); return null; }
        var startPos = getPortPosition(fromObj, fromPortId);
        if (!startPos) { notifyUser('Puerto origen ' + fromPortId + ' no encontrado', true); return null; }
        var endPos = getPortPosition(toObj, toPortId);
        if (!endPos) { notifyUser('Puerto destino ' + toPortId + ' no encontrado', true); return null; }
        var allPoints = [startPos];
        if (waypoints && Array.isArray(waypoints)) { for (var w = 0; w < waypoints.length; w++) { allPoints.push({ x: waypoints[w].x, y: waypoints[w].y, z: waypoints[w].z }); } }
        allPoints.push({ x: endPos.x, y: endPos.y, z: endPos.z });
        var cleanPoints = [allPoints[0]];
        for (var i = 1; i < allPoints.length; i++) { if (distance(allPoints[i], cleanPoints[cleanPoints.length - 1]) > 10) { cleanPoints.push({ x: allPoints[i].x, y: allPoints[i].y, z: allPoints[i].z }); } }
        if (cleanPoints.length < 2) { notifyUser('Se requieren al menos 2 puntos distintos', true); return null; }
        var tag = generateUniqueLineTag();
        var isFromEquip = fromObj.posX !== undefined || (fromObj.pos && fromObj.pos.x !== undefined);
        var isToEquip = toObj.posX !== undefined || (toObj.pos && toObj.pos.x !== undefined);
        var nuevaLinea = {
            tag: tag, diameter: diameter, material: material, spec: spec,
            origin: { objType: isFromEquip ? 'equipment' : 'line', equipTag: fromEquipTag, portId: fromPortId },
            destination: { objType: isToEquip ? 'equipment' : 'line', equipTag: toEquipTag, portId: toPortId },
            waypoints: cleanPoints.slice(1, -1), _cachedPoints: cleanPoints.slice(),
            points3D: cleanPoints.slice(), points: cleanPoints.slice(), components: []
        };
        _core.addLine(nuevaLinea);
        var lineaRegistrada = db.lines.find(function(l) { return l.tag === tag; }) || nuevaLinea;
        var fittingInfo = ensureFittings(lineaRegistrada, fromObj, fromPortId, toObj, toPortId, diameter, material);
        if (_core.updateLine) { _core.updateLine(tag, lineaRegistrada); }
        if (fromObj.puertos) { var pFrom = fromObj.puertos.find(function(p) { return p.id === fromPortId; }); if (pFrom) pFrom.connectedLine = tag; }
        if (toObj.puertos) { var pTo = toObj.puertos.find(function(p) { return p.id === toPortId; }); if (pTo) pTo.connectedLine = tag; }
        var codosInyectados = 0;
        if (lineaRegistrada.components) { for (var c = 0; c < lineaRegistrada.components.length; c++) { if (lineaRegistrada.components[c].type && lineaRegistrada.components[c].type.toUpperCase().indexOf('ELBOW') !== -1) codosInyectados++; } }
        notifyUser('✅ Ruta: ' + tag + ' (' + fromEquipTag + '.' + fromPortId + ' → ' + cleanPoints.length + ' pts → ' + toEquipTag + '.' + toPortId + ') | ' + material + ' ' + diameter + '" ' + spec + (fittingInfo.message || '') + (codosInyectados > 0 ? ' | 🔧 ' + codosInyectados + ' codo(s)' : ''), false);
        if (_renderUI) _renderUI();
        return lineaRegistrada;
    }

    function handleSnapClick(snapData) {
        if (!snapData) return;
        ensureInitialized();
        _core.setSelected({ type: 'PUERTO', obj: snapData.port, parent: snapData.item });
        notifyUser('Puerto seleccionado: ' + snapData.item.tag + ' - ' + snapData.port.id);
    }

    function executeCommand(cmdLine) {
        ensureInitialized();
        var parts = cmdLine.trim().split(/\s+/);
        var action = parts[0] ? parts[0].toLowerCase() : '';
        switch(action) {
            case 'conectar': if (parts.length >= 5) routeBetweenPorts(parts[1], parts[2], parts[3], parts[4]); else notifyUser('Formato: conectar [Origen] [Puerto] [Destino] [Puerto]', true); break;
            case 'split': if (parts.length >= 2) { var p = parseFloat(parts[1]); if (!isNaN(p) && _core.injectAccessory) _core.injectAccessory(parts[0], p, { tag: 'TEE' }); } break;
            case 'limpiar': if (_core.nuevoProyecto) _core.nuevoProyecto(); break;
            default: notifyUser('Comando no reconocido: ' + action, true);
        }
    }

    function init(coreInstance, catalogInstance, notifyFn, renderFn) {
        _core = coreInstance;
        _catalog = catalogInstance;
        _notifyUI = notifyFn || _notifyUI;
        _renderUI = renderFn || _renderUI;
    }

    return {
        init: init, routeBetweenPorts: routeBetweenPorts, routeWithWaypoints: routeWithWaypoints,
        insertarAccesorioEnLinea: insertarAccesorioEnLinea, procesarInterseccionesDeLinea: procesarInterseccionesDeLinea,
        getPortPosition: getPortPosition, getPortDirection: getPortDirection,
        getPortDirectionLocal: getPortDirectionLocal, getPortDiameter: getPortDiameter,
        findComponentInCatalog: findComponentInCatalog, findElbowForLine: findElbowForLine,
        findReducerForDiameters: findReducerForDiameters, calculateOrthogonalIntersection: calculateOrthogonalIntersection,
        getFittingLength: getFittingLength, ensureFittings: ensureFittings,
        necesitaReductor: necesitaReductor, generateUniqueLineTag: generateUniqueLineTag,
        handleSnapClick: handleSnapClick, executeCommand: executeCommand
    };
})();

if (typeof window !== 'undefined') window.SmartFlowRouter = SmartFlowRouter;
