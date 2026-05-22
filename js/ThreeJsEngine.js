
// ============================================================
// ARCHIVO: js/ThreeJsEngine.js - v2.0
// Adaptador: SmartFlowCore v5.5 ↔ Three.js 0.128.0
// ============================================================
const ThreeJsEngine = (function() {
    let _scene = null;
    let _camera = null;
    let _renderer = null;
    let _controls = null;
    let _container = null;
    let _core = null;
    let _visualMeshes = new Map();
    let _raycaster = new THREE.Raycaster();
    let _mouse = new THREE.Vector2();
    let _animationId = null;
    let _isDragging = false;
    let _dragStart = { x: 0, y: 0 };
    
    // ============ INICIALIZACIÓN ============
    function init(containerElement, coreInstance) {
        _container = containerElement;
        _core = coreInstance;
        
        if (!_container) {
            console.error('ThreeJsEngine: contenedor no encontrado');
            return false;
        }
        
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
        var aspect = _container.clientWidth / _container.clientHeight || 1;
        var frustumSize = 20;
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
            _controls.rotateSpeed = 0.8;
            _controls.zoomSpeed = 1.2;
            _controls.panSpeed = 0.8;
            _controls.update();
        } catch (e) {
            console.warn('ThreeJsEngine: OrbitControls no disponible');
            _controls = {
                target: new THREE.Vector3(0, 0, 0),
                update: function() {},
                enableDamping: false
            };
        }
        
        // ── Luces ──
        var ambientLight = new THREE.AmbientLight(0x334455, 1.8);
        _scene.add(ambientLight);
        
        var sunLight = new THREE.DirectionalLight(0xffffff, 3);
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
        
        var fillLight = new THREE.DirectionalLight(0x8899cc, 0.7);
        fillLight.position.set(-8, 4, -10);
        _scene.add(fillLight);
        
        var hemiLight = new THREE.HemisphereLight(0x8899cc, 0x334455, 0.5);
        _scene.add(hemiLight);
        
        // ── Grid ──
        var gridHelper = new THREE.GridHelper(40, 20, 0x2a3a5a, 0x1a2a3a);
        gridHelper.position.y = -0.01;
        _scene.add(gridHelper);
        
        // ── Ejes de origen ──
        var originGroup = new THREE.Group();
        var arrowLen = 2;
        var arrowHead = 0.3;
        var arrowHeadSize = 0.15;
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
        
        // ── Bucle de animación ──
        animate();
        
        console.log('✔ ThreeJsEngine v2.0 inicializado');
        return true;
    }
    
    // ============ RAYCASTER ============
    function getIntersections(event) {
        if (!_renderer || !_camera) return [];
        var rect = _renderer.domElement.getBoundingClientRect();
        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        _raycaster.setFromCamera(_mouse, _camera);
        
        var objects = [];
        _scene.traverse(function(child) {
            if (child.isMesh && child.visible && 
                child.userData && child.userData.tag) {
                objects.push(child);
            }
        });
        return _raycaster.intersectObjects(objects, true);
    }
    
    function findRootWithTag(object) {
        var current = object;
        var depth = 0;
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
        var dx = event.clientX - _dragStart.x;
        var dy = event.clientY - _dragStart.y;
        var dist = Math.hypot(dx, dy);
        
        if (dist < 5) {
            var intersects = getIntersections(event);
            if (intersects.length > 0) {
                var root = findRootWithTag(intersects[0].object);
                if (root && root.userData.tag && _core) {
                    var tag = root.userData.tag;
                    var dbObj = _core.findObjectByTag(tag);
                    if (dbObj) {
                        var isLine = _core.linesMap.has(tag);
                        _core.setSelected({ 
                            obj: dbObj, 
                            type: isLine ? 'line' : 'equipment' 
                        });
                        return;
                    }
                }
            }
            if (_core) _core.setSelected(null);
        }
        _isDragging = false;
    }
    
    function onPointerMove(event) {
        if (_dragStart.x && (Math.abs(event.clientX - _dragStart.x) > 3 || 
            Math.abs(event.clientY - _dragStart.y) > 3)) {
            _isDragging = true;
        }
        
        var intersects = getIntersections(event);
        if (intersects.length > 0) {
            var root = findRootWithTag(intersects[0].object);
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
        var toRemove = [];
        _scene.traverse(function(child) {
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
        toRemove.forEach(function(obj) {
            obj.traverse(function(child) {
                if (child.geometry && child !== obj) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(function(m) { m.dispose(); });
                    } else {
                        child.material.dispose();
                    }
                }
            });
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(function(m) { m.dispose(); });
                } else {
                    obj.material.dispose();
                }
            }
            if (obj.parent) obj.parent.remove(obj);
        });
        _visualMeshes.clear();
    }
    
    function addToScene(object) {
        if (object && _scene) _scene.add(object);
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
        var width = _container.clientWidth;
        var height = _container.clientHeight;
        if (width === 0 || height === 0) return;
        
        var aspect = width / height;
        var frustumSize = 20;
        
        _camera.left = frustumSize * aspect / -2;
        _camera.right = frustumSize * aspect / 2;
        _camera.top = frustumSize / 2;
        _camera.bottom = frustumSize / -2;
        _camera.updateProjectionMatrix();
        
        _renderer.setSize(width, height);
    }
    
    // ============ VISTAS ============
    function setView(type) {
        if (!_camera || !_controls) return;
        var dist = 15;
        var target = new THREE.Vector3(0, 0, 0);
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
    
    function fitCameraToEquipments() {
        if (!_scene || !_camera || !_controls) return;
        
        var bounds = new THREE.Box3();
        var hasValidObject = false;
        
        _scene.traverse(function(child) {
            if (child.isMesh && child.visible && child.geometry) {
                if (child.userData && (child.userData.isComponentSymbol || 
                    child.userData.isDimensionLine || 
                    child.userData.isFlowArrow ||
                    child.userData.isLabel ||
                    child.userData.isLabelAnchor ||
                    child.userData.isLineLabel)) {
                    return;
                }
                if (child instanceof THREE.GridHelper) return;
                if (child instanceof THREE.ArrowHelper) return;
                
                var box = new THREE.Box3().setFromObject(child);
                var size = box.getSize(new THREE.Vector3());
                
                if (size.x > 100000 || size.y > 100000 || size.z > 100000) return;
                if (size.x < 0.01 && size.y < 0.01 && size.z < 0.01) return;
                
                bounds.expandByObject(child);
                hasValidObject = true;
            }
        });
        
        if (!hasValidObject) {
            _camera.position.set(12, 8, 12);
            _controls.target.set(0, 0, 0);
            _controls.update();
            return;
        }
        
        var center = bounds.getCenter(new THREE.Vector3());
        var size = bounds.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z);
        var effectiveMaxDim = Math.max(maxDim, 5);
        var distance = effectiveMaxDim * 1.5;
        
        distance = Math.min(distance, 100);
        distance = Math.max(distance, 5);
        
        _camera.position.set(
            center.x + distance * 0.7,
            center.y + distance * 0.55,
            center.z + distance * 0.7
        );
        _controls.target.copy(center);
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
        init: init,
        getScene: function() { return _scene; },
        getCamera: function() { return _camera; },
        getRenderer: function() { return _renderer; },
        getControls: function() { return _controls; },
        registerVisualMesh: registerVisualMesh,
        unregisterVisualMesh: unregisterVisualMesh,
        getVisualMesh: getVisualMesh,
        clearAllMeshes: clearAllMeshes,
        addToScene: addToScene,
        removeFromScene: removeFromScene,
        setView: setView,
        fitCameraToEquipments: fitCameraToEquipments,
        exportToDataURL: exportToDataURL,
        onResize: onResize,
        dispose: dispose
    };
})();
