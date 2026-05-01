
// ============================================================
// MÓDULO: SMARTFLOW IO (Exportación/Importación Unificada)
// Archivo: js/io.js
// ============================================================

(function() {
    
    // -------------------- 1. EXPORTAR PROYECTO (JSON) --------------------
    function exportProjectJSON() {
        if (typeof SmartFlowCore === 'undefined') {
            console.error("IO: Core no disponible");
            return;
        }
        const state = SmartFlowCore.exportProject();
        const blob = new Blob([state], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${window.currentProjectName || 'Proyecto'}_SmartEngp.json`;
        a.click();
    }
    
    // -------------------- 2. IMPORTAR PROYECTO (JSON) --------------------
    function importProjectJSON(file) {
        if (typeof SmartFlowCore === 'undefined') {
            console.error("IO: Core no disponible");
            return;
        }
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const state = JSON.parse(ev.target.result);
                SmartFlowCore.importState(state.data || state);
                // Notificar éxito
                if (typeof SmartFlowCore !== 'undefined') {
                    const statusEl = document.getElementById('statusMsg');
                    if (statusEl) statusEl.innerText = "Proyecto importado correctamente.";
                }
            } catch (err) {
                console.error("Error al importar proyecto JSON", err);
                const statusEl = document.getElementById('statusMsg');
                if (statusEl) statusEl.innerText = "Error al importar: archivo corrupto.";
            }
        };
        reader.readAsText(file);
    }
    
    // -------------------- 3. EXPORTAR PCF --------------------
    function exportPCF() {
        if (typeof SmartFlowCommands === 'undefined' || typeof SmartFlowCommands.exportPCF !== 'function') {
            console.error("IO: Comando exportPCF no disponible");
            return;
        }
        // SmartFlowCommands.exportPCF() debe estar definido en commands.js
        // Si no existe, delegamos al renderizador antiguo como fallback
        if (typeof SmartFlowRenderer3D !== 'undefined' && typeof SmartFlowRenderer3D.exportPCF === 'function') {
            SmartFlowRenderer3D.exportPCF();
        } else {
            SmartFlowCommands.exportPCF();
        }
    }
    
    // -------------------- 4. IMPORTAR PCF --------------------
    function importPCF(fileContent) {
        if (typeof SmartFlowCommands === 'undefined' || typeof SmartFlowCommands.importPCF !== 'function') {
            console.error("IO: Comando importPCF no disponible");
            return;
        }
        SmartFlowCommands.importPCF(fileContent);
    }
    
    // -------------------- 5. ABRIR DIÁLOGO DE ARCHIVO --------------------
    function openFileDialog(accept, callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                callback(ev.target.result, file);
            };
            reader.readAsText(file);
        };
        input.click();
    }
    
    // -------------------- API PÚBLICA --------------------
    window.SmartFlowIO = {
        exportProjectJSON: exportProjectJSON,
        importProjectJSON: importProjectJSON,
        exportPCF: exportPCF,
        importPCF: importPCF,
        openFileDialog: openFileDialog
    };
    
    console.log("✅ SmartFlowIO inicializado correctamente");
})();
