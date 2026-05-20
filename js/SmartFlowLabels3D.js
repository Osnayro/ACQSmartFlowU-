
// ============================================================
// ARCHIVO: js/SmartFlowLabels3D.js
// Etiquetas CSS2D + Cotas 3D para SmartFlowRender
// Dependencias: Three.js, ThreeJsEngine, SmartFlowCore
// ============================================================
const SmartFlowLabels3D = (function() {
    let _core = null;
    let _engine = null;
    let _labelRenderer = null;
    let _camera = null;
    let _scene = null;
    
    // Grupos
    let _labelGroup = new THREE.Group();
    let _dimensionGroup3D = new THREE.Group();
    
    // Mapas para seguimiento
    let _equipmentLabels = new Map();
    let _lineLabels = new Map();
    let _dimensionLines = new Map();
    
    // Configuración
    const LABEL_OFFSET = 0.6;
    const DIMENSION_OFFSET = 0.4;
    const MIN_SEGMENT_LENGTH = 0.1; // metros (100mm)
    
    // ============ INICIALIZACIÓN ============
    function init(coreInstance, engineInstance) {
        _core = coreInstance;
        _engine = engineInstance;
        _camera = engineInstance ? engineInstance.getCamera() : null;
        _scene = engineInstance ? engineInstance.getScene() : null;
        
        if (!_scene || !_camera) {
            console.warn('SmartFlowLabels3D: Engine no disponible');
            return false;
        }
        
        // Crear CSS2DRenderer
        try {
            _labelRenderer = new THREE.CSS2DRenderer();
            _labelRenderer.setSize(window.innerWidth, window.innerHeight);
            _labelRenderer.domElement.style.position = 'absolute';
            _labelRenderer.domElement.style.top = '0px';
            _labelRenderer.domElement.style.left = '0px';
            _labelRenderer.domElement.style.pointerEvents = 'none';
            _labelRenderer.domElement.style.zIndex = '10';
            
            const container = _engine.getRenderer()?.domElement?.parentElement;
            if (container) {
                container.appendChild(_labelRenderer.domElement);
            }
        } catch (e) {
            console.warn('SmartFlowLabels3D: CSS2DRenderer no disponible', e);
            _labelRenderer = null;
        }
        
        // Agregar grupos a la escena
        _labelGroup.userData = { isLabelGroup: true };
        _dimensionGroup3D.userData = { isDimensionGroup3D: true };
        _scene.add(_labelGroup);
        _scene.add(_dimensionGroup3D);
        
        // Suscribirse a cambios
        if (_core && typeof _core.on === 'function') {
            _core.on('modelChanged', function() {
                setTimeout(function() {
                    refreshAllLabels();
                    refreshAllDimensions();
                }, 300);
            });
        }
        
        window.addEventListener('resize', onResize);
        
        console.log('✔ SmartFlowLabels3D inicializado');
        return true;
    }
    
    function onResize() {
        if (_labelRenderer) {
            _labelRenderer.setSize(window.innerWidth, window.innerHeight);
        }
    }
    
    // ============ ETIQUETAS DE EQUIPOS ============
    function createEquipmentLabel(eq) {
        if (!eq || !eq.tag) return null;
        
        const posX = (eq.posX || 0) / 1000;
        const posY = (eq.posY || 0) / 1000;
        const posZ = (eq.posZ || 0) / 1000;
        
        // Altura para posicionar arriba
        let altura = 2000;
        if (eq.tipo === 'tanque_v' || eq.tipo === 'torre' || eq.tipo === 'reactor') {
            altura = eq.altura || 6000;
        } else if (eq.tipo === 'bomba') {
            altura = eq.altura || 800;
        } else if (eq.tipo === 'tanque_h') {
            altura = eq.diametro || 3000;
        } else if (eq.tipo === 'plataforma') {
            altura = eq.altura || 400;
        } else {
            altura = eq.altura || eq.diametro || 2000;
        }
        
        const offsetY = (altura / 1000) / 2 + LABEL_OFFSET;
        
        // ── Punto de anclaje ──
        const anchorGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const anchorMat = new THREE.MeshBasicMaterial({ visible: false });
        const anchor = new THREE.Mesh(anchorGeo, anchorMat);
        anchor.position.set(posX, posY + offsetY, posZ);
        anchor.userData = { tag: eq.tag, isLabelAnchor: true };
        _labelGroup.add(anchor);
        
        // ── Etiqueta CSS2D ──
        const tipoStr = eq.tipo || 'EQUIPO';
        const materialStr = (eq.material || 'N/D').substring(0, 12);
        
        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = `
            background: rgba(15, 23, 42, 0.92);
            border: 1px solid #f59e0b;
            border-radius: 6px;
            padding: 5px 9px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            color: #f59e0b;
            text-align: center;
            white-space: nowrap;
            backdrop-filter: blur(4px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            pointer-events: auto;
            cursor: pointer;
        `;
        labelDiv.innerHTML = '<div style="font-weight:bold;font-size:11px;">🏭 ' + eq.tag + '</div>' +
            '<div style="font-size:8px;color:#94a3b8;">' + tipoStr + ' | ' + materialStr + '</div>';
        
        var label = new THREE.CSS2DObject(labelDiv);
        label.position.copy(anchor.position);
        label.userData = { tag: eq.tag, isLabel: true };
        _labelGroup.add(label);
        
        // Clic en etiqueta → seleccionar
        labelDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            if (_core) {
                _core.setSelected({ obj: eq, type: 'equipment' });
            }
        });
        
        _equipmentLabels.set(eq.tag, { label: label, anchor: anchor });
        return { label: label, anchor: anchor };
    }
    
    // ============ ETIQUETAS DE LÍNEAS ============
    function createLineLabel(line) {
        if (!line || !line.tag) return null;
        
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return null;
        
        // Punto medio
        var totalLen = 0;
        var lengths = [];
        for (var i = 0; i < pts.length - 1; i++) {
            var d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            lengths.push(d);
            totalLen += d;
        }
        if (totalLen === 0) return null;
        
        var halfLen = totalLen / 2;
        var accum = 0;
        var segIdx = 0;
        var t = 0;
        for (var j = 0; j < lengths.length; j++) {
            if (accum + lengths[j] >= halfLen || j === lengths.length - 1) {
                segIdx = j;
                t = lengths[j] > 0 ? (halfLen - accum) / lengths[j] : 0;
                t = Math.min(1, Math.max(0, t));
                break;
            }
            accum += lengths[j];
        }
        
        var p1 = pts[segIdx];
        var p2 = pts[segIdx + 1];
        
        var midX = (p1.x + (p2.x - p1.x) * t) / 1000;
        var midY = (p1.y + (p2.y - p1.y) * t) / 1000 + 0.25;
        var midZ = (p1.z + (p2.z - p1.z) * t) / 1000;
        
        var diam = line.diameter || '?';
        var service = line.service || '';
        var materialShort = (line.material || 'N/D').substring(0, 3);
        
        var labelDiv = document.createElement('div');
        labelDiv.style.cssText = `
            background: rgba(15, 23, 42, 0.88);
            border: 1px solid #0ea5e9;
            border-radius: 4px;
            padding: 3px 7px;
            font-family: 'Courier New', monospace;
            font-size: 9px;
            color: #00f2ff;
            text-align: center;
            white-space: nowrap;
            backdrop-filter: blur(4px);
            box-shadow: 0 1px 6px rgba(0,0,0,0.4);
            pointer-events: auto;
            cursor: pointer;
        `;
        labelDiv.textContent = diam + '" ' + materialShort + (service ? ' ' + service : '');
        
        var label = new THREE.CSS2DObject(labelDiv);
        label.position.set(midX, midY, midZ);
        label.userData = { tag: line.tag, isLineLabel: true };
        _labelGroup.add(label);
        
        labelDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            if (_core) {
                _core.setSelected({ obj: line, type: 'line' });
            }
        });
        
        _lineLabels.set(line.tag, { label: label });
        return { label: label };
    }
    
    // ============ COTAS DE DISTANCIA ============
    function createDimensionLine3D(p1, p2, labelText) {
        var pos1 = new THREE.Vector3(p1.x / 1000, p1.y / 1000 + DIMENSION_OFFSET, p1.z / 1000);
        var pos2 = new THREE.Vector3(p2.x / 1000, p2.y / 1000 + DIMENSION_OFFSET, p2.z / 1000);
        
        var distance = pos1.distanceTo(pos2);
        if (distance < MIN_SEGMENT_LENGTH) return null;
        
        var key = Math.round(p1.x) + ',' + Math.round(p1.y) + ',' + Math.round(p1.z) + '-' +
                  Math.round(p2.x) + ',' + Math.round(p2.y) + ',' + Math.round(p2.z);
        if (_dimensionLines.has(key)) return null;
        
        // Línea principal
        var lineGeo = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
        var lineMat = new THREE.LineBasicMaterial({ 
            color: 0xfacc15, 
            linewidth: 1,
            transparent: true,
            opacity: 0.75,
            depthTest: true
        });
        var line = new THREE.Line(lineGeo, lineMat);
        line.userData = { isDimensionLine: true, key: key };
        
        // Ticks
        var tickSize = 0.12;
        var down = new THREE.Vector3(0, -1, 0);
        
        var tickGeo1 = new THREE.BufferGeometry().setFromPoints([
            pos1, pos1.clone().add(down.clone().multiplyScalar(tickSize))
        ]);
        var tickGeo2 = new THREE.BufferGeometry().setFromPoints([
            pos2, pos2.clone().add(down.clone().multiplyScalar(tickSize))
        ]);
        
        var tickMat = new THREE.LineBasicMaterial({ 
            color: 0xfacc15,
            linewidth: 1,
            transparent: true,
            opacity: 0.85,
            depthTest: true
        });
        
        var tick1 = new THREE.Line(tickGeo1, tickMat);
        var tick2 = new THREE.Line(tickGeo2, tickMat);
        tick1.userData = { isDimensionTick: true, key: key };
        tick2.userData = { isDimensionTick: true, key: key };
        
        // Texto
        var dimText = labelText || formatDistance(distance);
        var textDiv = document.createElement('div');
        textDiv.innerHTML = '<span style="background:rgba(15,23,42,0.85);color:#ffffff;padding:1px 5px;border-radius:3px;font-family:Courier New,monospace;font-size:8px;white-space:nowrap;border:1px solid #facc15;">' + dimText + '</span>';
        
        var textLabel = new THREE.CSS2DObject(textDiv);
        var midPoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
        textLabel.position.copy(midPoint);
        textLabel.position.y -= 0.12;
        textLabel.userData = { isDimensionText: true, key: key };
        
        // Agregar
        _dimensionGroup3D.add(line);
        _dimensionGroup3D.add(tick1);
        _dimensionGroup3D.add(tick2);
        _dimensionGroup3D.add(textLabel);
        
        _dimensionLines.set(key, { line: line, tick1: tick1, tick2: tick2, textLabel: textLabel });
        return { line: line, tick1: tick1, tick2: tick2, textLabel: textLabel };
    }
    
    function formatDistance(meters) {
        if (meters >= 1) {
            return meters.toFixed(2) + ' m';
        } else {
            return (meters * 1000).toFixed(0) + ' mm';
        }
    }
    
    function createDimensionsForLine(line) {
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return;
        
        for (var i = 0; i < pts.length - 1; i++) {
            var p1 = pts[i];
            var p2 = pts[i + 1];
            if (p1.isControlPoint || p2.isControlPoint) continue;
            
            var dist = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
            if (dist >= 100) {
                createDimensionLine3D(p1, p2);
            }
        }
    }
    
    function createDimensionsForEquipment(eq) {
        if (!eq.puertos || eq.puertos.length < 2) return;
        
        for (var i = 0; i < eq.puertos.length; i++) {
            for (var j = i + 1; j < eq.puertos.length; j++) {
                var pA = eq.puertos[i];
                var pB = eq.puertos[j];
                
                var posA = {
                    x: (eq.posX || 0) + (pA.relX || 0),
                    y: (eq.posY || 0) + (pA.relY || 0),
                    z: (eq.posZ || 0) + (pA.relZ || 0)
                };
                var posB = {
                    x: (eq.posX || 0) + (pB.relX || 0),
                    y: (eq.posY || 0) + (pB.relY || 0),
                    z: (eq.posZ || 0) + (pB.relZ || 0)
                };
                
                createDimensionLine3D(posA, posB, pA.id + ' ↔ ' + pB.id);
            }
        }
    }
    
    // ============ REFRESCO ============
    function clearAllLabels() {
        _equipmentLabels.forEach(function(item) {
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
            if (item.anchor && item.anchor.parent) item.anchor.parent.remove(item.anchor);
        });
        _equipmentLabels.clear();
        
        _lineLabels.forEach(function(item) {
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
        });
        _lineLabels.clear();
    }
    
    function clearAllDimensions() {
        _dimensionLines.forEach(function(item) {
            if (item.line) {
                if (item.line.parent) item.line.parent.remove(item.line);
                if (item.line.material) item.line.material.dispose();
                if (item.line.geometry) item.line.geometry.dispose();
            }
            if (item.tick1) {
                if (item.tick1.parent) item.tick1.parent.remove(item.tick1);
                if (item.tick1.material) item.tick1.material.dispose();
                if (item.tick1.geometry) item.tick1.geometry.dispose();
            }
            if (item.tick2) {
                if (item.tick2.parent) item.tick2.parent.remove(item.tick2);
                if (item.tick2.material) item.tick2.material.dispose();
                if (item.tick2.geometry) item.tick2.geometry.dispose();
            }
            if (item.textLabel) {
                if (item.textLabel.parent) item.textLabel.parent.remove(item.textLabel);
                if (item.textLabel.element) item.textLabel.element.remove();
            }
        });
        _dimensionLines.clear();
    }
    
    function refreshAllLabels() {
        if (!_core) return;
        clearAllLabels();
        
        var db = _core.getDb();
        if (!db) return;
        
        var equipos = db.equipos || [];
        var lines = db.lines || [];
        
        for (var i = 0; i < equipos.length; i++) {
            if (equipos[i].tipo !== 'plataforma') {
                createEquipmentLabel(equipos[i]);
            }
        }
        
        for (var j = 0; j < lines.length; j++) {
            createLineLabel(lines[j]);
        }
    }
    
    function refreshAllDimensions() {
        if (!_core) return;
        clearAllDimensions();
        
        var db = _core.getDb();
        if (!db) return;
        
        var lines = db.lines || [];
        var equipos = db.equipos || [];
        
        for (var i = 0; i < lines.length; i++) {
            createDimensionsForLine(lines[i]);
        }
        
        for (var j = 0; j < equipos.length; j++) {
            createDimensionsForEquipment(equipos[j]);
        }
    }
    
    function actualizarVisibilidad() {
        if (_labelRenderer && _scene && _camera) {
            _labelRenderer.render(_scene, _camera);
        }
    }
    
    function dispose() {
        clearAllLabels();
        clearAllDimensions();
        
        if (_labelRenderer && _labelRenderer.domElement) {
            _labelRenderer.domElement.remove();
        }
        
        if (_labelGroup.parent) _labelGroup.parent.remove(_labelGroup);
        if (_dimensionGroup3D.parent) _dimensionGroup3D.parent.remove(_dimensionGroup3D);
        
        window.removeEventListener('resize', onResize);
    }
    
    // ============ API PÚBLICA ============
    return {
        init: init,
        refreshAllLabels: refreshAllLabels,
        refreshAllDimensions: refreshAllDimensions,
        clearAllLabels: clearAllLabels,
        clearAllDimensions: clearAllDimensions,
        actualizarVisibilidad: actualizarVisibilidad,
        getLabelRenderer: function() { return _labelRenderer; },
        dispose: dispose
    };
})();
