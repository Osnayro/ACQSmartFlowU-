
// ============================================================
// SMARTFLOW CORE UNIFICADO v7.0 (2D + 3D opcional)
// Archivo: js/core.js
// Conserva el 100% de funciones del Core 2D v4.5
// Añade motor Three.js opcional con suscripción y raycasting
// ============================================================

const SmartFlowCore = (function() {
    
    // ==================== 1. BASE DE DATOS ====================
    let _db = { 
        equipos: [], 
        lines: [], 
        specs: {
            "A1A": { mat: "Acero al Carbono", rating: 150, sch: "STD" },
            "A3B": { mat: "Acero Inoxidable", rating: 300, sch: "40S" },
            "PPR_PN12_5": { mat: "PPR", norma: "IRAM 13471", presion: "PN 12.5" },
            "ACERO_SCH80": { mat: "Acero al Carbono", schedule: "SCH 80" }
        },
        metadata: { version: "7.0", lastModified: Date.now() }
    };
    
    let _selectedElement = null;
    let _history = { past: [], future: [], maxSize: 50 };
    let _voiceEnabled = true;
    let _currentElevation = 0;

    let _notifyUI = (msg, isErr) => console.log(msg);
    let _renderUI = () => {};
    
    // ==================== 2. SUSCRIPTORES (para UI y renderers) ====================
    let _subscribers = [];
    
    // ==================== 3. RECURSOS THREE.JS (opcional) ====================
    let _scene = null;
    let _camera = null;
    let _renderer3D = null;
    let _controls = null;
    let _raycaster = null;
    let _mouse = null;
    let _container3D = null;
    let _threeInitialized = false;
    let _animateId = null;
    
    let _visualFactory = null;
    let _visualMap = new Map();          // tag → Object3D
    
    // ==================== 4. UTILIDADES PRIVADAS ====================
    const _deepClone = (obj) => {
        try { return structuredClone(obj); } 
        catch (e) { return JSON.parse(JSON.stringify(obj)); }
    };
    
    const _exists = (tag, type) => _db[type].some(item => item.tag === tag);
    
    const _notify = () => {
        _db.metadata.lastModified = Date.now();
        _subscribers.forEach(cb => cb(_db));
    };
    
    // ==================== 5. MÉTODOS DE NEGOCIO (ORIGINALES 2D) ====================
    
    function findObjectByTag(tag) {
        return _db.equipos.find(e => e.tag === tag) || _db.lines.find(l => l.tag === tag);
    }
    
    function getObjectPosition(obj) {
        if (obj.posX !== undefined) return { x: obj.posX, y: obj.posY, z: obj.posZ };
        const pts = obj._cachedPoints || obj.points3D;
        if (pts && pts.length > 0) return pts[0];
        return { x: 0, y: 0, z: 0 };
    }
    
    function syncPhysicalData() {
        _db.lines.forEach(line => {
            if (line.origin && line.origin.objTag) {
                const sourceObj = findObjectByTag(line.origin.objTag);
                if (sourceObj) {
                    const puerto = sourceObj.puertos?.find(p => p.id === line.origin.portId);
                    if (puerto) {
                        const posBase = getObjectPosition(sourceObj);
                        const newStart = {
                            x: posBase.x + (puerto.relX || puerto.relPos?.x || 0),
                            y: posBase.y + (puerto.relY || puerto.relPos?.y || 0),
                            z: posBase.z + (puerto.relZ || puerto.relPos?.z || 0)
                        };
                        const pts = line._cachedPoints || line.points3D;
                        if (pts && pts.length > 0) pts[0] = newStart;
                    }
                }
            }
            if (line.destination && line.destination.objTag) {
                const targetObj = findObjectByTag(line.destination.objTag);
                if (targetObj) {
                    const puerto = targetObj.puertos?.find(p => p.id === line.destination.portId);
                    if (puerto) {
                        const posBase = getObjectPosition(targetObj);
                        const newEnd = {
                            x: posBase.x + (puerto.relX || puerto.relPos?.x || 0),
                            y: posBase.y + (puerto.relY || puerto.relPos?.y || 0),
                            z: posBase.z + (puerto.relZ || puerto.relPos?.z || 0)
                        };
                        const pts = line._cachedPoints || line.points3D;
                        if (pts && pts.length > 0) pts[pts.length - 1] = newEnd;
                    }
                }
            }
        });
        _renderUI();
        _notify();
    }
    
    function checkCompatibility(portA, portB) {
        const alerts = [];
        if (portA.diametro !== portB.diametro) alerts.push(`Diferencia de diámetro: ${portA.diametro}" vs ${portB.diametro}"`);
        if (portA.constraints?.spec && portB.constraints?.spec && portA.constraints.spec !== portB.constraints.spec)
            alerts.push(`Diferencia de especificación: ${portA.constraints.spec} vs ${portB.constraints.spec}`);
        return { isCompatible: alerts.length === 0, alerts };
    }
    
    function _findSegmentAtPoint(line, clickPoint, tolerance = 500) {
        const pts = line._cachedPoints || line.points3D;
        if (!pts || pts.length < 2) return -1;
        let minDist = Infinity, bestIndex = -1;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i+1];
            const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
            const ap = { x: clickPoint.x - a.x, y: clickPoint.y - a.y, z: clickPoint.z - a.z };
            const len2 = ab.x*ab.x + ab.y*ab.y + ab.z*ab.z;
            if (len2 === 0) continue;
            const t = Math.max(0, Math.min(1, (ap.x*ab.x + ap.y*ab.y + ap.z*ab.z) / len2));
            const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
            const dist = Math.hypot(clickPoint.x - proj.x, clickPoint.y - proj.y, clickPoint.z - proj.z);
            if (dist < minDist && dist < tolerance) { minDist = dist; bestIndex = i; }
        }
        return bestIndex;
    }
    
    function pointInBox(p, box) {
        return p.x >= box.xMin && p.x <= box.xMax && p.y >= box.yMin && p.y <= box.yMax && p.z >= box.zMin && p.z <= box.zMax;
    }
    
    function segmentIntersectsBox(p1, p2, box) {
        if (pointInBox(p1, box) || pointInBox(p2, box)) return true;
        const segMin = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), z: Math.min(p1.z, p2.z) };
        const segMax = { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y), z: Math.max(p1.z, p2.z) };
        return !(segMax.x < box.xMin || segMin.x > box.xMax || segMax.y < box.yMin || segMin.y > box.yMax || segMax.z < box.zMin || segMin.z > box.zMax);
    }
    
    function auditCollisions() {
        const collisions = [];
        _db.lines.forEach(line => {
            const pts = line._cachedPoints || line.points3D; if (!pts || pts.length < 2) return;
            _db.equipos.forEach(eq => {
                if ((line.origin && line.origin.objTag === eq.tag) || (line.destination && line.destination.objTag === eq.tag)) return;
                let box;
                if (eq.tipo === 'tanque_v' || eq.tipo === 'torre' || eq.tipo === 'reactor') {
                    const r = eq.diametro/2, hh = eq.altura/2;
                    box = { xMin: eq.posX-r, xMax: eq.posX+r, yMin: eq.posY-hh, yMax: eq.posY+hh, zMin: eq.posZ-r, zMax: eq.posZ+r };
                } else if (eq.tipo === 'tanque_h') {
                    const hl = eq.largo/2, hd = eq.diametro/2;
                    box = { xMin: eq.posX-hl, xMax: eq.posX+hl, yMin: eq.posY-hd, yMax: eq.posY+hd, zMin: eq.posZ-hd, zMax: eq.posZ+hd };
                } else {
                    const hl = (eq.largo||1000)/2, hw = (eq.ancho||eq.diametro||1000)/2, hh = (eq.altura||1000)/2;
                    box = { xMin: eq.posX-hl, xMax: eq.posX+hl, yMin: eq.posY-hh, yMax: eq.posY+hh, zMin: eq.posZ-hw, zMax: eq.posZ+hw };
                }
                for (let i = 0; i < pts.length-1; i++) if (segmentIntersectsBox(pts[i], pts[i+1], box)) { collisions.push({ line1: line.tag, equipment: eq.tag, type: 'LINE_EQUIPMENT' }); break; }
            });
        });
        for (let i = 0; i < _db.lines.length; i++) {
            const lineA = _db.lines[i], ptsA = lineA._cachedPoints || lineA.points3D; if (!ptsA || ptsA.length < 2) continue;
            for (let j = i+1; j < _db.lines.length; j++) {
                const lineB = _db.lines[j], ptsB = lineB._cachedPoints || lineB.points3D; if (!ptsB || ptsB.length < 2) continue;
                const share = (lineA.origin && lineB.origin && lineA.origin.objTag === lineB.origin.objTag) || (lineA.origin && lineB.destination && lineA.origin.objTag === lineB.destination.objTag) || (lineA.destination && lineB.origin && lineA.destination.objTag === lineB.origin.objTag) || (lineA.destination && lineB.destination && lineA.destination.objTag === lineB.destination.objTag);
                if (share) continue;
                let col = false;
                for (let a = 0; a < ptsA.length-1 && !col; a++) {
                    for (let b = 0; b < ptsB.length-1 && !col; b++) {
                        const sA1 = ptsA[a], sA2 = ptsA[a+1], sB1 = ptsB[b], sB2 = ptsB[b+1];
                        const boxA = { xMin: Math.min(sA1.x,sA2.x), xMax: Math.max(sA1.x,sA2.x), yMin: Math.min(sA1.y,sA2.y), yMax: Math.max(sA1.y,sA2.y), zMin: Math.min(sA1.z,sA2.z), zMax: Math.max(sA1.z,sA2.z) };
                        const boxB = { xMin: Math.min(sB1.x,sB2.x), xMax: Math.max(sB1.x,sB2.x), yMin: Math.min(sB1.y,sB2.y), yMax: Math.max(sB1.y,sB2.y), zMin: Math.min(sB1.z,sB2.z), zMax: Math.max(sB1.z,sB2.z) };
                        if (!(boxA.xMax < boxB.xMin || boxA.xMin > boxB.xMax || boxA.yMax < boxB.yMin || boxA.yMin > boxB.yMax || boxA.zMax < boxB.zMin || boxA.zMin > boxB.zMax)) { collisions.push({ line1: lineA.tag, line2: lineB.tag, type: 'LINE_LINE' }); col = true; }
                    }
                }
            }
        }
        return collisions;
    }
    
    function getSpoolReport(lineTag) {
        const line = _db.lines.find(l => l.tag === lineTag);
        if (!line) return null;
        const pts = line._cachedPoints || line.points3D;
        if (!pts || pts.length < 2) return null;
        let totalLen = 0;
        for (let i = 0; i < pts.length-1; i++) totalLen += Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y, pts[i+1].z-pts[i].z);
        const codos = pts.filter(p => p.isControlPoint).length;
        const comps = line.components?.length || 0;
        const juntas = codos*2 + comps*2 + (line.origin?1:0) + (line.destination?1:0);
        return { tag: line.tag, longitudTotal: totalLen, longitudTotalM: (totalLen/1000).toFixed(2)+' m', codos, componentes: comps, juntasEstimadas: juntas };
    }
    
    function _splitLineSegment(lineTag, param) {
        const line = _db.lines.find(l => l.tag === lineTag);
        if (!line) return null;
        const pts = line._cachedPoints || line.points3D;
        if (!pts || pts.length < 2) return null;
        let totalLen = 0, lengths = [];
        for (let i = 0; i < pts.length-1; i++) { const d = Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y, pts[i+1].z-pts[i].z); lengths.push(d); totalLen += d; }
        const targetLen = totalLen*param; let accum = 0, segIdx = 0, t = 0;
        for (let i = 0; i < lengths.length; i++) { if (accum+lengths[i] >= targetLen || i === lengths.length-1) { segIdx = i; t = (targetLen-accum)/(lengths[i]||1); break; } accum += lengths[i]; }
        const pA = pts[segIdx], pB = pts[segIdx+1];
        const punto = { x: pA.x+(pB.x-pA.x)*t, y: pA.y+(pB.y-pA.y)*t, z: pA.z+(pB.z-pA.z)*t };
        return { punto, segIdx, t };
    }
    
    function _getPerpendicular(dir) {
        let perp = { dx: -dir.dy, dy: dir.dx, dz: 0 };
        const len = Math.hypot(perp.dx, perp.dy, perp.dz);
        if (len < 0.1) perp = { dx: 1, dy: 0, dz: 0 };
        else { perp.dx /= len; perp.dy /= len; perp.dz /= len; }
        return perp;
    }
    
    // ==================== 6. INICIALIZACIÓN 3D ====================
    function _init3D(containerElement) {
        if (_threeInitialized) return;
        _container3D = containerElement;
        
        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0x0f172a);
        
        _camera = new THREE.PerspectiveCamera(45, containerElement.clientWidth / containerElement.clientHeight, 1, 1000000);
        _camera.position.set(8000, 8000, 8000);
        
        _renderer3D = new THREE.WebGLRenderer({ antialias: true });
        _renderer3D.setSize(containerElement.clientWidth, containerElement.clientHeight);
        _renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        containerElement.appendChild(_renderer3D.domElement);
        
        _controls = new THREE.OrbitControls(_camera, _renderer3D.domElement);
        _controls.enableDamping = true;
        _controls.target.set(0, 0, 0);
        
        _raycaster = new THREE.Raycaster();
        _mouse = new THREE.Vector2();
        _setupRaycaster();
        
        const ambient = new THREE.AmbientLight(0x404040, 1.5);
        const dir = new THREE.DirectionalLight(0xffffff, 1.2);
        dir.position.set(5000, 10000, 5000);
        _scene.add(ambient, dir);
        _scene.add(new THREE.GridHelper(20000, 40, 0x334155, 0x1e293b));
        
        const animate = () => {
            _animateId = requestAnimationFrame(animate);
            if (_controls) _controls.update();
            if (_renderer3D && _scene && _camera) _renderer3D.render(_scene, _camera);
        };
        animate();
        
        _threeInitialized = true;
        if (_visualFactory) _refreshAllVisuals();
    }
    
    function _setupRaycaster() {
        if (!_container3D) return;
        _container3D.addEventListener('click', (e) => {
            if (!_threeInitialized) return;
            const rect = _container3D.getBoundingClientRect();
            _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            _raycaster.setFromCamera(_mouse, _camera);
            const objects = Array.from(_visualMap.values());
            const intersects = _raycaster.intersectObjects(objects, true);
            if (intersects.length) {
                let hit = intersects[0].object;
                while (hit && !hit.userData.tag) hit = hit.parent;
                if (hit && hit.userData.tag) {
                    const tag = hit.userData.tag;
                    const eq = _db.equipos.find(e => e.tag === tag);
                    const line = _db.lines.find(l => l.tag === tag);
                    _selectedElement = eq ? { type: 'equipment', obj: eq } : line ? { type: 'line', obj: line } : null;
                    _notify();
                }
            }
        });
    }
    
    function _refreshAllVisuals() {
        if (!_scene || !_visualFactory) return;
        _visualMap.forEach(obj => _scene.remove(obj));
        _visualMap.clear();
        _db.equipos.forEach(eq => {
            const mesh = _visualFactory.createEquipmentMesh(eq);
            if (mesh) { _scene.add(mesh); _visualMap.set(eq.tag, mesh); }
        });
        _db.lines.forEach(line => {
            const mesh = _visualFactory.createLineMesh(line);
            if (mesh) { _scene.add(mesh); _visualMap.set(line.tag, mesh); }
        });
        _notify();
    }
    
    // ==================== 7. API PÚBLICA ====================
    return {
        // ---- Inicialización básica (2D) ----
        init: function(notifyFn, renderFn) {
            _notifyUI = notifyFn || _notifyUI;
            _renderUI = renderFn || _renderUI;
            this._saveState();
        },
        
        // ---- Inicialización 3D ----
        init3D: function(containerElement) { _init3D(containerElement); },
        is3DActive: () => _threeInitialized,
        
        // ---- Factoría visual ----
        registerVisualFactory: function(factory) {
            _visualFactory = factory;
            if (_threeInitialized) _refreshAllVisuals();
        },
        
        // ---- Suscripción ----
        subscribe: function(callback) {
            _subscribers.push(callback);
            callback(_db);
            return () => { _subscribers = _subscribers.filter(cb => cb !== callback); };
        },
        
        // ---- Recursos Three.js ----
        getScene: () => _scene,
        getCamera: () => _camera,
        getRenderer: () => _renderer3D,
        getControls: () => _controls,
        getVisualMesh: (tag) => _visualMap.get(tag),
        
        // ---- CRUD Equipos ----
        addEquipment: function(equipo) {
            if (!equipo.tag) return _notifyUI("Error: Tag requerido.", true);
            if (_exists(equipo.tag, 'equipos')) return _notifyUI(`Error: El equipo ${equipo.tag} ya existe.`, true);
            if (equipo.puertos) equipo.puertos.forEach(p => { if (!p.status) p.status = 'open'; if (!p.flow) p.flow = 'bi'; if (!p.constraints) p.constraints = { spec: equipo.spec || 'STD', diametro: p.diametro || 3 }; });
            _db.equipos.push(equipo);
            if (_visualFactory && _threeInitialized) {
                const mesh = _visualFactory.createEquipmentMesh(equipo);
                if (mesh) { _scene.add(mesh); _visualMap.set(equipo.tag, mesh); }
            }
            this._saveState(); _notifyUI(`Equipo ${equipo.tag} añadido.`, false); _renderUI(); _notify();
            return true;
        },
        
        updateEquipment: function(tag, datos) {
            const eq = _db.equipos.find(e => e.tag === tag);
            if (!eq) return _notifyUI(`Equipo ${tag} no encontrado.`, true);
            Object.assign(eq, datos);
            if (_threeInitialized) {
                const old = _visualMap.get(tag); if (old) _scene.remove(old);
                if (_visualFactory) {
                    const mesh = _visualFactory.createEquipmentMesh(eq);
                    if (mesh) { _scene.add(mesh); _visualMap.set(tag, mesh); }
                }
            }
            syncPhysicalData(); this._saveState(); _renderUI(); _notify();
            return true;
        },
        
        deleteEquipment: function(tag) {
            const idx = _db.equipos.findIndex(e => e.tag === tag);
            if (idx === -1) return false;
            _db.equipos.splice(idx, 1);
            if (_threeInitialized) { const m = _visualMap.get(tag); if (m) { _scene.remove(m); _visualMap.delete(tag); } }
            this._saveState(); _notify(); _renderUI();
            return true;
        },
        
        // ---- CRUD Líneas ----
        addLine: function(linea) {
            if (!linea.tag) return _notifyUI("Error: Tag de línea requerido.", true);
            if (_exists(linea.tag, 'lines')) return _notifyUI(`Error: La línea ${linea.tag} ya existe.`, true);
            if (linea.spec && _db.specs[linea.spec]) { const s = _db.specs[linea.spec]; linea.material = s.mat; linea.rating = s.rating; linea.schedule = s.sch; }
            _db.lines.push(linea);
            if (_visualFactory && _threeInitialized) {
                const mesh = _visualFactory.createLineMesh(linea);
                if (mesh) { _scene.add(mesh); _visualMap.set(linea.tag, mesh); }
            }
            this._saveState(); _notifyUI(`Línea ${linea.tag} creada correctamente.`, false); _renderUI(); _notify();
            return true;
        },
        
        updateLine: function(tag, datos) {
            const line = _db.lines.find(l => l.tag === tag);
            if (!line) return _notifyUI(`Línea ${tag} no encontrada.`, true);
            Object.assign(line, datos);
            if (_threeInitialized) {
                const old = _visualMap.get(tag); if (old) _scene.remove(old);
                if (_visualFactory) {
                    const mesh = _visualFactory.createLineMesh(line);
                    if (mesh) { _scene.add(mesh); _visualMap.set(tag, mesh); }
                }
            }
            this._saveState(); _renderUI(); _notify();
            return true;
        },
        
        deleteLine: function(tag) {
            const idx = _db.lines.findIndex(l => l.tag === tag);
            if (idx === -1) return false;
            _db.lines.splice(idx, 1);
            if (_threeInitialized) { const m = _visualMap.get(tag); if (m) { _scene.remove(m); _visualMap.delete(tag); } }
            this._saveState(); _notify(); _renderUI();
            return true;
        },
        
        // ---- Puertos ----
        updatePuerto: function(ownerTag, puertoId, cambios) {
            const owner = findObjectByTag(ownerTag);
            if (!owner) return _notifyUI(`Objeto ${ownerTag} no encontrado.`, true);
            const puerto = owner.puertos?.find(p => p.id === puertoId);
            if (!puerto) return _notifyUI(`Puerto ${puertoId} no encontrado.`, true);
            if (cambios.status !== undefined) puerto.status = cambios.status;
            if (cambios.connectedTo !== undefined) puerto.connectedTo = cambios.connectedTo;
            if (cambios.flow !== undefined) puerto.flow = cambios.flow;
            if (cambios.constraints !== undefined) puerto.constraints = { ...puerto.constraints, ...cambios.constraints };
            if (cambios.diametro !== undefined) puerto.diametro = cambios.diametro;
            if (cambios.pos) { puerto.relX = cambios.pos.x; puerto.relY = cambios.pos.y; puerto.relZ = cambios.pos.z; }
            if (cambios.dir) { const { dx, dy, dz } = cambios.dir; const len = Math.sqrt(dx*dx+dy*dy+dz*dz); if (len > 0) puerto.orientacion = { dx: dx/len, dy: dy/len, dz: dz/len }; }
            syncPhysicalData(); this._saveState(); _renderUI(); _notify();
            return true;
        },
        
        syncPhysicalData,
        
        // ---- Proyecto ----
        nuevoProyecto: function() {
            _db = { equipos: [], lines: [], specs: _db.specs, metadata: { version: "7.0", lastModified: Date.now() } };
            _selectedElement = null; _history = { past: [], future: [], maxSize: 50 };
            if (_threeInitialized) { _visualMap.forEach(o => _scene.remove(o)); _visualMap.clear(); }
            this._saveState(); _renderUI(); _notifyUI("Nuevo proyecto creado.", false);
        },
        
        clearProject: function() { this.nuevoProyecto(); },
        
        exportProject: function() { return JSON.stringify({ version: "7.0", date: new Date().toISOString(), data: _db }); },
        
        importState: function(state) {
            if (state && (state.equipos || state.data?.equipos)) {
                const src = state.data || state;
                _db.equipos = _deepClone(src.equipos); _db.lines = _deepClone(src.lines);
                _selectedElement = null;
                if (_threeInitialized) _refreshAllVisuals();
                this._saveState(); syncPhysicalData(); _renderUI();
                _notifyUI("Proyecto importado correctamente.", false); _notify();
                return true;
            }
            _notifyUI("Error: Formato de proyecto inválido.", true); return false;
        },
        
        _saveState: function() {
            const state = _deepClone({ equipos: _db.equipos, lines: _db.lines });
            _history.past.push(state); if (_history.past.length > _history.maxSize) _history.past.shift();
            _history.future = [];
        },
        
        undo: function() {
            if (_history.past.length <= 1) return _notifyUI("Nada que deshacer.", true);
            const current = _deepClone({ equipos: _db.equipos, lines: _db.lines }); _history.future.push(current);
            _history.past.pop(); const prev = _history.past[_history.past.length-1];
            _db.equipos = _deepClone(prev.equipos); _db.lines = _deepClone(prev.lines);
            if (_threeInitialized) _refreshAllVisuals();
            _selectedElement = null; syncPhysicalData(); _renderUI(); _notifyUI("Acción deshecha.", false); _notify();
        },
        
        redo: function() {
            if (_history.future.length === 0) return _notifyUI("Nada que rehacer.", true);
            const next = _history.future.pop(); _history.past.push(_deepClone(next));
            _db.equipos = _deepClone(next.equipos); _db.lines = _deepClone(next.lines);
            if (_threeInitialized) _refreshAllVisuals();
            _selectedElement = null; syncPhysicalData(); _renderUI(); _notifyUI("Acción rehecha.", false); _notify();
        },
        
        // ---- Auditoría ----
        auditCollisions,
        
        auditModel: function() {
            let report = "--- REPORTE DE AUDITORÍA DE INGENIERÍA ---\n"; let errors = 0, warnings = 0;
            _db.lines.forEach(line => {
                const diamLinea = line.diameter;
                if (line.origin && line.origin.objTag) { const obj = findObjectByTag(line.origin.objTag); const nz = obj?.puertos?.find(p => p.id === line.origin.portId); if (nz && nz.diametro !== diamLinea) { errors++; report += `⚠️ ERROR [${line.tag}]: Diámetro línea (${diamLinea}") no coincide con puerto ${nz.id} (${nz.diametro}")\n`; } }
                if (line.destination && line.destination.objTag) { const obj = findObjectByTag(line.destination.objTag); const nz = obj?.puertos?.find(p => p.id === line.destination.portId); if (nz && nz.diametro !== diamLinea) { errors++; report += `⚠️ ERROR [${line.tag}]: Diámetro línea (${diamLinea}") no coincide con puerto ${nz.id} (${nz.diametro}")\n`; } }
                if (!(line._cachedPoints || line.points3D) || (line._cachedPoints||line.points3D).length < 2) { errors++; report += `⚠️ ERROR [${line.tag}]: Línea sin geometría definida.\n`; }
            });
            const collisions = auditCollisions();
            collisions.forEach(c => { if (c.type === 'LINE_EQUIPMENT') report += `⚠️ COLISIÓN: Línea ${c.line1} interfiere con equipo ${c.equipment}\n`; else report += `⚠️ COLISIÓN: Línea ${c.line1} interfiere con línea ${c.line2}\n`; warnings++; });
            if (errors === 0 && warnings === 0) report += "✅ Modelo íntegro. Sin discrepancias de diámetro o colisiones."; else report += `Se encontraron ${errors} errores y ${warnings} advertencias.`;
            _notifyUI(report, errors > 0); return report;
        },
        
        recalculateAll: function() { syncPhysicalData(); const collisions = auditCollisions(); if (collisions.length > 0) _notifyUI(`Recálculo completado. ${collisions.length} posibles interferencias.`, true); else _notifyUI("Recálculo completado. Sin interferencias.", false); _renderUI(); },
        
        // ---- Conexiones inteligentes ----
        connectSmart: function(source, target) {
            const objS = findObjectByTag(source.tag), objT = findObjectByTag(target.tag);
            if (!objS || !objT) return _notifyUI("Objeto no encontrado.", true);
            const pS = objS.puertos?.find(p => p.id === source.portId), pT = objT.puertos?.find(p => p.id === target.portId);
            if (!pS || !pT) return _notifyUI("Puerto no encontrado.", true);
            const validation = checkCompatibility(pS, pT);
            if (!validation.isCompatible) _notifyUI(`⚠️ Advertencia: ${validation.alerts.join(", ")}`, false);
            pS.status = "connected"; pS.connectedTo = { tag: target.tag, portId: target.portId };
            pT.status = "connected"; pT.connectedTo = { tag: source.tag, portId: source.portId };
            syncPhysicalData(); this._saveState(); _notifyUI(`Conexión lógica: ${source.tag}:${source.portId} ↔ ${target.tag}:${target.portId}`, false); _notify();
            return true;
        },
        
        injectAccessory: function(lineTag, param, accesorioDef) {
            const result = _splitLineSegment(lineTag, param); if (!result) return null;
            if (accesorioDef && accesorioDef.generarPuertos) {
                const line = _db.lines.find(l => l.tag === lineTag);
                const nuevosPuertos = accesorioDef.generarPuertos(line, param, line.diameter);
                line.puertos = line.puertos.filter(p => !p.id.startsWith('ACC-'));
                nuevosPuertos.forEach((p, idx) => { p.id = `${accesorioDef.tag||'ACC'}_${idx}`; line.puertos.push(p); });
                _notifyUI(`Accesorio ${accesorioDef.tag||'ACC'} inyectado en ${lineTag}`, false);
            }
            this._saveState(); syncPhysicalData(); _renderUI(); return result;
        },
        
        splitLine: function(lineTag, point, config) {
            const line = _db.lines.find(l => l.tag === lineTag);
            if (!line) { _notifyUI("Línea no encontrada.", true); return null; }
            const segmentIndex = _findSegmentAtPoint(line, point);
            if (segmentIndex === -1) { _notifyUI("El punto no está sobre la línea o está demasiado lejos.", true); return null; }
            const pts = line._cachedPoints || line.points3D;
            const a = pts[segmentIndex], b = pts[segmentIndex + 1];
            const dir = { dx: b.x - a.x, dy: b.y - a.y, dz: b.z - a.z };
            const len = Math.hypot(dir.dx, dir.dy, dir.dz) || 1;
            const dirUnit = { dx: dir.dx/len, dy: dir.dy/len, dz: dir.dz/len };
            let perp = _getPerpendicular(dirUnit);
            const accessoryTag = `TEE-${Date.now().toString().slice(-6)}`;
            const nuevoAccesorio = {
                tag: accessoryTag, tipo: config?.type || 'TEE_EQUAL',
                posX: point.x, posY: point.y, posZ: point.z,
                diametro: line.diameter, material: line.material, spec: line.spec,
                puertos: [
                    { id: 'P1', relX: -dirUnit.dx*100, relY: -dirUnit.dy*100, relZ: -dirUnit.dz*100, orientacion: { dx: -dirUnit.dx, dy: -dirUnit.dy, dz: -dirUnit.dz }, status: 'connected', connectedTo: { tag: lineTag, portId: 'S1' }, diametro: line.diameter, flow: 'in', constraints: { spec: line.spec||'STD', diametro: line.diameter } },
                    { id: 'P2', relX: dirUnit.dx*100, relY: dirUnit.dy*100, relZ: dirUnit.dz*100, orientacion: { dx: dirUnit.dx, dy: dirUnit.dy, dz: dirUnit.dz }, status: 'connected', connectedTo: { tag: lineTag, portId: 'S2' }, diametro: line.diameter, flow: 'out', constraints: { spec: line.spec||'STD', diametro: line.diameter } },
                    { id: 'P3', relX: perp.dx*100, relY: perp.dy*100, relZ: perp.dz*100, orientacion: { dx: perp.dx, dy: perp.dy, dz: perp.dz }, status: 'open', diametro: line.diameter, flow: 'bi', constraints: { spec: line.spec||'STD', diametro: line.diameter } }
                ]
            };
            pts.splice(segmentIndex+1, 0, point);
            line._cachedPoints = pts;
            if (!line.puertos) line.puertos = [];
            line.puertos.push({ id: 'S1', relX: 0, relY: 0, relZ: 0, status: 'connected', connectedTo: { tag: accessoryTag, portId: 'P1' }, diametro: line.diameter });
            line.puertos.push({ id: 'S2', relX: 0, relY: 0, relZ: 0, status: 'connected', connectedTo: { tag: accessoryTag, portId: 'P2' }, diametro: line.diameter });
            _db.equipos.push(nuevoAccesorio);
            this._saveState(); syncPhysicalData(); _renderUI(); _notifyUI(`Línea ${lineTag} dividida. Accesorio ${accessoryTag} insertado.`, false);
            return { componente: nuevoAccesorio, linea: line };
        },
        
        // ---- Selección ----
        setSelected: function(element) {
            if (element && element.obj && !findObjectByTag(element.obj.tag)) {
                _selectedElement = null; _renderUI(); _notify(); return;
            }
            _selectedElement = element;
            _renderUI();
            if (_selectedElement && _selectedElement.obj) {
                const info = this.getPropertyInfo(_selectedElement.obj.tag);
                if (typeof updatePropertyPanel === 'function') updatePropertyPanel(info);
            }
            _notify();
        },
        
        getSelected: function() { return _selectedElement; },
        
        getPropertyInfo: function(tag) {
            const obj = findObjectByTag(tag);
            if (!obj) return null;
            const isLine = _db.lines.some(l => l.tag === tag);
            const isEquipment = _db.equipos.some(e => e.tag === tag);
            return {
                tag: obj.tag, tipo: obj.tipo || (isLine ? 'Tubería' : (isEquipment ? 'Equipo' : 'Desconocido')),
                spec: obj.spec || 'N/A', material: obj.material || 'N/A',
                diametro: obj.diameter || obj.diametro || 'N/A',
                dimensiones: obj.posX !== undefined ? { posX: obj.posX, posY: obj.posY, posZ: obj.posZ, diametro: obj.diametro, altura: obj.altura, largo: obj.largo } : null,
                puertos: obj.puertos ? obj.puertos.map(p => ({ id: p.id, status: p.status || 'open', connectedTo: p.connectedTo?.tag || 'Libre', diametro: p.diametro, orientacion: p.orientacion })) : [],
                spool: isLine ? getSpoolReport(tag) : null
            };
        },
        
        updateFromPanel: function(tag, field, newValue) {
            const obj = findObjectByTag(tag);
            if (!obj) { _notifyUI("Objeto no encontrado.", true); return false; }
            if (field === 'tag') {
                if (_exists(newValue, 'equipos') || _exists(newValue, 'lines')) { _notifyUI("Error: El Tag ya existe.", true); return false; }
                _db.lines.forEach(line => {
                    if (line.origin && line.origin.objTag === tag) line.origin.objTag = newValue;
                    if (line.destination && line.destination.objTag === tag) line.destination.objTag = newValue;
                });
                obj.tag = newValue;
            } else { obj[field] = newValue; }
            if (['posX', 'posY', 'posZ', 'diametro', 'altura', 'largo', 'diameter'].includes(field)) syncPhysicalData();
            this._saveState(); _renderUI(); _notifyUI(`Propiedad '${field}' actualizada.`, false); _notify();
            return true;
        },
        
        // ---- Consultas ----
        getDb: function() { return _db; },
        getEquipos: function() { return _db.equipos; },
        getLines: function() { return _db.lines; },
        getSpecs: function() { return Object.keys(_db.specs); },
        
        // ---- Elevación y voz ----
        setElevation: function(level) { _currentElevation = level; },
        getElevation: function() { return _currentElevation; },
        setVoice: function(enabled) { _voiceEnabled = enabled; },
        isVoiceEnabled: function() { return _voiceEnabled; },
        
        // ---- Spool ----
        getSpoolReport
    };
})();
