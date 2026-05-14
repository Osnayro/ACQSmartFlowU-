```javascript
// ============================================================
// SMARTFLOW LABELS v3.0 – Etiquetas 3D + Abreviaturas ISO + Componentes
// Archivo: js/labels.js
// ============================================================

const SmartFlowLabels = (function() {
    let _core = null;
    let _labelRenderer = null;
    let _labelObjects = [];
    let _scene = null;
    let _camera = null;
    let _showDetails = false;
    let _visibilityDistance = 15000;

    const COLOR_MAP = {
        'tanque_v': '#3b82f6',
        'tanque_h': '#3b82f6',
        'bomba': '#f59e0b',
        'bomba_dosificacion': '#f59e0b',
        'bomba_sumergible': '#f59e0b',
        'torre': '#ef4444',
        'reactor': '#8b5cf6',
        'intercambiador': '#10b981',
        'caldera': '#ef4444',
        'compresor': '#f59e0b',
        'separador': '#8b5cf6',
        'clarificador': '#06b6d4',
        'filtro_arena': '#06b6d4',
        'osmosis': '#06b6d4',
        'pasteurizador': '#10b981',
        'homogeneizador': '#8b5cf6',
        'tanque_acero': '#94a3b8',
        'colector': '#facc15'
    };

    // Abreviaturas ISO para componentes
    function getComponentAbbr(compType) {
        if (typeof SmartFlowCatalog !== 'undefined') {
            const catComp = SmartFlowCatalog.getComponent(compType);
            if (catComp && catComp.abbr) return catComp.abbr;
        }
        const fallback = {
            'GATE_VALVE':'GV','GLOBE_VALVE':'GL','BUTTERFLY_VALVE':'VB','BALL_VALVE':'BA',
            'CHECK_VALVE':'CK','DIAPHRAGM_VALVE':'DV','CONTROL_VALVE':'CV',
            'CONCENTRIC_REDUCER':'RC','ECCENTRIC_REDUCER':'RE',
            'WELD_NECK_FLANGE':'FL','SLIP_ON_FLANGE':'FL','BLIND_FLANGE':'FB','LAP_JOINT_FLANGE':'FL',
            'PRESSURE_GAUGE':'PG','TEMPERATURE_GAUGE':'TG','FLOW_METER':'FM',
            'TEE_EQUAL':'TE','TEE_REDUCING':'TR','CROSS':'CR','CAP':'CA',
            'ELBOW_90_LR':'EL','ELBOW_90_SR':'EL','ELBOW_45':'E4',
            'TRANSITION':'TR','UNION':'UN','BULKHEAD':'BH','Y_STRAINER':'YS',
            'LEVEL_SWITCH_RANA':'LS','PIPE_SHOE':'SH','U_BOLT':'UB','GUIDE':'GD','ANCHOR':'AN',
            'HANGER':'HG','PIPE_CLAMP':'PC','EXPANSION_JOINT':'EJ','FLEXIBLE_HOSE':'HO',
            'NIPPLE':'NI','STUB_END':'SE','CAMLOCK':'CM','QUICK_CONNECT':'QC',
            'STEAM_TRAP':'ST','SILENCER':'SI','FLAME_ARRESTER':'FA','VACUUM_BREAKER':'VB',
            'DRAIN_VALVE':'DV','AIR_RELEASE':'AR','SAMPLE_COOLER':'SC','SAMPLE_VALVE':'SV'
        };
        return fallback[compType] || compType?.substring(0,2) || '??';
    }

    function init(core, labelRenderer, scene) {
        _core = core;
        _labelRenderer = labelRenderer || null;
        _scene = scene || (core && core.getScene ? core.getScene() : null);
        _camera = core && core.getCamera ? core.getCamera() : null;
        _showDetails = localStorage.getItem('smartflow_labels_detailed') === 'true';
        console.log('✅ Labels v3.0 – Componentes + Abreviaturas ISO');
    }

    function toggleLabelDetail() {
        _showDetails = !_showDetails;
        localStorage.setItem('smartflow_labels_detailed', _showDetails);
        crearLabelsProyecto();
    }

    function getShortLabel(obj) {
        return obj.tag || '?';
    }

    function getDetailedLabel(obj) {
        let label = obj.tag || '?';
        const diam = obj.diametro || obj.diameter || '';
        const mat = obj.material || '';
        if (diam) label += ` ⌀${diam}"`;
        if (mat) label += ` ${mat.substring(0,4)}`;
        return label;
    }

    function crearLabel(texto, posicion, colorHex = '#ffffff', fontSize = '14px', offsetY = 200) {
        if (!_labelRenderer || !_scene) {
            console.warn('⚠️ LabelRenderer o Scene no disponibles');
            return null;
        }

        const displayText = texto.length > 20 ? texto.substring(0, 18) + '..' : texto;

        const div = document.createElement('div');
        div.textContent = displayText;
        div.style.cssText = `
            color: ${colorHex};
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: ${fontSize};
            font-weight: 700;
            text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.8);
            background: rgba(10, 14, 23, 0.75);
            padding: 3px 8px;
            border-radius: 3px;
            border: 1px solid ${colorHex}44;
            pointer-events: none;
            white-space: nowrap;
            user-select: none;
            letter-spacing: 0.5px;
        `;

        const label = new THREE.CSS2DObject(div);
        label.position.copy(posicion);
        label.position.y += offsetY;
        label.userData = { texto, colorHex, fontSize, offsetY, type: 'label', fullText: texto };
        
        _scene.add(label);
        _labelObjects.push(label);
        
        return label;
    }

    function crearLabelEquipo(equipo) {
        if (!equipo) return null;
        
        const pos = {
            x: equipo.posX || (equipo.pos?.x || 0),
            y: equipo.posY || (equipo.pos?.y || 0),
            z: equipo.posZ || (equipo.pos?.z || 0)
        };

        const altura = equipo.altura || 1500;
        const offsetY = altura / 2 + 250;
        
        const color = COLOR_MAP[equipo.tipo] || '#00f2ff';
        const texto = _showDetails ? getDetailedLabel(equipo) : getShortLabel(equipo);
        
        return crearLabel(texto, pos, color, _showDetails ? '13px' : '14px', offsetY);
    }

    function crearLabelLinea(linea) {
        if (!linea) return null;
        
        const pts = linea.points || linea._cachedPoints || linea.points3D || [];
        if (pts.length < 2) return null;
        
        const midIdx = Math.floor(pts.length / 2);
        const pos = { x: pts[midIdx].x, y: pts[midIdx].y + 200, z: pts[midIdx].z };
        
        const texto = _showDetails 
            ? `${linea.tag} ${linea.diameter}"` 
            : linea.tag;
        
        return crearLabel(texto, pos, '#f59e0b', '11px', 0);
    }

    function crearLabelComponente(linea, comp) {
        if (!linea || !comp) return null;

        const pts = linea.points || linea._cachedPoints || linea.points3D || [];
        if (pts.length < 2) return null;

        // Recalcular la posición 3D del componente
        let lengths = [], totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            lengths.push(d);
            totalLen += d;
        }
        if (totalLen === 0) return null;

        const param = comp.param || 0.5;
        const targetLen = totalLen * param;
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
        const pos = {
            x: pA.x + (pB.x - pA.x) * t,
            y: pA.y + (pB.y - pA.y) * t + 150,
            z: pA.z + (pB.z - pA.z) * t
        };

        const abbr = getComponentAbbr(comp.type);
        const texto = _showDetails ? `${abbr} – ${comp.type}` : abbr;

        return crearLabel(texto, pos, '#fbbf24', '10px', 0);
    }

    function crearLabelsProyecto() {
        if (!_core || !_scene) return;
        
        limpiarLabels();
        
        const db = _core.getDb();
        
        // Labels de equipos
        (db.equipos || []).forEach(eq => {
            crearLabelEquipo(eq);
        });
        
        // Labels de líneas y componentes
        (db.lines || []).forEach(line => {
            crearLabelLinea(line);
            if (line.components && line.components.length > 0) {
                line.components.forEach(comp => {
                    crearLabelComponente(line, comp);
                });
            }
        });
        
        console.log(`✅ ${_labelObjects.length} labels creadas (${_showDetails ? 'detallado' : 'compacto'})`);
    }

    function actualizarVisibilidad() {
        if (!_camera) return;
        
        _labelObjects.forEach(label => {
            const distance = _camera.position.distanceTo(label.position);
            label.visible = distance < _visibilityDistance;
        });
    }

    function limpiarLabels() {
        if (!_scene) return;
        _labelObjects.forEach(label => {
            _scene.remove(label);
            if (label.element) label.element.remove();
        });
        _labelObjects = [];
    }

    function setVisibilityDistance(dist) {
        _visibilityDistance = dist;
    }

    function getLabels() {
        return _labelObjects;
    }

    function isDetailedMode() {
        return _showDetails;
    }

    return {
        init,
        crearLabel,
        crearLabelEquipo,
        crearLabelLinea,
        crearLabelComponente,
        crearLabelsProyecto,
        limpiarLabels,
        getLabels,
        toggleLabelDetail,
        actualizarVisibilidad,
        setVisibilityDistance,
        isDetailedMode,
        getComponentAbbr
    };
})();
