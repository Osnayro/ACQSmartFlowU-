
// ============================================================
// SMARTFLOW LABELS 3D v2.0 - Etiquetas + Cotas + Tags 3D
// Archivo: js/SmartFlowLabels3D.js
// Integración: CSS2DRenderer + ThreeJsEngine v2.0 + Core v5.5
// ============================================================

const SmartFlowLabels3D = (function() {
    let _core = null;
    let _engine = null;
    let _labelRenderer = null;
    let _camera = null;
    let _scene = null;
    
    // Grupos en la escena
    let _labelGroup = new THREE.Group();
    let _dimensionGroup3D = new THREE.Group();
    
    // Mapas de seguimiento
    let _equipmentLabels = new Map();    // tag → { anchor, label }
    let _lineLabels = new Map();         // tag → { label }
    let _componentLabels = new Map();    // tag → { label }
    let _dimensionLines = new Map();     // key → { line, text }
    
    // Configuración
    const EQUIPMENT_LABEL_OFFSET = 0.8;  // metros sobre el equipo
    const LINE_LABEL_OFFSET = 0.4;
    const DIMENSION_OFFSET = 0.5;
    const MIN_SEGMENT_LENGTH = 0.3;      // metros mínimos para cota
    
    // Colores por tipo
    const COLORS = {
        equipment: '#f59e0b',
        equipmentBg: 'rgba(15, 23, 42, 0.92)',
        equipmentBorder: '#f59e0b',
        line: '#00f2ff',
        lineBg: 'rgba(15, 23, 42, 0.88)',
        lineBorder: '#0ea5e9',
        component: '#a78bfa',
        componentBg: 'rgba(15, 23, 42, 0.85)',
        componentBorder: '#8b5cf6',
        dimension: '#facc15',
        dimensionBg: 'rgba(15, 23, 42, 0.85)',
        dimensionBorder: '#facc15',
        dimensionText: '#ffffff'
    };
    
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
            
            var container = _engine.getRenderer() ? _engine.getRenderer().domElement.parentElement : null;
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
        
        // Suscribirse a cambios del modelo
        if (_core && typeof _core.on === 'function') {
            _core.on('modelChanged', function() {
                setTimeout(function() {
                    refreshAllLabels();
                    refreshAllDimensions();
                }, 400);
            });
        }
        
        window.addEventListener('resize', onResize);
        
        console.log('✔ SmartFlowLabels3D v2.0 inicializado');
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
        
        var posX = (eq.posX || 0) / 1000;
        var posY = (eq.posY || 0) / 1000;
        var posZ = (eq.posZ || 0) / 1000;
        
        // Calcular altura del equipo
        var altura = eq.altura || eq.diametro || 2000;
        if (eq.tipo === 'tanque_h') altura = eq.diametro || 3000;
        if (eq.tipo && eq.tipo.includes('bomba')) altura = eq.diametro || 800;
        if (eq.tipo === 'plataforma') altura = eq.altura || 400;
        
        var offsetY = (altura / 1000) / 2 + EQUIPMENT_LABEL_OFFSET;
        
        // Anclaje invisible
        var anchorGeo = new THREE.SphereGeometry(0.03, 4, 4);
        var anchorMat = new THREE.MeshBasicMaterial({ visible: false });
        var anchor = new THREE.Mesh(anchorGeo, anchorMat);
        anchor.position.set(posX, posY + offsetY, posZ);
        anchor.userData = { tag: eq.tag, isLabelAnchor: true };
        _labelGroup.add(anchor);
        
        // Etiqueta CSS2D
        var tipoStr = eq.tipo || 'EQUIPO';
        var matStr = (eq.material || 'N/D').substring(0, 15);
        var diamStr = eq.diametro ? ' ⌀' + (eq.diametro/1000).toFixed(1) + 'm' : '';
        
        var div = document.createElement('div');
        div.style.cssText = [
            'background: ' + COLORS.equipmentBg + ';',
            'border: 1px solid ' + COLORS.equipmentBorder + ';',
            'border-radius: 6px;',
            'padding: 6px 10px;',
            'font-family: "Courier New", monospace;',
            'font-size: 10px;',
            'color: ' + COLORS.equipment + ';',
            'text-align: center;',
            'white-space: nowrap;',
            'backdrop-filter: blur(4px);',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.5);',
            'pointer-events: auto;',
            'cursor: pointer;',
            'user-select: none;'
        ].join(' ');
        
        div.innerHTML = '<div style="font-weight:bold;font-size:11px;">🏭 ' + eq.tag + '</div>' +
            '<div style="font-size:8px;color:#94a3b8;">' + tipoStr + diamStr + ' | ' + matStr + '</div>';
        
        var label = new THREE.CSS2DObject(div);
        label.position.copy(anchor.position);
        label.userData = { tag: eq.tag, isEquipmentLabel: true };
        _labelGroup.add(label);
        
        // Clic en etiqueta → seleccionar equipo
        div.addEventListener('click', function(e) {
            e.stopPropagation();
            if (_core) _core.setSelected({ obj: eq, type: 'equipment' });
        });
        
        _equipmentLabels.set(eq.tag, { anchor: anchor, label: label });
        return { anchor: anchor, label: label };
    }
    
    // ============ ETIQUETAS DE LÍNEAS ============
    function createLineLabel(line) {
        if (!line || !line.tag) return null;
        
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return null;
        
        // Punto medio del recorrido
        var totalLen = 0, lengths = [];
        for (var i = 0; i < pts.length - 1; i++) {
            var d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            lengths.push(d); totalLen += d;
        }
        if (totalLen === 0) return null;
        
        var halfLen = totalLen / 2, accum = 0, segIdx = 0, t = 0;
        for (var j = 0; j < lengths.length; j++) {
            if (accum + lengths[j] >= halfLen || j === lengths.length - 1) {
                segIdx = j;
                t = lengths[j] > 0 ? (halfLen - accum) / lengths[j] : 0;
                t = Math.min(1, Math.max(0, t));
                break;
            }
            accum += lengths[j];
        }
        
        var p1 = pts[segIdx], p2 = pts[segIdx + 1];
        var midX = (p1.x + (p2.x - p1.x) * t) / 1000;
        var midY = (p1.y + (p2.y - p1.y) * t) / 1000 + LINE_LABEL_OFFSET;
        var midZ = (p1.z + (p2.z - p1.z) * t) / 1000;
        
        var diam = line.diameter || '?';
        var service = line.service || '';
        var matShort = (line.material || 'N/D').substring(0, 4);
        
        var div = document.createElement('div');
        div.style.cssText = [
            'background: ' + COLORS.lineBg + ';',
            'border: 1px solid ' + COLORS.lineBorder + ';',
            'border-radius: 4px;',
            'padding: 3px 7px;',
            'font-family: "Courier New", monospace;',
            'font-size: 9px;',
            'color: ' + COLORS.line + ';',
            'text-align: center;',
            'white-space: nowrap;',
            'backdrop-filter: blur(4px);',
            'box-shadow: 0 1px 6px rgba(0,0,0,0.4);',
            'pointer-events: auto;',
            'cursor: pointer;',
            'user-select: none;'
        ].join(' ');
        
        div.textContent = diam + '" ' + matShort + (service ? ' ' + service : '');
        
        var label = new THREE.CSS2DObject(div);
        label.position.set(midX, midY, midZ);
        label.userData = { tag: line.tag, isLineLabel: true };
        _labelGroup.add(label);
        
        div.addEventListener('click', function(e) {
            e.stopPropagation();
            if (_core) _core.setSelected({ obj: line, type: 'line' });
        });
        
        _lineLabels.set(line.tag, { label: label });
        return { label: label };
    }
    
    // ============ ETIQUETAS DE COMPONENTES ============
    function createComponentLabels(line) {
        if (!line.components || !line.components.length) return;
        
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return;
        
        var lengths = [], totalLen = 0;
        for (var i = 0; i < pts.length - 1; i++) {
            var d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            lengths.push(d); totalLen += d;
        }
        if (totalLen === 0) return;
        
        line.components.forEach(function(comp) {
            var param = comp.param || 0.5;
            var targetLen = totalLen * Math.min(1, Math.max(0, param));
            var accum = 0, segIdx = 0, t = 0;
            for (var j = 0; j < lengths.length; j++) {
                if (accum + lengths[j] >= targetLen || j === lengths.length - 1) {
                    segIdx = j; t = (targetLen - accum) / (lengths[j] || 1); break;
                }
                accum += lengths[j];
            }
            var pA = pts[segIdx], pB = pts[segIdx + 1];
            var cx = (pA.x + (pB.x - pA.x) * t) / 1000;
            var cy = (pA.y + (pB.y - pA.y) * t) / 1000 + LINE_LABEL_OFFSET;
            var cz = (pA.z + (pB.z - pA.z) * t) / 1000;
            
            var compType = comp.type || 'COMP';
            var abbr = getAbbreviation(compType);
            
            var div = document.createElement('div');
            div.style.cssText = [
                'background: ' + COLORS.componentBg + ';',
                'border: 1px solid ' + COLORS.componentBorder + ';',
                'border-radius: 3px;',
                'padding: 2px 5px;',
                'font-family: "Courier New", monospace;',
                'font-size: 8px;',
                'color: ' + COLORS.component + ';',
                'text-align: center;',
                'white-space: nowrap;',
                'backdrop-filter: blur(4px);',
                'pointer-events: auto;',
                'cursor: pointer;',
                'user-select: none;'
            ].join(' ');
            
            div.textContent = abbr;
            
            var label = new THREE.CSS2DObject(div);
            label.position.set(cx, cy, cz);
            label.userData = { tag: comp.tag, type: comp.type, isComponentLabel: true };
            _labelGroup.add(label);
            
            _componentLabels.set(comp.tag || (line.tag + '_' + compType), { label: label });
        });
    }
    
    function getAbbreviation(type) {
        var t = (type || '').toUpperCase();
        if (t.includes('GATE_VALVE') || t.includes('COMPUERTA')) return 'GV';
        if (t.includes('GLOBE_VALVE')) return 'GL';
        if (t.includes('BALL_VALVE') || t.includes('BOLA')) return 'BA';
        if (t.includes('BUTTERFLY_VALVE') || t.includes('MARIPOSA')) return 'VB';
        if (t.includes('CHECK_VALVE') || t.includes('RETENCION')) return 'CK';
        if (t.includes('DIAPHRAGM_VALVE')) return 'DV';
        if (t.includes('CONTROL_VALVE')) return 'CV';
        if (t.includes('RELIEF') || t.includes('SAFETY')) return 'RV';
        if (t.includes('ELBOW_90')) return 'E9';
        if (t.includes('ELBOW_45')) return 'E4';
        if (t.includes('TEE_EQUAL')) return 'TE';
        if (t.includes('TEE_REDUCING')) return 'TR';
        if (t.includes('REDUCER') || t.includes('REDUCTOR')) return 'RE';
        if (t.includes('FLANGE') || t.includes('BRIDA')) return 'FL';
        if (t.includes('BULKHEAD') || t.includes('PASAMUROS')) return 'BH';
        if (t.includes('CAP') || t.includes('TAPON')) return 'CA';
        if (t.includes('UNION')) return 'UN';
        if (t.includes('NIPPLE') || t.includes('NIPLE')) return 'NI';
        if (t.includes('STRAINER') || t.includes('FILTRO')) return 'ST';
        if (t.includes('STEAM_TRAP')) return 'TR';
        if (t.includes('EXPANSION')) return 'EJ';
        if (t.includes('GAUGE') || t.includes('MANOMETRO')) return 'PG';
        if (t.includes('FLOW_METER') || t.includes('CAUDAL')) return 'FM';
        if (t.includes('TRANSMITTER')) return 'XT';
        if (t.includes('LEVEL_SWITCH')) return 'LS';
        if (t.includes('PIPE_SHOE') || t.includes('ZAPATA')) return 'SH';
        if (t.includes('GUIDE') || t.includes('GUIA')) return 'GD';
        if (t.includes('ANCHOR') || t.includes('ANCLAJE')) return 'AN';
        if (t.includes('HANGER') || t.includes('COLGADOR')) return 'HG';
        return '??';
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
        
        // Línea de cota
        var lineGeo = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
        var lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.7, depthTest: true });
        var line = new THREE.Line(lineGeo, lineMat);
        line.userData = { isDimensionLine: true, key: key };
        _dimensionGroup3D.add(line);
        
        // Texto de cota
        var dimText = labelText || formatDistance(distance);
        var textDiv = document.createElement('div');
        textDiv.innerHTML = '<span style="' + [
            'background: ' + COLORS.dimensionBg + ';',
            'color: ' + COLORS.dimensionText + ';',
            'padding: 2px 6px;',
            'border-radius: 3px;',
            'font-family: "Courier New", monospace;',
            'font-size: 8px;',
            'white-space: nowrap;',
            'border: 1px solid ' + COLORS.dimensionBorder + ';'
        ].join(' ') + '">' + dimText + '</span>';
        
        var textLabel = new THREE.CSS2DObject(textDiv);
        var midPoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
        textLabel.position.copy(midPoint);
        textLabel.position.y -= 0.1;
        textLabel.userData = { isDimensionText: true, key: key };
        _dimensionGroup3D.add(textLabel);
        
        _dimensionLines.set(key, { line: line, textLabel: textLabel });
        return { line: line, textLabel: textLabel };
    }
    
    function formatDistance(meters) {
        if (meters >= 1) return meters.toFixed(2) + ' m';
        return (meters * 1000).toFixed(0) + ' mm';
    }
    
    function createDimensionsForLine(line) {
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return;
        
        for (var i = 0; i < pts.length - 1; i++) {
            if (pts[i].isControlPoint || pts[i+1].isControlPoint) continue;
            var dist = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            if (dist >= 100) {
                createDimensionLine3D(pts[i], pts[i+1]);
            }
        }
    }
    
    function createDimensionsForEquipment(eq) {
        if (!eq.puertos || eq.puertos.length < 2) return;
        
        for (var i = 0; i < eq.puertos.length; i++) {
            for (var j = i + 1; j < eq.puertos.length; j++) {
                var pA = eq.puertos[i], pB = eq.puertos[j];
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
    
    // ============ LIMPIEZA ============
    function clearAllLabels() {
        _equipmentLabels.forEach(function(item) {
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
            if (item.anchor && item.anchor.parent) {
                item.anchor.parent.remove(item.anchor);
                if (item.anchor.geometry) item.anchor.geometry.dispose();
                if (item.anchor.material) item.anchor.material.dispose();
            }
        });
        _equipmentLabels.clear();
        
        _lineLabels.forEach(function(item) {
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
        });
        _lineLabels.clear();
        
        _componentLabels.forEach(function(item) {
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
        });
        _componentLabels.clear();
    }
    
    function clearAllDimensions() {
        _dimensionLines.forEach(function(item) {
            if (item.line) {
                if (item.line.parent) item.line.parent.remove(item.line);
                if (item.line.material) item.line.material.dispose();
                if (item.line.geometry) item.line.geometry.dispose();
            }
            if (item.textLabel) {
                if (item.textLabel.parent) item.textLabel.parent.remove(item.textLabel);
                if (item.textLabel.element) item.textLabel.element.remove();
            }
        });
        _dimensionLines.clear();
        
        while (_dimensionGroup3D.children.length > 0) {
            var child = _dimensionGroup3D.children[0];
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
            if (child.element) child.element.remove();
            _dimensionGroup3D.remove(child);
        }
    }
    
    // ============ REFRESCO ============
    function refreshAllLabels() {
        if (!_core) return;
        clearAllLabels();
        
        var db = _core.getDb();
        if (!db) return;
        
        // Etiquetas de equipos
        var equipos = db.equipos || [];
        for (var i = 0; i < equipos.length; i++) {
            if (equipos[i].tipo !== 'plataforma' && !(equipos[i].tag || '').startsWith('TEE-')) {
                createEquipmentLabel(equipos[i]);
            }
        }
        
        // Etiquetas de líneas y componentes
        var lines = db.lines || [];
        for (var j = 0; j < lines.length; j++) {
            createLineLabel(lines[j]);
            createComponentLabels(lines[j]);
        }
        
        console.log('🏷️ Labels: ' + _equipmentLabels.size + ' equipos, ' + _lineLabels.size + ' líneas, ' + _componentLabels.size + ' componentes');
    }
    
    function refreshAllDimensions() {
        if (!_core) return;
        clearAllDimensions();
        
        var db = _core.getDb();
        if (!db) return;
        
        var lines = db.lines || [];
        for (var i = 0; i < lines.length; i++) {
            createDimensionsForLine(lines[i]);
        }
        
        var equipos = db.equipos || [];
        for (var j = 0; j < equipos.length; j++) {
            createDimensionsForEquipment(equipos[j]);
        }
        
        console.log('📏 Cotas: ' + _dimensionLines.size + ' dimensiones');
    }
    
    // ============ RENDERIZADO ============
    function render() {
        if (_labelRenderer && _scene && _camera) {
            _labelRenderer.render(_scene, _camera);
        }
    }
    
    // ============ API PÚBLICA ============
    function dispose() {
        clearAllLabels();
        clearAllDimensions();
        
        if (_labelRenderer && _labelRenderer.domElement) {
            _labelRenderer.domElement.remove();
        }
        
        if (_labelGroup.parent) _labelGroup.parent.remove(_labelGroup);
        if (_dimensionGroup3D.parent) _dimensionGroup3D.parent.remove(_dimensionGroup3D);
        
        window.removeEventListener('resize', onResize);
        
        _core = null;
        _engine = null;
        _labelRenderer = null;
        _camera = null;
        _scene = null;
    }
    
    return {
        init: init,
        refreshAllLabels: refreshAllLabels,
        refreshAllDimensions: refreshAllDimensions,
        clearAllLabels: clearAllLabels,
        clearAllDimensions: clearAllDimensions,
        render: render,
        getLabelRenderer: function() { return _labelRenderer; },
        dispose: dispose
    };
})();
```

---

Integración con el Bucle de Renderizado

En render.js, la función init() ya incluye la inicialización de labels. Pero falta que el bucle de animación llame a SmartFlowLabels3D.render() en cada frame.

Agrega esto en ThreeJsEngine.js, dentro de la función animate():

```javascript
    function animate() {
        _animationId = requestAnimationFrame(animate);
        if (_controls && _controls.update) _controls.update();
        if (_renderer && _scene && _camera) {
            _renderer.render(_scene, _camera);
        }
        // ═══ RENDERIZAR LABELS ═══
        if (typeof SmartFlowLabels3D !== 'undefined' && SmartFlowLabels3D.render) {
            SmartFlowLabels3D.render();
        }
    }
