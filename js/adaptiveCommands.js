
// ================================================================
// SMARTFLOW ADAPTIVE COMMAND SYSTEM v2.1 - COMPLETO
// Archivo: js/adaptiveCommands.js
// 32 Comandos | 72 Variantes | 100% Cobertura Commands.js v3.6
// Novedades v2.1: Selector de componentes por categoría (cascada)
// ================================================================

const AdaptiveCommandSystem = (function() {
    
    let currentState = {
        commandPath: null,
        variantId: null,
        step: 0,
        selections: {},
        flow: null
    };

    // ================================================================
    // CATÁLOGO COMPLETO DE COMANDOS (32 comandos, 72 variantes)
    // ================================================================
    const COMMAND_FLOWS = {

        // ═══════════════════════════════════════════════════════
        // 1. CONFIGURACIÓN DE PROYECTO (3 variantes)
        // ═══════════════════════════════════════════════════════
        'PROJECT.SET': {
            name: 'Configurar Proyecto', icon: '⚙️', category: 'config',
            steps: [
                {
                    id: 'selectVariant', title: '¿Qué desea configurar?', type: 'select',
                    options: [
                        { value: 'defaults', label: '📋 Ver configuración actual', description: 'Muestra material y spec por defecto' },
                        { value: 'material', label: '🧪 Cambiar material por defecto', description: 'PPR, Acero, HDPE, PVC...' },
                        { value: 'spec', label: '📋 Cambiar especificación por defecto', description: 'Norma y schedule predeterminados' }
                    ],
                    nextMap: { defaults: 'executeDefaults', material: 'setMaterial', spec: 'setSpec' }
                },
                { id: 'setMaterial', title: 'Seleccione material por defecto', type: 'select',
                    options: () => getMaterialOptions(),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (sel, st) => `set project material ${st.setMaterial || sel}`
                },
                { id: 'setSpec', title: 'Seleccione especificación por defecto', type: 'select',
                    options: () => getSpecOptions(),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (sel, st) => `set project spec ${st.setSpec || sel}`
                },
                { id: 'executeDefaults', title: 'Configuración actual', type: 'info',
                    message: () => {
                        const defs = (typeof SmartFlowCommands !== 'undefined' && SmartFlowCommands.getProjectDefaults) ?
                            SmartFlowCommands.getProjectDefaults() : { material: 'N/D', spec: 'N/D' };
                        return `📐 Material por defecto: ${defs.material}\n📋 Spec por defecto: ${defs.spec}`;
                    },
                    isFinal: true, executeImmediately: true,
                    buildCommand: () => 'set project defaults'
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 2. CREAR EQUIPO (1 variante)
        // ═══════════════════════════════════════════════════════
        'CREATE.EQUIPMENT': {
            name: 'Crear Equipo', icon: '🏗️', category: 'create',
            steps: [
                { id: 'tipo', title: 'Seleccione tipo de equipo', type: 'dynamicSelect',
                    options: () => SmartFlowCatalog.listEquipmentTypes().map(t => {
                        const eq = SmartFlowCatalog.getEquipment(t);
                        return { value: t, label: `${eq?.nombre || t}`, icon: getEquipmentIcon(t), description: eq?.categoria || '' };
                    }),
                    next: 'tag'
                },
                { id: 'tag', title: 'Ingrese Tag del equipo', type: 'text', placeholder: 'Ej: TK-001, B-101, E-201',
                    validate: (v) => {
                        if (!v) return 'Tag requerido';
                        if (SmartFlowCore.findObjectByTag(v)) return 'Tag ya existe';
                        return null;
                    },
                    next: 'position'
                },
                { id: 'position', title: 'Posición del equipo (X, Y, Z) en mm', type: 'coordinate',
                    description: 'Coordenadas en milímetros',
                    next: 'dimensions'
                },
                { id: 'dimensions', title: 'Dimensiones del equipo', type: 'form',
                    fields: [
                        { id: 'diametro', type: 'number', label: 'Diámetro (mm)', default: 1000, min: 50 },
                        { id: 'altura', type: 'number', label: 'Altura (mm)', default: 1500, min: 50 },
                        { id: 'largo', type: 'number', label: 'Largo (mm)', default: 1000, min: 50 },
                        { id: 'ancho', type: 'number', label: 'Ancho (mm)', default: 1000, min: 50 }
                    ],
                    next: 'connections'
                },
                { id: 'connections', title: 'Conexiones (opcional)', type: 'form',
                    fields: [
                        { id: 'diametro_succion', type: 'number', label: 'Diámetro Succión (pulg)', default: 3 },
                        { id: 'diametro_descarga', type: 'number', label: 'Diámetro Descarga (pulg)', default: 3 },
                        { id: 'diametro_entrada', type: 'number', label: 'Diámetro Entrada (pulg)', default: 4 },
                        { id: 'diametro_salida', type: 'number', label: 'Diámetro Salida (pulg)', default: 4 },
                        { id: 'altura_salida_desde_base', type: 'number', label: 'Altura salida desde base (mm)' }
                    ],
                    next: 'specs'
                },
                { id: 'specs', title: 'Especificaciones', type: 'form',
                    fields: [
                        { id: 'material', type: 'select', label: 'Material', options: () => getMaterialOptions() },
                        { id: 'spec', type: 'select', label: 'Especificación', options: () => getSpecOptions() }
                    ],
                    next: 'extras'
                },
                { id: 'extras', title: 'Extras (opcional)', type: 'form',
                    fields: [
                        { id: 'baranda', type: 'checkbox', label: 'Incluir baranda' },
                        { id: 'escalera', type: 'checkbox', label: 'Incluir escalera' }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `create ${st.tipo} ${st.tag} at (${st.position.x},${st.position.y},${st.position.z})`;
                        const dims = st.dimensions || {};
                        if (dims.diametro) cmd += ` diam ${dims.diametro}`;
                        if (dims.altura) cmd += ` height ${dims.altura}`;
                        if (dims.largo) cmd += ` largo ${dims.largo}`;
                        if (dims.ancho) cmd += ` ancho ${dims.ancho}`;
                        const conn = st.connections || {};
                        if (conn.diametro_succion) cmd += ` succion ${conn.diametro_succion}`;
                        if (conn.diametro_descarga) cmd += ` descarga ${conn.diametro_descarga}`;
                        if (conn.diametro_entrada) cmd += ` entrada ${conn.diametro_entrada}`;
                        if (conn.diametro_salida) cmd += ` salida ${conn.diametro_salida}`;
                        if (conn.altura_salida_desde_base) cmd += ` altura_salida ${conn.altura_salida_desde_base}`;
                        const sp = st.specs || {};
                        if (sp.material) cmd += ` material ${sp.material}`;
                        if (sp.spec) cmd += ` spec ${sp.spec}`;
                        const ex = st.extras || {};
                        if (ex.baranda) cmd += ` baranda ${ex.baranda}`;
                        if (ex.escalera) cmd += ` escalera ${ex.escalera}`;
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 3. CREAR LÍNEA (1 variante)
        // ═══════════════════════════════════════════════════════
        'CREATE.LINE': {
            name: 'Crear Línea', icon: '📏', category: 'create',
            steps: [
                { id: 'tag', title: 'Tag de la línea', type: 'text', placeholder: 'Ej: L-001',
                    validate: (v) => v ? (SmartFlowCore.findObjectByTag(v) ? 'Tag ya existe' : null) : 'Tag requerido',
                    next: 'points'
                },
                { id: 'points', title: 'Puntos de ruta', type: 'coordinateList', minPoints: 2,
                    description: 'Agregue al menos 2 puntos (X, Y, Z) en mm',
                    next: 'specs'
                },
                { id: 'specs', title: 'Especificaciones', type: 'form',
                    fields: [
                        { id: 'diameter', type: 'select', label: 'Diámetro (pulg)', options: pipeDiameters(), default: '4' },
                        { id: 'material', type: 'select', label: 'Material', options: () => getMaterialOptions() },
                        { id: 'spec', type: 'select', label: 'Especificación', options: () => getSpecOptions() }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `create line ${st.tag} route`;
                        st.points.forEach(p => cmd += ` (${p.x},${p.y},${p.z})`);
                        const sp = st.specs || {};
                        if (sp.diameter) cmd += ` diameter ${sp.diameter}`;
                        if (sp.material) cmd += ` material ${sp.material}`;
                        if (sp.spec) cmd += ` spec ${sp.spec}`;
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 4. LÍNEA ENTRE EQUIPOS (2 variantes)
        // ═══════════════════════════════════════════════════════
        'CREATE.LINE_FROM_TO': {
            name: 'Línea Entre Equipos', icon: '🔗', category: 'create',
            steps: [
                { id: 'selectVariant', title: 'Modo de conexión', type: 'select',
                    options: [
                        { value: 'direct', label: '🔗 Conexión directa', description: 'Línea recta entre dos puntos' },
                        { value: 'via', label: '🗺️ Con waypoints', description: 'Ruta con puntos intermedios' }
                    ],
                    nextMap: { direct: 'tag', via: 'tag' }
                },
                { id: 'tag', title: 'Tag de la línea', type: 'text', placeholder: 'Ej: L-001',
                    validate: (v) => v ? (SmartFlowCore.findObjectByTag(v) ? 'Tag ya existe' : null) : 'Tag requerido',
                    next: 'fromEquip'
                },
                { id: 'fromEquip', title: 'Equipo origen', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'fromPort'
                },
                { id: 'fromPort', title: 'Puerto origen', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.fromEquip),
                    next: 'toEquip'
                },
                { id: 'toEquip', title: 'Equipo destino', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'toPort'
                },
                { id: 'toPort', title: 'Puerto destino', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.toEquip),
                    next: 'waypointsCheck'
                },
                { id: 'waypointsCheck', title: 'Waypoints', type: 'conditional',
                    condition: (st) => st.selectVariant === 'via',
                    ifTrue: 'waypoints',
                    ifFalse: 'specs'
                },
                { id: 'waypoints', title: 'Puntos intermedios (vía)', type: 'coordinateList', minPoints: 1,
                    description: 'Agregue waypoints para la ruta',
                    next: 'specs'
                },
                { id: 'specs', title: 'Especificaciones de línea', type: 'form',
                    fields: [
                        { id: 'diameter', type: 'select', label: 'Diámetro', options: pipeDiameters(), default: '4' },
                        { id: 'material', type: 'select', label: 'Material', options: () => getMaterialOptions() },
                        { id: 'spec', type: 'select', label: 'Especificación', options: () => getSpecOptions() }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `line ${st.tag} from ${st.fromEquip} ${st.fromPort} to ${st.toEquip}`;
                        if (st.toPort) cmd += ` ${st.toPort}`;
                        if (st.waypoints && st.waypoints.length > 0) {
                            cmd += ' via';
                            st.waypoints.forEach(wp => cmd += ` (${wp.x},${wp.y},${wp.z})`);
                        }
                        const sp = st.specs || {};
                        if (sp.diameter) cmd += ` diameter ${sp.diameter}`;
                        if (sp.material) cmd += ` material ${sp.material}`;
                        if (sp.spec) cmd += ` spec ${sp.spec}`;
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 5. CONECTAR (6 variantes)
        // ═══════════════════════════════════════════════════════
        'CONNECT': {
            name: 'Conectar', icon: '🔌', category: 'connect',
            steps: [
                { id: 'selectVariant', title: 'Tipo de conexión', type: 'select',
                    options: [
                        { value: 'equipment_to_equipment', label: '🏗️ Equipo → Equipo', description: 'Conexión directa entre equipos' },
                        { value: 'equipment_to_line', label: '🏗️→📏 Equipo → Línea', description: 'Conectar equipo a punto de línea' },
                        { value: 'line_to_equipment', label: '📏→🏗️ Línea → Equipo', description: 'Conectar punto de línea a equipo' },
                        { value: 'line_to_line', label: '📏→📏 Línea → Línea', description: 'Conectar dos líneas entre sí' },
                        { value: 'via_waypoints', label: '🗺️ Con waypoints', description: 'Ruta con puntos intermedios' },
                        { value: 'with_orientation', label: '🧭 Con orientación de branch', description: 'Especificar dirección del ramal' }
                    ],
                    nextMap: {
                        equipment_to_equipment: 'fromEquip',
                        equipment_to_line: 'fromEquip',
                        line_to_equipment: 'fromLine',
                        line_to_line: 'fromLine',
                        via_waypoints: 'fromEquip',
                        with_orientation: 'fromEquip'
                    }
                },
                { id: 'fromEquip', title: 'Equipo origen', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'fromPort',
                    condition: (st) => ['equipment_to_equipment', 'equipment_to_line', 'via_waypoints', 'with_orientation'].includes(st.selectVariant)
                },
                { id: 'fromLine', title: 'Línea origen', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'fromPosition',
                    condition: (st) => ['line_to_equipment', 'line_to_line'].includes(st.selectVariant)
                },
                { id: 'fromPort', title: 'Puerto origen', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.fromEquip),
                    next: 'toTarget',
                    condition: (st) => st.fromEquip
                },
                { id: 'fromPosition', title: 'Posición en línea origen (0-1)', type: 'slider', min: 0.01, max: 0.99, step: 0.01, default: 0.5,
                    next: 'toTarget',
                    condition: (st) => st.fromLine
                },
                { id: 'toTarget', title: 'Tipo de destino', type: 'select',
                    options: (sel, st) => {
                        const opts = [{ value: 'equipment', label: '🏗️ Equipo' }];
                        if (['equipment_to_line', 'line_to_line', 'line_to_equipment'].includes(st.selectVariant)) {
                            opts.push({ value: 'line', label: '📏 Línea' });
                        } else {
                            opts.push({ value: 'line', label: '📏 Línea' });
                        }
                        return opts;
                    },
                    nextMap: { equipment: 'toEquip', line: 'toLine' }
                },
                { id: 'toEquip', title: 'Equipo destino', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'toPort'
                },
                { id: 'toLine', title: 'Línea destino', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'toPosition'
                },
                { id: 'toPort', title: 'Puerto destino', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.toEquip),
                    next: 'waypointsCheck'
                },
                { id: 'toPosition', title: 'Posición en línea destino (0-1)', type: 'slider', min: 0.01, max: 0.99, step: 0.01, default: 0.5,
                    next: 'waypointsCheck'
                },
                { id: 'waypointsCheck', title: 'Configuración adicional', type: 'conditional',
                    condition: (st) => st.selectVariant === 'via_waypoints',
                    ifTrue: 'waypoints',
                    ifFalse: 'orientationCheck'
                },
                { id: 'waypoints', title: 'Waypoints intermedios', type: 'coordinateList', minPoints: 1,
                    next: 'specs'
                },
                { id: 'orientationCheck', title: 'Orientación', type: 'conditional',
                    condition: (st) => st.selectVariant === 'with_orientation',
                    ifTrue: 'branchOrientation',
                    ifFalse: 'specs'
                },
                { id: 'branchOrientation', title: 'Orientación del branch (dx, dy, dz)', type: 'coordinate',
                    description: 'Vector de dirección del ramal',
                    next: 'specs'
                },
                { id: 'specs', title: 'Especificaciones de línea', type: 'form',
                    fields: [
                        { id: 'diameter', type: 'select', label: 'Diámetro', options: pipeDiameters(), default: '4' },
                        { id: 'material', type: 'select', label: 'Material', options: () => getMaterialOptions() },
                        { id: 'spec', type: 'select', label: 'Especificación', options: () => getSpecOptions() }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = 'connect ';
                        if (st.fromEquip) {
                            cmd += `${st.fromEquip} ${st.fromPort}`;
                        } else if (st.fromLine) {
                            cmd += `${st.fromLine} ${st.fromPosition}`;
                        }
                        cmd += ' to ';
                        if (st.toEquip) {
                            cmd += `${st.toEquip}`;
                            if (st.toPort) cmd += ` ${st.toPort}`;
                        } else if (st.toLine) {
                            cmd += `${st.toLine} ${st.toPosition}`;
                        }
                        if (st.waypoints && st.waypoints.length > 0) {
                            cmd += ' via';
                            st.waypoints.forEach(wp => cmd += ` (${wp.x},${wp.y},${wp.z})`);
                        }
                        if (st.branchOrientation) {
                            cmd += ` orient (${st.branchOrientation.x},${st.branchOrientation.y},${st.branchOrientation.z})`;
                        }
                        const sp = st.specs || {};
                        if (sp.diameter) cmd += ` diameter ${sp.diameter}`;
                        if (sp.material) cmd += ` material ${sp.material}`;
                        if (sp.spec) cmd += ` spec ${sp.spec}`;
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 6. RUTA (2 variantes)
        // ═══════════════════════════════════════════════════════
        'ROUTE': {
            name: 'Ruta', icon: '🗺️', category: 'connect',
            steps: [
                { id: 'selectVariant', title: 'Modo de ruteo', type: 'select',
                    options: [
                        { value: 'direct', label: '🔗 Ruta directa', description: 'Línea recta entre puertos' },
                        { value: 'via', label: '🗺️ Con waypoints', description: 'Ruta con puntos intermedios' }
                    ],
                    nextMap: { direct: 'fromEquip', via: 'fromEquip' }
                },
                { id: 'fromEquip', title: 'Equipo origen', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'fromPort'
                },
                { id: 'fromPort', title: 'Puerto origen', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.fromEquip),
                    next: 'toEquip'
                },
                { id: 'toEquip', title: 'Equipo destino', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'toPort'
                },
                { id: 'toPort', title: 'Puerto destino', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.toEquip),
                    next: 'waypointsCheck'
                },
                { id: 'waypointsCheck', title: 'Waypoints', type: 'conditional',
                    condition: (st) => st.selectVariant === 'via',
                    ifTrue: 'waypoints',
                    ifFalse: 'specs'
                },
                { id: 'waypoints', title: 'Puntos intermedios', type: 'coordinateList', minPoints: 1,
                    next: 'specs'
                },
                { id: 'specs', title: 'Especificaciones', type: 'form',
                    fields: [
                        { id: 'diameter', type: 'select', label: 'Diámetro', options: pipeDiameters(), default: '4' },
                        { id: 'material', type: 'select', label: 'Material', options: () => getMaterialOptions() },
                        { id: 'spec', type: 'select', label: 'Especificación', options: () => getSpecOptions() }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `route from ${st.fromEquip} ${st.fromPort}`;
                        if (st.waypoints && st.waypoints.length > 0) {
                            cmd += ' via';
                            st.waypoints.forEach(wp => cmd += ` (${wp.x},${wp.y},${wp.z})`);
                        }
                        cmd += ` to ${st.toEquip}`;
                        if (st.toPort) cmd += ` ${st.toPort}`;
                        const sp = st.specs || {};
                        if (sp.diameter) cmd += ` diameter ${sp.diameter}`;
                        if (sp.material) cmd += ` material ${sp.material}`;
                        if (sp.spec) cmd += ` spec ${sp.spec}`;
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 7. DERIVAR / TAP (2 variantes)
        // ═══════════════════════════════════════════════════════
        'TAP': {
            name: 'Derivar (Tap)', icon: '🔀', category: 'connect',
            steps: [
                { id: 'selectVariant', title: 'Tipo de derivación', type: 'select',
                    options: [
                        { value: 'standard', label: '🔀 Derivación estándar', description: 'Conexión simple a línea' },
                        { value: 'with_orientation', label: '🧭 Con orientación', description: 'Especificar dirección del ramal' }
                    ],
                    nextMap: { standard: 'fromEquip', with_orientation: 'fromEquip' }
                },
                { id: 'fromEquip', title: 'Equipo origen', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'fromPort'
                },
                { id: 'fromPort', title: 'Puerto origen', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.fromEquip),
                    next: 'toLine'
                },
                { id: 'toLine', title: 'Línea destino', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'position'
                },
                { id: 'position', title: 'Posición de derivación (0-1)', type: 'slider', min: 0.02, max: 0.98, step: 0.01, default: 0.5,
                    next: 'orientationCheck'
                },
                { id: 'orientationCheck', title: 'Orientación', type: 'conditional',
                    condition: (st) => st.selectVariant === 'with_orientation',
                    ifTrue: 'branchOrientation',
                    ifFalse: 'specs'
                },
                { id: 'branchOrientation', title: 'Dirección del ramal (dx, dy, dz)', type: 'coordinate',
                    next: 'specs'
                },
                { id: 'specs', title: 'Especificaciones', type: 'form',
                    fields: [
                        { id: 'diameter', type: 'select', label: 'Diámetro', options: pipeDiameters(), default: '4' },
                        { id: 'material', type: 'select', label: 'Material', options: () => getMaterialOptions() },
                        { id: 'spec', type: 'select', label: 'Especificación', options: () => getSpecOptions() }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `tap ${st.fromEquip} ${st.fromPort} to ${st.toLine} ${st.position}`;
                        if (st.branchOrientation) {
                            cmd += ` orient (${st.branchOrientation.x},${st.branchOrientation.y},${st.branchOrientation.z})`;
                        }
                        const sp = st.specs || {};
                        if (sp.diameter) cmd += ` diameter ${sp.diameter}`;
                        if (sp.material) cmd += ` material ${sp.material}`;
                        if (sp.spec) cmd += ` spec ${sp.spec}`;
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 8. DIVIDIR LÍNEA / SPLIT (1 variante)
        // ═══════════════════════════════════════════════════════
        'SPLIT': {
            name: 'Dividir Línea', icon: '✂️', category: 'edit',
            steps: [
                { id: 'lineTag', title: 'Seleccione línea a dividir', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'position'
                },
                { id: 'position', title: 'Punto de división (X, Y, Z)', type: 'coordinate',
                    description: 'Coordenadas del punto de corte en mm',
                    next: 'type'
                },
                { id: 'type', title: 'Tipo de accesorio', type: 'select',
                    options: [
                        { value: 'TEE_EQUAL', label: '🔱 TEE Recta' },
                        { value: 'TEE_REDUCING', label: '🔱 TEE Reductora' }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        return `split ${st.lineTag} at (${st.position.x},${st.position.y},${st.position.z}) type ${st.type || 'TEE_EQUAL'}`;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 9. EDITAR (8 variantes) - CON SELECTOR DE CATEGORÍA
        // ═══════════════════════════════════════════════════════
        'EDIT': {
            name: 'Editar', icon: '✏️', category: 'edit',
            steps: [
                { id: 'selectType', title: '¿Qué desea editar?', type: 'select',
                    options: [
                        { value: 'equipment', label: '🏗️ Equipo', icon: '🏗️' },
                        { value: 'line', label: '📏 Línea/Tubería', icon: '📏' }
                    ],
                    nextMap: { equipment: 'selectEquipment', line: 'selectLine' }
                },
                // --- EQUIPO ---
                { id: 'selectEquipment', title: 'Seleccione equipo', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'equipmentAction'
                },
                { id: 'equipmentAction', title: 'Acción sobre equipo', type: 'select',
                    options: [
                        { value: 'move', label: '📍 Mover', description: 'Cambiar posición' },
                        { value: 'port_diameter', label: '🔌 Diámetro de puerto', description: 'Cambiar diámetro de conexión' },
                        { value: 'port_position', label: '📌 Posición de puerto', description: 'Cambiar ubicación relativa' },
                        { value: 'port_direction', label: '🧭 Dirección de puerto', description: 'Cambiar orientación' }
                    ],
                    nextMap: {
                        move: 'equipmentMove',
                        port_diameter: 'equipmentPortSelect',
                        port_position: 'equipmentPortSelect',
                        port_direction: 'equipmentPortSelect'
                    }
                },
                { id: 'equipmentMove', title: 'Nueva posición (X, Y, Z)', type: 'coordinate',
                    isFinal: true,
                    buildCommand: (params, st) => `edit equipment ${st.selectEquipment} move (${st.equipmentMove.x},${st.equipmentMove.y},${st.equipmentMove.z})`
                },
                { id: 'equipmentPortSelect', title: 'Seleccione puerto', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.selectEquipment),
                    next: 'equipmentPortValue'
                },
                { id: 'equipmentPortValue', title: 'Nuevo valor', type: 'dynamic',
                    resolver: (st) => {
                        if (st.equipmentAction === 'port_diameter') {
                            return { type: 'number', label: 'Diámetro (pulgadas)', default: 4 };
                        } else if (st.equipmentAction === 'port_position') {
                            return { type: 'coordinate', label: 'Posición relativa (dx, dy, dz)' };
                        } else {
                            return { type: 'coordinate', label: 'Dirección (dx, dy, dz)', default: { x: 0, y: 1, z: 0 } };
                        }
                    },
                    isFinal: true,
                    buildCommand: (params, st) => {
                        const port = st.equipmentPortSelect;
                        const val = st.equipmentPortValue;
                        if (st.equipmentAction === 'port_diameter') {
                            return `edit equipment ${st.selectEquipment} set puerto ${port} diametro ${val}`;
                        } else if (st.equipmentAction === 'port_position') {
                            return `edit equipment ${st.selectEquipment} set puerto ${port} posicion (${val.x},${val.y},${val.z})`;
                        } else {
                            return `edit equipment ${st.selectEquipment} set puerto ${port} direccion (${val.x},${val.y},${val.z})`;
                        }
                    }
                },
                // --- LÍNEA ---
                { id: 'selectLine', title: 'Seleccione línea', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'lineAction'
                },
                { id: 'lineAction', title: 'Acción sobre línea', type: 'select',
                    options: [
                        { value: 'material', label: '🧪 Cambiar material', description: 'PPR, Acero, HDPE...' },
                        { value: 'diameter', label: '📏 Cambiar diámetro', description: '2", 3", 4", 6"...' },
                        { value: 'spec', label: '📋 Cambiar especificación', description: 'Norma y schedule' },
                        { value: 'add_component', label: '🔩 Agregar componente', description: 'Válvula, codo, tee, brida...' }
                    ],
                    nextMap: {
                        material: 'lineMaterial',
                        diameter: 'lineDiameter',
                        spec: 'lineSpec',
                        add_component: 'lineComponentCategory'
                    }
                },
                { id: 'lineMaterial', title: 'Nuevo material', type: 'select',
                    options: () => getMaterialOptions(),
                    isFinal: true,
                    buildCommand: (params, st) => `edit line ${st.selectLine} set material ${st.lineMaterial}`
                },
                { id: 'lineDiameter', title: 'Nuevo diámetro', type: 'select',
                    options: pipeDiameters(),
                    isFinal: true,
                    buildCommand: (params, st) => `edit line ${st.selectLine} set diameter ${st.lineDiameter}`
                },
                { id: 'lineSpec', title: 'Nueva especificación', type: 'select',
                    options: () => getSpecOptions(),
                    isFinal: true,
                    buildCommand: (params, st) => `edit line ${st.selectLine} set spec ${st.lineSpec}`
                },
                // ✅ NUEVO: Selector de categoría de componente (PASO 1)
                { id: 'lineComponentCategory', title: 'Seleccione categoría de componente', type: 'select',
                    options: () => getComponentCategories(),
                    next: 'lineComponentType'
                },
                // ✅ NUEVO: Selector de componente filtrado (PASO 2)
                { id: 'lineComponentType', title: 'Seleccione componente', type: 'dynamicSelect',
                    options: (sel, st) => {
                        const cat = st.lineComponentCategory;
                        if (cat === 'ALL') return getComponentTypeOptions();
                        return getComponentTypeOptions().filter(comp => comp.category === cat);
                    },
                    next: 'lineComponentPosition'
                },
                { id: 'lineComponentPosition', title: 'Posición en línea (0-1)', type: 'slider', min: 0.01, max: 0.99, step: 0.01, default: 0.5,
                    next: 'lineComponentOrient'
                },
                { id: 'lineComponentOrient', title: 'Orientación (opcional)', type: 'coordinate',
                    description: 'Vector (dx, dy, dz). Dejar en 0 para automático.',
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `edit line ${st.selectLine} add component ${st.lineComponentType} at ${st.lineComponentPosition}`;
                        const orient = st.lineComponentOrient;
                        if (orient && (orient.x !== 0 || orient.y !== 0 || orient.z !== 0)) {
                            cmd += ` orient (${orient.x},${orient.y},${orient.z})`;
                        }
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 10. ELIMINAR (2 variantes)
        // ═══════════════════════════════════════════════════════
        'DELETE': {
            name: 'Eliminar', icon: '🗑️', category: 'edit',
            steps: [
                { id: 'selectType', title: '¿Qué tipo de elemento eliminar?', type: 'select',
                    options: [
                        { value: 'equipment', label: '🏗️ Equipo', description: 'Elimina equipo y líneas conectadas' },
                        { value: 'line', label: '📏 Línea', description: 'Elimina línea y libera puertos' }
                    ],
                    nextMap: { equipment: 'selectEquipment', line: 'selectLine' }
                },
                { id: 'selectEquipment', title: 'Seleccione equipo a eliminar', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'confirmEquipment'
                },
                { id: 'confirmEquipment', title: '⚠️ Confirmar eliminación', type: 'confirm',
                    message: (st) => {
                        const connectedLines = SmartFlowCore.getLines().filter(l =>
                            (l.origin && l.origin.objTag === st.selectEquipment) ||
                            (l.destination && l.destination.objTag === st.selectEquipment)
                        );
                        return `¿Eliminar "${st.selectEquipment}"?\n\nSe eliminarán ${connectedLines.length} línea(s) conectada(s).\nEsta acción no se puede deshacer.`;
                    },
                    isFinal: true,
                    buildCommand: (params, st) => `delete equipment ${st.selectEquipment}`
                },
                { id: 'selectLine', title: 'Seleccione línea a eliminar', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'confirmLine'
                },
                { id: 'confirmLine', title: '⚠️ Confirmar eliminación', type: 'confirm',
                    message: (st) => `¿Eliminar la línea "${st.selectLine}"?\n\nLos puertos conectados quedarán liberados.`,
                    isFinal: true,
                    buildCommand: (params, st) => `delete line ${st.selectLine}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 11. MOVER (2 variantes)
        // ═══════════════════════════════════════════════════════
        'MOVE': {
            name: 'Mover', icon: '📍', category: 'edit',
            steps: [
                { id: 'selectElement', title: 'Seleccione elemento a mover', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    next: 'selectMode'
                },
                { id: 'selectMode', title: 'Modo de movimiento', type: 'select',
                    options: [
                        { value: 'to', label: '📍 A posición absoluta', description: 'Mover a coordenadas exactas' },
                        { value: 'by', label: '↗️ Por incremento', description: 'Desplazar una distancia relativa' }
                    ],
                    next: 'coordinates'
                },
                { id: 'coordinates', title: 'Vector (X, Y, Z) en mm', type: 'coordinate',
                    isFinal: true,
                    buildCommand: (params, st) => {
                        const c = st.coordinates;
                        if (st.selectMode === 'to') {
                            return `move ${st.selectElement} to (${c.x},${c.y},${c.z})`;
                        }
                        return `move ${st.selectElement} by (${c.x},${c.y},${c.z})`;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 12. ROTAR (1 variante)
        // ═══════════════════════════════════════════════════════
        'ROTATE': {
            name: 'Rotar', icon: '🔄', category: 'edit',
            steps: [
                { id: 'selectElement', title: 'Seleccione elemento a rotar', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'angle'
                },
                { id: 'angle', title: 'Ángulo de rotación (grados)', type: 'number', default: 90, min: -360, max: 360,
                    next: 'axis'
                },
                { id: 'axis', title: 'Eje de rotación', type: 'select',
                    options: [
                        { value: 'X', label: 'Eje X' },
                        { value: 'Y', label: 'Eje Y (vertical)' },
                        { value: 'Z', label: 'Eje Z' }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => `rotate ${st.selectElement} by ${st.angle} around ${st.axis}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 13. DUPLICAR (1 variante)
        // ═══════════════════════════════════════════════════════
        'DUPLICATE': {
            name: 'Duplicar', icon: '📋', category: 'edit',
            steps: [
                { id: 'selectElement', title: 'Seleccione elemento a duplicar', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    next: 'newTag'
                },
                { id: 'newTag', title: 'Nuevo Tag', type: 'text', placeholder: 'Ej: TK-002',
                    validate: (v) => v ? (SmartFlowCore.findObjectByTag(v) ? 'Tag ya existe' : null) : 'Tag requerido',
                    next: 'offset'
                },
                { id: 'offset', title: 'Desplazamiento (X, Y, Z) en mm', type: 'coordinate',
                    default: { x: 2000, y: 0, z: 0 },
                    isFinal: true,
                    buildCommand: (params, st) => `duplicate ${st.selectElement} as ${st.newTag} offset (${st.offset.x},${st.offset.y},${st.offset.z})`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 14. ALINEAR (1 variante)
        // ═══════════════════════════════════════════════════════
        'ALIGN': {
            name: 'Alinear', icon: '📐', category: 'edit',
            steps: [
                { id: 'selectElements', title: 'Seleccione equipos a alinear', type: 'multiSelect',
                    options: () => getEquipmentOptions(),
                    minSelect: 2,
                    next: 'axis'
                },
                { id: 'axis', title: 'Eje de alineación', type: 'select',
                    options: [
                        { value: 'X', label: 'Eje X' },
                        { value: 'Y', label: 'Eje Y (vertical)' },
                        { value: 'Z', label: 'Eje Z' }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => `align ${st.selectElements.join(' ')} on ${st.axis}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 15. APOYAR / PLACE (2 variantes)
        // ═══════════════════════════════════════════════════════
        'PLACE': {
            name: 'Apoyar/Posar', icon: '📌', category: 'edit',
            steps: [
                { id: 'selectVariant', title: 'Modo de apoyo', type: 'select',
                    options: [
                        { value: 'on_ground', label: '🌍 Sobre suelo', description: 'Apoyar a elevación 0' },
                        { value: 'on_surface', label: '🏗️ Sobre superficie', description: 'Apoyar sobre otro equipo' }
                    ],
                    nextMap: { on_ground: 'selectEquipmentGround', on_surface: 'selectEquipment' }
                },
                { id: 'selectEquipmentGround', title: 'Seleccione equipo', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    isFinal: true,
                    buildCommand: (params, st) => `place ${st.selectEquipmentGround} on ground`
                },
                { id: 'selectEquipment', title: 'Seleccione equipo a apoyar', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    next: 'selectSurface'
                },
                { id: 'selectSurface', title: 'Seleccione superficie', type: 'dynamicSelect',
                    options: (sel, st) => getEquipmentOptions().filter(e => e.value !== st.selectEquipment),
                    isFinal: true,
                    buildCommand: (params, st) => `place ${st.selectEquipment} on ${st.selectSurface}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 16. ACCESORIOS (3 variantes) - CON SELECTOR DE CATEGORÍA
        // ═══════════════════════════════════════════════════════
        'ACCESSORIES': {
            name: 'Accesorios', icon: '🔩', category: 'edit',
            steps: [
                { id: 'selectLine', title: 'Seleccione línea', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'selectVariant'
                },
                { id: 'selectVariant', title: 'Modo', type: 'select',
                    options: [
                        { value: 'add_manual', label: '🔩 Manual', description: 'Agregar componente en posición específica' },
                        { value: 'auto', label: '🤖 Automático', description: 'Espaciado óptimo automático' },
                        { value: 'transition', label: '🔀 Transición', description: 'Transición de material' }
                    ],
                    nextMap: { add_manual: 'accessoryCategory', auto: 'autoAccessoryCategory', transition: 'transitionFrom' }
                },
                // ✅ NUEVO: Selector de categoría para modo Manual (PASO 1)
                { id: 'accessoryCategory', title: 'Seleccione categoría', type: 'select',
                    options: () => getComponentCategories(),
                    next: 'manualComponents'
                },
                // ✅ NUEVO: Componentes filtrados para modo Manual (PASO 2)
                { id: 'manualComponents', title: 'Seleccione componentes', type: 'multiComponentSelect',
                    options: (sel, st) => {
                        const cat = st.accessoryCategory;
                        if (cat === 'ALL') return getComponentTypeOptions();
                        return getComponentTypeOptions().filter(comp => comp.category === cat);
                    },
                    next: 'manualPosition'
                },
                { id: 'manualPosition', title: 'Posiciones', type: 'form',
                    fields: (st) => (st.manualComponents || []).map((c, i) => ({
                        id: `pos_${i}`, type: 'slider', label: `Posición para ${c}`, min: 0.01, max: 0.99, step: 0.01, default: 0.5
                    })),
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `accessories ${st.selectLine} add`;
                        (st.manualComponents || []).forEach((c, i) => {
                            const posKey = `pos_${i}`;
                            const pos = st.manualPosition?.[posKey] || st[posKey] || 0.5;
                            cmd += ` ${c}@${pos}`;
                        });
                        return cmd;
                    }
                },
                // ✅ NUEVO: Selector de categoría para modo Auto (PASO 1)
                { id: 'autoAccessoryCategory', title: 'Seleccione categoría', type: 'select',
                    options: () => getComponentCategories(),
                    next: 'autoComponents'
                },
                // ✅ NUEVO: Componentes filtrados para modo Auto (PASO 2)
                { id: 'autoComponents', title: 'Tipos de componentes', type: 'multiSelect',
                    options: (sel, st) => {
                        const cat = st.autoAccessoryCategory;
                        if (cat === 'ALL') return getComponentTypeOptions();
                        return getComponentTypeOptions().filter(comp => comp.category === cat);
                    },
                    next: 'autoPosition'
                },
                { id: 'autoPosition', title: 'Posición inicial', type: 'slider', min: 0.01, max: 0.99, step: 0.01, default: 0.5,
                    next: 'autoDiameter'
                },
                { id: 'autoDiameter', title: 'Diámetro (opcional)', type: 'select',
                    options: () => [{ value: '', label: 'Usar diámetro de línea' }, ...pipeDiameters()],
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `accessories ${st.selectLine} auto`;
                        (st.autoComponents || []).forEach(c => cmd += ` ${c}`);
                        cmd += ` at ${st.autoPosition}`;
                        if (st.autoDiameter) cmd += ` diameter ${st.autoDiameter}`;
                        return cmd;
                    }
                },
                // Transición
                { id: 'transitionFrom', title: 'Material desde', type: 'select',
                    options: () => getMaterialOptions(),
                    next: 'transitionTo'
                },
                { id: 'transitionTo', title: 'Material hasta', type: 'select',
                    options: () => getMaterialOptions(),
                    next: 'transitionComp'
                },
                { id: 'transitionComp', title: 'Componente adicional (opcional)', type: 'select',
                    options: () => [{ value: '', label: 'Ninguno' }, ...getComponentTypeOptions()],
                    next: 'transitionPos'
                },
                { id: 'transitionPos', title: 'Posición', type: 'slider', min: 0.1, max: 0.9, step: 0.01, default: 0.85,
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `accessories ${st.selectLine} transition from ${st.transitionFrom} to ${st.transitionTo}`;
                        if (st.transitionComp) cmd += ` with ${st.transitionComp}`;
                        cmd += ` at ${st.transitionPos}`;
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 17. EXTENDER LÍNEA (2 variantes)
        // ═══════════════════════════════════════════════════════
        'EXTEND': {
            name: 'Extender Línea', icon: '➡️', category: 'edit',
            steps: [
                { id: 'selectLine', title: 'Seleccione línea a extender', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'selectVariant'
                },
                { id: 'selectVariant', title: 'Modo de extensión', type: 'select',
                    options: [
                        { value: 'direct', label: '➡️ Directa', description: 'Extensión recta al destino' },
                        { value: 'via', label: '🗺️ Con waypoints', description: 'Con puntos intermedios' }
                    ],
                    nextMap: { direct: 'targetTag', via: 'targetTag' }
                },
                { id: 'targetTag', title: 'Equipo/Línea destino', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    next: 'targetPort'
                },
                { id: 'targetPort', title: 'Puerto destino', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.targetTag),
                    next: 'waypointsCheck'
                },
                { id: 'waypointsCheck', title: 'Waypoints', type: 'conditional',
                    condition: (st) => st.selectVariant === 'via',
                    ifTrue: 'waypoints',
                    ifFalse: null
                },
                { id: 'waypoints', title: 'Puntos intermedios', type: 'coordinateList', minPoints: 1,
                    isFinal: true,
                    buildCommand: (params, st) => {
                        let cmd = `extend line ${st.selectLine} to ${st.targetTag}`;
                        if (st.targetPort) cmd += ` ${st.targetPort}`;
                        if (st.waypoints && st.waypoints.length > 0) {
                            cmd += ' via';
                            st.waypoints.forEach(wp => cmd += ` (${wp.x},${wp.y},${wp.z})`);
                        }
                        return cmd;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 18. OPTIMIZAR RUTA (1 variante)
        // ═══════════════════════════════════════════════════════
        'OPTIMIZE': {
            name: 'Optimizar Ruta', icon: '⚡', category: 'edit',
            steps: [
                { id: 'selectLine', title: 'Seleccione línea a optimizar', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    isFinal: true,
                    buildCommand: (params, st) => `optimize route ${st.selectLine}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 19. RE-ENRUTAR (2 variantes)
        // ═══════════════════════════════════════════════════════
        'REROUTE': {
            name: 'Re-enrutar', icon: '🔀', category: 'edit',
            steps: [
                { id: 'selectLine', title: 'Seleccione línea a re-enrutar', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'selectVariant'
                },
                { id: 'selectVariant', title: 'Modo', type: 'select',
                    options: [
                        { value: 'smart', label: '🧠 Inteligente', description: 'Ruta óptima automática' },
                        { value: 'with_elevation', label: '📏 Con elevación fija', description: 'Mantener elevación constante' }
                    ],
                    nextMap: { smart: 'modeSelect', with_elevation: 'elevation' }
                },
                { id: 'modeSelect', title: 'Modo de ruteo', type: 'select',
                    options: [
                        { value: 'smart', label: 'Smart' },
                        { value: 'orthogonal', label: 'Orthogonal' }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => `reroute line ${st.selectLine} mode ${st.modeSelect || 'smart'}`
                },
                { id: 'elevation', title: 'Elevación (mm)', type: 'number', default: 0,
                    next: 'modeSelect2'
                },
                { id: 'modeSelect2', title: 'Modo de ruteo', type: 'select',
                    options: [
                        { value: 'smart', label: 'Smart' },
                        { value: 'orthogonal', label: 'Orthogonal' }
                    ],
                    isFinal: true,
                    buildCommand: (params, st) => `reroute line ${st.selectLine} mode ${st.modeSelect2 || 'smart'} elevation ${st.elevation || 0}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 20. INFORMACIÓN (3 variantes)
        // ═══════════════════════════════════════════════════════
        'INFO': {
            name: 'Información', icon: 'ℹ️', category: 'query',
            steps: [
                { id: 'selectVariant', title: 'Tipo de información', type: 'select',
                    options: [
                        { value: 'equipment', label: '🏗️ Equipo', description: 'Dimensiones, puertos, especificaciones' },
                        { value: 'line', label: '📏 Línea', description: 'Longitud, BOM, componentes' },
                        { value: 'component', label: '🔩 Componente', description: 'Detalles del accesorio' }
                    ],
                    nextMap: { equipment: 'selectEquipment', line: 'selectLine', component: 'selectComponent' }
                },
                { id: 'selectEquipment', title: 'Seleccione equipo', type: 'dynamicSelect',
                    options: () => getEquipmentOptions(),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => `info equipment ${st.selectEquipment}`
                },
                { id: 'selectLine', title: 'Seleccione línea', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => `info line ${st.selectLine}`
                },
                { id: 'selectComponent', title: 'Seleccione componente', type: 'dynamicSelect',
                    options: () => getAllComponentOptions(),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => `info component ${st.selectComponent}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 21. COORDENADAS / POINT (4 variantes)
        // ═══════════════════════════════════════════════════════
        'POINT': {
            name: 'Coordenadas', icon: '📍', category: 'query',
            steps: [
                { id: 'selectVariant', title: '¿Qué desea consultar?', type: 'select',
                    options: [
                        { value: 'base', label: '📍 Posición base', description: 'Coordenadas del centro' },
                        { value: 'port', label: '🔌 Puerto específico', description: 'Coordenadas de un puerto' },
                        { value: 'point_index', label: '📏 Punto por índice', description: 'Punto de ruta específico' },
                        { value: 'param', label: '📐 Punto paramétrico', description: 'Punto en posición 0-1' }
                    ],
                    nextMap: { base: 'selectElement', port: 'selectElement', point_index: 'selectLine', param: 'selectLine' }
                },
                { id: 'selectElement', title: 'Seleccione elemento', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    next: 'portSelect'
                },
                { id: 'portSelect', title: 'Seleccione puerto', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.selectElement),
                    condition: (st) => st.selectVariant === 'port',
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => {
                        if (st.selectVariant === 'base') return `point de ${st.selectElement}`;
                        if (st.selectVariant === 'port') return `point de ${st.selectElement} puerto ${st.portSelect}`;
                        return '';
                    }
                },
                { id: 'selectLine', title: 'Seleccione línea', type: 'dynamicSelect',
                    options: () => getLineOptions(),
                    next: 'pointValue'
                },
                { id: 'pointValue', title: (st) => st.selectVariant === 'point_index' ? 'Índice del punto' : 'Posición paramétrica (0-1)', 
                    type: 'dynamic',
                    resolver: (st) => {
                        if (st.selectVariant === 'point_index') {
                            const line = SmartFlowCore.findObjectByTag(st.selectLine);
                            const pts = line ? SmartFlowCore.getLinePoints(line) : [];
                            const maxIdx = pts.length - 1;
                            return { type: 'number', label: `Índice (0-${maxIdx >= 0 ? maxIdx : '?'})`, min: 0, max: maxIdx, default: 0 };
                        }
                        return { type: 'number', label: 'Posición (0-1)', min: 0, max: 1, step: 0.01, default: 0.5 };
                    },
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => {
                        if (st.selectVariant === 'point_index') return `point de ${st.selectLine} punto ${st.pointValue}`;
                        return `point de ${st.selectLine} @${st.pointValue}`;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 22. NODOS (2 variantes)
        // ═══════════════════════════════════════════════════════
        'NODES': {
            name: 'Nodos', icon: '🔌', category: 'query',
            steps: [
                { id: 'selectVariant', title: '¿Qué nodos desea ver?', type: 'select',
                    options: [
                        { value: 'all', label: '📋 Todos', description: 'Puertos ocupados y disponibles' },
                        { value: 'open', label: '🟢 Disponibles', description: 'Solo puertos libres' }
                    ],
                    nextMap: { all: 'selectElement', open: 'selectElement' }
                },
                { id: 'selectElement', title: 'Seleccione elemento', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => {
                        if (st.selectVariant === 'open') return `nodos abiertos ${st.selectElement}`;
                        return `nodos ${st.selectElement}`;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 23. LISTAR (4 variantes)
        // ═══════════════════════════════════════════════════════
        'LIST': {
            name: 'Listar', icon: '📋', category: 'query',
            steps: [
                { id: 'selectVariant', title: '¿Qué desea listar?', type: 'select',
                    options: [
                        { value: 'equipos', label: `🏗️ Equipos (${SmartFlowCore.getEquipos().length})` },
                        { value: 'lineas', label: `📏 Líneas (${SmartFlowCore.getLines().length})` },
                        { value: 'componentes', label: '🔩 Componentes (catálogo)' },
                        { value: 'especificaciones', label: '📋 Especificaciones' }
                    ],
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => {
                        if (st.selectVariant === 'equipos') return 'list equipos';
                        if (st.selectVariant === 'lineas') return 'list lineas';
                        if (st.selectVariant === 'componentes') return 'list componentes';
                        return 'list especificaciones';
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 24. MEDIR (2 variantes)
        // ═══════════════════════════════════════════════════════
        'MEASURE': {
            name: 'Medir Distancia', icon: '📏', category: 'query',
            steps: [
                { id: 'selectVariant', title: 'Tipo de medición', type: 'select',
                    options: [
                        { value: 'between_tags', label: '🏷️ Entre elementos', description: 'Distancia entre centros' },
                        { value: 'between_ports', label: '🔌 Entre puertos', description: 'Distancia entre puertos específicos' }
                    ],
                    nextMap: { between_tags: 'tag1', between_ports: 'tag1' }
                },
                { id: 'tag1', title: 'Elemento 1', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    next: 'port1Check'
                },
                { id: 'port1Check', title: 'Puerto origen', type: 'conditional',
                    condition: (st) => st.selectVariant === 'between_ports',
                    ifTrue: 'port1',
                    ifFalse: 'tag2'
                },
                { id: 'port1', title: 'Puerto del elemento 1', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.tag1),
                    next: 'tag2'
                },
                { id: 'tag2', title: 'Elemento 2', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    next: 'port2Check'
                },
                { id: 'port2Check', title: 'Puerto destino', type: 'conditional',
                    condition: (st) => st.selectVariant === 'between_ports',
                    ifTrue: 'port2',
                    ifFalse: null
                },
                { id: 'port2', title: 'Puerto del elemento 2', type: 'dynamicSelect',
                    options: (sel, st) => getPortOptions(st.tag2),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => `measure ${st.tag1}:${st.port1} to ${st.tag2}:${st.port2}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 25. BOM (1 variante)
        // ═══════════════════════════════════════════════════════
        'BOM': {
            name: 'Generar BOM', icon: '📊', category: 'utility',
            steps: [
                { id: 'confirm', title: 'Generar Lista de Materiales', type: 'confirm',
                    message: 'Se generará un archivo CSV con la lista completa de materiales del proyecto.',
                    isFinal: true, executeImmediately: true,
                    buildCommand: () => 'bom'
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 26. AUDITAR (1 variante)
        // ═══════════════════════════════════════════════════════
        'AUDIT': {
            name: 'Auditar', icon: '🔍', category: 'utility',
            steps: [
                { id: 'confirm', title: 'Ejecutar Auditoría', type: 'confirm',
                    message: 'Se verificará el modelo en busca de colisiones, juntas cercanas y discrepancias de diámetro.',
                    isFinal: true, executeImmediately: true,
                    buildCommand: () => 'audit'
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 27. VISTA (5 variantes)
        // ═══════════════════════════════════════════════════════
        'VIEW': {
            name: 'Vista', icon: '👁️', category: 'utility',
            steps: [
                { id: 'selectVariant', title: 'Seleccione vista', type: 'select',
                    options: [
                        { value: 'top', label: '🔽 Planta (TOP)', description: 'Vista superior' },
                        { value: 'front', label: '🔲 Frontal', description: 'Vista frontal' },
                        { value: 'iso', label: '🔷 Isométrica', description: 'Vista isométrica 3D' },
                        { value: 'extents', label: '🔍 Extender', description: 'Zoom para ver todo' },
                        { value: 'focus', label: '🎯 Centrar en elemento', description: 'Enfocar un elemento específico' }
                    ],
                    nextMap: { top: null, front: null, iso: null, extents: null, focus: 'focusElement' }
                },
                { id: 'focusElement', title: 'Seleccione elemento a enfocar', type: 'dynamicSelect',
                    options: () => getAllElementOptions(),
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => `view ${st.focusElement}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 28. MACRO (4 variantes)
        // ═══════════════════════════════════════════════════════
        'MACRO': {
            name: 'Macro', icon: '📜', category: 'utility',
            steps: [
                { id: 'selectVariant', title: 'Acción sobre macros', type: 'select',
                    options: [
                        { value: 'save', label: '💾 Guardar', description: 'Guardar historial como macro' },
                        { value: 'run', label: '▶️ Ejecutar', description: 'Ejecutar macro guardada' },
                        { value: 'list', label: '📋 Listar', description: 'Ver macros guardadas' },
                        { value: 'delete', label: '🗑️ Eliminar', description: 'Eliminar macro' }
                    ],
                    nextMap: { save: 'macroName', run: 'macroSelect', list: null, delete: 'macroSelect' }
                },
                { id: 'macroName', title: 'Nombre de la macro', type: 'text', placeholder: 'Ej: mi_rutina',
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => `macro save ${st.macroName}`
                },
                { id: 'macroSelect', title: 'Seleccione macro', type: 'dynamicSelect',
                    options: () => {
                        const macros = (typeof SmartFlowCommands !== 'undefined' && SmartFlowCommands.getMacros) ?
                            SmartFlowCommands.getMacros() : new Map();
                        const opts = [];
                        macros.forEach((cmds, name) => opts.push({ value: name, label: `${name} (${cmds.length} cmds)` }));
                        return opts.length > 0 ? opts : [{ value: '', label: 'No hay macros guardadas', disabled: true }];
                    },
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => {
                        if (st.selectVariant === 'run') return `macro run ${st.macroSelect}`;
                        return `macro delete ${st.macroSelect}`;
                    }
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 29. EXPORTAR (2 variantes)
        // ═══════════════════════════════════════════════════════
        'EXPORT': {
            name: 'Exportar', icon: '📁', category: 'utility',
            steps: [
                { id: 'selectVariant', title: 'Formato de exportación', type: 'select',
                    options: [
                        { value: 'json', label: '📄 JSON', description: 'Archivo de proyecto completo' },
                        { value: 'csv', label: '📊 CSV (BOM)', description: 'Lista de materiales' }
                    ],
                    isFinal: true, executeImmediately: true,
                    buildCommand: (params, st) => `export ${st.selectVariant}`
                }
            ]
        },

        // ═══════════════════════════════════════════════════════
        // 30. AYUDA (1 variante)
        // ═══════════════════════════════════════════════════════
        'HELP': {
            name: 'Ayuda', icon: '❓', category: 'utility',
            steps: [
                { id: 'show', title: 'Ayuda de Comandos', type: 'info',
                    message: 'Se mostrará la lista completa de comandos disponibles.',
                    isFinal: true, executeImmediately: true,
                    buildCommand: () => 'help'
                }
            ]
        }
    };

    // ═══════════════════════════════════════════════════════
    // COMANDOS DIRECTOS
    // ═══════════════════════════════════════════════════════
    const DIRECT_COMMANDS = {
        'UNDO': { name: 'Deshacer', icon: '↩️', command: 'undo' },
        'REDO': { name: 'Rehacer', icon: '↪️', command: 'redo' }
    };

    // ================================================================
    // FUNCIONES AUXILIARES
    // ================================================================
    function getEquipmentOptions() {
        return SmartFlowCore.getEquipos().map(eq => ({
            value: eq.tag,
            label: `${eq.tag} - ${getEquipmentTypeName(eq.tipo)}`,
            icon: getEquipmentIcon(eq.tipo),
            type: 'equipment'
        }));
    }

    function getLineOptions() {
        return SmartFlowCore.getLines().map(line => ({
            value: line.tag,
            label: `${line.tag} - ${line.diameter}" ${line.material || 'STD'}`,
            icon: '📏',
            type: 'line'
        }));
    }

    function getAllElementOptions() {
        return [...getEquipmentOptions(), ...getLineOptions()];
    }

    function getPortOptions(tag) {
        if (!tag) return [];
        const obj = SmartFlowCore.findObjectByTag(tag);
        if (!obj || !obj.puertos) return [];
        return obj.puertos.map(p => ({
            value: p.id,
            label: `${p.id} - ⌀${p.diametro || '?'}" [${p.status === 'open' ? '🟢 Libre' : '🔴 Conectado'}]`,
            status: p.status
        }));
    }

    // ✅ NUEVO: Categorías de componentes para el selector en cascada
    function getComponentCategories() {
        return [
            { value: 'VALVE', label: '🔧 Válvulas', description: 'Compuerta, Globo, Bola, Mariposa, Check, Control, Seguridad...' },
            { value: 'ELBOW', label: '🔀 Codos', description: '90° LR, 90° SR, 45°, Sanitario...' },
            { value: 'TEE', label: '🔱 Tees', description: 'Tee Recta, Tee Reductora' },
            { value: 'REDUCER', label: '🔽 Reductores', description: 'Concéntrico, Excéntrico' },
            { value: 'FLANGE', label: '⭕ Bridas', description: 'WN, Slip-On, Ciega, Lap Joint, RTJ, Orificio...' },
            { value: 'STRAINER', label: '🔍 Filtros', description: 'Tipo Y, Canasta, Dúplex, Sanitario...' },
            { value: 'STEAM_TRAP', label: '💨 Trampas de Vapor', description: 'Termodinámica, Flotador, Cubeta...' },
            { value: 'INSTRUMENT', label: '📊 Instrumentos', description: 'Manómetro, Termómetro, Caudalímetro, Transmisores...' },
            { value: 'SUPPORT', label: '📌 Soportes', description: 'Zapata, Guía, Anclaje, Colgador, Resorte...' },
            { value: 'EXPANSION', label: '〰️ Juntas de Expansión', description: 'PPR, Acero' },
            { value: 'CONNECTION', label: '🔗 Conexiones', description: 'Uniones, Niples, Pasamuros, Adaptadores...' },
            { value: 'SAFETY', label: '🛡️ Seguridad', description: 'PSV, Disco Ruptura, Arrestador, Silenciador...' },
            { value: 'SANITARY', label: '🧼 Sanitario', description: 'Válvulas Asépticas, Spray Ball, Mirilla...' },
            { value: 'HOSE', label: '🔧 Mangueras', description: 'Flexible, Metálica, PTFE' },
            { value: 'SPECIAL', label: '⚙️ Especiales', description: 'Cruz, Tapón, Camlock, Mezclador, Difusor...' },
            { value: 'ALL', label: '📋 Todos los componentes', description: 'Mostrar lista completa sin filtrar' }
        ];
    }

    // ✅ ACTUALIZADO: Carga el 100% de los componentes del catálogo
    function getComponentTypeOptions() {
        const allComponents = [];
        const seen = new Set();
        
        // Obtener todos los componentes del catálogo
        const allKeys = SmartFlowCatalog.listComponentTypes();
        allKeys.forEach(key => {
            if (!seen.has(key)) {
                seen.add(key);
                const comp = SmartFlowCatalog.getComponent(key);
                if (comp) {
                    const tipo = (comp.tipo || key).toUpperCase();
                    let category = 'SPECIAL';
                    
                    if (tipo.includes('VALVE') || tipo.includes('VALVULA')) category = 'VALVE';
                    else if (tipo.includes('ELBOW') || tipo.includes('CODO')) category = 'ELBOW';
                    else if (tipo.includes('TEE')) category = 'TEE';
                    else if (tipo.includes('REDUCER') || tipo.includes('REDUCCION') || tipo.includes('REDUCING')) category = 'REDUCER';
                    else if (tipo.includes('FLANGE') || tipo.includes('BRIDA') || tipo.includes('STUB_END')) category = 'FLANGE';
                    else if (tipo.includes('STRAINER') || tipo.includes('FILTRO') || tipo.includes('FILTER')) category = 'STRAINER';
                    else if (tipo.includes('TRAP') || tipo.includes('STEAM_TRAP')) category = 'STEAM_TRAP';
                    else if (tipo.includes('INSTRUMENT') || tipo.includes('GAUGE') || tipo.includes('METER') || 
                             tipo.includes('TRANSMITTER') || tipo.includes('SENSOR') || tipo.includes('SWITCH') ||
                             tipo.includes('SIGHT') || tipo.includes('ROTAMETER')) category = 'INSTRUMENT';
                    else if (tipo.includes('PIPE') || tipo.includes('TUBO') || tipo.includes('TUBERIA')) category = 'PIPE';
                    else if (tipo.includes('SHOE') || tipo.includes('BOLT') || tipo.includes('GUIDE') || 
                             tipo.includes('ANCHOR') || tipo.includes('HANGER') || tipo.includes('CLAMP') ||
                             tipo.includes('SUPPORT') || tipo.includes('SOPORTE')) category = 'SUPPORT';
                    else if (tipo.includes('UNION') || tipo.includes('NIPPLE') || tipo.includes('NIPLE') ||
                             tipo.includes('BULKHEAD') || tipo.includes('TRANSITION') || tipo.includes('ADAPTADOR')) category = 'CONNECTION';
                    else if (tipo.includes('EXPANSION') || tipo.includes('JUNTA')) category = 'EXPANSION';
                    else if (tipo.includes('HOSE') || tipo.includes('MANGUERA')) category = 'HOSE';
                    else if (tipo.includes('SILENCER') || tipo.includes('ARRESTER') || tipo.includes('RUPTURE') || 
                             tipo.includes('VACUUM') || tipo.includes('SAFETY') || tipo.includes('ALIVIO') ||
                             tipo.includes('RELIEF') || tipo.includes('VENT')) category = 'SAFETY';
                    else if (tipo.includes('SAMPLE') || tipo.includes('MUESTREO')) category = 'SAMPLE';
                    else if (tipo.includes('CAMLOCK') || tipo.includes('QUICK')) category = 'QUICK_CONNECT';
                    else if (tipo.includes('SPRAY') || tipo.includes('CIP') || tipo.includes('SANITARY') ||
                             tipo.includes('ASEPTIC') || tipo.includes('SIGHT_GLASS_SANITARY')) category = 'SANITARY';
                    else if (tipo.includes('CROSS') || tipo.includes('CRUZ')) category = 'TEE';
                    else if (tipo.includes('CAP') || tipo.includes('TAPON') || tipo.includes('TAPÓN')) category = 'SPECIAL';
                    else if (tipo.includes('MIXER') || tipo.includes('MEZCLADOR') || tipo.includes('INJECTOR') || 
                             tipo.includes('DIFFUSER') || tipo.includes('EJECTOR') || tipo.includes('MEDIA') ||
                             tipo.includes('STERILIZER') || tipo.includes('OZONE') || tipo.includes('DESUPERHEATER') ||
                             tipo.includes('HEATER') || tipo.includes('KNOCKOUT') || tipo.includes('PIG_LAUNCHER')) category = 'SPECIAL';
                    
                    allComponents.push({
                        value: key,
                        label: `${comp.nombre || comp.tipo || key} [${comp.material || comp.spec || 'STD'}]`,
                        category: category,
                        abbr: comp.abbr || '',
                        spec: comp.spec || '',
                        material: comp.material || '',
                        conexion: comp.conexion || ''
                    });
                }
            }
        });
        
        // Ordenar alfabéticamente
        allComponents.sort((a, b) => a.label.localeCompare(b.label));
        
        return allComponents;
    }

    function getAllComponentOptions() {
        const options = [];
        SmartFlowCore.getLines().forEach(line => {
            if (line.components) {
                line.components.forEach(comp => {
                    options.push({
                        value: comp.tag,
                        label: `${comp.tag} - ${comp.type || '?'} [${line.tag}]`,
                        type: 'component'
                    });
                });
            }
        });
        return options;
    }

    function getMaterialOptions() {
        const specs = SmartFlowCatalog.getSpecs();
        const materials = new Set();
        Object.values(specs).forEach(s => { if (s.material) materials.add(s.material); });
        return Array.from(materials).sort().map(m => ({ value: m.toUpperCase(), label: m }));
    }

    function getSpecOptions() {
        return SmartFlowCatalog.listSpecs().map(spec => ({ value: spec, label: spec }));
    }

    function pipeDiameters() {
        return ['2','3','4','6','8','10','12','16','20','24'].map(d => ({ value: d, label: `${d}"` }));
    }

    function getEquipmentTypeName(tipo) {
        const eq = SmartFlowCatalog.getEquipment(tipo);
        return eq ? eq.nombre : tipo;
    }

    function getEquipmentIcon(tipo) {
        const icons = {
            'tanque_v': '🛢️', 'tanque_h': '🛢️', 'bomba': '⚡', 'bomba_z': '⚡',
            'intercambiador': '🔥', 'torre': '🗼', 'reactor': '⚗️', 'compresor': '💨',
            'separador': '🔀', 'caldera': '🔥', 'plataforma': '🏗️', 'filtro_arena': '🔍',
            'osmosis': '💧', 'clarificador': '🔵', 'antorcha': '🔥'
        };
        return icons[tipo] || '📦';
    }

    // ================================================================
    // GESTOR DE FLUJO
    // ================================================================
    function startCommandFlow(commandPath) {
        if (DIRECT_COMMANDS[commandPath]) {
            return {
                direct: true,
                command: DIRECT_COMMANDS[commandPath].command,
                name: DIRECT_COMMANDS[commandPath].name,
                icon: DIRECT_COMMANDS[commandPath].icon
            };
        }

        const flow = COMMAND_FLOWS[commandPath];
        if (!flow) return null;

        currentState = {
            commandPath: commandPath,
            variantId: null,
            step: 0,
            selections: {},
            flow: flow
        };

        return getCurrentStepData();
    }

    function getCurrentStepData() {
        if (!currentState.flow) return null;

        const steps = currentState.flow.steps;
        let stepIndex = currentState.step;
        let step = steps[stepIndex];

        while (step && step.condition && !step.condition(currentState.selections)) {
            stepIndex++;
            if (stepIndex >= steps.length) return null;
            step = steps[stepIndex];
        }

        currentState.step = stepIndex;

        if (!step) {
            const finalStep = findFinalStep(steps);
            if (finalStep && finalStep.buildCommand) {
                return {
                    finished: true,
                    command: finalStep.buildCommand(null, currentState.selections),
                    executeImmediately: finalStep.executeImmediately || false
                };
            }
            return null;
        }

        let options = [];
        if (typeof step.options === 'function') {
            const depValue = currentState.selections[Object.keys(currentState.selections).pop()];
            options = step.options(depValue, currentState.selections);
        } else if (step.options) {
            options = step.options;
        }

        let fields = [];
        if (typeof step.fields === 'function') {
            fields = step.fields(currentState.selections);
        } else {
            fields = step.fields || [];
        }

        return {
            commandPath: currentState.commandPath,
            commandName: currentState.flow.name,
            commandIcon: currentState.flow.icon,
            stepIndex: stepIndex,
            totalSteps: steps.filter(s => !s.condition || s.condition(currentState.selections)).length,
            stepId: step.id,
            title: typeof step.title === 'function' ? step.title(currentState.selections) : step.title,
            type: step.type || 'select',
            options: options,
            fields: fields,
            isFinal: step.isFinal || false,
            message: typeof step.message === 'function' ? step.message(currentState.selections) : step.message,
            executeImmediately: step.executeImmediately || false,
            nextMap: step.nextMap || null,
            condition: step.condition || null,
            progress: Math.min(((stepIndex + 1) / steps.length) * 100, 100),
            minSelect: step.minSelect || 2,
            minPoints: step.minPoints || 2,
            default: step.default || null,
            placeholder: step.placeholder || '',
            min: step.min,
            max: step.max,
            step: step.step,
            description: step.description || ''
        };
    }

    function findFinalStep(steps) {
        for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].isFinal && steps[i].buildCommand) return steps[i];
        }
        return steps[steps.length - 1];
    }

    function nextStep(selection) {
        if (!currentState.flow) return null;

        const step = currentState.flow.steps[currentState.step];
        if (step && step.id) {
            currentState.selections[step.id] = selection;
        }

        if (step && step.nextMap && selection) {
            const nextId = step.nextMap[selection];
            if (nextId) {
                const targetIndex = currentState.flow.steps.findIndex(s => s.id === nextId);
                if (targetIndex > currentState.step) {
                    currentState.step = targetIndex;
                    return getCurrentStepData();
                }
            }
        }

        let next = step.next;
        if (typeof next === 'function') next = next(currentState.selections);

        if (next) {
            const targetIndex = currentState.flow.steps.findIndex(s => s.id === next);
            if (targetIndex > currentState.step) {
                currentState.step = targetIndex;
                return getCurrentStepData();
            }
        }

        currentState.step++;
        const nextData = getCurrentStepData();

        if (!nextData || nextData.finished) {
            const finalStep = findFinalStep(currentState.flow.steps);
            if (finalStep && finalStep.buildCommand) {
                return {
                    finished: true,
                    command: finalStep.buildCommand(null, currentState.selections),
                    executeImmediately: finalStep.executeImmediately || false,
                    commandName: currentState.flow.name,
                    commandIcon: currentState.flow.icon
                };
            }
        }

        return nextData;
    }

    function previousStep() {
        if (currentState.step > 0) {
            currentState.step--;
            const step = currentState.flow.steps[currentState.step];
            if (step && step.id) {
                delete currentState.selections[step.id];
            }
        }
        return getCurrentStepData();
    }

    function resetFlow() {
        currentState = { commandPath: null, variantId: null, step: 0, selections: {}, flow: null };
    }

    function getAvailableCommands() {
        const commands = [];
        Object.entries(COMMAND_FLOWS).forEach(([key, flow]) => {
            commands.push({
                command: key,
                name: flow.name,
                icon: flow.icon,
                category: flow.category
            });
        });
        Object.entries(DIRECT_COMMANDS).forEach(([key, cmd]) => {
            commands.push({
                command: key,
                name: cmd.name,
                icon: cmd.icon,
                category: 'direct'
            });
        });
        return commands;
    }

    function getCommandsByCategory() {
        const cats = {};
        getAvailableCommands().forEach(cmd => {
            if (!cats[cmd.category]) cats[cmd.category] = [];
            cats[cmd.category].push(cmd);
        });
        return cats;
    }

    // API Pública
    return {
        startCommandFlow,
        getCurrentStepData,
        nextStep,
        previousStep,
        resetFlow,
        getAvailableCommands,
        getCommandsByCategory,
        COMMAND_FLOWS,
        DIRECT_COMMANDS,
        getEquipmentOptions,
        getLineOptions,
        getAllElementOptions,
        getPortOptions,
        getComponentCategories,
        getComponentTypeOptions,
        getMaterialOptions,
        getSpecOptions,
        pipeDiameters
    };

})();
