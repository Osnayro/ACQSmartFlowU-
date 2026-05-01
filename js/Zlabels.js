

// ============================================================
// SMARTFLOW LABELS v1.0 (Etiquetas técnicas + líneas conectoras)
// Archivo: js/labels.js
// Dependencias: Three.js, CSS2DRenderer, Core
// ============================================================

const SmartFlowLabels = (function() {
    let _core = null;
    let _scene = null;
    let _labelRenderer = null;
    let _itemsMap = new Map(); // tag -> { line, label, anchor, end }
    
    // Configuración estética
    const _config = {
        lineColor: 0x00f2ff,
        lineWidth: 1,
        dashSize: 6,
        gapSize: 4,
        useDashedLine: true,      // si es false, usa línea sólida
        offset: new THREE.Vector3(250, 200, 250), // desplazamiento estándar
        fontSize: '12px',
        fontFamily: 'monospace',
        textColor: '#00f2ff',
        bgColor: 'rgba(15, 23, 42, 0.85)',
        borderColor: '#00f2ff',
        borderRadius: '4px',
        padding: '2px 8px'
    };
    
    // ------------------------------------------------------------
    // Crear línea (punteada o sólida) entre dos puntos
    // ------------------------------------------------------------
    function createConnectorLine(start, end) {
        const points = [start.clone(), end.clone()];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        let material;
        
        if (_config.useDashedLine) {
            // Para línea punteada necesitamos calcular la longitud y usar LineDashedMaterial
            const length = start.distanceTo(end);
            material = new THREE.LineDashedMaterial({
                color: _config.lineColor,
                dashSize: _config.dashSize,
                gapSize: _config.gapSize,
                linewidth: _config.lineWidth
            });
            const line = new THREE.Line(geometry, material);
            line.computeLineDistances();
            line.material = material;
            return line;
        } else {
            material = new THREE.LineBasicMaterial({ color: _config.lineColor, linewidth: _config.lineWidth });
            return new THREE.Line(geometry, material);
        }
    }
    
    // ------------------------------------------------------------
    // Crear etiqueta CSS2D con texto multilínea
    // ------------------------------------------------------------
    function createLabel(text, position) {
        const div = document.createElement('div');
        div.innerHTML = text.replace(/\n/g, '<br>');
        div.style.color = _config.textColor;
        div.style.fontFamily = _config.fontFamily;
        div.style.fontSize = _config.fontSize;
        div.style.fontWeight = 'bold';
        div.style.background = _config.bgColor;
        div.style.border = `1px solid ${_config.borderColor}`;
        div.style.borderRadius = _config.borderRadius;
        div.style.padding = _config.padding;
        div.style.whiteSpace = 'nowrap';
        div.style.backdropFilter = 'blur(4px)';
        div.style.pointerEvents = 'none';
        div.style.textAlign = 'center';
        const label = new THREE.CSS2DObject(div);
        label.position.copy(position);
        return label;
    }
    
    // ------------------------------------------------------------
    // Calcular texto y punto de anclaje para un equipo
    // ------------------------------------------------------------
    function getEquipmentLabelData(eq) {
        let anchor = new THREE.Vector3(eq.posX, eq.posY, eq.posZ);
        let offset = _config.offset.clone();
        let text = eq.tag;
        
        // Añadir dimensiones según tipo
        if (eq.tipo === 'tanque_v' || eq.tipo === 'torre' || eq.tipo === 'reactor') {
            const diam = eq.diametro || 0;
            const alt = eq.altura || 0;
            text += `\n⌀${diam}mm  H=${alt}mm`;
            anchor = new THREE.Vector3(eq.posX, eq.posY + alt/2, eq.posZ);
            offset = new THREE.Vector3(300, 300, 0);
        } 
        else if (eq.tipo === 'tanque_h') {
            const largo = eq.largo || 0;
            const diam = eq.diametro || 0;             text += `\nL=${largo}mm  ⌀${diam}mm`;
            anchor = new THREE.Vector3(eq.posX, eq.posY, eq.posZ);
            offset = new THREE.Vector3(350, 0, 350);
        }
        else if (eq.tipo === 'bomba' || eq.tipo === 'bomba_dosificacion') {
            const alto = eq.altura || 800;
            const ancho = eq.ancho || 800;
            text += `\n${alto}x${ancho}mm`;
            anchor = new THREE.Vector3(eq.posX, eq.posY + alto/2, eq.posZ);
            offset = new THREE.Vector3(300, 200, 300);
        }
        else {
            // Otros equipos: mostrar dimensiones si existen
            if (eq.diametro) text += `\n⌀${eq.diametro}mm`;
            else if (eq.altura) text += `\nH=${eq.altura}mm`;
            else if (eq.largo) text += `\nL=${eq.largo}mm`;
            anchor = new THREE.Vector3(eq.posX, eq.posY, eq.posZ);
        }
        
        // Desplazar etiqueta en función de la cámara (offset fijo en mundo)
        const endPoint = anchor.clone().add(offset);         return { anchor, endPoint, text };
    }
    
    // ------------------------------------------------------------
    // Calcular texto y punto de anclaje para una línea (tubería)
    // ------------------------------------------------------------
    function getLineLabelData(line) {
        const pts = line.points || line._cachedPoints;
        if (!pts || pts.length < 2) return null;
        // Punto medio de la línea
        let mid = new THREE.Vector3(0,0,0);
        pts.forEach(p => mid.add(new THREE.Vector3(p.x, p.y, p.z)));
        mid.divideScalar(pts.length);
        // Calcular longitud total
        let totalLen = 0;
        for (let i=0; i<pts.length-1; i++) {
            totalLen += Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y, pts[i+1].z-pts[i].z);
        }
        const lenM = (totalLen / 1000).toFixed(2);
        const diam = line.diameter || 4;
        const material = line.material || 'PPR';
        const text = `${line.tag}\n${diam}" ${material}\nL=${lenM}m`;
        // Desplazar la etiqueta perpendicularmente a la línea (hacia arriba en Y)
        const offset = new THREE.Vector3(0, 200, 0);
        const endPoint = mid.clone().add(offset);
        return { anchor: mid, endPoint, text };
    }
    
    // ------------------------------------------------------------
    // Actualizar o crear elementos para un objeto (equipo o línea)
    // ------------------------------------------------------------
    function updateLabelForObject(obj, type, data) {
        const tag = obj.tag;
        // Eliminar elementos anteriores
        if (_itemsMap.has(tag)) {
            const old = _itemsMap.get(tag);
            if (old.line) _scene.remove(old.line);
            if (old.label) old.label.removeFromParent();
            _itemsMap.delete(tag);
        }
        
        if (!data) return;
        
        const { anchor, endPoint, text } = data;
        const line = createConnectorLine(anchor, endPoint);
        const label = createLabel(text, endPoint);
        
        _scene.add(line);
        _scene.add(label);
        
        _itemsMap.set(tag, { line, label, anchor, end: endPoint });
    }
    
    // ------------------------------------------------------------
    // Actualizar todas las anotaciones
    // ------------------------------------------------------------
    function updateAllLabels() {
        const db = _core.getDb();
        
        // Equipos
        db.equipos.forEach(eq => {
            const data = getEquipmentLabelData(eq);
            updateLabelForObject(eq, 'equipment', data);
        });
        
        // Líneas
        db.lines.forEach(line => {
            const data = getLineLabelData(line);
            if (data) updateLabelForObject(line, 'line', data);
        });
    }
    
    // ------------------------------------------------------------
    // Limpiar todas las anotaciones
    // ------------------------------------------------------------
    function clearAllLabels() {
        _itemsMap.forEach(item => {
            if (item.line) _scene.remove(item.line);
            if (item.label) item.label.removeFromParent();
        });
        _itemsMap.clear();
    }
    
    // ------------------------------------------------------------
    // Inicialización del módulo
    // ------------------------------------------------------------
    function init(coreInstance) {
        _core = coreInstance;
        _scene = _core.getScene();
        if (!_scene) {
            console.error("Labels: Core scene not available");
            return;
        }
        
        // Crear CSS2DRenderer
        const container = document.getElementById('canvas-container');
        if (!container) {
            console.error("Labels: canvas-container not found");
            return;
        }
        _labelRenderer = new THREE.CSS2DRenderer();
        _labelRenderer.setSize(window.innerWidth, window.innerHeight);
        _labelRenderer.domElement.style.position = 'absolute';
        _labelRenderer.domElement.style.top = '0px';
        _labelRenderer.domElement.style.left = '0px';
        _labelRenderer.domElement.style.pointerEvents = 'none';
        container.appendChild(_labelRenderer.domElement);
        
        // Suscribirse a cambios en el Core
        _core.subscribe(() => {
            clearAllLabels();
            updateAllLabels();
        });
        
        // Loop de renderizado para CSS2DRenderer
        function renderCSS() {
            requestAnimationFrame(renderCSS);
            if (_labelRenderer && _core.getCamera()) {
                _labelRenderer.render(_scene, _core.getCamera());
            }
        }
        renderCSS();
        
        // Forzar actualización inicial
        updateAllLabels();
        
        // Ajustar al redimensionar ventana
        window.addEventListener('resize', () => {
            _labelRenderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        console.log("✅ SmartFlowLabels: sistema de etiquetas técnicas activado");
    }
    
    // API pública
    return { init };
})();
```

## 🔌 Integración en `main.js`

En tu `main.js`, dentro de la función `initModules()` (o donde inicialices los módulos), agrega:

```javascript
if (typeof SmartFlowLabels !== 'undefined') {
    SmartFlowLabels.init(SmartFlowCore);
}
