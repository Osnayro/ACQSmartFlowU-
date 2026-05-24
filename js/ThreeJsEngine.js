// ============================================================
// ARCHIVO: js/ThreeJsEngine.js - v2.2
// Motor 3D: Escena, Cámara Ortográfica, Luces, Controles, Raycaster
// Escala: Mundo en metros (mm → m en SmartFlowRender)
// Dependencia: Three.js 0.128.0 (CDN)
// ============================================================
const ThreeJsEngine = (function() {
    let _scene = null;
    let _camera = null;
    let _renderer = null;
    let _controls = null;
    let _container = null;
    let _core = null;
    
    let _visualMeshes = new Map();
    let _raycastTargets = [];
    
    let _raycaster = new THREE.Raycaster();
    let _mouse = new THREE.Vector2();
    
    let _animationId = null;
    let _loopActive = false;
    
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
        
        // ── Cámara Ortográfica (mundo en metros) ──
        _camera = createCamera();
        
        // ── Controles de órbita ──
        try {
            _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
            _controls.target.set(0, 0, 0);
            _controls.enableDamping = true;
            _controls.dampingFactor = 0.08;
            _controls.rotateSpeed = 0.6;
            _controls.zoomSpeed = 1.0;
            _controls.panSpeed = 0.6;
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
        setupLights();
        
        // ── Grid de referencia ──
        setupGrid();
        
        // ── Ejes de origen ──
        setupAxes();
        
        // ── Eventos ──
        _renderer.domElement.addEventListener('pointerdown', onPointerDown);
        _renderer.domElement.addEventListener('pointerup', onPointerUp);
        _renderer.domElement.addEventListener('pointermove', onPointerMove);
        _renderer.domElement.addEventListener('wheel', function(e) { e.preventDefault(); }, { passive: false });
        
        window.addEventListener('resize', onResize);
        
        // ── Arrancar bucle ──
        resumeLoop();
        
        console.log('✔ ThreeJsEngine v2.2 inicializado (escala metros)');
        return true;
    }
    
    // ============ CÁMARA ============
    function createCamera() {
        var aspect = (_container.clientWidth / _container.clientHeight) || 1;
        var frustumSize = 20; // 20 metros de vista vertical
        
        var camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1,
            1000
        );
        
        // Posición isométrica estándar (en metros)
        camera.position.set(12, 8, 12);
        camera.lookAt(0, 0, 0);
        
        return camera;
    }
    
    // ============ LUCES ============
    function setupLights() {
        // Luz ambiental suave
        var ambientLight = new THREE.AmbientLight(0x334455, 1.5);
        _scene.add(ambientLight);
        
        // Luz principal (sol)
        var sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
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
        
        // Luz de relleno
        var fillLight = new THREE.DirectionalLight(0x8899cc, 0.6);
        fillLight.position.set(-8, 4, -10);
        _scene.add(fillLight);
        
        // Luz hemisférica
        var hemiLight = new THREE.HemisphereLight(0x8899cc, 0x334455, 0.4);
        _scene.add(hemiLight);
    }
    
    // ============ GRID ============
    function setupGrid() {
        // 40m x 40m con divisiones cada 1m
        var gridHelper = new THREE.GridHelper(40, 40, 0x2a3a5a, 0x1a2a3a);
        gridHelper.position.y = -0.01;
        _scene.add(gridHelper);
    }
    
    // ============ EJES ============
    function setupAxes() {
        var originGroup = new THREE.Group();
        var len = 2;        // 2 metros
        var head = 0.3;     // 30 cm
        var headSize = 0.15;
        
        originGroup.add(new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), len, 0xff4444, head, headSize
        ));
        originGroup.add(new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), len, 0x44ff44, head, headSize
        ));
        originGroup.add(new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), len, 0x4444ff, head, headSize
        ));
        
        _scene.add(originGroup);
    }
    
    // ============ RAYCASTER ============
    function getIntersections(event) {
        if (!_renderer || !_camera) return [];
        
        var rect = _renderer.domElement.getBoundingClientRect();
        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        _raycaster.setFromCamera(_mouse, _camera);
        return _raycaster.intersectObjects(_raycastTargets, true);
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
                        _core.setSelected({ obj: dbObj, type: isLine ? 'line' : 'equipment' });
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
        _renderer.domElement.style.cursor = (intersects.length > 0) ? 'pointer' : 'default';
    }
    
    // ============ GESTIÓN DE MALLAS ============
    function registerVisualMesh(tag, mesh) {
        if (mesh) {
            mesh.userData.tag = tag;
            _visualMeshes.set(tag, mesh);
            _raycastTargets.push(mesh);
        }
    }
    
    function unregisterVisualMesh(tag) {
        var mesh = _visualMeshes.get(tag);
        if (mesh) {
            var index = _raycastTargets.indexOf(mesh);
            if (index > -1) _raycastTargets.splice(index, 1);
        }
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
                if (child.geometry) { child.geometry.dispose(); child.geometry = null; }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(function(m) { 
                            if (m.map) { m.map.dispose(); m.map = null; } m.dispose(); 
                        });
                    } else {
                        if (child.material.map) { child.material.map.dispose(); child.material.map = null; }
                        child.material.dispose();
                    }
                    child.material = null;
                }
            });
            if (obj.parent) obj.parent.remove(obj);
        });
        
        _visualMeshes.clear();
        _raycastTargets = [];
    }
    
    function addToScene(object) {
        if (object && _scene) _scene.add(object);
    }
    
    function removeFromScene(object) {
        if (object && _scene && object.parent) {
            object.parent.remove(object);
        }
    }
    
    // ============ BUCLE DE ANIMACIÓN ============
    function pauseLoop() {
        _loopActive = false;
        if (_animationId) {
            cancelAnimationFrame(_animationId);
            _animationId = null;
        }
    }
    
    function resumeLoop() {
        if (!_loopActive) {
            _loopActive = true;
            animate();
        }
    }
    
    function animate() {
        if (!_loopActive) return;
        
        _animationId = requestAnimationFrame(animate);
        
        if (_controls && _controls.update) _controls.update();
        
        if (_renderer && _scene && _camera) {
            _renderer.render(_scene, _camera);
        }
        
        // Renderizar etiquetas CSS2D
        if (typeof SmartFlowLabels3D !== 'undefined' && SmartFlowLabels3D.render) {
            SmartFlowLabels3D.render();
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
    
    // ============ ENCUADRE DINÁMICO ============
    function fitCameraToEquipments() {
        if (!_scene || !_camera || !_controls) return;
        
        var bounds = new THREE.Box3();
        var hasValidObject = false;
        
        _scene.traverse(function(child) {
            if (child.isMesh && child.visible && child.geometry) {
                if (child instanceof THREE.GridHelper) return;
                if (child instanceof THREE.ArrowHelper) return;
                if (child.userData && (child.userData.isLabel || child.userData.isLabelAnchor || 
                    child.userData.isLineLabel || child.userData.isDimensionText)) return;
                
                bounds.expandByObject(child);
                hasValidObject = true;
            }
        });
        
        if (!hasValidObject) {
            _camera.position.set(12, 8, 12);
            _camera.zoom = 1.0;
            _camera.updateProjectionMatrix();
            _controls.target.set(0, 0, 0);
            _controls.update();
            return;
        }
        
        var center = bounds.getCenter(new THREE.Vector3());
        var size = bounds.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z, 1);
        
        // Ajustar el frustum al tamaño de la escena
        var aspect = (_container.clientWidth / _container.clientHeight) || 1;
        var padding = 1.3;
        
        _camera.left = (maxDim * aspect) / -2 * padding;
        _camera.right = (maxDim * aspect) / 2 * padding;
        _camera.top = maxDim / 2 * padding;
        _camera.bottom = maxDim / -2 * padding;
        
        var distance = maxDim * 2;
        _camera.position.set(
            center.x + distance * 0.7,
            center.y + distance * 0.55,
            center.z + distance * 0.7
        );
        
        _camera.zoom = 1.0;
        _camera.updateProjectionMatrix();
        _controls.target.copy(center);
        _controls.update();
    }
    
    // ============ VISTAS PREDEFINIDAS ============
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
    
    // ============ LIMPIEZA TOTAL ============
    function dispose() {
        pauseLoop();
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
        _raycastTargets = [];
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
        pauseLoop: pauseLoop,
        resumeLoop: resumeLoop,
        fitCameraToEquipments: fitCameraToEquipments,
        setView: setView,
        exportToDataURL: exportToDataURL,
        onResize: onResize,
        dispose: dispose
    };
})();
