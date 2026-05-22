
// ============================================================
// SMARTFLOW RENDER v7.4 - Símbolos 3D + Cotas + Flujo + Labels
// Archivo: js/render.js
// Integración: ThreeJsEngine v2.0 + SmartFlowCore v5.5
// ============================================================

const SmartFlowRender = (function() {
    let _composer = null;
    let _outlinePass = null;
    let _currentHighlighted = null;
    let _infoPanel = null;
    let _core = null;
    let _engine = null;
    let _labelRenderer = null;
    
    let _symbolGroup = new THREE.Group();
    let _dimensionGroup = new THREE.Group();
    let _flowArrowGroup = new THREE.Group();
    
    let _isAnimating = false;
    let _targetPos = new THREE.Vector3();
    let _targetLookAt = new THREE.Vector3();
    const _transitionSpeed = 0.08;
    
    let _debounceTimer = null;
    
    const materials = {
        valve: new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.4, roughness: 0.3 }),
        tee: new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.4, roughness: 0.3 }),
        reducer: new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.3 }),
        elbow: new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.4, roughness: 0.3 }),
        flange: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.2 }),
        instrument: new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.2, roughness: 0.5 }),
        pipe: new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.1, roughness: 0.6 }),
        platform_steel: new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.8, roughness: 0.3 }),
        platform_concrete: new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.1, roughness: 0.8 }),
        highlight: new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.3 })
    };

    // ============ EFECTOS VISUALES ============
    function setupEffects(scene, camera, renderer) {
        if (!scene || !camera || !renderer) return;
        
        if (typeof THREE.EffectComposer !== 'undefined') {
            _composer = new THREE.EffectComposer(renderer);
            const renderPass = new THREE.RenderPass(scene, camera);
            _composer.addPass(renderPass);
            
            if (typeof THREE.OutlinePass !== 'undefined') {
                _outlinePass = new THREE.OutlinePass(
                    new THREE.Vector2(window.innerWidth, window.innerHeight),
                    scene, camera
                );
                _outlinePass.edgeStrength = 3;
                _outlinePass.edgeGlow = 0.6;
                _outlinePass.edgeThickness = 1.5;
                _outlinePass.pulsePeriod = 2;
                _outlinePass.visibleEdgeColor.setHex(0x00f2ff);
                _outlinePass.hiddenEdgeColor.setHex(0x1e293b);
                _composer.addPass(_outlinePass);
            }
        }
    }
    
    // ============ SÍMBOLOS 3D ============
    function createValve3D(comp, position, direction, size) {
        const group = new THREE.Group();
        const s = size || 0.3;
        
        const bodyGeo = new THREE.BoxGeometry(s * 1.5, s, s);
        const body = new THREE.Mesh(bodyGeo, materials.valve.clone());
        group.add(body);
        
        const handwheelGeo = new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.3, 16);
        const handwheel = new THREE.Mesh(handwheelGeo, materials.valve.clone());
        handwheel.position.y = s * 0.7;
        group.add(handwheel);
        
        const stemGeo = new THREE.CylinderGeometry(s * 0.1, s * 0.1, s * 0.5, 8);
        const stem = new THREE.Mesh(stemGeo, materials.valve.clone());
        stem.position.y = s * 0.3;
        group.add(stem);
        
        group.position.copy(position);
        if (direction) {
            group.quaternion.setFromUnitVectors(
                new THREE.Vector3(1, 0, 0),
                new THREE.Vector3(direction.x || 0, direction.y || 0, direction.z || 0)
            );
        }
        
        return group;
    }
    
    function createTee3D(position, direction, perpendicular, size) {
        const group = new THREE.Group();
        const s = size || 0.25;
        
        const mainGeo = new THREE.CylinderGeometry(s * 0.6, s * 0.6, s * 3, 16);
        const main = new THREE.Mesh(mainGeo, materials.tee.clone());
        main.rotation.z = Math.PI / 2;
        group.add(main);
        
        const branchGeo = new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 1.5, 16);
        const branch = new THREE.Mesh(branchGeo, materials.tee.clone());
        branch.position.y = s * 0.75;
        group.add(branch);
        
        const centerGeo = new THREE.SphereGeometry(s * 0.7, 16, 16);
        const center = new THREE.Mesh(centerGeo, materials.tee.clone());
        group.add(center);
        
        group.position.copy(position);
        if (direction) {
            const quat = new THREE.Quaternion();
            quat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
            group.quaternion.copy(quat);
        }
        
        return group;
    }
    
    function createReducer3D(position, direction, size) {
        const group = new THREE.Group();
        const s = size || 0.25;
        
        const reducerGeo = new THREE.CylinderGeometry(s * 0.7, s * 0.4, s * 2, 16);
        const reducer = new THREE.Mesh(reducerGeo, materials.reducer.clone());
        reducer.rotation.z = Math.PI / 2;
        group.add(reducer);
        
        group.position.copy(position);
        if (direction) {
            group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
        }
        
        return group;
    }
    
    function createElbow3D(position, direction, nextDirection, size, angle) {
        const group = new THREE.Group();
        const s = size || 0.25;
        
        const elbowGeo = new THREE.SphereGeometry(s * 0.6, 16, 16);
        const elbow = new THREE.Mesh(elbowGeo, materials.elbow.clone());
        group.add(elbow);
        
        const ringGeo = new THREE.TorusGeometry(s * 0.7, s * 0.1, 8, 16);
        const ring = new THREE.Mesh(ringGeo, materials.elbow.clone());
        group.add(ring);
        
        group.position.copy(position);
        return group;
    }
    
    function createFlange3D(position, direction, size) {
        const group = new THREE.Group();
        const s = size || 0.25;
        
        const flangeGeo = new THREE.CylinderGeometry(s * 0.8, s * 0.8, s * 0.3, 32);
        const flange = new THREE.Mesh(flangeGeo, materials.flange.clone());
        flange.rotation.z = Math.PI / 2;
        group.add(flange);
        
        group.position.copy(position);
        if (direction) {
            group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
        }
        
        return group;
    }
    
    function createInstrument3D(position, type, size) {
        const group = new THREE.Group();
        const s = size || 0.2;
        
        const boxGeo = new THREE.BoxGeometry(s * 1.2, s * 1.5, s * 0.8);
        const box = new THREE.Mesh(boxGeo, materials.instrument.clone());
        group.add(box);
        
        const dialGeo = new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.1, 32);
        const dial = new THREE.Mesh(dialGeo, materials.instrument.clone());
        dial.position.z = s * 0.5;
        group.add(dial);
        
        group.position.copy(position);
        return group;
    }
    
    function createPlatform3D(eq) {
        const group = new THREE.Group();
        const w = (eq.largo || 6000) / 1000;
        const d = (eq.ancho || 3000) / 1000;
        const h = (eq.altura || 400) / 1000;
        const materialName = (eq.material || '').toUpperCase();
        const esConcreto = materialName.includes('CONCRETO') || materialName.includes('CEMENTO');
        
        const baseGeo = new THREE.BoxGeometry(w, h, d);
        const baseMat = esConcreto ? materials.platform_concrete.clone() : materials.platform_steel.clone();
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = h / 2;
        group.add(base);
        
        const legGeo = new THREE.BoxGeometry(0.1, h * 2, 0.1);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.7, roughness: 0.3 });
        const legPositions = [
            { x: -w/2 + 0.15, z: -d/2 + 0.15 },
            { x: w/2 - 0.15, z: -d/2 + 0.15 },
            { x: w/2 - 0.15, z: d/2 - 0.15 },
            { x: -w/2 + 0.15, z: d/2 - 0.15 }
        ];
        legPositions.forEach(function(pos) {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(pos.x, -h/2, pos.z);
            group.add(leg);
        });
        
        if (eq.baranda) {
            const railGeo = new THREE.BoxGeometry(w, 0.05, 0.05);
            const railMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.3 });
            const railH = h + 0.2;
            ['front', 'back'].forEach(function(side, idx) {
                const rail = new THREE.Mesh(railGeo, railMat);
                rail.position.set(0, railH, idx === 0 ? d/2 : -d/2);
                group.add(rail);
            });
            const sideGeo = new THREE.BoxGeometry(0.05, 0.05, d);
            ['left', 'right'].forEach(function(side, idx) {
                const rail = new THREE.Mesh(sideGeo, railMat);
                rail.position.set(idx === 0 ? -w/2 : w/2, railH, 0);
                group.add(rail);
            });
        }
        
        group.position.set(eq.posX / 1000, eq.posY / 1000, eq.posZ / 1000);
        group.userData = { tag: eq.tag, type: 'plataforma', isEquipment: true };
        
        return group;
    }
    
    // ============ GENERACIÓN DE COMPONENTES ============
    function createComponentSymbols(line) {
        if (!line.components || !line.components.length) return;
        
        const pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return;
        
        let lengths = [], totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            lengths.push(d);
            totalLen += d;
        }
        if (totalLen === 0) return;
        
        line.components.forEach(function(comp) {
            const param = comp.param || 0.5;
            const targetLen = totalLen * Math.min(1, Math.max(0, param));
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
            const position = {
                x: pA.x + (pB.x - pA.x) * t,
                y: pA.y + (pB.y - pA.y) * t,
                z: pA.z + (pB.z - pA.z) * t
            };
            
            const dirVec = new THREE.Vector3(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z).normalize();
            const size = (line.diameter || 4) * 0.06;
            const pos3D = new THREE.Vector3(position.x / 1000, position.y / 1000, position.z / 1000);
            
            let symbol = null;
            const type = (comp.type || '').toUpperCase();
            
            if (type.includes('VALVE') || type.includes('VALVULA')) {
                symbol = createValve3D(comp, pos3D, dirVec, size);
            } else if (type.includes('TEE')) {
                symbol = createTee3D(pos3D, dirVec, null, size);
            } else if (type.includes('REDUCER') || type.includes('REDUCTOR')) {
                symbol = createReducer3D(pos3D, dirVec, size);
            } else if (type.includes('ELBOW') || type.includes('CODO')) {
                symbol = createElbow3D(pos3D, dirVec, null, size, comp.angle || 90);
            } else if (type.includes('FLANGE') || type.includes('BRIDA')) {
                symbol = createFlange3D(pos3D, dirVec, size);
            } else if (type.includes('GAUGE') || type.includes('METER') || type.includes('SWITCH')) {
                symbol = createInstrument3D(pos3D, type, size);
            } else {
                const geo = new THREE.SphereGeometry(size * 0.4, 8, 8);
                symbol = new THREE.Mesh(geo, materials.valve.clone());
                symbol.position.copy(pos3D);
            }
            
            if (symbol) {
                symbol.userData = { tag: comp.tag || (line.tag + '_' + type), type: comp.type, lineTag: line.tag, isComponentSymbol: true };
                _symbolGroup.add(symbol);
            }
        });
    }
    
    function refreshAllSymbols() {
        if (!_core) return;
        
        while (_symbolGroup.children.length > 0) {
            const child = _symbolGroup.children[0];
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
            _symbolGroup.remove(child);
        }
        
        const db = _core.getDb();
        if (!db) return;
        
        (db.lines || []).forEach(function(line) {
            createComponentSymbols(line);
        });
        
        // Carga de plataformas desde equipos
        if (db.equipos) {
            db.equipos.forEach(function(eq) {
                if ((eq.tipo || '').toLowerCase().includes('plataforma')) {
                    const plat = createPlatform3D(eq);
                    if (_engine) _engine.registerVisualMesh(eq.tag, plat);
                    _symbolGroup.add(plat);
                }
            });
        }
    }
    
    // ============ COTAS ============
    function createDimensionLine(p1, p2, color) {
        color = color || 0xfacc15;
        const pos1 = new THREE.Vector3(p1.x / 1000, p1.y / 1000 + 0.3, p1.z / 1000);
        const pos2 = new THREE.Vector3(p2.x / 1000, p2.y / 1000 + 0.3, p2.z / 1000);
        
        const lineGeo = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
        const lineMat = new THREE.LineBasicMaterial({ color: color, linewidth: 1, transparent: true, opacity: 0.7 });
        const line = new THREE.Line(lineGeo, lineMat);
        line.userData = { isDimensionLine: true };
        _dimensionGroup.add(line);
        
        const tickSize = 0.15;
        const normal = new THREE.Vector3(0, -1, 0);
        const tickGeo1 = new THREE.BufferGeometry().setFromPoints([
            pos1, new THREE.Vector3().addVectors(pos1, normal.clone().multiplyScalar(tickSize))
        ]);
        const tickGeo2 = new THREE.BufferGeometry().setFromPoints([
            pos2, new THREE.Vector3().addVectors(pos2, normal.clone().multiplyScalar(tickSize))
        ]);
        const tick1 = new THREE.Line(tickGeo1, lineMat);
        const tick2 = new THREE.Line(tickGeo2, lineMat);
        tick1.userData = { isDimensionLine: true };
        tick2.userData = { isDimensionLine: true };
        _dimensionGroup.add(tick1);
        _dimensionGroup.add(tick2);
    }
    
    function refreshAllDimensions() {
        if (!_core) return;
        
        while (_dimensionGroup.children.length > 0) {
            const child = _dimensionGroup.children[0];
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
            _dimensionGroup.remove(child);
        }
        
        const db = _core.getDb();
        if (!db) return;
        
        (db.lines || []).forEach(function(line) {
            const pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
            if (pts.length >= 2) {
                for (let i = 0; i < pts.length - 1; i++) {
                    createDimensionLine(pts[i], pts[i + 1]);
                }
            }
        });
    }
    
    // ============ FLECHAS DE FLUJO ============
    function createFlowArrows(line) {
        const pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return;
        
        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i], p2 = pts[i + 1];
            const mid = {
                x: (p1.x + p2.x) / 2 / 1000,
                y: (p1.y + p2.y) / 2 / 1000,
                z: (p1.z + p2.z) / 2 / 1000
            };
            
            const dirVec = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize();
            
            const coneGeo = new THREE.ConeGeometry(0.08, 0.2, 8, 8);
            const cone = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ 
                color: 0x00f2ff, 
                emissive: 0x003344,
                metalness: 0.1,
                roughness: 0.4
            }));
            cone.position.set(mid.x, mid.y + 0.15, mid.z);
            
            const upVec = new THREE.Vector3(0, 1, 0);
            const quat = new THREE.Quaternion();
            quat.setFromUnitVectors(upVec, dirVec);
            cone.quaternion.copy(quat);
            
            cone.userData = { type: 'flowArrow', lineTag: line.tag, isFlowArrow: true };
            _flowArrowGroup.add(cone);
        }
    }
    
    function refreshAllFlowArrows() {
        if (!_core) return;
        
        while (_flowArrowGroup.children.length > 0) {
            const child = _flowArrowGroup.children[0];
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
            _flowArrowGroup.remove(child);
        }
        
        const db = _core.getDb();
        if (!db) return;
        
        (db.lines || []).forEach(function(line) {
            createFlowArrows(line);
        });
    }
    
    // ============ CÁMARA ============
    function focusOnObject(mesh) {
        if (!mesh || !_engine) return;
        const camera = _engine.getCamera();
        const controls = _engine.getControls();
        if (!camera || !controls) return;
        
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;
        
        const direction = new THREE.Vector3().subVectors(camera.position, center).normalize();
        _targetPos.copy(center).add(direction.multiplyScalar(cameraZ));
        _targetLookAt.copy(center);
        _isAnimating = true;
    }
    
    function fitCameraToEquipments() {
        if (!_engine) return;
        const scene = _engine.getScene();
        const camera = _engine.getCamera();
        const controls = _engine.getControls();
        if (!scene || !camera || !controls) return;
        
        const bounds = new THREE.Box3();
        let hasValidObject = false;
        
        scene.traverse(function(child) {
            if (child.isMesh && child.visible && child.geometry) {
                if (child.userData && (child.userData.isComponentSymbol || 
                    child.userData.isDimensionLine || 
                    child.userData.isFlowArrow ||
                    child.userData.isLabel ||
                    child.userData.isLabelAnchor ||
                    child.userData.isLineLabel ||
                    child.userData.isDimensionText)) {
                    return;
                }
                if (child instanceof THREE.GridHelper) return;
                if (child instanceof THREE.ArrowHelper) return;
                
                const box = new THREE.Box3().setFromObject(child);
                const size = box.getSize(new THREE.Vector3());
                
                if (size.x > 1000000 || size.y > 1000000 || size.z > 1000000) return;
                if (size.x < 0.01 && size.y < 0.01 && size.z < 0.01) return;
                
                bounds.expandByObject(child);
                hasValidObject = true;
            }
        });
        
        if (!hasValidObject) {
            camera.position.set(15, 10, 15);
            controls.target.set(0, 0, 0);
            controls.update();
            return;
        }
        
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const effectiveMaxDim = Math.max(maxDim, 5);
        const fov = camera.fov * (Math.PI / 180);
        let distance = Math.abs(effectiveMaxDim / 2 / Math.tan(fov / 2)) * 1.8;
        
        distance = Math.min(distance, 500);
        distance = Math.max(distance, 5);
        
        const angleRad = 45 * (Math.PI / 180);
        camera.position.set(
            center.x + distance * Math.sin(angleRad),
            center.y + distance * 0.6,
            center.z + distance * Math.cos(angleRad)
        );
        controls.target.copy(center);
        controls.update();
    }
    
    function setView(type) {
        if (!_engine) return;
        const camera = _engine.getCamera();
        const controls = _engine.getControls();
        if (!camera) return;
        const distance = 8;
        const target = new THREE.Vector3(0, 0, 0);
        switch(type) {
            case 'top': camera.position.set(0, distance, 0); break;
            case 'front': camera.position.set(0, 0, distance); break;
            case 'side': camera.position.set(distance, 0, 0); break;
            case 'iso': camera.position.set(distance, distance, distance); break;
            default: return;
        }
        camera.lookAt(target);
        if (controls) {
            controls.target.copy(target);
            controls.update();
        }
    }
    
    // ============ SELECCIÓN Y UI ============
    function updateSelectionHighlight() {
        const selected = _core.getSelected();
        
        if (_outlinePass) {
            if (selected && selected.obj) {
                const tag = selected.obj.tag;
                const mesh = _engine ? _engine.getVisualMesh(tag) : null;
                if (mesh) {
                    _outlinePass.selectedObjects = [mesh];
                    _currentHighlighted = mesh;
                    focusOnObject(mesh);
                } else {
                    _outlinePass.selectedObjects = [];
                    _currentHighlighted = null;
                }
            } else {
                _outlinePass.selectedObjects = [];
                _currentHighlighted = null;
            }
        } else {
            if (_currentHighlighted && _currentHighlighted.material && _currentHighlighted.material.emissive) {
                _currentHighlighted.material.emissiveIntensity = 0;
            }
            if (selected && selected.obj) {
                const tag = selected.obj.tag;
                const mesh = _engine ? _engine.getVisualMesh(tag) : null;
                if (mesh && mesh.material && mesh.material.emissive) {
                    mesh.material.emissiveIntensity = 0.5;
                    mesh.material.emissive = new THREE.Color(0x00f2ff);
                    _currentHighlighted = mesh;
                    focusOnObject(mesh);
                }
            } else {
                _currentHighlighted = null;
            }
        }
    }
    
    function createInfoPanel() {
        let panel = document.getElementById('selectionInfo3D');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'selectionInfo3D';
            panel.style.cssText = `
                position: fixed; bottom: 80px; right: 20px;
                background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(8px);
                border: 1px solid #00f2ff; border-radius: 8px;
                padding: 12px; font-family: 'Courier New', monospace;
                font-size: 12px; color: #e0e6ed; width: 280px;
                pointer-events: none; z-index: 1000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            `;
            document.body.appendChild(panel);
        }
        return panel;
    }
    
    function updateInfoPanel(selected) {
        if (!_infoPanel) _infoPanel = createInfoPanel();
        if (selected && selected.obj) {
            const obj = selected.obj;
            const posX = obj.posX || (obj.pos && obj.pos.x) || 0;
            const posY = obj.posY || (obj.pos && obj.pos.y) || 0;
            const posZ = obj.posZ || (obj.pos && obj.pos.z) || 0;
            _infoPanel.innerHTML = `
                <div style="color: #00f2ff; font-weight: bold; border-bottom: 1px solid #334155; margin-bottom: 8px; padding-bottom: 4px;">
                    📌 ${obj.tag}
                </div>
                <div><span style="color:#94a3b8;">TIPO:</span> ${selected.type.toUpperCase()}</div>
                <div><span style="color:#94a3b8;">MATERIAL:</span> ${obj.material || 'N/A'}</div>
                <div><span style="color:#94a3b8;">DIÁMETRO:</span> ${obj.diameter || obj.diametro || '-'}"</div>
                <div><span style="color:#94a3b8;">POSICIÓN:</span> X:${Math.round(posX)} Y:${Math.round(posY)} Z:${Math.round(posZ)}</div>
                ${obj.puertos ? '<div style="margin-top:6px;"><span style="color:#94a3b8;">PUERTOS:</span> ' + obj.puertos.map(function(p) { return p.id; }).join(', ') + '</div>' : ''}
            `;
        } else {
            _infoPanel.innerHTML = `
                <div style="color: #00f2ff; font-weight: bold;">🔍 SIN SELECCIÓN</div>
                <div style="color:#94a3b8;">Click en un elemento para seleccionarlo</div>
            `;
        }
    }
    
    function scheduleRefresh() {
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function() {
            refreshAllSymbols();
            refreshAllDimensions();
            refreshAllFlowArrows();
        }, 200);
    }
    
    function initUIBridge() {
        if (!_core) return;
        _infoPanel = createInfoPanel();
        
        if (typeof _core.on === 'function') {
            _core.on('modelChanged', function() {
                scheduleRefresh();
                const selected = _core.getSelected();
                updateInfoPanel(selected);
                updateSelectionHighlight();
            });
        }
        
        setInterval(function() {
            const selected = _core.getSelected();
            updateInfoPanel(selected);
            updateSelectionHighlight();
        }, 500);
    }
    
    // ============ INICIALIZACIÓN ============
    function init(coreInstance, engineInstance) {
        _core = coreInstance;
        _engine = engineInstance;
        
        if (!_engine) {
            console.error('SmartFlowRender: engineInstance es requerido');
            return;
        }
        
        const scene = _engine.getScene();
        const camera = _engine.getCamera();
        const renderer = _engine.getRenderer();
        
        if (!scene || !camera || !renderer) {
            console.error('SmartFlowRender: Engine no inicializado correctamente');
            return;
        }
        
        setupEffects(scene, camera, renderer);
        initUIBridge();
        
        _symbolGroup.userData = { isSymbolGroup: true };
        _dimensionGroup.userData = { isDimensionGroup: true };
        _flowArrowGroup.userData = { isFlowArrowGroup: true };
        scene.add(_symbolGroup);
        scene.add(_dimensionGroup);
        scene.add(_flowArrowGroup);
        
        if (typeof SmartFlowLabels3D !== 'undefined') {
            SmartFlowLabels3D.init(coreInstance, engineInstance);
            
            setTimeout(function() {
                SmartFlowLabels3D.refreshAllLabels();
                SmartFlowLabels3D.refreshAllDimensions();
            }, 800);
        }
        
        window.set3DView = function(type) {
            _engine.setView(type);
        };
        
        setTimeout(function() {
            refreshAllSymbols();
            refreshAllDimensions();
            refreshAllFlowArrows();
        }, 500);
        
        scheduleRefresh();
        
        console.log("✔ SmartFlowRender v7.4 listo (integrado con ThreeJsEngine v2.0 + Core v5.5)");
    }
    
    function setLabelRenderer(lr) {
        _labelRenderer = lr;
    }
    
    // ============ API PÚBLICA ============
    return {
        init: init,
        setView: setView,
        fitCameraToEquipments: fitCameraToEquipments,
        updateSelectionHighlight: updateSelectionHighlight,
        refreshAllSymbols: refreshAllSymbols,
        refreshAllDimensions: refreshAllDimensions,
        refreshAllFlowArrows: refreshAllFlowArrows,
        setLabelRenderer: setLabelRenderer,
        getComposer: function() { return _composer; },
        getOutlinePass: function() { return _outlinePass; }
    };
})();
