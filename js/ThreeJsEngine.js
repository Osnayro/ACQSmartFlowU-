

// ============================================================
// ARCHIVO: js/ThreeJsEngine.js
// Adaptador: SmartFlowCore ↔ Three.js (Escena, Cámara, Raycaster)
// Dependencia: Three.js cargado globalmente (CDN)
// ============================================================
const ThreeJsEngine = (function() {
    let _scene, _camera, _renderer, _controls;
    let _container = null;
    let _core = null;
    let _visualMeshes = new Map();
    let _raycaster = new THREE.Raycaster();
    let _mouse = new THREE.Vector2();
    let _animationId = null;
    let _isDragging = false;
    let _dragStart = { x: 0, y: 0 };
    let _onSelectionCallback = null;
    
    // ============ INICIALIZACIÓN PRINCIPAL ============
    function init(containerElement, coreInstance, onSelectionFn) {
        _container = containerElement;
        _core = coreInstance;
        _onSelectionCallback = onSelectionFn || null;
        
        if (!_container) {
            console.error('ThreeJsEngine: contenedor no encontrado');
            return false;
        }
        
        // Limpiar contenedor
        _container.innerHTML = '';
        
        // ── Renderer WebGL ──
        try {
            _renderer = new THREE.WebGLRenderer({ 
                antialias: true, 
                alpha: false,
                preserveDrawingBuffer: true 
            });
            _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            _renderer.setSize(_container.clientWidth, _container.clientHeight);
            _renderer.shadowMap.enabled = true;
            _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            if (_renderer.outputColorSpace !== undefined) {
                _renderer.outputColorSpace = THREE.SRGBColorSpace;
            }
            _container.appendChild(_renderer.domElement);
        } catch (e) {
            console.error('ThreeJsEngine: Error al crear WebGLRenderer', e);
            return false;
        }
        
        // ── Escena ──
        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0x0a0f1a);
        _scene.fog = new THREE.Fog(0x0a0f1a, 50, 300);
        
        // ── Cámara Ortográfica Isométrica ──
        const aspect = _container.clientWidth / _container.clientHeight || 1;
        const frustumSize = 20;
        _camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1,
            500
        );
        _camera.position.set(12, 8, 12);
        _camera.lookAt(0, 0, 0);
        
        // ── OrbitControls ──
        try {
            _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
            _controls.target.set(0, 0, 0);
            _controls.enableDamping = true;
            _controls.dampingFactor = 0.08;
            _controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.PAN
            };
            _controls.update();
        } catch (e) {
            console.warn('ThreeJsEngine: OrbitControls no disponible, usando fallback');
            _controls = {
                target: new THREE.Vector3(0, 0, 0),
                update: function() {},
                enableDamping: false
            };
        }
        
        // ── Luces ──
        const ambientLight = new THREE.AmbientLight(0x334455, 1.8);
        _scene.add(ambientLight);
        
        const sunLight = new THREE.DirectionalLight(0xffffff, 3);
        sunLight.position.set(20, 30, 15);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 150;
        sunLight.shadow.camera.left = -40;
        sunLight.shadow.camera.right = 40;
        sunLight.shadow.camera.top = 40;
        sunLight.shadow.camera.bottom = -40;
        _scene.add(sunLight);
        
        const fillLight = new THREE.DirectionalLight(0x8899cc, 0.7);
        fillLight.position.set(-8, 4, -10);
        _scene.add(fillLight);
        
        const hemiLight = new THREE.HemisphereLight(0x8899cc, 0x334455, 0.5);
        _scene.add(hemiLight);
        
        // ── Grid ──
        const gridHelper = new THREE.GridHelper(40, 20, 0x2a3a5a, 0x1a2a3a);
        gridHelper.position.y = -0.01;
        _scene.add(gridHelper);
        
        // ── Ejes de origen ──
        const originGroup = new THREE.Group();
        const arrowLen = 2;
        const arrowHead = 0.3;
        const arrowHeadSize = 0.15;
        originGroup.add(new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), arrowLen, 0xff4444, arrowHead, arrowHeadSize
        ));
        originGroup.add(new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), arrowLen, 0x44ff44, arrowHead, arrowHeadSize
        ));
        originGroup.add(new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), arrowLen, 0x4444ff, arrowHead, arrowHeadSize
        ));
        _scene.add(originGroup);
        
        // ── Eventos de puntero ──
        _renderer.domElement.addEventListener('pointerdown', onPointerDown);
        _renderer.domElement.addEventListener('pointerup', onPointerUp);
        _renderer.domElement.addEventListener('pointermove', onPointerMove);
        _renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
        
        // ── Redimensionamiento ──
        window.addEventListener('resize', onResize);
        
        // ── Arrancar bucle de animación ──
        animate();
        
        console.log('✔ ThreeJsEngine inicializado correctamente');
        return true;
    }
    
    // ============ RAYCASTER Y SELECCIÓN ============
    function getIntersections(event) {
        if (!_renderer || !_camera) return [];
        const rect = _renderer.domElement.getBoundingClientRect();
        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        _raycaster.setFromCamera(_mouse, _camera);
        
        const objects = [];
        _scene.traverse(child => {
            if (child.isMesh && child.visible && 
                !(child.parent instanceof THREE.GridHelper) &&
                !(child.parent instanceof THREE.ArrowHelper) &&
                child.userData && child.userData.tag) {
                objects.push(child);
            }
        });
        return _raycaster.intersectObjects(objects, true);
    }
    
    function findRootWithTag(object) {
        let current = object;
        let depth = 0;
        while (current && depth < 30) {
            if (current.userData && current.userData.tag) return current;
            current = current.parent;
            depth++;
        }
        return null;
    }
    
    function onPointerDown(event) {
        _dragStart = { x: event.clientX, y: event.clientY };
        _isDragging = false;
    }
    
    function onPointerUp(event) {
        const dx = event.clientX - _dragStart.x;
        const dy = event.clientY - _dragStart.y;
        const dist = Math.hypot(dx, dy);
        
        // Solo clic si no hubo arrastre
        if (dist < 5) {
            const intersects = getIntersections(event);
            if (intersects.length > 0) {
                const root = findRootWithTag(intersects[0].object);
                if (root && root.userData.tag && _core) {
                    const tag = root.userData.tag;
                    const dbObj = _core.findObjectByTag(tag);
                    if (dbObj) {
                        const isLine = _core.getLinesMap().has(tag);
                        const selection = { 
                            obj: dbObj, 
                            type: isLine ? 'line' : 'equipment' 
                        };
                        _core.setSelected(selection);
                        if (_onSelectionCallback) _onSelectionCallback(selection);
                        return;
                    }
                }
            }
            // Clic en vacío → deseleccionar
            if (_core) _core.setSelected(null);
            if (_onSelectionCallback) _onSelectionCallback(null);
        }
        _isDragging = false;
    }
    
    function onPointerMove(event) {
        if (_dragStart.x && (Math.abs(event.clientX - _dragStart.x) > 3 || 
            Math.abs(event.clientY - _dragStart.y) > 3)) {
            _isDragging = true;
        }
        
        const intersects = getIntersections(event);
        if (intersects.length > 0) {
            const root = findRootWithTag(intersects[0].object);
            if (root && root.userData.tag) {
                _renderer.domElement.style.cursor = 'pointer';
                return;
            }
        }
        _renderer.domElement.style.cursor = 'default';
    }
    
    function onWheel(event) {
        event.preventDefault();
    }
    
    // ============ GESTIÓN DE MESHES ============
    function registerVisualMesh(tag, mesh) {
        if (mesh) {
            mesh.userData.tag = tag;
            _visualMeshes.set(tag, mesh);
        }
    }
    
    function unregisterVisualMesh(tag) {
        _visualMeshes.delete(tag);
    }
    
    function getVisualMesh(tag) {
        return _visualMeshes.get(tag) || null;
    }
    
    function clearAllMeshes() {
        const toRemove = [];
        _scene.traverse(child => {
            if (child.userData && child.userData.tag && 
                (child.isMesh || child.isGroup) &&
                !child.userData.isSymbolGroup &&
                !child.userData.isDimensionGroup &&
                !child.userData.isFlowArrowGroup &&
                !child.userData.isLabelGroup &&
                !child.userData.isDimensionGroup3D) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(obj => {
            obj.traverse(child => {
                if (child.geometry && child.geometry !== obj.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
            if (obj.parent) obj.parent.remove(obj);
        });
        _visualMeshes.clear();
    }
    
    function addToScene(object) {
        if (object && _scene) {
            _scene.add(object);
        }
    }
    
    function removeFromScene(object) {
        if (object && _scene && object.parent) {
            object.parent.remove(object);
        }
    }
    
    // ============ ANIMACIÓN ============
    function animate() {
        _animationId = requestAnimationFrame(animate);
        if (_controls && _controls.update) _controls.update();
        if (_renderer && _scene && _camera) {
            _renderer.render(_scene, _camera);
        }
    }
    
    // ============ RESIZE ============
    function onResize() {
        if (!_container || !_camera || !_renderer) return;
        const width = _container.clientWidth;
        const height = _container.clientHeight;
        if (width === 0 || height === 0) return;
        
        const aspect = width / height;
        const frustumSize = 20;
        
        _camera.left = frustumSize * aspect / -2;
        _camera.right = frustumSize * aspect / 2;
        _camera.top = frustumSize / 2;
        _camera.bottom = frustumSize / -2;
        _camera.updateProjectionMatrix();
        
        _renderer.setSize(width, height);
    }
    
    // ============ VISTAS PREDEFINIDAS ============
    function setView(type) {
        if (!_camera || !_controls) return;
        const dist = 15;
        const target = new THREE.Vector3(0, 0, 0);
        switch(type) {
            case 'iso':
                _camera.position.set(dist * 0.7, dist * 0.55, dist * 0.7);
                break;
            case 'top':
                _camera.position.set(0, dist, 0.01);
                break;
            case 'front':
                _camera.position.set(0, dist * 0.15, dist);
                break;
            case 'side':
                _camera.position.set(dist, dist * 0.15, 0);
                break;
            default: return;
        }
        _camera.lookAt(target);
        _controls.target.copy(target);
        _controls.update();
    }
    
    // ============ EXPORTACIÓN ============
    function exportToDataURL() {
        if (_renderer && _scene && _camera) {
            _renderer.render(_scene, _camera);
            return _renderer.domElement.toDataURL('image/png');
        }
        return null;
    }
    
    // ============ LIMPIEZA ============
    function dispose() {
        if (_animationId) cancelAnimationFrame(_animationId);
        window.removeEventListener('resize', onResize);
        clearAllMeshes();
        if (_renderer) {
            _renderer.dispose();
            if (_renderer.domElement && _renderer.domElement.parentNode) {
                _renderer.domElement.parentNode.removeChild(_renderer.domElement);
            }
        }
        _scene = null;
        _camera = null;
        _renderer = null;
        _controls = null;
        _container = null;
        _core = null;
        _visualMeshes.clear();
    }
    
    // ============ API PÚBLICA ============
    return {
        init,
        getScene: () => _scene,
        getCamera: () => _camera,
        getRenderer: () => _renderer,
        getControls: () => _controls,
        registerVisualMesh,
        unregisterVisualMesh,
        getVisualMesh,
        clearAllMeshes,
        addToScene,
        removeFromScene,
        setView,
        exportToDataURL,
        onResize,
        dispose
    };
})();
```

---

Confírmame cuando hayas creado este archivo y paso al siguiente.
