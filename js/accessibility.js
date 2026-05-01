
// ============================================================
// MÓDULO 7: SMARTFLOW ACCESSIBILITY (Accesibilidad Avanzada)
// Archivo: js/accessibility.js
// Propósito: Proporcionar retroalimentación por voz detallada,
//            comandos de navegación asistida por texto, y descripciones
//            semánticas para usuarios con discapacidad visual.
// ============================================================

const SmartFlowAccessibility = (function() {
    
    let _core = null;
    let _catalog = null;
    let _renderer = null;
    let _notifyUI = (msg) => console.log(msg);
    
    // Estado del modo accesibilidad
    let _verboseMode = true;
    let _ariaLiveRegion = null;
    
    // Síntesis de voz
    let _synth = window.speechSynthesis;
    let _speaking = false;
    
    // Cola de mensajes para evitar solapamiento
    let _messageQueue = [];
    
    // -------------------- 1. GESTIÓN DE VOZ (TTS) --------------------
    function speak(text, priority = false) {
        if (!_synth) return;
        
        if (priority) {
            _synth.cancel();
            _messageQueue = [];
        }
        
        _messageQueue.push(text);
        if (!_speaking) {
            _processQueue();
        }
    }
    
    function _processQueue() {
        if (_messageQueue.length === 0) {
            _speaking = false;
            return;
        }
        _speaking = true;
        const text = _messageQueue.shift();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = 0.95;
        utterance.onend = () => { _processQueue(); };
        utterance.onerror = () => { _processQueue(); };
        _synth.speak(utterance);
    }
    
    function stopSpeaking() {
        if (_synth) {
            _synth.cancel();
            _messageQueue = [];
            _speaking = false;
        }
    }
    
    // -------------------- 2. DESCRIPCIONES SEMÁNTICAS --------------------
    function describeEquipment(eq) {
        const def = _catalog ? _catalog.getEquipment(eq.tipo) : null;
        const tipoNombre = def?.nombre || eq.tipo;
        let desc = `${tipoNombre} ${eq.tag}. `;
        desc += `Posición: X=${eq.posX.toFixed(0)}, Y=${eq.posY.toFixed(0)}, Z=${eq.posZ.toFixed(0)} milímetros. `;
        desc += `Diámetro ${eq.diametro} milímetros, altura ${eq.altura} milímetros. `;
        desc += `Material: ${eq.material || 'No especificado'}. `;
        
        if (eq.puertos && eq.puertos.length > 0) {
            const puertosConectados = eq.puertos.filter(p => p.connectedLine);
            const puertosLibres = eq.puertos.filter(p => !p.connectedLine);
            desc += `Tiene ${eq.puertos.length} puertos. `;
            if (puertosConectados.length > 0) {
                desc += `Conectados: ${puertosConectados.map(p => p.id).join(', ')}. `;
            }
            if (puertosLibres.length > 0) {
                desc += `Libres: ${puertosLibres.map(p => p.id).join(', ')}. `;
            }
        }
        return desc;
    }
    
    function describeLine(line) {
        let desc = `Línea ${line.tag}. `;
        desc += `Diámetro ${line.diameter} pulgadas, material ${line.material || 'PPR'}. `;
        
        const pts = line._cachedPoints || line.points3D;
        if (pts && pts.length >= 2) {
            let totalLen = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                totalLen += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            }
            desc += `Longitud total: ${(totalLen/1000).toFixed(2)} metros. `;
        }
        
        if (line.origin) {
            desc += `Conecta desde equipo ${line.origin.equipTag}, puerto ${line.origin.portId}. `;
        }
        if (line.destination) {
            desc += `Conecta hacia equipo ${line.destination.equipTag}, puerto ${line.destination.portId}. `;
        }
        
        if (line.components && line.components.length > 0) {
            const compNames = line.components.map(c => c.type);
            desc += `Contiene ${line.components.length} componentes: ${compNames.join(', ')}. `;
        }
        
        return desc;
    }
    
    function describeScene() {
        const db = _core.getDb();
        const equipos = db.equipos || [];
        const lines = db.lines || [];
        
        let desc = `Escena actual: `;
        desc += `${equipos.length} equipos, ${lines.length} líneas. `;
        
        if (equipos.length > 0) {
            desc += `Equipos: ${equipos.map(e => e.tag).join(', ')}. `;
        }
        
        return desc;
    }
    
    function describeSelection() {
        const selected = _core.getSelected();
        if (!selected) {
            return "No hay ningún elemento seleccionado.";
        }
        
        if (selected.type === 'equipment') {
            return describeEquipment(selected.obj);
        } else if (selected.type === 'line') {
            return describeLine(selected.obj);
        }
        return "Elemento seleccionado no reconocido.";
    }
    
    // -------------------- 3. COMANDOS DE ACCESIBILIDAD (TEXTO) --------------------
    function processAccessibilityCommand(cmd) {
        const lower = cmd.toLowerCase().trim();
        
        // Comandos de selección
        if (lower.startsWith('seleccionar ')) {
            const tag = cmd.substring(12).trim().toUpperCase();
            const db = _core.getDb();
            const eq = db.equipos.find(e => e.tag === tag);
            if (eq) {
                _core.setSelected({ type: 'equipment', obj: eq });
                if (_renderer) _renderer.render();
                const desc = describeEquipment(eq);
                speak(`Seleccionado. ${desc}`, true);
                return true;
            }
            const line = db.lines.find(l => l.tag === tag);
            if (line) {
                _core.setSelected({ type: 'line', obj: line });
                if (_renderer) _renderer.render();
                const desc = describeLine(line);
                speak(`Seleccionado. ${desc}`, true);
                return true;
            }
            speak(`No se encontró el elemento con tag ${tag}`, true);
            return true;
        }
        
        // Comandos de información
        if (lower === 'leer selección' || lower === 'describir selección') {
            const desc = describeSelection();
            speak(desc, true);
            return true;
        }
        
        if (lower === 'leer escena' || lower === 'describir escena') {
            const desc = describeScene();
            speak(desc, true);
            return true;
        }
        
        if (lower === '¿dónde estoy?' || lower === 'donde estoy' || lower === 'ubicación') {
            const cam = _renderer ? _renderer.getCam() : null;
            if (cam) {
                speak(`Vista isométrica. Escala ${cam.scale.toFixed(2)}. Centro aproximado en X=${(-cam.panX/cam.scale).toFixed(0)}, Y=${_core.getElevation()}.`, true);
            } else {
                speak("Información de cámara no disponible.", true);
            }
            return true;
        }
        
        if (lower === 'lista de equipos' || lower === 'listar equipos') {
            const db = _core.getDb();
            const equipos = db.equipos || [];
            if (equipos.length === 0) {
                speak("No hay equipos en el modelo.", true);
            } else {
                const lista = equipos.map(e => e.tag).join(', ');
                speak(`Equipos en el modelo: ${lista}`, true);
            }
            return true;
        }
        
        if (lower === 'lista de líneas' || lower === 'listar líneas') {
            const db = _core.getDb();
            const lines = db.lines || [];
            if (lines.length === 0) {
                speak("No hay líneas en el modelo.", true);
            } else {
                const lista = lines.map(l => l.tag).join(', ');
                speak(`Líneas en el modelo: ${lista}`, true);
            }
            return true;
        }
        
        if (lower === 'centrar vista') {
            if (_renderer) _renderer.autoCenter();
            speak("Vista centrada.", true);
            return true;
        }
        
        if (lower === 'ayuda accesibilidad' || lower === 'comandos de voz') {
            const ayuda = "Comandos de accesibilidad disponibles: seleccionar [tag], leer selección, leer escena, ¿dónde estoy?, lista de equipos, lista de líneas, centrar vista, silencio, modo verbose.";
            speak(ayuda, true);
            return true;
        }
        
        if (lower === 'silencio' || lower === 'callar') {
            stopSpeaking();
            return true;
        }
        
        if (lower === 'modo verbose') {
            _verboseMode = !_verboseMode;
            speak(_verboseMode ? "Modo detallado activado." : "Modo detallado desactivado.", true);
            return true;
        }
        
        return false;
    }
    
    // -------------------- 4. HOOKS PARA NOTIFICACIONES MEJORADAS --------------------
    function notifyWithDescription(message, isError, context) {
        // Mostrar en UI (si existe función)
        if (_notifyUI) {
            _notifyUI(message, isError);
        }
        
        // Si hay contexto adicional y estamos en modo verbose, enriquecer el mensaje hablado
        let spokenMessage = message;
        if (context && _verboseMode) {
            if (context.equipment) {
                spokenMessage += '. ' + describeEquipment(context.equipment);
            } else if (context.line) {
                spokenMessage += '. ' + describeLine(context.line);
            }
        }
        
        speak(spokenMessage, isError);
        
        // Actualizar región ARIA live para lectores de pantalla
        if (_ariaLiveRegion) {
            _ariaLiveRegion.textContent = message;
        }
    }
    
    // -------------------- 5. INICIALIZACIÓN --------------------
    function init(coreInstance, catalogInstance, rendererInstance, notifyFn) {
        _core = coreInstance;
        _catalog = catalogInstance;
        _renderer = rendererInstance;
        _notifyUI = notifyFn;
        
        // Crear región ARIA live para lectores de pantalla
        _ariaLiveRegion = document.getElementById('aria-live-region');
        if (!_ariaLiveRegion) {
            _ariaLiveRegion = document.createElement('div');
            _ariaLiveRegion.id = 'aria-live-region';
            _ariaLiveRegion.setAttribute('aria-live', 'polite');
            _ariaLiveRegion.setAttribute('aria-atomic', 'true');
            _ariaLiveRegion.style.position = 'absolute';
            _ariaLiveRegion.style.width = '1px';
            _ariaLiveRegion.style.height = '1px';
            _ariaLiveRegion.style.padding = '0';
            _ariaLiveRegion.style.margin = '-1px';
            _ariaLiveRegion.style.overflow = 'hidden';
            _ariaLiveRegion.style.clip = 'rect(0,0,0,0)';
            _ariaLiveRegion.style.whiteSpace = 'nowrap';
            _ariaLiveRegion.style.border = '0';
            document.body.appendChild(_ariaLiveRegion);
        }
        
        // Mensaje de bienvenida
        speak("Sistema de accesibilidad activado. Escriba 'ayuda accesibilidad' en el panel de comandos para conocer las opciones.", true);
    }
    
    // -------------------- API PÚBLICA --------------------
    return {
        init,
        speak,
        stopSpeaking,
        describeEquipment,
        describeLine,
        describeScene,
        describeSelection,
        processAccessibilityCommand,
        notifyWithDescription
    };
})();
