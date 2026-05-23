// ============================================================
// SMARTFLOW RENDER v9.3.0 - ESCALA MILIMÉTRICA UNIFICADA
// Archivo: js/render.js
// Estrategia: 1 unidad Three.js = 1 milímetro
// Optimizaciones: Materiales compartidos, valores proporcionales
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
    
    let _debounceTimer = null;
    let _totalObjects = 0;
    let _sceneRef = null;
    let _cameraRef = null;
    let _rendererRef = null;
    
    // ============ COLORES ============
    function getPipeColor(spec) {
        var s = (spec || '').toUpperCase();
        if (s.includes('PPR')) return 0x10b981;
        if (s.includes('HDPE') || s.includes('PE100')) return 0x22c55e;
        if (s.includes('PVC')) return 0xeab308;
        if (s.includes('SS_') || s.includes('INOX') || s.includes('SANITARY')) return 0xe2e8f0;
        if (s.includes('A3B')) return 0x64748b;
        if (s.includes('A1A') || s.includes('ACERO') || s.includes('CS_') || s.includes('SCH80')) return 0x94a3b8;
        if (s.includes('PTFE')) return 0xa78bfa;
        return 0x94a3b8;
    }
    
    function getEquipmentColor(tipo) {
        var t = (tipo || '').toLowerCase();
        if (t === 'tanque_v' || t === 'tanque_acero') return 0x3b82f6;
        if (t === 'tanque_h') return 0x2563eb;
        if (t === 'torre') return 0x6366f1;
        if (t === 'reactor') return 0x8b5cf6;
        if (t.includes('bomba')) return 0xf39c12;
        if (t === 'compresor') return 0xef4444;
        if (t === 'intercambiador' || t === 'caldera' || t === 'pasteurizador') return 0x06b6d4;
        if (t === 'separador') return 0x14b8a6;
        if (t === 'clarificador' || t === 'filtro_arena') return 0x0ea5e9;
        if (t === 'osmosis') return 0x06b6d4;
        if (t === 'homogeneizador') return 0xa855f7;
        if (t === 'plataforma') return 0x6b7280;
        if (t.includes('TEE')) return 0xd35400;
        return 0x475569;
    }
    
    function createMaterial(color, metalness, roughness) {
        return new THREE.MeshStandardMaterial({ color: color, metalness: metalness || 0.3, roughness: roughness || 0.5 });
    }
    
    // ═══════════════════════════════════════
    // MATERIALES COMPARTIDOS (sin clonar)
    // ═══════════════════════════════════════
    const matSupport = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.25 });
    const matStem = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.2 });
    const matWheel = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.3 });
    const matBlack = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.6 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.5, roughness: 0.1 });
    const matRed = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 });
    const matGreen = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4 });
    const matBrass = new THREE.MeshStandardMaterial({ color: 0xd4a800, metalness: 0.8, roughness: 0.2 });
    
    // ============ ORIENTACIÓN ESTABLE ============
    function orientComponent(group, dirVec) {
        if (!dirVec || dirVec.lengthSq() < 0.001) return;
        var targetMatrix = new THREE.Matrix4();
        var upVec = Math.abs(dirVec.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        targetMatrix.lookAt(new THREE.Vector3(0, 0, 0), dirVec.clone().normalize(), upVec);
        group.quaternion.setFromRotationMatrix(targetMatrix);
        group.rotateY(Math.PI / 2);
    }
    
    // ============ EFECTOS ============
    function setupEffects(scene, camera, renderer) {
        if (!scene || !camera || !renderer) return;
        if (typeof THREE.EffectComposer !== 'undefined') {
            _composer = new THREE.EffectComposer(renderer);
            _composer.addPass(new THREE.RenderPass(scene, camera));
            if (typeof THREE.OutlinePass !== 'undefined') {
                _outlinePass = new THREE.OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
                _outlinePass.edgeStrength = 3; _outlinePass.edgeGlow = 0.6; _outlinePass.edgeThickness = 1.5;
                _outlinePass.pulsePeriod = 2;
                _outlinePass.visibleEdgeColor.setHex(0x00f2ff); _outlinePass.hiddenEdgeColor.setHex(0x1e293b);
                _composer.addPass(_outlinePass);
            }
        }
    }
    
    // ============ LIMPIEZA ULTRA SEGURA GPU ============
    function deepDisposeGroup(group) {
        if (!group) return;
        group.traverse(function(node) {
            if (!node) return;
            if (node.geometry) { 
                try { node.geometry.dispose(); } catch(e) {} 
                node.geometry = null; 
            }
            if (node.material) {
                try {
                    if (Array.isArray(node.material)) {
                        node.material.forEach(function(m) { 
                            if (m.map) { m.map.dispose(); m.map = null; } 
                            m.dispose(); 
                        });
                    } else {
                        if (node.material.map) { node.material.map.dispose(); node.material.map = null; }
                        node.material.dispose();
                    }
                } catch(e) {}
                node.material = null;
            }
        });
        while (group.children.length > 0) {
            var child = group.children[group.children.length - 1];
            group.remove(child);
        }
    }
    
    // ============ EQUIPOS (DATOS EN mm DESDE CORE) ============
    function createTankVertical(eq) {
        var color = getEquipmentColor(eq.tipo), mat = createMaterial(color, 0.4, 0.35), matRing = createMaterial(color, 0.6, 0.3);
        var r = (eq.diametro || 3000) / 2;
        var h = eq.altura || 6000;
        var group = new THREE.Group();
        var body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), mat);
        body.position.y = h/2; body.castShadow = true; body.receiveShadow = true;
        group.add(body);
        var dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI*2, 0, Math.PI/3), mat);
        dome.position.y = h; dome.castShadow = true;
        group.add(dome);
        // Anillos proporcionales: espesor = 1% del radio, separación = 0.5% del radio
        for (var y = h*0.2; y < h; y += h*0.25) {
            var ring = new THREE.Mesh(new THREE.TorusGeometry(r*1.01, r*0.01, 8, 32), matRing);
            ring.position.y = y; ring.rotation.x = Math.PI/2;
            group.add(ring);
        }
        group.position.set(eq.posX||0, eq.posY||0, eq.posZ||0);
        group.userData = { tag: eq.tag, tipo: 'equipo' };
        return group;
    }
    
    function createTankHorizontal(eq) {
        var color = getEquipmentColor(eq.tipo), mat = createMaterial(color, 0.4, 0.35);
        var r = (eq.diametro||3000)/2, l = eq.largo||6000, group = new THREE.Group();
        var body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 32), mat);
        body.rotation.z = Math.PI/2; body.position.set(l/2, r, 0);
        body.castShadow = true; body.receiveShadow = true;
        group.add(body);
        var capGeo = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI*2, 0, Math.PI/2);
        var cap1 = new THREE.Mesh(capGeo, mat); cap1.position.set(0, r, 0); cap1.rotation.z = -Math.PI/2;
        group.add(cap1);
        var cap2 = new THREE.Mesh(capGeo, mat); cap2.position.set(l, r, 0); cap2.rotation.z = Math.PI/2;
        group.add(cap2);
        var legGeo = new THREE.BoxGeometry(r*0.3, r*1.5, r*0.5);
        for (var i=0; i<2; i++) { 
            var leg = new THREE.Mesh(legGeo, matSupport); 
            leg.position.set(l*0.25+i*l*0.5, -r*0.5, 0); 
            group.add(leg); 
        }
        group.position.set(eq.posX||0, eq.posY||0, eq.posZ||0);
        group.userData = { tag: eq.tag, tipo: 'equipo' };
        return group;
    }
    
    function createBomba(eq) {
        var color = getEquipmentColor(eq.tipo), mat = createMaterial(color, 0.5, 0.3);
        var s = eq.diametro||800, group = new THREE.Group();
        // Base de soporte
        group.add(new THREE.Mesh(new THREE.BoxGeometry(s*1.2, s*0.1, s*0.8), matSupport));
        // Carcasa/Voluta
        var casing = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.45, s*0.7, 16), mat);
        casing.position.set(0, s*0.4, 0); casing.castShadow = true;
        group.add(casing);
        // Motor eléctrico
        var motor = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*0.6, 16), 
            new THREE.MeshStandardMaterial({ color:0x666666, metalness:0.6, roughness:0.3 }));
        motor.position.set(s*0.5, s*0.5, 0); motor.castShadow = true;
        group.add(motor);
        // Brida de succión (entrada)
        var sucFlange = new THREE.Mesh(new THREE.CylinderGeometry(s*0.15, s*0.15, s*0.2, 16), matBrass);
        sucFlange.position.set(-s*0.6, s*0.4, 0); sucFlange.rotation.z = Math.PI/2;
        group.add(sucFlange);
        // Brida de descarga (salida)
        var disFlange = new THREE.Mesh(new THREE.CylinderGeometry(s*0.12, s*0.12, s*0.2, 16), matBrass);
        disFlange.position.set(s*0.6, s*0.6, 0); disFlange.rotation.z = Math.PI/2;
        group.add(disFlange);
        
        group.position.set(eq.posX||0, eq.posY||0, eq.posZ||0);
        group.userData = { tag: eq.tag, tipo: 'equipo' };
        return group;
    }
    
    function createCompresor(eq) {
        var color = getEquipmentColor(eq.tipo), mat = createMaterial(color, 0.5, 0.3);
        var s = eq.diametro||1000, group = new THREE.Group();
        var body = new THREE.Mesh(new THREE.BoxGeometry(s*1.2, s*0.9, s*0.7), mat);
        body.position.y = s*0.45; body.castShadow = true;
        group.add(body);
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.35, s*0.5, 16), matSupport)).position.set(0, s*0.9, 0);
        group.position.set(eq.posX||0, eq.posY||0, eq.posZ||0);
        group.userData = { tag: eq.tag, tipo: 'equipo' };
        return group;
    }
    
    function createExchanger(eq) {
        var color = getEquipmentColor(eq.tipo), mat = createMaterial(color, 0.5, 0.3);
        var l = eq.largo||4000, r = (eq.diametro||800)/2, group = new THREE.Group();
        var shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 24), mat);
        shell.rotation.z = Math.PI/2; shell.position.set(l/2, r*1.5, 0); shell.castShadow = true;
        group.add(shell);
        group.position.set(eq.posX||0, eq.posY||0, eq.posZ||0);
        group.userData = { tag: eq.tag, tipo: 'equipo' };
        return group;
    }
    
    function createBoxEquip(eq) {
        var color = getEquipmentColor(eq.tipo), mat = createMaterial(color, 0.3, 0.5);
        var xl = eq.largo||eq.diametro||800, yh = eq.altura||800, zw = eq.ancho||eq.diametro||800, group = new THREE.Group();
        var body = new THREE.Mesh(new THREE.BoxGeometry(xl, yh, zw), mat);
        body.position.y = yh/2; body.castShadow = true; body.receiveShadow = true;
        group.add(body);
        group.position.set(eq.posX||0, eq.posY||0, eq.posZ||0);
        group.userData = { tag: eq.tag, tipo: 'equipo' };
        return group;
    }
    
    function createEquipmentMesh(eq) {
        if (!eq || !eq.tipo) return null;
        var tipo = (eq.tipo||'').toLowerCase();
        if (tipo==='tanque_v'||tipo==='tanque_acero') return createTankVertical(eq);
        if (tipo==='tanque_h') return createTankHorizontal(eq);
        if (tipo==='torre'||tipo==='reactor') return createTankVertical(eq);
        if (tipo.includes('bomba')) return createBomba(eq);
        if (tipo==='compresor') return createCompresor(eq);
        if (tipo==='intercambiador'||tipo==='caldera'||tipo==='pasteurizador') return createExchanger(eq);
        if (tipo==='separador') return createTankHorizontal(eq);
        if (tipo==='clarificador'||tipo==='filtro_arena') return createTankVertical(eq);
        if (tipo==='osmosis'||tipo==='homogeneizador') return createBoxEquip(eq);
        if (tipo==='plataforma') return createBoxEquip(eq);
        return createBoxEquip(eq);
    }
    
    // ============ TUBERÍAS (DIÁMETRO EN PULGADAS → mm) ============
    function createPipeMesh(line) {
        var pts = _core.getLinePoints(line) || line._cachedPoints || line.points3D || [];
        if (pts.length < 2) return null;
        var color = getPipeColor(line.spec || line.material);
        var radius = ((line.diameter||4)*25.4)/2;
        var isPPR = (line.spec||line.material||'').toUpperCase().includes('PPR');
        var vector3Points = pts.map(function(p){ return new THREE.Vector3(p.x, p.y, p.z); });
        var curve = new THREE.CatmullRomCurve3(vector3Points, false, 'catmullrom', 0);
        var segments = Math.min(Math.max(vector3Points.length*4, 32), 256);
        var pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 12, false),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.05, roughness: 0.5 }));
        pipe.castShadow = true; pipe.receiveShadow = true;
        pipe.userData = { tag: line.tag, tipo: 'linea' };
        if (_engine) _engine.registerVisualMesh(line.tag, pipe);
        if (isPPR) {
            var totalLength = curve.getLength(), spacing = 1500, numRings = Math.floor(totalLength/spacing);
            for (var i=1; i<numRings; i++) {
                var t = i*spacing/totalLength, pt = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
                var ring = new THREE.Mesh(new THREE.TorusGeometry(radius*1.25, radius*0.2, 8, 16),
                    new THREE.MeshStandardMaterial({ color:0x064e3b, metalness:0.1, roughness:0.4, emissive:0x022c1a, emissiveIntensity:0.3 }));
                ring.position.copy(pt);
                var q = new THREE.Quaternion(); q.setFromUnitVectors(new THREE.Vector3(0,0,1), tangent);
                ring.quaternion.copy(q); ring.userData = { isFusionRing: true };
            }
        }
        return pipe;
    }
    
    // ═══════════════════════════════════════════════════════
    // COMPONENTES (FITTINGS) - size en mm (radio del tubo)
    // Valores proporcionales corregidos para escala milimétrica
    // ═══════════════════════════════════════════════════════
    function createFitting(comp, pos3D, dirVec, size, compType, spec) {
        var type = (compType || comp.type || '').toUpperCase();
        // size = radio del tubo en mm. Default: 50mm (tubo 4")
        var s = size || 50;
        var color = getPipeColor(spec);
        var mat = new THREE.MeshStandardMaterial({ color:color, metalness:0.3, roughness:0.4 });
        var matDark = new THREE.MeshStandardMaterial({ color:color, metalness:0.5, roughness:0.25 });
        var group = new THREE.Group();
        
        // ═══ CODOS ═══
        if (type.includes('ELBOW_90')||type.includes('CODO_90')) {
            var c90 = new THREE.EllipseCurve(0, 0, s*1.5, s*1.5, 0, Math.PI/2, false, 0);
            var p90 = c90.getPoints(24);
            group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p90.map(function(p){return new THREE.Vector3(p.x,p.y,0);})), 24, s*0.4, 8, false), mat));
        }
        else if (type.includes('ELBOW_45')||type.includes('CODO_45')) {
            var c45 = new THREE.EllipseCurve(0, 0, s*1.5, s*1.5, 0, Math.PI/4, false, 0);
            var p45 = c45.getPoints(16);
            group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p45.map(function(p){return new THREE.Vector3(p.x,p.y,0);})), 16, s*0.4, 8, false), mat));
        }
        // ═══ TEEs ═══
        else if (type.includes('TEE_EQUAL')||type.includes('TEE_RECTA')) {
            var main = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*2.5, 16), mat); 
            main.rotation.z = Math.PI/2; group.add(main);
            var branch = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*1.2, 16), mat); 
            branch.position.y = s*0.7; group.add(branch);
            var collar = new THREE.Mesh(new THREE.TorusGeometry(s*0.45, s*0.08, 8, 16), matDark); 
            collar.position.y = s*0.1; collar.rotation.x = Math.PI/2; group.add(collar);
        }
        else if (type.includes('TEE_REDUCING')) {
            var trm = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*2.5, 16), mat); 
            trm.rotation.z = Math.PI/2; group.add(trm);
            var trb = new THREE.Mesh(new THREE.CylinderGeometry(s*0.25, s*0.25, s*1.2, 16), mat); 
            trb.position.y = s*0.7; group.add(trb);
        }
        // ═══ CRUZ ═══
        else if (type.includes('CROSS')) {
            var cm = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*2.5, 16), mat); 
            cm.rotation.z = Math.PI/2; group.add(cm);
            var cb1 = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*1.2, 16), mat); 
            cb1.position.y = s*0.7; group.add(cb1);
            var cb2 = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*1.2, 16), mat); 
            cb2.position.y = -s*0.7; group.add(cb2);
        }
        // ═══ REDUCTORES ═══
        else if (type.includes('CONCENTRIC_REDUCER')||type.includes('REDUCTOR_CONCENTRICO')) {
            group.add(new THREE.Mesh(new THREE.CylinderGeometry(s*0.5, s*0.3, s*1.8, 16), mat));
        }
        else if (type.includes('ECCENTRIC_REDUCER')) {
            var re = new THREE.Mesh(new THREE.CylinderGeometry(s*0.5, s*0.3, s*1.8, 16), mat); 
            re.position.y = -s*0.25; group.add(re);
        }
        // ═══ PASAMUROS ═══
        else if (type.includes('BULKHEAD')||type.includes('PASAMUROS')) {
            var bh = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*1.2, 16), mat); 
            bh.rotation.z = Math.PI/2; group.add(bh);
            var bfg = new THREE.CylinderGeometry(s*0.55, s*0.55, s*0.12, 32);
            var bf1 = new THREE.Mesh(bfg, matDark); bf1.rotation.z = Math.PI/2; bf1.position.x = -s*0.6; group.add(bf1);
            var bf2 = new THREE.Mesh(bfg, matDark); bf2.rotation.z = Math.PI/2; bf2.position.x = s*0.6; group.add(bf2);
            var gask = new THREE.Mesh(new THREE.TorusGeometry(s*0.45, s*0.04, 8, 16), matGreen); 
            gask.position.x = -s*0.65; gask.rotation.y = Math.PI/2; group.add(gask);
        }
        // ═══ BRIDAS ═══
        else if (type.includes('FLANGE')||type.includes('BRIDA')) {
            var fb = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*0.3, 16), mat); 
            fb.rotation.z = Math.PI/2; group.add(fb);
            var fd = new THREE.Mesh(new THREE.CylinderGeometry(s*0.6, s*0.6, s*0.1, 32), matDark); 
            fd.rotation.z = Math.PI/2; fd.position.x = s*0.2; group.add(fd);
            for (var h = 0; h < Math.PI*2; h += Math.PI/3) {
                var hole = new THREE.Mesh(new THREE.CylinderGeometry(s*0.04, s*0.04, s*0.12, 8), matBlack);
                hole.rotation.z = Math.PI/2; 
                hole.position.set(s*0.2, Math.cos(h)*s*0.45, Math.sin(h)*s*0.45); 
                group.add(hole);
            }
        }
        // ═══ STUB END ═══
        else if (type.includes('STUB_END')||type.includes('PORTABRIDA')) {
            var se = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.45, s*0.5, 16), mat); 
            se.rotation.z = Math.PI/2; group.add(se);
            var sef = new THREE.Mesh(new THREE.CylinderGeometry(s*0.55, s*0.55, s*0.1, 32), matDark); 
            sef.rotation.z = Math.PI/2; sef.position.x = s*0.3; group.add(sef);
        }
        // ═══ TAPÓN ═══
        else if (type.includes('CAP')||type.includes('TAPON')) {
            group.add(new THREE.Mesh(new THREE.SphereGeometry(s*0.45, 16, 8, 0, Math.PI*2, 0, Math.PI/2), mat));
        }
        // ═══ UNIÓN ═══
        else if (type.includes('UNION')) {
            var ub = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*0.7, 16), mat); 
            ub.rotation.z = Math.PI/2; group.add(ub);
            var un = new THREE.Mesh(new THREE.CylinderGeometry(s*0.45, s*0.45, s*0.15, 6), matDark); 
            un.rotation.z = Math.PI/2; un.position.x = s*0.4; group.add(un);
        }
        // ═══ NIPPLE ═══
        else if (type.includes('NIPPLE')||type.includes('NIPLE')) {
            group.add(new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*1.5, 16), mat));
        }
        // ═══ ADAPTADOR ═══
        else if (type.includes('TRANSITION')||type.includes('ADAPTADOR')) {
            var trGeo = new THREE.CylinderGeometry(s*0.4, s*0.5, s*1.0, 16);
            group.add(new THREE.Mesh(trGeo, mat));
            var trNut = new THREE.Mesh(new THREE.CylinderGeometry(s*0.5, s*0.5, s*0.15, 6), matDark);
            trNut.rotation.z = Math.PI/2; trNut.position.x = s*0.5; group.add(trNut);
        }
        // ═══ JUNTA DE EXPANSIÓN ═══
        else if (type.includes('EXPANSION_JOINT')||type.includes('JUNTA_EXPANSION')) {
            var ej = new THREE.Mesh(new THREE.CylinderGeometry(s*0.45, s*0.45, s*1.2, 16), mat); 
            ej.rotation.z = Math.PI/2; group.add(ej);
            for (var b = 0; b < 3; b++) {
                var bellows = new THREE.Mesh(new THREE.TorusGeometry(s*0.5, s*0.05, 8, 16), matDark);
                bellows.position.x = -s*0.4 + b*s*0.4; bellows.rotation.y = Math.PI/2; group.add(bellows);
            }
        }
        // ═══ FILTRO ═══
        else if (type.includes('STRAINER')||type.includes('FILTRO')) {
            var strainerType = type.includes('Y_') ? 'Y' : (type.includes('T_') ? 'T' : 'BASKET');
            var stBody = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*1.5, 16), mat);
            stBody.rotation.z = Math.PI/2; group.add(stBody);
            if (strainerType === 'Y') {
                var yLeg = new THREE.Mesh(new THREE.CylinderGeometry(s*0.25, s*0.25, s*1.0, 8), mat);
                yLeg.position.set(0, -s*0.7, 0); yLeg.rotation.x = Math.PI/4; group.add(yLeg);
            }
            var stCap = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*0.2, 16), matDark);
            stCap.position.set(0, -s*1.0, 0); group.add(stCap);
        }
        // ═══ TRAMPA DE VAPOR ═══
        else if (type.includes('STEAM_TRAP')||type.includes('TRAMPA')) {
            var trap = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*0.9, 16), mat); 
            trap.rotation.z = Math.PI/2; group.add(trap);
            var trapTop = new THREE.Mesh(new THREE.CylinderGeometry(s*0.25, s*0.3, s*0.3, 16), matDark); 
            trapTop.position.y = s*0.5; group.add(trapTop);
        }
        // ═══ CAMLOCK ═══
        else if (type.includes('CAMLOCK')||type.includes('CAM-LOCK')) {
            var cl = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*0.6, 16), mat); 
            cl.rotation.z = Math.PI/2; group.add(cl);
            for (var a = 0; a < Math.PI*2; a += Math.PI) {
                var arm = new THREE.Mesh(new THREE.BoxGeometry(s*0.08, s*0.3, s*0.05), matDark);
                arm.position.set(Math.cos(a)*s*0.4, Math.sin(a)*s*0.4, 0); group.add(arm);
            }
        }
        // ═══ CONEXIÓN RÁPIDA ═══
        else if (type.includes('QUICK_CONNECT')||type.includes('CONEXION_RAPIDA')) {
            var qc = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*0.5, 16), matBrass); 
            qc.rotation.z = Math.PI/2; group.add(qc);
            var qcRing = new THREE.Mesh(new THREE.TorusGeometry(s*0.4, s*0.04, 8, 16), matDark); 
            qcRing.rotation.y = Math.PI/2; group.add(qcRing);
        }
        // ═══ MANGUERA ═══
        else if (type.includes('HOSE')||type.includes('MANGUERA')) {
            var hoseColor = type.includes('PTFE') ? 0xa78bfa : (type.includes('METALLIC') ? 0x94a3b8 : 0x22c55e);
            var hoseMat = new THREE.MeshStandardMaterial({ color:hoseColor, metalness:0.1, roughness:0.7 });
            group.add(new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*1.5, 16), hoseMat));
            for (var r = 0; r < 4; r++) {
                var rib = new THREE.Mesh(new THREE.TorusGeometry(s*0.38, s*0.03, 8, 16), matDark);
                rib.position.x = -s*0.6 + r*s*0.4; rib.rotation.y = Math.PI/2; group.add(rib);
            }
        }
        // ═══ SILENCIADOR ═══
        else if (type.includes('SILENCER')||type.includes('SILENCIADOR')) {
            var sil = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.5, s*1.5, 16), mat); group.add(sil);
            var silCap1 = new THREE.Mesh(new THREE.CylinderGeometry(s*0.5, s*0.5, s*0.1, 16), matDark); 
            silCap1.position.y = s*0.8; group.add(silCap1);
            var silCap2 = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*0.1, 16), matDark); 
            silCap2.position.y = -s*0.8; group.add(silCap2);
        }
        // ═══ ARRESTADOR DE LLAMA ═══
        else if (type.includes('FLAME_ARRESTER')||type.includes('ARRESTADOR')) {
            var fa = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*0.9, 16),
                new THREE.MeshStandardMaterial({ color:0xef4444, metalness:0.5, roughness:0.3 })); 
            fa.rotation.z = Math.PI/2; group.add(fa);
            var faGrid = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*0.05, 32), matBlack); group.add(faGrid);
        }
        // ═══ ROMPEDOR DE VACÍO ═══
        else if (type.includes('VACUUM_BREAKER')||type.includes('ROMPEDOR')) {
            var vb = new THREE.Mesh(new THREE.CylinderGeometry(s*0.2, s*0.3, s*0.7, 16),
                new THREE.MeshStandardMaterial({ color:0x0ea5e9, metalness:0.5, roughness:0.3 })); group.add(vb);
            var vbCap = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*0.1, 16), matDark); 
            vbCap.position.y = s*0.4; group.add(vbCap);
        }
        // ═══ ENFRIADOR DE MUESTRA ═══
        else if (type.includes('SAMPLE_COOLER')||type.includes('ENFRIADOR')) {
            var sc = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*1.0, 16), mat); 
            sc.rotation.z = Math.PI/2; group.add(sc);
            var scJacket = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*0.8, 16),
                new THREE.MeshStandardMaterial({ color:0x94a3b8, transparent:true, opacity:0.4 })); 
            scJacket.rotation.z = Math.PI/2; group.add(scJacket);
        }
        // ═══ SOPORTES ═══
        else if (type.includes('PIPE_SHOE')||type.includes('ZAPATA')) {
            group.add(new THREE.Mesh(new THREE.BoxGeometry(s*0.6, s*0.3, s*0.6), matSupport));
        }
        else if (type.includes('U_BOLT')||type.includes('U-BOLT')) {
            var ubGeo = new THREE.TorusGeometry(s*0.4, s*0.05, 8, 8, Math.PI);
            group.add(new THREE.Mesh(ubGeo, matSupport));
            var ubPlate = new THREE.Mesh(new THREE.BoxGeometry(s*0.8, s*0.04, s*0.1), matSupport); 
            ubPlate.position.y = -s*0.4; group.add(ubPlate);
        }
        else if (type.includes('GUIDE')||type.includes('GUIA')) {
            group.add(new THREE.Mesh(new THREE.BoxGeometry(s*0.3, s*0.6, s*0.3), matSupport));
        }
        else if (type.includes('ANCHOR')||type.includes('ANCLAJE')) {
            var anchorGeo = new THREE.BoxGeometry(s*0.5, s*0.5, s*0.5);
            group.add(new THREE.Mesh(anchorGeo, new THREE.MeshStandardMaterial({ color:0xdc2626, metalness:0.7, roughness:0.25 })));
        }
        else if (type.includes('HANGER')||type.includes('COLGADOR')||type.includes('SPRING')) {
            var hangerRod = new THREE.Mesh(new THREE.CylinderGeometry(s*0.05, s*0.05, s*1.5, 8), matSupport); 
            group.add(hangerRod);
            if (type.includes('SPRING')) {
                var springGeo = new THREE.TorusGeometry(s*0.2, s*0.04, 8, 16);
                for (var sp = 0; sp < 3; sp++) { 
                    var spring = new THREE.Mesh(springGeo, matSupport); 
                    spring.position.y = sp*s*0.2; group.add(spring); 
                }
            }
        }
        else if (type.includes('PIPE_CLAMP')||type.includes('ABRAZADERA')) {
            var clampGeo = new THREE.TorusGeometry(s*0.45, s*0.05, 8, 16);
            group.add(new THREE.Mesh(clampGeo, matSupport));
        }
        // ═══ DEFAULT ═══
        else {
            group.add(new THREE.Mesh(new THREE.SphereGeometry(s*0.35, 8, 8), mat));
        }
        
        group.position.copy(pos3D);
        orientComponent(group, dirVec);
        group.userData = { tag: comp.tag, type: comp.type, isComponent: true };
        return group;
    }
    
    // ═══════════════════════════════════════════════════════
    // VÁLVULAS E INSTRUMENTOS - size en mm (radio del tubo)
    // Valores proporcionales corregidos para escala milimétrica
    // ═══════════════════════════════════════════════════════
    function createValve(comp, pos3D, dirVec, size, compType, spec) {
        var type = (compType || comp.type || '').toUpperCase();
        // size = radio del tubo en mm. Default: 50mm (tubo 4")
        var s = size || 50;
        var color = getPipeColor(spec);
        var mat = new THREE.MeshStandardMaterial({ color:color, metalness:0.5, roughness:0.3 });
        var matDark = new THREE.MeshStandardMaterial({ color:color, metalness:0.6, roughness:0.25 });
        var group = new THREE.Group();
        
        // ═══ VÁLVULA COMPUERTA ═══
        if (type.includes('GATE_VALVE')||type.includes('COMPUERTA')) {
            var body = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*1.4, 16), mat); 
            body.rotation.z = Math.PI/2; group.add(body);
            var bonnet = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.35, s*0.5, 16), matDark); 
            bonnet.position.y = s*0.55; group.add(bonnet);
            var stem = new THREE.Mesh(new THREE.CylinderGeometry(s*0.05, s*0.05, s*1.2, 8), matStem); 
            stem.position.y = s*1.1; group.add(stem);
            var wheel = new THREE.Mesh(new THREE.TorusGeometry(s*0.4, s*0.06, 8, 24), matWheel); 
            wheel.position.y = s*1.7; wheel.rotation.x = Math.PI/2; group.add(wheel);
            for (var a = 0; a < Math.PI*2; a += Math.PI/3) { 
                var spoke = new THREE.Mesh(new THREE.CylinderGeometry(s*0.03, s*0.03, s*0.35, 6), matWheel); 
                spoke.position.set(Math.cos(a)*s*0.35, s*1.7, Math.sin(a)*s*0.35); 
                spoke.rotation.z = Math.PI/2; group.add(spoke); 
            }
        }
        // ═══ VÁLVULA GLOBO ═══
        else if (type.includes('GLOBE_VALVE')) {
            var gBody = new THREE.Mesh(new THREE.SphereGeometry(s*0.45, 16, 16), mat); 
            gBody.scale.set(1, 1.2, 1); group.add(gBody);
            var gBonnet = new THREE.Mesh(new THREE.CylinderGeometry(s*0.25, s*0.35, s*0.5, 16), matDark); 
            gBonnet.position.y = s*0.7; group.add(gBonnet);
            var gStem = new THREE.Mesh(new THREE.CylinderGeometry(s*0.04, s*0.04, s*0.9, 8), matStem); 
            gStem.position.y = s*1.15; group.add(gStem);
            var gWheel = new THREE.Mesh(new THREE.TorusGeometry(s*0.3, s*0.05, 8, 24), matWheel); 
            gWheel.position.y = s*1.6; gWheel.rotation.x = Math.PI/2; group.add(gWheel);
        }
        // ═══ VÁLVULA BOLA ═══
        else if (type.includes('BALL_VALVE')||type.includes('BOLA')) {
            var bBody = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*1.0, 16), matDark); 
            bBody.rotation.z = Math.PI/2; group.add(bBody);
            var bBall = new THREE.Mesh(new THREE.SphereGeometry(s*0.3, 16, 16), 
                new THREE.MeshStandardMaterial({color:0xe0e0e0, metalness:0.9, roughness:0.1})); 
            group.add(bBall);
            var lever = new THREE.Mesh(new THREE.CylinderGeometry(s*0.04, s*0.04, s*1.0, 8), matDark); 
            lever.position.y = s*0.6; group.add(lever);
            var handle = new THREE.Mesh(new THREE.SphereGeometry(s*0.09, 8, 8), matRed); 
            handle.position.y = s*1.1; group.add(handle);
        }
        // ═══ VÁLVULA MARIPOSA ═══
        else if (type.includes('BUTTERFLY_VALVE')||type.includes('MARIPOSA')) {
            var mBody = new THREE.Mesh(new THREE.CylinderGeometry(s*0.4, s*0.4, s*0.3, 16), mat); 
            mBody.rotation.z = Math.PI/2; group.add(mBody);
            var disc = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*0.04, 16), matDark); 
            disc.rotation.z = Math.PI/2; group.add(disc);
            var mStem = new THREE.Mesh(new THREE.CylinderGeometry(s*0.04, s*0.04, s*0.7, 8), matStem); 
            mStem.position.y = s*0.4; group.add(mStem);
            var mHandle = new THREE.Mesh(new THREE.BoxGeometry(s*0.6, s*0.04, s*0.06), matDark); 
            mHandle.position.y = s*0.75; group.add(mHandle);
        }
        // ═══ VÁLVULA RETENCIÓN ═══
        else if (type.includes('CHECK_VALVE')||type.includes('RETENCION')) {
            var cBody = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*1.2, 16), mat); 
            cBody.rotation.z = Math.PI/2; group.add(cBody);
            var arrow = new THREE.Mesh(new THREE.ConeGeometry(s*0.12, s*0.35, 8), 
                new THREE.MeshStandardMaterial({color:0x22c55e, emissive:0x0a3d0a, emissiveIntensity:0.5})); 
            arrow.position.x = s*0.3; arrow.rotation.z = -Math.PI/2; group.add(arrow);
        }
        // ═══ VÁLVULA DIAFRAGMA ═══
        else if (type.includes('DIAPHRAGM_VALVE')||type.includes('DIAFRAGMA')) {
            var dBody = new THREE.Mesh(new THREE.BoxGeometry(s*1.0, s*0.6, s*0.8), mat); group.add(dBody);
            var dBonnet = new THREE.Mesh(new THREE.CylinderGeometry(s*0.25, s*0.35, s*0.5, 16), matDark); 
            dBonnet.position.y = s*0.5; group.add(dBonnet);
            var dWheel = new THREE.Mesh(new THREE.TorusGeometry(s*0.3, s*0.04, 8, 16), matWheel); 
            dWheel.position.y = s*0.85; dWheel.rotation.x = Math.PI/2; group.add(dWheel);
        }
        // ═══ VÁLVULA CONTROL ═══
        else if (type.includes('CONTROL_VALVE')) {
            var cvBody = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.45, s*1.2, 16), mat); 
            cvBody.rotation.z = Math.PI/2; group.add(cvBody);
            var actuator = new THREE.Mesh(new THREE.BoxGeometry(s*0.5, s*0.7, s*0.5), 
                new THREE.MeshStandardMaterial({color:0x3b82f6, metalness:0.3, roughness:0.4})); 
            actuator.position.y = s*0.7; group.add(actuator);
        }
        // ═══ VÁLVULA SEGURIDAD ═══
        else if (type.includes('RELIEF')||type.includes('SAFETY')||type.includes('ALIVIO')||type.includes('SEGURIDAD')) {
            var rBody = new THREE.Mesh(new THREE.CylinderGeometry(s*0.25, s*0.35, s*0.8, 16), 
                new THREE.MeshStandardMaterial({color:0xef4444, metalness:0.5, roughness:0.3})); group.add(rBody);
            var rCap = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*0.2, 16), matDark); 
            rCap.position.y = s*0.5; group.add(rCap);
        }
        // ═══ VÁLVULA PURGA ═══
        else if (type.includes('DRAIN_VALVE')||type.includes('PURGA')) {
            var dv = new THREE.Mesh(new THREE.CylinderGeometry(s*0.2, s*0.2, s*0.6, 16), mat); 
            dv.rotation.z = Math.PI/2; group.add(dv);
            var dvHandle = new THREE.Mesh(new THREE.BoxGeometry(s*0.3, s*0.04, s*0.04), matDark); 
            dvHandle.position.y = s*0.35; group.add(dvHandle);
        }
        // ═══ VÁLVULA LIBERACIÓN AIRE ═══
        else if (type.includes('AIR_RELEASE')||type.includes('LIBERACION')) {
            var ar = new THREE.Mesh(new THREE.CylinderGeometry(s*0.15, s*0.2, s*0.5, 16), mat); group.add(ar);
            var arVent = new THREE.Mesh(new THREE.CylinderGeometry(s*0.05, s*0.05, s*0.2, 8), matBlack); 
            arVent.position.y = s*0.3; group.add(arVent);
        }
        // ═══ VÁLVULA MUESTREO ═══
        else if (type.includes('SAMPLE_VALVE')||type.includes('MUESTREO')) {
            var sv = new THREE.Mesh(new THREE.CylinderGeometry(s*0.2, s*0.2, s*0.5, 16), mat); 
            sv.rotation.z = Math.PI/2; group.add(sv);
            var svPort = new THREE.Mesh(new THREE.CylinderGeometry(s*0.08, s*0.08, s*0.3, 8), matDark); 
            svPort.position.y = s*0.3; group.add(svPort);
            var svKnob = new THREE.Mesh(new THREE.SphereGeometry(s*0.08, 6, 6), matRed); 
            svKnob.position.y = s*0.5; group.add(svKnob);
        }
        // ═══ MANÓMETRO ═══
        else if (type.includes('PRESSURE_GAUGE')||type.includes('MANOMETRO')) {
            var pgBody = new THREE.Mesh(new THREE.CylinderGeometry(s*0.3, s*0.3, s*0.15, 32),
                new THREE.MeshStandardMaterial({color:0x333333, metalness:0.6, roughness:0.2})); group.add(pgBody);
            var pgDial = new THREE.Mesh(new THREE.CylinderGeometry(s*0.28, s*0.28, s*0.02, 32),
                new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.1})); 
            pgDial.position.z = s*0.09; group.add(pgDial);
            var pgNeedle = new THREE.Mesh(new THREE.BoxGeometry(s*0.01, s*0.15, s*0.01), matRed); 
            pgNeedle.position.z = s*0.1; group.add(pgNeedle);
        }
        // ═══ TERMÓMETRO ═══
        else if (type.includes('TEMPERATURE_GAUGE')||type.includes('TERMOMETRO')) {
            var tgStem = new THREE.Mesh(new THREE.CylinderGeometry(s*0.04, s*0.04, s*1.0, 8), matStem); group.add(tgStem);
            var tgDial = new THREE.Mesh(new THREE.CylinderGeometry(s*0.2, s*0.2, s*0.1, 16),
                new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.1})); 
            tgDial.position.y = s*0.5; group.add(tgDial);
        }
        // ═══ CAUDALÍMETRO ═══
        else if (type.includes('FLOW_METER')||type.includes('CAUDALIMETRO')) {
            var fm = new THREE.Mesh(new THREE.CylinderGeometry(s*0.35, s*0.35, s*0.8, 16), mat); 
            fm.rotation.z = Math.PI/2; group.add(fm);
            var fmDisplay = new THREE.Mesh(new THREE.BoxGeometry(s*0.3, s*0.4, s*0.05),
                new THREE.MeshStandardMaterial({color:0x1e293b, roughness:0.2})); 
            fmDisplay.position.y = s*0.5; group.add(fmDisplay);
        }
        // ═══ TRANSMISOR ═══
        else if (type.includes('TRANSMITTER')) {
            var tx = new THREE.Mesh(new THREE.BoxGeometry(s*0.4, s*0.5, s*0.3),
                new THREE.MeshStandardMaterial({color:0x6366f1, metalness:0.3, roughness:0.4})); group.add(tx);
            var txAntenna = new THREE.Mesh(new THREE.CylinderGeometry(s*0.03, s*0.03, s*0.3, 8), matBlack); 
            txAntenna.position.y = s*0.4; group.add(txAntenna);
        }
        // ═══ ROTÁMETRO ═══
        else if (type.includes('ROTAMETER')||type.includes('ROTAMETRO')) {
            var roTube = new THREE.Mesh(new THREE.CylinderGeometry(s*0.12, s*0.15, s*1.2, 16), matGlass); group.add(roTube);
            var roFrame = new THREE.Mesh(new THREE.CylinderGeometry(s*0.16, s*0.16, s*1.2, 8),
                new THREE.MeshStandardMaterial({color:0x666666, metalness:0.6, roughness:0.3})); group.add(roFrame);
        }
        // ═══ VISOR ═══
        else if (type.includes('SIGHT_GLASS')||type.includes('VISOR')) {
            var sg = new THREE.Mesh(new THREE.CylinderGeometry(s*0.2, s*0.2, s*0.5, 16), matGlass); 
            sg.rotation.z = Math.PI/2; group.add(sg);
            var sgFrame1 = new THREE.Mesh(new THREE.TorusGeometry(s*0.22, s*0.03, 8, 16), matSupport); 
            sgFrame1.position.x = -s*0.25; sgFrame1.rotation.y = Math.PI/2; group.add(sgFrame1);
            var sgFrame2 = new THREE.Mesh(new THREE.TorusGeometry(s*0.22, s*0.03, 8, 16), matSupport); 
            sgFrame2.position.x = s*0.25; sgFrame2.rotation.y = Math.PI/2; group.add(sgFrame2);
        }
        // ═══ SWITCH DE NIVEL ═══
        else if (type.includes('LEVEL_SWITCH')||type.includes('SWITCH_RANA')) {
            var ls = new THREE.Mesh(new THREE.BoxGeometry(s*0.35, s*0.25, s*0.25),
                new THREE.MeshStandardMaterial({color:0xf59e0b, metalness:0.3, roughness:0.4})); group.add(ls);
            var lsRod = new THREE.Mesh(new THREE.CylinderGeometry(s*0.04, s*0.04, s*0.6, 8), matStem); 
            lsRod.position.y = s*0.4; group.add(lsRod);
        }
        // ═══ DEFAULT ═══
        else {
            group.add(new THREE.Mesh(new THREE.SphereGeometry(s*0.35, 8, 8), mat));
        }
        
        group.position.copy(pos3D);
        orientComponent(group, dirVec);
        group.userData = { tag: comp.tag, type: comp.type, isComponent: true };
        return group;
    }
    
    function isFitting(type) {
        var t = (type||'').toUpperCase();
        return t.includes('ELBOW')||t.includes('CODO')||t.includes('TEE')||t.includes('CROSS')||
               t.includes('REDUCER')||t.includes('REDUCTOR')||t.includes('FLANGE')||t.includes('BRIDA')||
               t.includes('BULKHEAD')||t.includes('PASAMUROS')||t.includes('CAP')||t.includes('TAPON')||
               t.includes('UNION')||t.includes('NIPPLE')||t.includes('NIPLE')||t.includes('STUB_END')||
               t.includes('PORTABRIDA')||t.includes('TRANSITION')||t.includes('ADAPTADOR')||
               t.includes('EXPANSION')||t.includes('STRAINER')||t.includes('FILTRO')||
               t.includes('STEAM_TRAP')||t.includes('TRAMPA')||t.includes('CAMLOCK')||
               t.includes('QUICK_CONNECT')||t.includes('HOSE')||t.includes('MANGUERA')||
               t.includes('SILENCER')||t.includes('SILENCIADOR')||t.includes('FLAME_ARRESTER')||
               t.includes('ARRESTADOR')||t.includes('VACUUM_BREAKER')||t.includes('ROMPEDOR')||
               t.includes('SAMPLE_COOLER')||t.includes('ENFRIADOR')||
               t.includes('PIPE_SHOE')||t.includes('ZAPATA')||t.includes('U_BOLT')||
               t.includes('GUIDE')||t.includes('GUIA')||t.includes('ANCHOR')||t.includes('ANCLAJE')||
               t.includes('HANGER')||t.includes('COLGADOR')||t.includes('SPRING')||
               t.includes('PIPE_CLAMP')||t.includes('ABRAZADERA');
    }
    
    // ============ REFRESCO ============
    function refreshAllSymbols() {
        if (!_core) return;
        deepDisposeGroup(_symbolGroup);
        var db = _core.getDb(); if (!db) return;
        _totalObjects = 0;
        
        var equipos = db.equipos || [];
        for (var i=0; i<equipos.length; i++) {
            if (equipos[i].tag && equipos[i].tag.toString().startsWith('TEE-')) continue;
            var mesh = createEquipmentMesh(equipos[i]);
            if (mesh) { if (_engine) _engine.registerVisualMesh(equipos[i].tag, mesh); _symbolGroup.add(mesh); _totalObjects++; }
        }
        
        var lines = db.lines || [];
        for (var j=0; j<lines.length; j++) {
            var line = lines[j];
            var pipe = createPipeMesh(line);
            if (pipe) { _symbolGroup.add(pipe); _totalObjects++; }
            if (line.components && line.components.length) {
                var pts = _core.getLinePoints(line)||line._cachedPoints||line.points3D||[];
                if (pts.length >= 2) {
                    var lengths=[], totalLen=0;
                    for (var k=0; k<pts.length-1; k++) { 
                        var d=Math.hypot(pts[k+1].x-pts[k].x,pts[k+1].y-pts[k].y,pts[k+1].z-pts[k].z); 
                        lengths.push(d); totalLen+=d; 
                    }
                    line.components.forEach(function(comp){
                        var param=comp.param||0.5, targetLen=totalLen*Math.min(1,Math.max(0,param)), accum=0, segIdx=0, t=0;
                        for (var m=0; m<lengths.length; m++) { 
                            if (accum+lengths[m]>=targetLen||m===lengths.length-1){ 
                                segIdx=m; t=(targetLen-accum)/(lengths[m]||1); break; 
                            } 
                            accum+=lengths[m]; 
                        }
                        var pA=pts[segIdx], pB=pts[segIdx+1];
                        var pos3D=new THREE.Vector3(pA.x+(pB.x-pA.x)*t, pA.y+(pB.y-pA.y)*t, pA.z+(pB.z-pA.z)*t);
                        var dirVec=new THREE.Vector3(pB.x-pA.x, pB.y-pA.y, pB.z-pA.z).normalize();
                        var size=(line.diameter||4)*25.4*0.5, spec=line.spec||line.material||'ACERO';
                        var symbol = isFitting(comp.type) ? 
                            createFitting(comp, pos3D, dirVec, size, comp.type, spec) : 
                            createValve(comp, pos3D, dirVec, size, comp.type, spec);
                        if (symbol) { _symbolGroup.add(symbol); _totalObjects++; }
                    });
                }
            }
        }
        if (_outlinePass) _outlinePass.enabled = _totalObjects <= 30;
    }
    
    function refreshAllDimensions() {
        if (!_core) return;
        deepDisposeGroup(_dimensionGroup);
        (_core.getDb().lines||[]).forEach(function(line){
            var pts=_core.getLinePoints(line)||[];
            if (pts.length>=2) for (var i=0; i<pts.length-1; i++)
                _dimensionGroup.add(new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(pts[i].x, pts[i].y+500, pts[i].z),
                        new THREE.Vector3(pts[i+1].x, pts[i+1].y+500, pts[i+1].z)
                    ]),
                    new THREE.LineBasicMaterial({color:0xfacc15, transparent:true, opacity:0.6})
                ));
        });
    }
    
    function refreshAllFlowArrows() {
        if (!_core) return;
        deepDisposeGroup(_flowArrowGroup);
        (_core.getDb().lines||[]).forEach(function(line){
            var pts=_core.getLinePoints(line)||[];
            if (pts.length<2) return;
            var pipeDiameter = (line.diameter || 4) * 25.4;
            var arrowRadius = pipeDiameter * 0.4;
            var arrowLength = pipeDiameter * 1.2;
            for (var i=0; i<pts.length-1; i++){
                var mid=new THREE.Vector3(
                    (pts[i].x+pts[i+1].x)/2,
                    (pts[i].y+pts[i+1].y)/2 + pipeDiameter * 0.8,
                    (pts[i].z+pts[i+1].z)/2
                );
                var dir=new THREE.Vector3(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y, pts[i+1].z-pts[i].z).normalize();
                var cone=new THREE.Mesh(
                    new THREE.ConeGeometry(arrowRadius, arrowLength, 12, 1),
                    new THREE.MeshStandardMaterial({color:0x00f2ff, emissive:0x003344})
                );
                cone.position.copy(mid); 
                var q=new THREE.Quaternion(); 
                q.setFromUnitVectors(new THREE.Vector3(0,1,0), dir); 
                cone.quaternion.copy(q);
                _flowArrowGroup.add(cone);
            }
        });
    }
    
    function fitCameraToEquipments() {
        if (!_engine) return;
        var scene=_engine.getScene(), camera=_engine.getCamera(), controls=_engine.getControls();
        if (!scene||!camera||!controls) return;
        var bounds=new THREE.Box3(), has=false;
        scene.traverse(function(c){ 
            if (c.isMesh&&c.visible&&c.geometry&&!(c instanceof THREE.GridHelper||c instanceof THREE.ArrowHelper)){ 
                bounds.expandByObject(c); has=true; 
            }
        });
        if (!has){ 
            camera.position.set(15000, 10000, 15000); 
            controls.target.set(0,0,0); 
            controls.update(); 
            return; 
        }
        var center=bounds.getCenter(new THREE.Vector3()), size=bounds.getSize(new THREE.Vector3());
        var maxDim=Math.max(size.x, size.y, size.z, 1000), dist=Math.min(maxDim*1.8, 500000);
        camera.position.set(center.x+dist*0.7, center.y+dist*0.55, center.z+dist*0.7);
        controls.target.copy(center); controls.update();
    }
    
    function updateSelectionHighlight() {
        var sel=_core?_core.getSelected():null;
        if (_outlinePass&&_outlinePass.enabled) 
            _outlinePass.selectedObjects=(sel&&sel.obj&&_engine)?[_engine.getVisualMesh(sel.obj.tag)].filter(Boolean):[];
    }
    
    function scheduleRefresh() {
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer=setTimeout(function(){ 
            refreshAllSymbols(); 
            refreshAllDimensions(); 
            refreshAllFlowArrows(); 
        }, 200);
    }
    
    function renderFrame() {
        if (!_rendererRef||!_sceneRef||!_cameraRef) return;
        if (_composer&&_outlinePass&&_outlinePass.enabled) _composer.render();
        else _rendererRef.render(_sceneRef, _cameraRef);
        if (_labelRenderer&&_sceneRef&&_cameraRef) _labelRenderer.render(_sceneRef, _cameraRef);
    }
    
    function init(coreInstance, engineInstance) {
        _core=coreInstance; _engine=engineInstance;
        if (!_engine){ console.error('SmartFlowRender: engineInstance requerido'); return; }
        _sceneRef=_engine.getScene(); _cameraRef=_engine.getCamera(); _rendererRef=_engine.getRenderer();
        if (!_sceneRef||!_cameraRef||!_rendererRef){ console.error('SmartFlowRender: Engine no inicializado'); return; }
        setupEffects(_sceneRef, _cameraRef, _rendererRef);
        _symbolGroup.userData={isSymbolGroup:true}; 
        _dimensionGroup.userData={isDimensionGroup:true}; 
        _flowArrowGroup.userData={isFlowArrowGroup:true};
        _sceneRef.add(_symbolGroup); 
        _sceneRef.add(_dimensionGroup); 
        _sceneRef.add(_flowArrowGroup);
        if (typeof SmartFlowLabels3D!=='undefined'){ 
            SmartFlowLabels3D.init(coreInstance, engineInstance); 
            setTimeout(function(){ 
                SmartFlowLabels3D.refreshAllLabels(); 
                SmartFlowLabels3D.refreshAllDimensions(); 
            }, 800); 
        }
        if (typeof _core.on==='function') _core.on('modelChanged', function(){ scheduleRefresh(); });
        window.set3DView=function(type){ _engine.setView(type); };
        scheduleRefresh();
        console.log("✔ SmartFlowRender v9.3.0 - ESCALA MILIMÉTRICA UNIFICADA");
    }
    
    return {
        init, fitCameraToEquipments, refreshAllSymbols, refreshAllDimensions, refreshAllFlowArrows,
        updateSelectionHighlight, renderFrame,
        getComposer:function(){return _composer;}, 
        getOutlinePass:function(){return _outlinePass;},
        setLabelRenderer:function(lr){_labelRenderer=lr;}
    };
})();
