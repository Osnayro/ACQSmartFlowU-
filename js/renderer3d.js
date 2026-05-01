
// ============================================================
// MÓDULO: SMARTFLOW RENDERER 3D (Three.js Volumétrico)
// Archivo: js/renderer3d.js
// ============================================================

const SmartFlowRenderer3D = (function() {
    
    // Dependencias
    let _core = null;
    let _catalog = null;
    let _notifyUI = (msg, isErr) => console.log(msg);
    
    // Elementos Three.js
    let _scene = null;
    let _camera = null;
    let _renderer = null;
    let _controls = null;
    let _container = null;
    let _animationId = null;
    
    // Diccionarios para acceder rápidamente a los meshes
    let _equipmentMeshes = {};
    let _lineMeshes = {};
    let _componentMeshes = {};
    
    // Colores por material (para tuberías)
    const materialColors = {
        'PPR': 0x7c3aed,
        'ACERO AL CARBONO': 0x94a3b8,
        'ACERO INOXIDABLE 316L': 0xe2e8f0,
        'HDPE': 0x22c55e,
        'PVC': 0xeab308,
        'PP_EPDM': 0x8b5cf6,
        'ACERO GALVANIZADO': 0x94a3b8,
        'PTFE': 0xa78bfa,
        'EPDM': 0xf59e0b
    };
    
    // Configuración de tubería
    const PIPE_CONFIG = {
        segments: 12,
        defaultRadiusMM: 50,
        elbowRadiusFactor: 1.5
    };
    
    // ==================== 1. INICIALIZACIÓN DE ESCENA ====================
    function initScene(containerElement) {
        if (!containerElement) {
            console.error("Renderer3D: No se proporcionó contenedor");
            return false;
        }
        
        _container = containerElement;
        
        // Crear escena
        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0x0a0e17);
        _scene.fog = new THREE.Fog(0x0a0e17, 50000, 150000);
        
        // Cámara
        const aspect = _container.clientWidth / _container.clientHeight;
        _camera = new THREE.PerspectiveCamera(45, aspect, 100, 200000);
        _camera.position.set(15000, 12000, 15000);
        _camera.lookAt(0, 0, 0);
        
        // Renderer
        _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        _renderer.setSize(_container.clientWidth, _container.clientHeight);
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.shadowMap.enabled = true;
        _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        _renderer.toneMapping = THREE.ACESFilmicToneMapping;
        _renderer.toneMappingExposure = 1.2;
        _container.appendChild(_renderer.domElement);
        
        // Luces
        const ambientLight = new THREE.AmbientLight(0x404060, 1.5);
        _scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(20000, 30000, 15000);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 100;
        dirLight.shadow.camera.far = 100000;
        dirLight.shadow.camera.left = -30000;
        dirLight.shadow.camera.right = 30000;
        dirLight.shadow.camera.top = 30000;
        dirLight.shadow.camera.bottom = -30000;
        _scene.add(dirLight);
        
        const hemiLight = new THREE.HemisphereLight(0x00f2ff, 0x0a0e17, 0.8);
        _scene.add(hemiLight);
        
        // Controles de órbita
        _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
        _controls.enableDamping = true;
        _controls.dampingFactor = 0.08;
        _controls.minDistance = 2000;
        _controls.maxDistance = 80000;
        _controls.maxPolarAngle = Math.PI * 0.55;
        _controls.target.set(0, 0, 0);
        
        // Rejilla de piso
        const gridHelper = new THREE.GridHelper(40000, 40, 0x1e293b, 0x0f172a);
        _scene.add(gridHelper);
        
        // Ejes de referencia
        const axesHelper = new THREE.AxesHelper(5000);
        _scene.add(axesHelper);
        
        // Evento de resize
        window.addEventListener('resize', onWindowResize);
        
        // Iniciar bucle de renderizado
        animate();
        
        console.log("✅ Renderer 3D inicializado correctamente");
        return true;
    }
    
    function onWindowResize() {
        if (!_camera || !_renderer || !_container) return;
        _camera.aspect = _container.clientWidth / _container.clientHeight;
        _camera.updateProjectionMatrix();
        _renderer.setSize(_container.clientWidth, _container.clientHeight);
    }
    
    function animate() {
        _animationId = requestAnimationFrame(animate);
        if (_controls) _controls.update();
        if (_renderer && _scene && _camera) {
            _renderer.render(_scene, _camera);
        }
    }
    
    // ==================== 2. CREACIÓN DE TUBERÍAS VOLUMÉTRICAS ====================
    function createLineMesh(lineData) {
        const points = lineData._cachedPoints || lineData.points || lineData.points3D;
        if (!points || points.length < 2) {
            console.warn("Renderer3D: línea sin puntos suficientes", lineData.tag);
            return new THREE.Group();
        }
        
        const group = new THREE.Group();
        group.name = lineData.tag;
        group.userData = { tag: lineData.tag, type: 'line', diameter: lineData.diameter, material: lineData.material };
        
        // Determinar radio del tubo
        const diamMM = (parseFloat(lineData.diameter) || 4) * 25.4;
        const radius = Math.max(5, diamMM / 2);
        
        // Determinar color
        const materialName = (lineData.material || 'PPR').toUpperCase();
        let color = 0x71717a;
        for (const [key, val] of Object.entries(materialColors)) {
            if (materialName.includes(key)) { color = val; break; }
        }
        if (lineData.spec && _catalog && _catalog.getSpec) {
            const spec = _catalog.getSpec(lineData.spec);
            if (spec && spec.color) {
                color = parseInt(spec.color.replace('#', ''), 16);
            }
        }
        
        // Crear curva y geometría de tubo
        const vectors = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const curve = new THREE.CatmullRomCurve3(vectors);
        curve.curveType = 'catmullrom';
        curve.tension = 0;
        curve.closed = false;
        
        const tubularSegments = Math.max(32, vectors.length * 8);
        const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, PIPE_CONFIG.segments, false);
        
        const material = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.6,
            roughness: 0.4,
            emissive: 0x000000
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        
        // Si la línea tiene componentes, crear sus meshes
        if (lineData.components && lineData.components.length > 0) {
            createComponentMeshes(group, lineData, points, radius);
        }
        
        // Guardar referencia
        if (_lineMeshes[lineData.tag]) {
            _scene.remove(_lineMeshes[lineData.tag]);
        }
        _lineMeshes[lineData.tag] = group;
        _scene.add(group);
        
        return group;
    }
    
    function createComponentMeshes(parentGroup, lineData, linePoints, pipeRadius) {
        if (!linePoints || linePoints.length < 2) return;
        
        // Calcular longitud total de la línea
        let lengths = [];
        let totalLen = 0;
        for (let i = 0; i < linePoints.length - 1; i++) {
            const d = new THREE.Vector3(linePoints[i].x, linePoints[i].y, linePoints[i].z)
                       .distanceTo(new THREE.Vector3(linePoints[i+1].x, linePoints[i+1].y, linePoints[i+1].z));
            lengths.push(d);
            totalLen += d;
        }
        if (totalLen === 0) return;
        
        lineData.components.forEach(comp => {
            const param = comp.param || 0.5;
            const targetLen = totalLen * param;
            let accum = 0, segIdx = 0;
            for (let i = 0; i < lengths.length; i++) {
                if (accum + lengths[i] >= targetLen || i === lengths.length - 1) {
                    segIdx = i; break;
                }
                accum += lengths[i];
            }
            
            // Crear un pequeño mesh indicador (caja de color)
            const a = new THREE.Vector3(linePoints[segIdx].x, linePoints[segIdx].y, linePoints[segIdx].z);
            const b = new THREE.Vector3(linePoints[segIdx+1].x, linePoints[segIdx+1].y, linePoints[segIdx+1].z);
            const direction = new THREE.Vector3().subVectors(b, a).normalize();
            const midPoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
            
            const compRadius = pipeRadius * 1.8;
            const geom = new THREE.CylinderGeometry(compRadius, compRadius, pipeRadius * 2, 16);
            const mat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.3, roughness: 0.5 });
            const indicator = new THREE.Mesh(geom, mat);
            indicator.position.copy(midPoint);
            
            // Orientar perpendicular a la dirección del tubo
            const quat = new THREE.Quaternion();
            quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            indicator.setRotationFromQuaternion(quat);
            
            indicator.userData = { componentTag: comp.tag, type: comp.type };
            parentGroup.add(indicator);
            
            if (comp.tag) {
                _componentMeshes[comp.tag] = indicator;
            }
        });
    }

    // ==================== 3. CREACIÓN DE EQUIPOS VOLUMÉTRICOS ====================
    function createEquipmentMesh(eq) {
        const group = new THREE.Group();
        group.name = eq.tag;
        group.userData = { tag: eq.tag, type: 'equipment', tipo: eq.tipo };

        const pos = new THREE.Vector3(eq.posX, eq.posY, eq.posZ);
        group.position.copy(pos);

        // Según el tipo de equipo, crear forma básica
        switch (eq.tipo) {
            case 'tanque_v':
            case 'torre':
            case 'reactor':
                const radius = (eq.diametro || 1000) / 2;
                const height = eq.altura || 1500;
                const cylGeom = new THREE.CylinderGeometry(radius, radius, height, 32);
                const cylMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.4, roughness: 0.5 });
                const cylinder = new THREE.Mesh(cylGeom, cylMat);
                cylinder.castShadow = true;
                cylinder.receiveShadow = true;
                group.add(cylinder);
                break;

            case 'bomba':
            case 'bomba_dosificacion':
                const pumpGeom = new THREE.CylinderGeometry(400, 400, 800, 16);
                const pumpMat = new THREE.MeshStandardMaterial({ color: 0xf39c12, metalness: 0.6, roughness: 0.3 });
                const pump = new THREE.Mesh(pumpGeom, pumpMat);
                pump.castShadow = true;
                pump.receiveShadow = true;
                group.add(pump);
                break;

            case 'colector':
                const length = eq.largo || 3000;
                const collGeom = new THREE.BoxGeometry(length, 100, 100);
                const collMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.5, roughness: 0.4 });
                const collector = new THREE.Mesh(collGeom, collMat);
                collector.position.x = length / 2;
                collector.castShadow = true;
                collector.receiveShadow = true;
                group.add(collector);
                break;

            case 'tanque_h':
                const hLength = eq.largo || 4000;
                const hRadius = (eq.diametro || 2000) / 2;
                const hGeom = new THREE.CylinderGeometry(hRadius, hRadius, hLength, 32);
                const hMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.4, roughness: 0.5 });
                const hCylinder = new THREE.Mesh(hGeom, hMat);
                hCylinder.rotation.z = Math.PI / 2;
                hCylinder.castShadow = true;
                hCylinder.receiveShadow = true;
                group.add(hCylinder);
                break;

            default:
                const boxGeom = new THREE.BoxGeometry(1000, 1000, 1000);
                const boxMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.4 });
                const box = new THREE.Mesh(boxGeom, boxMat);
                box.castShadow = true;
                box.receiveShadow = true;
                group.add(box);
        }

        // Crear indicadores de puertos
        if (eq.puertos) {
            eq.puertos.forEach(nz => {
                const portPos = {
                    x: (nz.relX || nz.relPos?.x || 0),
                    y: (nz.relY || nz.relPos?.y || 0),
                    z: (nz.relZ || nz.relPos?.z || 0)
                };
                const sphereGeom = new THREE.SphereGeometry(80, 16, 16);
                const portColor = nz.connectedLine ? 0x4ade80 : 0xff8800;
                const sphereMat = new THREE.MeshStandardMaterial({ color: portColor, emissive: portColor, emissiveIntensity: 0.3 });
                const sphere = new THREE.Mesh(sphereGeom, sphereMat);
                sphere.position.set(portPos.x, portPos.y, portPos.z);
                sphere.userData = { portId: nz.id, diameter: nz.diametro };
                group.add(sphere);
            });
        }

        // Si ya existe un mesh para este equipo, eliminarlo antes de agregar el nuevo
        if (_equipmentMeshes[eq.tag]) {
            _scene.remove(_equipmentMeshes[eq.tag]);
        }
        _equipmentMeshes[eq.tag] = group;
        _scene.add(group);

        return group;
    }

    // ==================== 4. ACTUALIZACIÓN DE LÍNEAS Y EQUIPOS ====================
    function updateLineMesh(lineTag) {
        const line = _core ? _core.getDb().lines.find(l => l.tag === lineTag) : null;
        if (!line) return;

        // Remover el viejo grupo
        if (_lineMeshes[lineTag]) {
            _scene.remove(_lineMeshes[lineTag]);
            delete _lineMeshes[lineTag];
        }

        // Crear nuevo
        createLineMesh(line);
    }

    function updateEquipmentMesh(equipTag) {
        const eq = _core ? _core.getDb().equipos.find(e => e.tag === equipTag) : null;
        if (!eq) return;

        if (_equipmentMeshes[equipTag]) {
            _scene.remove(_equipmentMeshes[equipTag]);
            delete _equipmentMeshes[equipTag];
        }

        createEquipmentMesh(eq);
    }

    // ==================== 5. SINCRONIZACIÓN COMPLETA ====================
    function syncAllFromCore() {
        if (!_core) return;
        const db = _core.getDb();

        // Limpiar escena de objetos previos
        Object.values(_equipmentMeshes).forEach(mesh => _scene.remove(mesh));
        Object.values(_lineMeshes).forEach(mesh => _scene.remove(mesh));
        _equipmentMeshes = {};
        _lineMeshes = {};
        _componentMeshes = {};

        // Reconstruir equipos
        (db.equipos || []).forEach(eq => createEquipmentMesh(eq));

        // Reconstruir líneas
        (db.lines || []).forEach(line => createLineMesh(line));
    }

    // ==================== 6. SELECCIÓN DE ELEMENTOS ====================
    function selectElement(tag) {
        // Resaltar el elemento (cambiar emisión o contorno)
        // Por simplicidad, hacemos un cambio de material temporal
        for (const [key, meshGroup] of Object.entries(_equipmentMeshes)) {
            if (key === tag) {
                meshGroup.children.forEach(child => {
                    if (child.material && child.material.emissive) {
                        child.userData.oldEmissive = child.material.emissive.getHex();
                        child.material.emissive = new THREE.Color(0xfacc15);
                        child.material.emissiveIntensity = 0.8;
                    }
                });
            } else {
                meshGroup.children.forEach(child => {
                    if (child.material && child.material.emissive && child.userData.oldEmissive) {
                        child.material.emissive = new THREE.Color(child.userData.oldEmissive);
                        child.material.emissiveIntensity = 0.3;
                        delete child.userData.oldEmissive;
                    }
                });
            }
        }

        for (const [key, meshGroup] of Object.entries(_lineMeshes)) {
            if (key === tag) {
                meshGroup.children.forEach(child => {
                    if (child.material && child.material.emissive) {
                        child.userData.oldEmissive = child.material.emissive.getHex();
                        child.material.emissive = new THREE.Color(0xfacc15);
                        child.material.emissiveIntensity = 0.8;
                    }
                });
            } else {
                meshGroup.children.forEach(child => {
                    if (child.material && child.material.emissive && child.userData.oldEmissive) {
                        child.material.emissive = new THREE.Color(child.userData.oldEmissive);
                        child.material.emissiveIntensity = 0.3;
                        delete child.userData.oldEmissive;
                    }
                });
            }
        }
    }

    // ==================== 7. AUTO‑CENTER ====================
    function autoCenter() {
        if (!_core) return;
        const db = _core.getDb();
        const allMeshes = [...Object.values(_equipmentMeshes), ...Object.values(_lineMeshes)];
        
        if (allMeshes.length === 0) {
            _camera.position.set(15000, 12000, 15000);
            _controls.target.set(0, 0, 0);
            _controls.update();
            return;
        }

        // Calcular bounding box de toda la escena
        const box = new THREE.Box3();
        allMeshes.forEach(mesh => box.expandByObject(mesh));
        
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // Calcular distancia de cámara para que quepa todo
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = _camera.fov * (Math.PI / 180);
        const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;
        
        _camera.position.set(center.x + dist * 0.7, center.y + dist * 0.6, center.z + dist * 0.7);
        _controls.target.copy(center);
        _controls.update();
        
        _notifyUI("Vista centrada correctamente.", false);
    }

    // ==================== 8. PAN / ZOOM ====================
    function pan(dx, dy) {
        // Con OrbitControls ya tenemos pan con el botón derecho
        // Pero podemos implementar un pan programático si se necesita
    }

    function zoom(delta) {
        if (_camera && _controls) {
            _camera.position.multiplyScalar(delta > 0 ? 1.1 : 0.9);
            _camera.position.clampLength(2000, 80000);
            _controls.update();
        }
    }

    // ==================== 9. EXPORTAR A PDF (vista 3D) ====================
    function exportPDF() {
        // Capturar canvas del renderer y usar jspdf (similar a la versión anterior)
        if (!_renderer) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        const imgData = _renderer.domElement.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 10, 10, 277, 150);
        doc.setFontSize(16);
        doc.text("SmartEngp - Reporte Isométrico 3D", 10, 175);
        doc.text(`Fecha: ${new Date().toLocaleString()}`, 10, 185);
        doc.save(`${window.currentProjectName || 'Proyecto'}_Isometrico3D_${Date.now()}.pdf`);
        _notifyUI("PDF generado correctamente.", false);
    }

    // ==================== 10. INICIALIZACIÓN ====================
    function init(containerElement, coreInstance, catalogInstance, notifyFn) {
        _core = coreInstance;
        _catalog = catalogInstance;
        if (notifyFn) _notifyUI = notifyFn;
        
        if (!initScene(containerElement)) {
            console.error("No se pudo inicializar la escena 3D");
            return false;
        }
        
        // Sincronizar con los datos del core
        if (_core) {
            syncAllFromCore();
        }
        
        return true;
    }

    // ==================== API PÚBLICA ====================
    return {
        init,
        createLineMesh,
        createEquipmentMesh,
        updateLineMesh,
        updateEquipmentMesh,
        syncAllFromCore,
        selectElement,
        autoCenter,
        pan,
        zoom,
        exportPDF,
        getScene: () => _scene,
        getCamera: () => _camera,
        getRenderer: () => _renderer,
        getControls: () => _controls
    };
})();

