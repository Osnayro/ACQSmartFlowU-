
// ============================================================
// SMARTFLOW LABELS 3D v4.0 - Etiquetas y Cotas 3D
// Archivo: js/labels3d.js
// Novedades v4.0: Cota total, ángulos, elevaciones, FROM/TO,
//                 integración con DimensionGenerator,
//                 corrección líneas verticales, keys únicas,
//                 exportación CSV, anotaciones de ángulo 3D
// ============================================================

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const SmartFlowLabels3D = (function() {
    let _core = null;
    let _engine = null;
    let _labelRenderer = null;
    let _camera = null;
    let _scene = null;
    
    const _labelGroup = new THREE.Group();
    const _dimensionGroup3D = new THREE.Group();
    const _annotationGroup = new THREE.Group();
    
    const _equipmentLabels = new Map();
    const _lineLabels = new Map();
    const _componentLabels = new Map();
    const _dimensionLines = new Map();
    const _angleAnnotations = new Map();
    const _elevationLabels = new Map();
    
    let _sharedDimLineMat = null;
    let _sharedDimExtMat = null;
    let _sharedDimTickMat = null;
    let _sharedAnchorMat = null;
    let _sharedAnchorGeo = null;
    let _sharedAngleArcMat = null;
    
    let _raycaster = null;
    let _dimensionCounter = 0;
    
    const EQUIPMENT_LABEL_OFFSET = 0.5;
    const LINE_LABEL_OFFSET = 0.15;
    const DIMENSION_OFFSET = 0.3;
    const ANGLE_OFFSET = 0.25;
    const ELEVATION_OFFSET = 0.4;
    const MIN_SEGMENT_LENGTH = 0.1;
    const MIN_ANGLE_DISPLAY = 3;
    
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
        dimensionText: '#ffffff',
        angle: '#4ade80',
        angleBg: 'rgba(15, 23, 42, 0.85)',
        angleBorder: '#4ade80',
        elevation: '#38bdf8',
        elevationBg: 'rgba(15, 23, 42, 0.85)',
        elevationBorder: '#38bdf8',
        endpoint: '#fb923c',
        endpointBg: 'rgba(15, 23, 42, 0.90)',
        endpointBorder: '#fb923c',
        total: '#ef4444',
        totalBg: 'rgba(15, 23, 42, 0.92)',
        totalBorder: '#ef4444'
    };
    
    function toMeters(mmValue) {
        return (mmValue || 0) / 1000;
    }
    
    function diameterToRadiusMeters(diameterPulgadas) {
        return ((diameterPulgadas || 4) * 25.4) / 2000;
    }
    
    function formatLengthMM(mm) {
        if (mm >= 1000) return (mm / 1000).toFixed(2) + ' m';
        return Math.round(mm) + ' mm';
    }
    
    function formatElevation(mmValue) {
        var meters = mmValue / 1000;
        return 'EL ' + (meters >= 0 ? '+' : '') + meters.toFixed(3) + ' m';
    }
    
    // ═══════════════════════════════════════════
    // VERIFICACIÓN DE OCLUSIÓN DE ETIQUETAS
    // ═══════════════════════════════════════════
    function updateLabelVisibility() {
        if (!_camera || !_engine || !_scene) return;
        
        if (!_raycaster) _raycaster = new THREE.Raycaster();
        var camPos = _camera.position.clone();
        
        // Verificar etiquetas de equipos
        _equipmentLabels.forEach(function(item, tag) {
            if (!item.anchor) return;
            var worldPos = new THREE.Vector3();
            item.anchor.getWorldPosition(worldPos);
            
            var dir = worldPos.clone().sub(camPos).normalize();
            _raycaster.set(camPos, dir);
            
            var allObjects = [];
            _scene.traverse(function(child) {
                if (child.isMesh && child.visible && child.geometry) {
                    allObjects.push(child);
                }
            });
            
            var intersects = _raycaster.intersectObjects(allObjects, false);
            
            var isOccluded = false;
            if (intersects.length > 0) {
                var firstHit = intersects[0].object;
                var distToAnchor = camPos.distanceTo(worldPos);
                var distToFirstHit = intersects[0].distance;
                
                var isOwnerMesh = false;
                var current = firstHit;
                while (current) {
                    if (current.userData && current.userData.tag === tag) {
                        isOwnerMesh = true;
                        break;
                    }
                    current = current.parent;
                }
                
                if (!isOwnerMesh && distToFirstHit < distToAnchor - 0.05) {
                    isOccluded = true;
                }
            }
            
            if (item.label && item.label.element) {
                item.label.element.style.display = isOccluded ? 'none' : '';
            }
        });
        
        // Verificar etiquetas de líneas
        _lineLabels.forEach(function(item, tag) {
            if (!item.label) return;
            var worldPos = new THREE.Vector3();
            item.label.getWorldPosition(worldPos);
            
            var dir = worldPos.clone().sub(camPos).normalize();
            _raycaster.set(camPos, dir);
            
            var allObjects = [];
            _scene.traverse(function(child) {
                if (child.isMesh && child.visible && child.geometry) {
                    allObjects.push(child);
                }
            });
            
            var intersects = _raycaster.intersectObjects(allObjects, false);
            
            var isOccluded = false;
            if (intersects.length > 0) {
                var distToLabel = camPos.distanceTo(worldPos);
                if (intersects[0].distance < distToLabel - 0.05) {
                    isOccluded = true;
                }
            }
            
            if (item.label.element) {
                item.label.element.style.display = isOccluded ? 'none' : '';
            }
        });
        
        // Verificar etiquetas de componentes
        _componentLabels.forEach(function(item) {
            if (!item.label || !item.label.element) return;
            var worldPos = new THREE.Vector3();
            item.label.getWorldPosition(worldPos);
            
            var dir = worldPos.clone().sub(camPos).normalize();
            _raycaster.set(camPos, dir);
            
            var allObjects = [];
            _scene.traverse(function(child) {
                if (child.isMesh && child.visible && child.geometry) {
                    allObjects.push(child);
                }
            });
            
            var intersects = _raycaster.intersectObjects(allObjects, false);
            
            var isOccluded = false;
            if (intersects.length > 0) {
                var distToLabel = camPos.distanceTo(worldPos);
                if (intersects[0].distance < distToLabel - 0.02) {
                    isOccluded = true;
                }
            }
            
            item.label.element.style.display = isOccluded ? 'none' : '';
        });
        
        // Verificar etiquetas de dimensiones
        _dimensionLines.forEach(function(item) {
            if (!item.textLabel || !item.textLabel.element) return;
            var worldPos = new THREE.Vector3();
            item.textLabel.getWorldPosition(worldPos);
            
            var dir = worldPos.clone().sub(camPos).normalize();
            _raycaster.set(camPos, dir);
            
            var allObjects = [];
            _scene.traverse(function(child) {
                if (child.isMesh && child.visible && child.geometry) {
                    allObjects.push(child);
                }
            });
            
            var intersects = _raycaster.intersectObjects(allObjects, false);
            
            var isOccluded = false;
            if (intersects.length > 0) {
                var distToLabel = camPos.distanceTo(worldPos);
                if (intersects[0].distance < distToLabel - 0.02) {
                    isOccluded = true;
                }
            }
            
            item.textLabel.element.style.display = isOccluded ? 'none' : '';
        });
        
        // Verificar anotaciones de ángulo
        _angleAnnotations.forEach(function(item) {
            if (!item.label || !item.label.element) return;
            var worldPos = new THREE.Vector3();
            item.label.getWorldPosition(worldPos);
            item.label.element.style.display = '';
        });
        
        // Verificar elevaciones
        _elevationLabels.forEach(function(item) {
            if (!item.label || !item.label.element) return;
            item.label.element.style.display = '';
        });
    }
    
    // ═══════════════════════════════════════════
    // ESCALADO DE ETIQUETAS SEGÚN ZOOM
    // ═══════════════════════════════════════════
    function updateLabelScale() {
        if (!_camera) return;
        var zoom = _camera.zoom;
        
        var scale = Math.min(Math.max(zoom * 1.5, 0.35), 2.5);
        var opacity = Math.min(Math.max((zoom - 0.2) * 2.5, 0.2), 1.0);
        
        _equipmentLabels.forEach(function(item) {
            if (item.label && item.label.element) {
                item.label.element.style.transform = 'scale(' + scale.toFixed(2) + ')';
                item.label.element.style.opacity = opacity.toFixed(2);
            }
        });
        
        _lineLabels.forEach(function(item) {
            if (item.label && item.label.element) {
                item.label.element.style.transform = 'scale(' + scale.toFixed(2) + ')';
                item.label.element.style.opacity = opacity.toFixed(2);
            }
        });
        
        _componentLabels.forEach(function(item) {
            if (item.label && item.label.element) {
                item.label.element.style.transform = 'scale(' + scale.toFixed(2) + ')';
                item.label.element.style.opacity = opacity.toFixed(2);
            }
        });
        
        _dimensionLines.forEach(function(item) {
            if (item.textLabel && item.textLabel.element) {
                item.textLabel.element.style.transform = 'scale(' + scale.toFixed(2) + ')';
                item.textLabel.element.style.opacity = opacity.toFixed(2);
            }
        });
        
        _angleAnnotations.forEach(function(item) {
            if (item.label && item.label.element) {
                item.label.element.style.transform = 'scale(' + scale.toFixed(2) + ')';
                item.label.element.style.opacity = opacity.toFixed(2);
            }
        });
        
        _elevationLabels.forEach(function(item) {
            if (item.label && item.label.element) {
                item.label.element.style.transform = 'scale(' + scale.toFixed(2) + ')';
                item.label.element.style.opacity = opacity.toFixed(2);
            }
        });
    }
    
    // ═══════════════════════════════════════════
    // INICIALIZACIÓN
    // ═══════════════════════════════════════════
    function init(coreInstance, engineInstance) {
        _core = coreInstance;
        _engine = engineInstance;
        _camera = engineInstance ? engineInstance.getCamera() : null;
        _scene = engineInstance ? engineInstance.getScene() : null;
        
        if (!_scene || !_camera) {
            console.warn('SmartFlowLabels3D: Engine no disponible');
            return false;
        }
        
        _sharedDimLineMat = new THREE.LineBasicMaterial({ 
            color: 0xfacc15, linewidth: 1, transparent: true, opacity: 0.8, depthTest: true
        });
        _sharedDimExtMat = new THREE.LineBasicMaterial({ 
            color: 0xfacc15, linewidth: 1, transparent: true, opacity: 0.4, depthTest: true
        });
        _sharedDimTickMat = new THREE.LineBasicMaterial({ 
            color: 0xfacc15, linewidth: 1, transparent: true, opacity: 0.8, depthTest: true
        });
        _sharedAnchorMat = new THREE.MeshBasicMaterial({ visible: false });
        _sharedAnchorGeo = new THREE.SphereGeometry(0.02, 4, 4);
        _sharedAngleArcMat = new THREE.LineBasicMaterial({ 
            color: 0x4ade80, linewidth: 1, transparent: true, opacity: 0.6, depthTest: true
        });
        
        try {
            _labelRenderer = new CSS2DRenderer();
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
        
        _labelGroup.userData = { isLabelGroup: true };
        _dimensionGroup3D.userData = { isDimensionGroup3D: true };
        _annotationGroup.userData = { isAnnotationGroup: true };
        _scene.add(_labelGroup);
        _scene.add(_dimensionGroup3D);
        _scene.add(_annotationGroup);
        
        if (_core && typeof _core.on === 'function') {
            _core.on('modelChanged', function() {
                setTimeout(function() {
                    refreshAllLabels();
                    refreshAllDimensions();
                }, 400);
            });
        }
        
        window.addEventListener('resize', onResize);
        
        console.log('✔ SmartFlowLabels3D v4.0 (cotas totales + ángulos + elevaciones + FROM/TO)');
        return true;
    }
    
    function onResize() {
        if (_labelRenderer) {
            _labelRenderer.setSize(window.innerWidth, window.innerHeight);
        }
    }
    
    // ═══════════════════════════════════════════
    // ETIQUETAS DE EQUIPO
    // ═══════════════════════════════════════════
    function createEquipmentLabel(eq) {
        if (!eq || !eq.tag) return null;
        
        var posX = toMeters(eq.posX);
        var posY = toMeters(eq.posY);
        var posZ = toMeters(eq.posZ);
        
        var altura = toMeters(eq.altura || eq.diametro || 2000);
        if (eq.tipo === 'tanque_h') altura = toMeters(eq.diametro || 3000);
        if (eq.tipo && eq.tipo.includes('bomba')) altura = toMeters(eq.diametro || 800);
        if (eq.tipo === 'plataforma') altura = toMeters(eq.altura || 400);
        
        var offsetY = (altura / 2) + EQUIPMENT_LABEL_OFFSET;
        
        var anchor = new THREE.Mesh(_sharedAnchorGeo, _sharedAnchorMat);
        anchor.position.set(posX, posY + offsetY, posZ);
        anchor.userData = { tag: eq.tag, isLabelAnchor: true };
        _labelGroup.add(anchor);
        
        var tipoStr = eq.tipo || 'EQUIPO';
        var matStr = (eq.material || 'N/D').substring(0, 15);
        var diamStr = eq.diametro ? ' ⌀' + (eq.diametro / 1000).toFixed(1) + 'm' : '';
        
        var div = document.createElement('div');
        div.className = 'label-3d';
        div.style.cssText = [
            'background: ' + COLORS.equipmentBg + ';',
            'border: 1px solid ' + COLORS.equipmentBorder + ';',
            'border-radius: 6px; padding: 6px 10px;',
            'font-family: "Courier New", monospace; font-size: 10px;',
            'color: ' + COLORS.equipment + '; text-align: center;',
            'white-space: nowrap; backdrop-filter: blur(4px);',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.5);',
            'pointer-events: auto; cursor: pointer; user-select: none;',
            'transition: opacity 0.3s ease, transform 0.2s ease;',
            'transform-origin: center center;'
        ].join(' ');
        
        div.innerHTML = '<div style="font-weight:bold;font-size:11px;">🏭 ' + eq.tag + '</div>' +
            '<div style="font-size:8px;color:#94a3b8;">' + tipoStr + diamStr + ' | ' + matStr + '</div>';
        
        var label = new CSS2DObject(div);
        label.position.copy(anchor.position);
        label.userData = { tag: eq.tag, isEquipmentLabel: true };
        _labelGroup.add(label);
        
        var clickHandler = function(e) {
            e.stopPropagation();
            if (_core) _core.setSelected({ obj: eq, type: 'equipment' });
        };
        div.addEventListener('click', clickHandler);
        
        _equipmentLabels.set(eq.tag, { 
            anchor: anchor, label: label, element: div, handler: clickHandler 
        });
        return { anchor: anchor, label: label };
    }
    
    // ═══════════════════════════════════════════
    // ETIQUETAS DE LÍNEA
    // ═══════════════════════════════════════════
    function createLineLabel(line) {
        if (!line || !line.tag) return null;
        
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return null;
        
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
        
        // ✅ CORREGIDO: Mejor detección de segmento vertical
        var dx = Math.abs(p2.x - p1.x);
        var dy = Math.abs(p2.y - p1.y);
        var dz = Math.abs(p2.z - p1.z);
        var isVertical = dy > dx && dy > dz;
        
        var midX = toMeters(p1.x + (p2.x - p1.x) * t) + (isVertical ? 0.2 : 0);
        var midY = toMeters(p1.y + (p2.y - p1.y) * t) + (isVertical ? 0 : LINE_LABEL_OFFSET);
        var midZ = toMeters(p1.z + (p2.z - p1.z) * t) + (isVertical ? 0.2 : 0);
        
        var diam = line.diameter || '?';
        var service = line.service || '';
        var matShort = (line.material || 'N/D').substring(0, 4);
        
        var div = document.createElement('div');
        div.className = 'label-3d';
        div.style.cssText = [
            'background: ' + COLORS.lineBg + ';',
            'border: 1px solid ' + COLORS.lineBorder + ';',
            'border-radius: 4px; padding: 3px 7px;',
            'font-family: "Courier New", monospace; font-size: 9px;',
            'color: ' + COLORS.line + '; text-align: center;',
            'white-space: nowrap; backdrop-filter: blur(4px);',
            'box-shadow: 0 1px 6px rgba(0,0,0,0.4);',
            'pointer-events: auto; cursor: pointer; user-select: none;',
            'transition: opacity 0.3s ease, transform 0.2s ease;',
            'transform-origin: center center;'
        ].join(' ');
        
        div.textContent = diam + '" ' + matShort + (service ? ' ' + service : '');
        
        var label = new CSS2DObject(div);
        label.position.set(midX, midY, midZ);
        label.userData = { tag: line.tag, isLineLabel: true };
        _labelGroup.add(label);
        
        var clickHandler = function(e) {
            e.stopPropagation();
            if (_core) _core.setSelected({ obj: line, type: 'line' });
        };
        div.addEventListener('click', clickHandler);
        
        _lineLabels.set(line.tag, { label: label, element: div, handler: clickHandler });
        return { label: label };
    }
    
    // ═══════════════════════════════════════════
    // ETIQUETAS DE COMPONENTES
    // ═══════════════════════════════════════════
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
            var cx = toMeters(pA.x + (pB.x - pA.x) * t);
            var cy = toMeters(pA.y + (pB.y - pA.y) * t) + LINE_LABEL_OFFSET;
            var cz = toMeters(pA.z + (pB.z - pA.z) * t);
            
            var abbr = getAbbreviation(comp.type);
            
            var div = document.createElement('div');
            div.className = 'label-3d';
            div.style.cssText = [
                'background: ' + COLORS.componentBg + ';',
                'border: 1px solid ' + COLORS.componentBorder + ';',
                'border-radius: 3px; padding: 2px 5px;',
                'font-family: "Courier New", monospace; font-size: 8px;',
                'color: ' + COLORS.component + '; text-align: center;',
                'white-space: nowrap; backdrop-filter: blur(4px);',
                'pointer-events: auto; cursor: pointer; user-select: none;',
                'transition: opacity 0.3s ease, transform 0.2s ease;',
                'transform-origin: center center;'
            ].join(' ');
            
            div.textContent = abbr;
            
            var label = new CSS2DObject(div);
            label.position.set(cx, cy, cz);
            label.userData = { tag: comp.tag, type: comp.type, isComponentLabel: true };
            _labelGroup.add(label);
            
            _componentLabels.set(comp.tag || (line.tag + '_' + comp.type), { label: label, element: div });
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
    
    // ═══════════════════════════════════════════
    // COTAS 3D
    // ═══════════════════════════════════════════
    function createDimensionLine3D(p1, p2, labelText, lineTag) {
        var pos1 = new THREE.Vector3(toMeters(p1.x), toMeters(p1.y), toMeters(p1.z));
        var pos2 = new THREE.Vector3(toMeters(p2.x), toMeters(p2.y), toMeters(p2.z));
        
        var distance = pos1.distanceTo(pos2);
        if (distance < MIN_SEGMENT_LENGTH) return null;
        
        // ✅ CORREGIDO: Key única con contador
        _dimensionCounter++;
        var key = (lineTag || 'dim') + '_' + _dimensionCounter;
        if (_dimensionLines.has(key)) return null;
        
        var dir = new THREE.Vector3().subVectors(pos2, pos1).normalize();
        var perpendicular = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
        if (perpendicular.length() < 0.1) {
            perpendicular = new THREE.Vector3(0, 1, 0);
        }
        perpendicular.multiplyScalar(DIMENSION_OFFSET);
        
        var cota1 = new THREE.Vector3().addVectors(pos1, perpendicular);
        var cota2 = new THREE.Vector3().addVectors(pos2, perpendicular);
        
        var extGeo1 = new THREE.BufferGeometry().setFromPoints([pos1, cota1]);
        var extGeo2 = new THREE.BufferGeometry().setFromPoints([pos2, cota2]);
        _dimensionGroup3D.add(new THREE.Line(extGeo1, _sharedDimExtMat));
        _dimensionGroup3D.add(new THREE.Line(extGeo2, _sharedDimExtMat));
        
        var lineGeo = new THREE.BufferGeometry().setFromPoints([cota1, cota2]);
        _dimensionGroup3D.add(new THREE.Line(lineGeo, _sharedDimLineMat));
        
        var tickDir = dir.clone().multiplyScalar(0.1);
        var tickGeo1 = new THREE.BufferGeometry().setFromPoints([
            cota1.clone().add(tickDir), cota1.clone().sub(tickDir)
        ]);
        var tickGeo2 = new THREE.BufferGeometry().setFromPoints([
            cota2.clone().add(tickDir), cota2.clone().sub(tickDir)
        ]);
        _dimensionGroup3D.add(new THREE.Line(tickGeo1, _sharedDimTickMat));
        _dimensionGroup3D.add(new THREE.Line(tickGeo2, _sharedDimTickMat));
        
        var dimText = labelText || formatDistance(distance);
        var textDiv = document.createElement('div');
        textDiv.className = 'label-3d';
        
        // Detectar si es cota total para cambiar color
        var isTotal = (labelText || '').toUpperCase().includes('TOTAL');
        var bgColor = isTotal ? COLORS.totalBg : COLORS.dimensionBg;
        var borderColor = isTotal ? COLORS.totalBorder : COLORS.dimensionBorder;
        
        textDiv.innerHTML = '<span style="' + [
            'background: ' + bgColor + ';',
            'color: ' + COLORS.dimensionText + ';',
            'padding: 2px 6px; border-radius: 3px;',
            'font-family: "Courier New", monospace; font-size: ' + (isTotal ? '9px' : '8px') + ';',
            'white-space: nowrap;',
            'border: 1px solid ' + borderColor + ';',
            'font-weight: ' + (isTotal ? 'bold' : 'normal') + ';',
            'transition: opacity 0.3s ease, transform 0.2s ease;',
            'transform-origin: center center;'
        ].join(' ') + '">' + dimText + '</span>';
        
        var midPoint = new THREE.Vector3().addVectors(cota1, cota2).multiplyScalar(0.5);
        var textLabel = new CSS2DObject(textDiv);
        textLabel.position.copy(midPoint);
        textLabel.userData = { isDimensionText: true, key: key };
        _dimensionGroup3D.add(textLabel);
        
        _dimensionLines.set(key, { textLabel: textLabel, isTotal: isTotal });
        return { cota1: cota1, cota2: cota2, textLabel: textLabel };
    }
    
    function formatDistance(meters) {
        if (meters >= 1) return meters.toFixed(2) + ' m';
        return (meters * 1000).toFixed(0) + ' mm';
    }
    
    // ═══════════════════════════════════════════
    // ANOTACIÓN DE ÁNGULO 3D (NUEVO v4.0)
    // ═══════════════════════════════════════════
    function createAngleAnnotation3D(point, angleDeg, lineTag) {
        var pos = new THREE.Vector3(toMeters(point.x), toMeters(point.y), toMeters(point.z));
        
        _dimensionCounter++;
        var key = (lineTag || 'angle') + '_angle_' + _dimensionCounter;
        
        // Crear arco pequeño para indicar el ángulo
        var arcRadius = ANGLE_OFFSET;
        var arcPoints = [];
        var startAngle = 0;
        var endAngle = angleDeg * Math.PI / 180;
        var segments = Math.max(8, Math.floor(angleDeg / 5));
        
        for (var i = 0; i <= segments; i++) {
            var a = startAngle + (endAngle - startAngle) * (i / segments);
            arcPoints.push(new THREE.Vector3(
                pos.x + Math.cos(a) * arcRadius,
                pos.y + 0.05,
                pos.z + Math.sin(a) * arcRadius
            ));
        }
        
        var arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
        var arcLine = new THREE.Line(arcGeo, _sharedAngleArcMat);
        arcLine.userData = { isAngleArc: true, key: key };
        _annotationGroup.add(arcLine);
        
        // Etiqueta de texto
        var textDiv = document.createElement('div');
        textDiv.className = 'label-3d';
        textDiv.innerHTML = '<span style="' + [
            'background: ' + COLORS.angleBg + ';',
            'color: ' + COLORS.angle + ';',
            'padding: 2px 5px; border-radius: 3px;',
            'font-family: "Courier New", monospace; font-size: 8px;',
            'white-space: nowrap;',
            'border: 1px solid ' + COLORS.angleBorder + ';',
            'transition: opacity 0.3s ease, transform 0.2s ease;',
            'transform-origin: center center;'
        ].join(' ') + '">' + angleDeg.toFixed(1) + '°</span>';
        
        var label = new CSS2DObject(textDiv);
        label.position.set(
            pos.x + Math.cos(endAngle / 2) * (arcRadius + 0.15),
            pos.y + 0.1,
            pos.z + Math.sin(endAngle / 2) * (arcRadius + 0.15)
        );
        label.userData = { isAngleLabel: true, key: key };
        _annotationGroup.add(label);
        
        _angleAnnotations.set(key, { label: label, arc: arcLine });
    }
    
    // ═══════════════════════════════════════════
    // ETIQUETA DE ELEVACIÓN (NUEVO v4.0)
    // ═══════════════════════════════════════════
    function createElevationLabel3D(point, elevationMM, lineTag) {
        var pos = new THREE.Vector3(toMeters(point.x), toMeters(point.y), toMeters(point.z));
        
        _dimensionCounter++;
        var key = (lineTag || 'elev') + '_elev_' + _dimensionCounter;
        
        var elevText = formatElevation(elevationMM);
        
        var textDiv = document.createElement('div');
        textDiv.className = 'label-3d';
        textDiv.innerHTML = '<span style="' + [
            'background: ' + COLORS.elevationBg + ';',
            'color: ' + COLORS.elevation + ';',
            'padding: 2px 6px; border-radius: 3px;',
            'font-family: "Courier New", monospace; font-size: 8px;',
            'white-space: nowrap;',
            'border: 1px solid ' + COLORS.elevationBorder + ';',
            'transition: opacity 0.3s ease, transform 0.2s ease;',
            'transform-origin: center center;'
        ].join(' ') + '">⌂ ' + elevText + '</span>';
        
        var label = new CSS2DObject(textDiv);
        label.position.set(pos.x - ELEVATION_OFFSET, pos.y, pos.z);
        label.userData = { isElevationLabel: true, key: key };
        _annotationGroup.add(label);
        
        _elevationLabels.set(key, { label: label });
    }
    
    // ═══════════════════════════════════════════
    // ETIQUETA FROM/TO (NUEVO v4.0)
    // ═══════════════════════════════════════════
    function createEndpointLabel3D(point, labelText, isStart) {
        var pos = new THREE.Vector3(toMeters(point.x), toMeters(point.y), toMeters(point.z));
        
        _dimensionCounter++;
        var key = 'endpoint_' + (isStart ? 'start_' : 'end_') + _dimensionCounter;
        
        var textDiv = document.createElement('div');
        textDiv.className = 'label-3d';
        textDiv.innerHTML = '<span style="' + [
            'background: ' + COLORS.endpointBg + ';',
            'color: ' + COLORS.endpoint + ';',
            'padding: 2px 6px; border-radius: 3px;',
            'font-family: "Courier New", monospace; font-size: 8px;',
            'white-space: nowrap;',
            'border: 1px solid ' + COLORS.endpointBorder + ';',
            'transition: opacity 0.3s ease, transform 0.2s ease;',
            'transform-origin: center center;'
        ].join(' ') + '">' + (isStart ? '▶ ' : '◀ ') + labelText + '</span>';
        
        var label = new CSS2DObject(textDiv);
        label.position.set(pos.x, pos.y + 0.2, pos.z);
        label.userData = { isEndpointLabel: true, key: key };
        _annotationGroup.add(label);
    }
    
    // ═══════════════════════════════════════════
    // CREACIÓN DE COTAS POR LÍNEA (MEJORADO v4.0)
    // ═══════════════════════════════════════════
    function createDimensionsForLine(line) {
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return;
        
        // ✅ Cotas por segmento
        for (var i = 0; i < pts.length - 1; i++) {
            if (pts[i].isControlPoint || pts[i+1].isControlPoint) continue;
            var dist = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            if (dist >= 100) {
                createDimensionLine3D(pts[i], pts[i+1], formatLengthMM(dist), line.tag);
            }
        }
        
        // ✅ Cota total (NUEVO v4.0)
        if (pts.length >= 2) {
            var totalDist = 0;
            for (var j = 0; j < pts.length - 1; j++) {
                totalDist += Math.hypot(pts[j+1].x - pts[j].x, pts[j+1].y - pts[j].y, pts[j+1].z - pts[j].z);
            }
            if (totalDist >= 100) {
                createDimensionLine3D(pts[0], pts[pts.length - 1], 'TOTAL ' + formatLengthMM(totalDist), line.tag);
            }
        }
        
        // ✅ Ángulos en giros (NUEVO v4.0)
        for (var k = 1; k < pts.length - 1; k++) {
            var v1 = { x: pts[k].x - pts[k-1].x, y: pts[k].y - pts[k-1].y, z: pts[k].z - pts[k-1].z };
            var v2 = { x: pts[k+1].x - pts[k].x, y: pts[k+1].y - pts[k].y, z: pts[k+1].z - pts[k].z };
            var len1 = Math.hypot(v1.x, v1.y, v1.z) || 1;
            var len2 = Math.hypot(v2.x, v2.y, v2.z) || 1;
            var dot = (v1.x*v2.x + v1.y*v2.y + v1.z*v2.z) / (len1 * len2);
            var angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
            
            if (angle > MIN_ANGLE_DISPLAY) {
                createAngleAnnotation3D(pts[k], angle, line.tag);
            }
        }
        
        // ✅ Elevaciones únicas (NUEVO v4.0)
        var seenElevations = new Set();
        for (var m = 0; m < pts.length; m++) {
            var elevKey = Math.round(pts[m].y / 500) * 500;
            if (!seenElevations.has(elevKey)) {
                seenElevations.add(elevKey);
                createElevationLabel3D(pts[m], pts[m].y, line.tag);
            }
        }
        
        // ✅ Etiquetas FROM/TO (NUEVO v4.0)
        if (line.origin) {
            createEndpointLabel3D(pts[0], 'FROM ' + line.origin.equipTag + ':' + line.origin.portId, true);
        }
        if (line.destination) {
            createEndpointLabel3D(pts[pts.length - 1], 'TO ' + line.destination.equipTag + ':' + line.destination.portId, false);
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
                createDimensionLine3D(posA, posB, pA.id + ' ↔ ' + pB.id, eq.tag);
            }
        }
    }
    
    // ═══════════════════════════════════════════
    // INTEGRACIÓN CON DIMENSION GENERATOR (NUEVO v4.0)
    // ═══════════════════════════════════════════
    function refreshAllDimensionsFromGenerator() {
        if (!_core || typeof SmartFlowDimensionGenerator === 'undefined') return false;
        
        var db = _core.getDb();
        if (!db) return false;
        
        var lines = db.lines || [];
        for (var i = 0; i < lines.length; i++) {
            var dimData = SmartFlowDimensionGenerator.generateDimensions(lines[i].tag);
            if (dimData && dimData.dimensions) {
                dimData.dimensions.forEach(function(d) {
                    switch(d.type) {
                        case 'segment':
                            createDimensionLine3D(d.from, d.to, d.lengthDisplay, lines[i].tag);
                            break;
                        case 'overall':
                            createDimensionLine3D(d.from, d.to, 'TOTAL ' + d.lengthDisplay, lines[i].tag);
                            break;
                        case 'angle':
                            createAngleAnnotation3D(d.atPoint, d.angle, lines[i].tag);
                            break;
                        case 'elevation':
                            createElevationLabel3D(d.atPoint, d.elevation, lines[i].tag);
                            break;
                        case 'end_label':
                            createEndpointLabel3D(d.atPoint, d.label, d.position === 'start');
                            break;
                    }
                });
            }
        }
        return true;
    }
    
    // ═══════════════════════════════════════════
    // LIMPIEZA
    // ═══════════════════════════════════════════
    function clearAllLabels() {
        _equipmentLabels.forEach(function(item) {
            if (item.element && item.handler) {
                item.element.removeEventListener('click', item.handler);
            }
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
            if (item.anchor && item.anchor.parent) {
                item.anchor.parent.remove(item.anchor);
            }
        });
        _equipmentLabels.clear();
        
        _lineLabels.forEach(function(item) {
            if (item.element && item.handler) {
                item.element.removeEventListener('click', item.handler);
            }
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
            if (item.textLabel) {
                if (item.textLabel.parent) item.textLabel.parent.remove(item.textLabel);
                if (item.textLabel.element) item.textLabel.element.remove();
            }
        });
        _dimensionLines.clear();
        
        _angleAnnotations.forEach(function(item) {
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
            if (item.arc && item.arc.parent) {
                item.arc.parent.remove(item.arc);
                if (item.arc.geometry) item.arc.geometry.dispose();
            }
        });
        _angleAnnotations.clear();
        
        _elevationLabels.forEach(function(item) {
            if (item.label) {
                if (item.label.parent) item.label.parent.remove(item.label);
                if (item.label.element) item.label.element.remove();
            }
        });
        _elevationLabels.clear();
        
        while (_dimensionGroup3D.children.length > 0) {
            var child = _dimensionGroup3D.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.element) child.element.remove();
            _dimensionGroup3D.remove(child);
        }
        
        while (_annotationGroup.children.length > 0) {
            var child2 = _annotationGroup.children[0];
            if (child2.geometry) child2.geometry.dispose();
            if (child2.element) child2.element.remove();
            _annotationGroup.remove(child2);
        }
        
        _dimensionCounter = 0;
    }
    
    function refreshAllLabels() {
        if (!_core) return;
        clearAllLabels();
        
        var db = _core.getDb();
        if (!db) return;
        
        var equipos = db.equipos || [];
        for (var i = 0; i < equipos.length; i++) {
            if (equipos[i].tipo !== 'plataforma' && !(equipos[i].tag || '').startsWith('TEE-')) {
                createEquipmentLabel(equipos[i]);
            }
        }
        
        var lines = db.lines || [];
        for (var j = 0; j < lines.length; j++) {
            createLineLabel(lines[j]);
            createComponentLabels(lines[j]);
        }
    }
    
    function refreshAllDimensions() {
        if (!_core) return;
        clearAllDimensions();
        
        // Intentar usar DimensionGenerator primero
        if (!refreshAllDimensionsFromGenerator()) {
            // Fallback al método tradicional
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
        }
    }
    
    function render() {
        if (_labelRenderer && _scene && _camera) {
            updateLabelVisibility();
            updateLabelScale();
            _labelRenderer.render(_scene, _camera);
        }
    }
    
    // ═══════════════════════════════════════════
    // EXPORTACIÓN (NUEVO v4.0)
    // ═══════════════════════════════════════════
    function exportDimensionsCSV() {
        if (typeof SmartFlowDimensionGenerator !== 'undefined') {
            var db = _core.getDb();
            var allCSV = '';
            var lines = db.lines || [];
            
            for (var i = 0; i < lines.length; i++) {
                var dimData = SmartFlowDimensionGenerator.generateDimensions(lines[i].tag);
                if (dimData) {
                    allCSV += SmartFlowDimensionGenerator.exportDimensionsToCSV(dimData) + '\n';
                }
            }
            
            var blob = new Blob([allCSV], { type: 'text/csv;charset=utf-8;' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'Dimensiones_' + new Date().toISOString().slice(0,10) + '.csv';
            a.click();
            return true;
        }
        return false;
    }
    
    function dispose() {
        clearAllLabels();
        clearAllDimensions();
        
        if (_sharedDimLineMat) _sharedDimLineMat.dispose();
        if (_sharedDimExtMat) _sharedDimExtMat.dispose();
        if (_sharedDimTickMat) _sharedDimTickMat.dispose();
        if (_sharedAnchorMat) _sharedAnchorMat.dispose();
        if (_sharedAnchorGeo) _sharedAnchorGeo.dispose();
        if (_sharedAngleArcMat) _sharedAngleArcMat.dispose();
        
        if (_labelRenderer && _labelRenderer.domElement) {
            _labelRenderer.domElement.remove();
        }
        
        if (_labelGroup.parent) _labelGroup.parent.remove(_labelGroup);
        if (_dimensionGroup3D.parent) _dimensionGroup3D.parent.remove(_dimensionGroup3D);
        if (_annotationGroup.parent) _annotationGroup.parent.remove(_annotationGroup);
        
        window.removeEventListener('resize', onResize);
        
        _core = null;
        _engine = null;
        _labelRenderer = null;
        _camera = null;
        _scene = null;
        _raycaster = null;
    }
    
    // ═══════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════
    return {
        init: init,
        refreshAllLabels: refreshAllLabels,
        refreshAllDimensions: refreshAllDimensions,
        clearAllLabels: clearAllLabels,
        clearAllDimensions: clearAllDimensions,
        exportDimensionsCSV: exportDimensionsCSV,
        render: render,
        getLabelRenderer: function() { return _labelRenderer; },
        dispose: dispose
    };
})();

window.SmartFlowLabels3D = SmartFlowLabels3D;
