
// ============================================================
// SMARTFLOW RENDER v7.0 (3D PostFX + Zoom suave + Vistas)
// Archivo: js/render.js
// ============================================================

const SmartFlowRender = (function() {
    let _core = null;
    let _composer = null;
    let _outlinePass = null;
    let _currentHighlighted = null;
    
    // Animación suave de cámara
    let _isAnimating = false;
    let _targetPos = new THREE.Vector3();
    let _targetLookAt = new THREE.Vector3();
    const _transitionSpeed = 0.08;
    
    // ==================== 1. CONFIGURACIÓN DE POST-PROCESADO ====================
    function setupEffects() {
        const scene = _core.getScene();
        const camera = _core.getCamera();
        const renderer = _core.getRenderer();
        if (!scene || !camera || !renderer) {
            console.warn("Render: Core no expone escena/cámara/renderer");
            return;
        }
        
        if (typeof THREE.EffectComposer !== 'undefined' && 
            typeof THREE.RenderPass !== 'undefined' && 
            typeof THREE.OutlinePass !== 'undefined') {
            
            _composer = new THREE.EffectComposer(renderer);
            const renderPass = new THREE.RenderPass(scene, camera);
            _composer.addPass(renderPass);
            
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
            
            console.log("✔ Efectos de post-procesado (Outline) configurados");
        } else {
            console.warn("Render: EffectComposer no disponible, usando render básico");
        }
    }
    
    // ==================== 2. ZOOM A OBJETO (FOCUS) ====================
    function focusOnObject(mesh) {
        if (!mesh || !_core.getControls()) return;
        const camera = _core.getCamera();
        const controls = _core.getControls();
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
    
    // ==================== 3. AJUSTAR CÁMARA A TODOS LOS EQUIPOS ====================
    function fitCameraToEquipments() {
        const scene = _core.getScene();
        const camera = _core.getCamera();
        const controls = _core.getControls();
        if (!scene || !camera || !controls) return;
        
        const bounds = new THREE.Box3();
        scene.traverse((child) => {
            if (child.isMesh && child.visible) {
                bounds.expandByObject(child);
            }
        });
        
        if (bounds.isEmpty()) {
            console.log("No hay objetos en la escena");
            return;
        }
        
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let distance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
        
        // Mantener vista isométrica (45°)
        const angleRad = 45 * (Math.PI / 180);
        const posX = center.x + distance * Math.sin(angleRad);
        const posZ = center.z + distance * Math.cos(angleRad);
        const posY = center.y + distance * 0.6;
        
        camera.position.set(posX, posY, posZ);
        controls.target.copy(center);
        controls.update();
    }
    
    // ==================== 4. RESALTADO DE SELECCIÓN ====================
    function updateSelectionHighlight() {
        const selected = _core.getSelected();
        
        if (_outlinePass) {
            if (selected && selected.obj) {
                const tag = selected.obj.tag;
                const mesh = _core.getVisualMesh(tag);
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
            // Fallback sin post-procesado: cambiamos emissive
            if (_currentHighlighted && _currentHighlighted.material) {
                _currentHighlighted.material.emissiveIntensity = 0;
            }
            if (selected && selected.obj) {
                const tag = selected.obj.tag;
                const mesh = _core.getVisualMesh(tag);
                if (mesh && mesh.material) {
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
    
    // ==================== 5. VISTAS PREDEFINIDAS ====================
    function setView(type) {
        const camera = _core.getCamera();
        const controls = _core.getControls();
        if (!camera) return;
        const distance = 8000;
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
    
    // ==================== 6. INICIALIZACIÓN ====================
    function init(coreInstance) {
        _core = coreInstance;
        if (!_core) return;
        
        setupEffects();
        
        // Suscribirse a cambios de selección para resaltar
        _core.subscribe(() => {
            updateSelectionHighlight();
        });
        
        console.log("✔ SmartFlowRender v7.0 listo (zoom suave, fitCamera, vistas)");
    }
    
    // ==================== API PÚBLICA ====================
    return {
        init,
        setView,
        fitCameraToEquipments,
        updateSelectionHighlight,
        getComposer: () => _composer,
        getOutlinePass: () => _outlinePass
    };
})();
