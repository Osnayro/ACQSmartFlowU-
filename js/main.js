
// ============================================================
// MÓDULO 5: SMARTFLOW MAIN (Punto de Entrada Principal) - v3.0
// Archivo: js/main.js
// Migrado a Three.js (Renderizador 3D)
// ============================================================

(function() {
    "use strict";
    
    // -------------------- 1. REFERENCIAS AL DOM --------------------
    const canvasContainer = document.getElementById('canvas-container');
    const notificationEl = document.getElementById('notification');
    const statusMsgEl = document.getElementById('statusMsg');
    const commandPanel = document.getElementById('commandPanel');
    const commandText = document.getElementById('commandText');
    const catalogPanel = document.getElementById('catalogPanel');
    const propertyPanel = document.getElementById('propertyPanel');
    const customElev = document.getElementById('customElev');
    
    const btnNew = document.getElementById('btnNew');
    const btnOpen = document.getElementById('btnOpen');
    const btnSave = document.getElementById('btnSave');
    const btnReset = document.getElementById('btnReset');
    const btnCommand = document.getElementById('btnCommand');
    const btnCloseCommand = document.getElementById('closeCommand');
    const btnRunCommands = document.getElementById('runCommands');
    const btnClearCommand = document.getElementById('clearCommand');
    const btnAddTank = document.getElementById('btnAddTank');
    const btnAddPump = document.getElementById('btnAddPump');
    const btnMTO = document.getElementById('btnMTO');
    const btnPDF = document.getElementById('btnPDF');
    const btnExportPCF = document.getElementById('btnExportPCF');
    const btnImportPCF = document.getElementById('btnImportPCF');
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    const btnVoice = document.getElementById('btnVoice');
    const btnApplyNorm = document.getElementById('btnApplyNorm');
    const btnSpeakSummary = document.getElementById('btnSpeakSummary');
    const btnRecalc = document.getElementById('btnRecalc');
    const btnToggleCatalog = document.getElementById('btnToggleCatalog');
    const btnSetElev = document.getElementById('btnSetElev');
    const btnExportProject = document.getElementById('btnExportProject');
    const btnImportProject = document.getElementById('btnImportProject');
    
    // -------------------- 2. ESTADO DE LA APLICACIÓN --------------------
    let toolMode = 'select';
    let voiceEnabled = true;
    let SmartFlowRenderer3D = null;
    
    // -------------------- 3. FUNCIONES DE UI --------------------
    function notify(msg, isErr = false) {
        if (notificationEl) {
            notificationEl.textContent = msg;
            notificationEl.style.backgroundColor = isErr ? '#da3633' : '#238636';
            notificationEl.style.display = 'block';
        }
        if (statusMsgEl) statusMsgEl.innerHTML = msg;
        
        if (voiceEnabled && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(msg);
            u.lang = 'es-ES';
            setTimeout(() => window.speechSynthesis.speak(u), 50);
        }
        
        setTimeout(() => { if (notificationEl) notificationEl.style.display = 'none'; }, 4000);
    }
    
    function render() {
        // En Three.js el renderizado es continuo, no necesitamos llamar a render manualmente
        // Pero mantenemos la función por compatibilidad
    }
    
    function autoCenter() {
        if (SmartFlowRenderer3D) {
            SmartFlowRenderer3D.autoCenter();
            notify("Vista centrada correctamente.", false);
        }
    }

    // Funciones para el panel de propiedades
    function togglePanel(show) {
        const panel = document.getElementById('side-panel');
        if (panel) {
            if (show) panel.classList.remove('hidden');
            else panel.classList.add('hidden');
        }
    }

    function updatePropertyPanel(obj) {
        const content = document.getElementById('panel-content');
        if (!obj) { togglePanel(false); return; }
        togglePanel(true);
        content.innerHTML = `
            <div class="prop-group"><span class="prop-label">TAG</span><span class="prop-value">${obj.tag}</span></div>
            <div class="prop-group"><span class="prop-label">TIPO</span><span class="prop-value">${obj.tipo || 'Tubería'}</span></div>
            <div class="prop-group"><span class="prop-label">MATERIAL</span><span class="prop-value">${obj.material || 'N/A'}</span></div>
            <div class="prop-group"><span class="prop-label">DIÁMETRO</span><span class="prop-value">${obj.diametro}"</span></div>
            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:15px 0;">
            <div class="prop-group"><span class="prop-label">PUERTOS</span>
                ${obj.puertos ? obj.puertos.map(p => `
                    <div class="port-item"><span>${p.id}</span><span class="${p.status === 'open' ? 'port-open' : 'port-connected'}">${p.status === 'open' ? 'DISPONIBLE' : 'CONECTADO a ' + (p.connectedTo || '')}</span></div>
                `).join('') : '<p>Sin puertos</p>'}
            </div>
        `;
    }
    
    // -------------------- 4. INICIALIZACIÓN DE MÓDULOS --------------------
    async function initModules() {
        SmartFlowCore.init(notify, render, updatePropertyPanel);
        
        // Inicializar renderizador 3D
        SmartFlowRenderer3D = window.SmartFlowRenderer3D;
        if (SmartFlowRenderer3D && canvasContainer) {
            const success = SmartFlowRenderer3D.init(canvasContainer, SmartFlowCore, SmartFlowCatalog, notify);
            if (success) {
                console.log("✅ Renderizador 3D inicializado correctamente");
            } else {
                console.error("❌ Error al inicializar el renderizador 3D");
            }
        }
        
        // Inicializar Router
        if (typeof SmartFlowRouter !== 'undefined') {
            SmartFlowRouter.init(SmartFlowCore, SmartFlowCatalog, window.notify || notify, render);
        }
        
        // Inicializar Commands
        SmartFlowCommands.init(SmartFlowCore, SmartFlowCatalog, SmartFlowRenderer3D, window.notify || notify, render);
        
        notify("Smart Engineering - Sistema listo", false);
    }
    
    // -------------------- 5. GESTIÓN DE PROYECTOS --------------------
    function guardarProyecto() {
        const state = SmartFlowCore.exportProject();
        localStorage.setItem('smartengp_v2_project', state);
        notify("Proyecto guardado en el navegador.", false);
    }
    
    function cargarProyecto() {
        const data = localStorage.getItem('smartengp_v2_project');
        if (data) {
            try {
                const state = JSON.parse(data);
                SmartFlowCore.importState(state.data || state);
                // Sincronizar la escena 3D
                if (SmartFlowRenderer3D) {
                    SmartFlowRenderer3D.syncAllFromCore();
                }
                autoCenter();
                notify("Proyecto cargado correctamente.", false);
            } catch (e) {
                notify("Error al cargar el proyecto: archivo corrupto.", true);
            }
        } else {
            notify("No hay proyecto guardado.", true);
        }
    }
    
    function exportarProyectoArchivo() {
        if (window.SmartFlowIO && SmartFlowIO.exportProjectJSON) {
            SmartFlowIO.exportProjectJSON();
            notify("Proyecto exportado como archivo JSON.", false);
        } else {
            const state = SmartFlowCore.exportProject();
            const blob = new Blob([state], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${window.currentProjectName || 'Proyecto'}_SmartEngp.json`;
            a.click();
            notify("Proyecto exportado como archivo JSON.", false);
        }
    }

    function importarProyectoArchivo() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (window.SmartFlowIO && SmartFlowIO.importProjectJSON) {
                SmartFlowIO.importProjectJSON(file);
                setTimeout(() => {
                    if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
                    autoCenter();
                }, 100);
            } else {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const state = JSON.parse(ev.target.result);
                        SmartFlowCore.importState(state.data || state);
                        if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
                        autoCenter();
                        notify("Proyecto importado correctamente.", false);
                    } catch (err) {
                        notify("Error al importar el proyecto: archivo corrupto.", true);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }
    
    function nuevoProyecto() {
        if (confirm("¿Desea crear un nuevo proyecto? Se perderán los cambios no guardados.")) {
            SmartFlowCore.nuevoProyecto();
            if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
            autoCenter();
        }
    }
    
    // -------------------- 6. MTO EXPANDIDO --------------------
    function exportarMTO() {
        const equipos = SmartFlowCore.getEquipos();
        const lines = SmartFlowCore.getLines();
        let items = [];
        equipos.forEach(eq => items.push([eq.tag, eq.tipo, "Und", 1]));
        lines.forEach(line => {
            let length = 0;
            const pts = line._cachedPoints || line.points3D;
            if (pts) for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            items.push([line.tag, `Tubería ${line.material || 'PPR'} ${line.diameter}"`, "m", (length / 1000).toFixed(2)]);
            if (line.components) {
                line.components.forEach(comp => {
                    let desc = comp.type;
                    items.push([comp.tag || `ACC-${line.tag}`, desc, "Und", 1]);
                });
            }
        });
        if (items.length === 0) { notify("No hay elementos para exportar.", true); return; }
        const ws = XLSX.utils.aoa_to_sheet([["Tag", "Descripción", "Unidad", "Cantidad"], ...items]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "MTO");
        XLSX.writeFile(wb, `MTO_${Date.now()}.xlsx`);
        notify("MTO exportado correctamente.", false);
    }
    
    function resumenProyecto() {
        const equipos = SmartFlowCore.getEquipos();
        const lines = SmartFlowCore.getLines();
        const tanques = equipos.filter(e => e.tipo === 'tanque_v' || e.tipo === 'tanque_h');
        const bombas = equipos.filter(e => e.tipo.includes('bomba'));
        const colectores = equipos.filter(e => e.tipo === 'colector');
        let totalCodos = 0, totalValvulas = 0;
        lines.forEach(l => {
            const pts = l._cachedPoints || l.points3D;
            if (pts) totalCodos += Math.max(0, pts.filter(p => !p.isControlPoint).length - 2);
            if (l.components) {
                l.components.forEach(c => {
                    if (c.type.includes('ELBOW')) totalCodos++;
                    if (c.type.includes('VALVE')) totalValvulas++;
                });
            }
        });
        const resumen = `Proyecto: ${tanques.length} tanques, ${bombas.length} bombas, ${colectores.length} colectores, ${lines.length} tuberías, ${totalCodos} codos, ${totalValvulas} válvulas.`;
        notify(resumen, false);
        if (voiceEnabled && window.speechSynthesis) {
            const u = new SpeechSynthesisUtterance(resumen);
            u.lang = 'es-ES';
            window.speechSynthesis.speak(u);
        }
    }
    
    // -------------------- 7. CONFIGURACIÓN DE HERRAMIENTAS --------------------
    function setTool(mode) {
        toolMode = mode;
    }
    
    function setElevation(level) {
        SmartFlowCore.setElevation(level);
        if (customElev) customElev.value = level;
    }
    
    function toggleVoice() {
        voiceEnabled = !voiceEnabled;
        SmartFlowCore.setVoice(voiceEnabled);
        if (btnVoice) btnVoice.textContent = voiceEnabled ? "Voz ON" : "Voz OFF";
    }
    
    // -------------------- ATJOS DE TECLADO --------------------
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.tagName === 'INPUT' && activeEl.id !== 'commandText') return;
            
            if (e.ctrlKey && e.shiftKey) {
                switch(e.key.toUpperCase()) {
                    case 'C':
                        e.preventDefault();
                        if (commandPanel) commandPanel.style.display = 'block';
                        if (commandText) commandText.focus();
                        break;
                    case 'R':
                        e.preventDefault();
                        resumenProyecto();
                        break;
                    case 'V':
                        e.preventDefault();
                        autoCenter();
                        break;
                    case 'U':
                        e.preventDefault();
                        SmartFlowCore.undo();
                        if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
                        break;
                    case 'Y':
                        e.preventDefault();
                        SmartFlowCore.redo();
                        if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
                        break;
                    case 'M':
                        e.preventDefault();
                        exportarMTO();
                        break;
                    case 'P':
                        e.preventDefault();
                        if (SmartFlowRenderer3D && SmartFlowRenderer3D.exportPDF) SmartFlowRenderer3D.exportPDF();
                        break;
                    case 'E':
                        e.preventDefault();
                        if (window.SmartFlowIO && SmartFlowIO.exportPCF) SmartFlowIO.exportPCF();
                        break;
                    default:
                        break;
                }
            }
        });
    }

    // -------------------- 8. EVENTOS DEL CANVAS (3D) --------------------
    function initCanvasEvents() {
        // Con OrbitControls ya tenemos rotación, pan y zoom con ratón.
        // No necesitamos los eventos antiguos de arrastre de equipos en 2D.
        // Pero podemos agregar un listener de clic para seleccionar objetos 3D.
        
        if (!SmartFlowRenderer3D) return;
        
        const renderer = SmartFlowRenderer3D.getRenderer();
        if (!renderer) return;
        
        const canvas = renderer.domElement;
        
        // Raycaster para detectar clicks en equipos y líneas
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        canvas.addEventListener('click', (event) => {
            // Solo si la herramienta de selección está activa
            if (toolMode !== 'select') return;
            
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, SmartFlowRenderer3D.getCamera());
            
            const scene = SmartFlowRenderer3D.getScene();
            const objects = [];
            scene.traverse(child => {
                if (child.userData && (child.userData.type === 'equipment' || child.userData.type === 'line')) {
                    objects.push(child);
                }
            });
            
            const intersects = raycaster.intersectObjects(objects, true);
            if (intersects.length > 0) {
                let obj = intersects[0].object;
                while (obj && !obj.userData.tag) obj = obj.parent;
                if (obj && obj.userData.tag) {
                    // Encontrar el objeto en el core
                    const db = SmartFlowCore.getDb();
                    const equip = db.equipos.find(e => e.tag === obj.userData.tag);
                    const line = db.lines.find(l => l.tag === obj.userData.tag);
                    const selected = equip ? { type: 'equipment', obj: equip } : (line ? { type: 'line', obj: line } : null);
                    SmartFlowCore.setSelected(selected);
                    if (SmartFlowRenderer3D) SmartFlowRenderer3D.selectElement(obj.userData.tag);
                    
                    // Actualizar panel de propiedades
                    if (selected && selected.obj) {
                        const info = SmartFlowCore.getPropertyInfo(selected.obj.tag);
                        updatePropertyPanel(info);
                    } else {
                        updatePropertyPanel(null);
                    }
                }
            } else {
                SmartFlowCore.setSelected(null);
                updatePropertyPanel(null);
                if (SmartFlowRenderer3D) SmartFlowRenderer3D.selectElement(null);
            }
        });
    }
    
    // -------------------- 9. CABLEADO DE BOTONES --------------------
    function bindEvents() {
        const vincular = (id, accion) => {
            const el = document.getElementById(id);
            if (el) el.onclick = accion;
            else console.warn("Botón no encontrado: " + id);
        };
        
        vincular('btnNew', nuevoProyecto);
        vincular('btnOpen', cargarProyecto);
        vincular('btnSave', guardarProyecto);
        vincular('btnExportProject', exportarProyectoArchivo);
        vincular('btnImportProject', importarProyectoArchivo);
        vincular('btnReset', autoCenter);
        vincular('btnCommand', () => { if (commandPanel) commandPanel.style.display = 'block'; });
        vincular('closeCommand', () => { if (commandPanel) commandPanel.style.display = 'none'; });
        vincular('clearCommand', () => { if (commandText) commandText.value = ''; });
        vincular('runCommands', () => {
            if (commandText) {
                const cmd = commandText.value.trim();
                let processed = false;
                if (typeof SmartFlowAccessibility !== 'undefined') {
                    processed = SmartFlowAccessibility.processAccessibilityCommand(cmd);
                }
                if (!processed) {
                    SmartFlowCommands.executeBatch(cmd);
                }
                commandText.value = '';
                if (commandPanel) commandPanel.style.display = 'none';
                // Sincronizar la escena 3D después de ejecutar comandos
                if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
            }
        });
        vincular('btnAddTank', () => {
            const equipos = SmartFlowCore.getEquipos();
            const tag = `TK-${equipos.filter(e => e.tipo === 'tanque_v').length + 1}`;
            const ult = equipos[equipos.length - 1];
            const x = ult ? ult.posX + 3000 : 0;
            SmartFlowCommands.executeCommand(`create tanque_v ${tag} at (${x},1450,0) diam 2380 height 2900 material PE`);
            if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
        });
        vincular('btnAddPump', () => {
            const equipos = SmartFlowCore.getEquipos();
            const tag = `B-${equipos.filter(e => e.tipo.includes('bomba')).length + 1}`;
            const ult = equipos[equipos.length - 1];
            const x = ult ? ult.posX + 3000 : 5000;
            SmartFlowCommands.executeCommand(`create bomba ${tag} at (${x},800,0) diam 800 height 800`);
            if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
        });
        vincular('btnMTO', exportarMTO);
        vincular('btnPDF', () => { 
            if (SmartFlowRenderer3D && SmartFlowRenderer3D.exportPDF) SmartFlowRenderer3D.exportPDF(); 
        });
        vincular('btnExportPCF', () => {
            if (window.SmartFlowIO && SmartFlowIO.exportPCF) {
                SmartFlowIO.exportPCF();
            } else {
                notify("Exportación PCF no disponible.", true);
            }
        });
        vincular('btnImportPCF', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pcf,.txt';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => { 
                        if (window.SmartFlowIO && SmartFlowIO.importPCF) {
                            SmartFlowIO.importPCF(ev.target.result);
                        }
                        setTimeout(() => {
                            if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
                        }, 50);
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        });
        vincular('btnUndo', () => { 
            SmartFlowCore.undo(); 
            if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
        });
        vincular('btnRedo', () => { 
            SmartFlowCore.redo(); 
            if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
        });
        vincular('btnVoice', toggleVoice);
        vincular('btnSpeakSummary', resumenProyecto);
        vincular('btnRecalc', () => { 
            SmartFlowCore.syncPhysicalData(); 
            if (SmartFlowRenderer3D) SmartFlowRenderer3D.syncAllFromCore();
        });
        vincular('btnSetElev', () => {
            const val = parseInt(customElev?.value);
            if (!isNaN(val)) setElevation(val);
        });
        vincular('btnApplyNorm', () => notify("Función de normas en desarrollo.", false));
        vincular('btnToggleCatalog', () => {
            if (catalogPanel) catalogPanel.style.display = catalogPanel.style.display === 'none' ? 'flex' : 'none';
        });
        
        window.addEventListener('resize', () => {
            // El renderizador 3D ya tiene su propio manejador de resize
        });
    }
    
    // -------------------- 10. ARRANQUE DE LA APLICACIÓN --------------------
    async function init() {
        await initModules();
        bindEvents();
        setupKeyboardShortcuts();
        initCanvasEvents();
        setTool('select');
        setElevation(0);
        setTimeout(() => {
            autoCenter();
        }, 200);  // Esperar a que el canvas 3D esté listo
    }
    
    init();
})();
