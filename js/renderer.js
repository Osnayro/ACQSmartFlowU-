
// ============================================================
// MÓDULO 3: SMARTFLOW RENDERER (Motor de Dibujo Isométrico) - v18.6
// Archivo: js/renderer.js
// ============================================================

const SmartFlowRenderer = (function() {
    
    let _canvas = null;
    let _ctx = null;
    let _core = null;
    
    let _cam = { scale: 0.5, panX: 0, panY: 0 };
    let _currentElevation = 0;
    let _notifyUI = (msg, isErr) => console.log(msg);

    // -------------------- ESTILOS DE INGENIERÍA --------------------
    const STYLE_DIM = { color: '#ef4444', font: 'bold 10px Inter, Arial', lineDash: [2, 2] };
    const STYLE_PORT = { open: '#10b981', closed: '#64748b', size: 4 };
    const STYLE_FITTING = { color: '#f59e0b', width: 3 };

    // -------------------- SNAP A PUERTOS --------------------
    const SNAP_THRESHOLD = 15;
    let _activeSnap = null;
    let _hoveredItem = null;

    // -------------------- 1. PROYECCIÓN ISOMÉTRICA --------------------
    const COS30 = 0.86602540378;
    const SIN30 = 0.5;
    
    function project(p) {
        const x = (p.x - p.z) * COS30;
        const y = (p.x + p.z) * SIN30 - p.y;
        return { x: x * _cam.scale + _cam.panX, y: y * _cam.scale + _cam.panY };
    }

    function inverseProject(screenX, screenY) {
        const X = (screenX - _cam.panX) / _cam.scale;
        const Y = (screenY - _cam.panY) / _cam.scale;
        const adjY = Y + (_currentElevation * 0.5);
        const A = X / COS30;
        const B = adjY / SIN30;
        return { x: (A + B) / 2, y: _currentElevation, z: (B - A) / 2 };
    }

    // -------------------- 2. DIBUJO DE REJILLA Y ORIGEN --------------------
    function drawGrid(elevation = 0) {
        const step = 1000;
        const minX = -10000, maxX = 20000, minZ = -10000, maxZ = 20000;
        _ctx.beginPath();
        _ctx.strokeStyle = '#1e293b';
        _ctx.lineWidth = 1;
        _ctx.globalAlpha = 0.4;
        for (let x = minX; x <= maxX; x += step) {
            const p1 = project({ x, y: elevation, z: minZ });
            const p2 = project({ x, y: elevation, z: maxZ });
            _ctx.moveTo(p1.x, p1.y); _ctx.lineTo(p2.x, p2.y);
        }
        for (let z = minZ; z <= maxZ; z += step) {
            const p1 = project({ x: minX, y: elevation, z });
            const p2 = project({ x: maxX, y: elevation, z });
            _ctx.moveTo(p1.x, p1.y); _ctx.lineTo(p2.x, p2.y);
        }
        _ctx.stroke();
        _ctx.globalAlpha = 1.0;
    }

    function drawOrigin() {
        const o = project({ x: 0, y: _currentElevation, z: 0 });
        _ctx.beginPath();
        _ctx.moveTo(o.x - 20, o.y); _ctx.lineTo(o.x + 20, o.y);
        _ctx.moveTo(o.x, o.y - 20); _ctx.lineTo(o.x, o.y + 20);
        _ctx.strokeStyle = '#ff8888'; _ctx.lineWidth = 2; _ctx.stroke();
        _ctx.fillStyle = '#ff8888'; _ctx.font = '14px monospace';
        _ctx.fillText(`ORIGEN (0,${_currentElevation/1000}m,0)`, o.x + 15, o.y - 8);
    }

    // -------------------- 3. DIBUJO DE EQUIPOS --------------------
    function drawTank(eq) {
        const p = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
        const w = (eq.diametro / 2) * _cam.scale;
        const h = eq.altura * _cam.scale;
        const topY = p.y - h/2;
        const bottomY = p.y + h/2;
        _ctx.beginPath(); _ctx.ellipse(p.x, bottomY, w, w*0.5, 0, 0, 2*Math.PI); _ctx.fillStyle = '#2563eb'; _ctx.fill(); _ctx.strokeStyle = '#fff'; _ctx.stroke();
        _ctx.fillStyle = '#1e40af'; _ctx.fillRect(p.x - w, topY, w, h);
        _ctx.fillStyle = '#3b82f6'; _ctx.fillRect(p.x, topY, w, h);
        _ctx.beginPath(); _ctx.ellipse(p.x, topY, w, w*0.5, 0, 0, 2*Math.PI); _ctx.fillStyle = '#60a5fa'; _ctx.fill(); _ctx.stroke();
        drawIsoText(eq.tag, p.x, topY - 10, 'XY');
        drawPuertos(eq);
    }

    function drawBomba(eq) {
        const p = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
        const rad = 16 * _cam.scale;
        const grad = _ctx.createRadialGradient(p.x-3, p.y-3, 2, p.x, p.y, rad);
        grad.addColorStop(0, '#f39c12'); grad.addColorStop(1, '#b85c00');
        _ctx.fillStyle = grad; _ctx.beginPath(); _ctx.arc(p.x, p.y, rad, 0, 2*Math.PI); _ctx.fill(); _ctx.strokeStyle = '#fff'; _ctx.stroke();
        _ctx.beginPath(); _ctx.moveTo(p.x-rad, p.y); _ctx.lineTo(p.x+rad, p.y); _ctx.stroke();
        drawIsoText(eq.tag, p.x + 20, p.y - 5, 'XY');
        drawPuertos(eq);
    }

    function drawColector(eq) {
        const pIzq = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
        const pDer = project({ x: eq.posX + eq.largo, y: eq.posY, z: eq.posZ });
        _ctx.beginPath(); _ctx.moveTo(pIzq.x, pIzq.y); _ctx.lineTo(pDer.x, pDer.y);
        _ctx.strokeStyle = '#facc15'; _ctx.lineWidth = Math.max(4, (eq.diametro || 4) * _cam.scale); _ctx.stroke();
        drawIsoText(eq.tag, (pIzq.x + pDer.x)/2, pIzq.y - 15, 'ZY');
        drawPuertos(eq);
    }

    function drawRectEquip(eq, color) {
        const p = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
        const w = (eq.largo || eq.diametro || 1000) * _cam.scale / 2;
        const h = (eq.altura || 1000) * _cam.scale / 2;
        _ctx.fillStyle = color; _ctx.fillRect(p.x-w, p.y-h, w*2, h*2);
        _ctx.strokeStyle = 'white'; _ctx.strokeRect(p.x-w, p.y-h, w*2, h*2);
        drawIsoText(eq.tag, p.x, p.y - h - 5, 'XY');
        drawPuertos(eq);
    }

    function drawCilindroHorizontal(eq, color) {
        const p = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
        const w = (eq.largo || eq.diametro) * _cam.scale / 2;
        const h = (eq.diametro / 2) * _cam.scale;
        _ctx.fillStyle = color; _ctx.fillRect(p.x-w, p.y-h, w*2, h*2); _ctx.strokeStyle = 'white'; _ctx.strokeRect(p.x-w, p.y-h, w*2, h*2);
        _ctx.beginPath(); _ctx.ellipse(p.x-w, p.y, h, h*0.5, 0, 0, 2*Math.PI); _ctx.fillStyle = color; _ctx.fill(); _ctx.stroke();
        _ctx.beginPath(); _ctx.ellipse(p.x+w, p.y, h, h*0.5, 0, 0, 2*Math.PI); _ctx.fillStyle = color; _ctx.fill(); _ctx.stroke();
        drawIsoText(eq.tag, p.x, p.y - h - 5, 'XY');
        drawPuertos(eq);
    }

    function drawPuertos(obj) {
        if (!obj.puertos) return;
        const posBase = obj.posX !== undefined ? { x: obj.posX, y: obj.posY, z: obj.posZ } : (obj._cachedPoints && obj._cachedPoints.length > 0 ? obj._cachedPoints[0] : { x: 0, y: 0, z: 0 });
        obj.puertos.forEach(nz => {
            const pos = { x: posBase.x + (nz.relX || nz.relPos?.x || 0), y: posBase.y + (nz.relY || nz.relPos?.y || 0), z: posBase.z + (nz.relZ || nz.relPos?.z || 0) };
            const proj = project(pos);
            if (nz.orientacion) {
                const dir = nz.orientacion;
                const endPos = { x: pos.x + dir.dx * 250, y: pos.y + dir.dy * 250, z: pos.z + dir.dz * 250 };
                const projEnd = project(endPos);
                _ctx.beginPath(); _ctx.moveTo(proj.x, proj.y); _ctx.lineTo(projEnd.x, projEnd.y);
                _ctx.strokeStyle = '#ffaa00'; _ctx.lineWidth = 2; _ctx.stroke();
                const angle = Math.atan2(projEnd.y - proj.y, projEnd.x - proj.x);
                const arrowSize = 8;
                _ctx.beginPath();
                _ctx.moveTo(projEnd.x, projEnd.y);
                _ctx.lineTo(projEnd.x - arrowSize * Math.cos(angle - 0.5), projEnd.y - arrowSize * Math.sin(angle - 0.5));
                _ctx.lineTo(projEnd.x - arrowSize * Math.cos(angle + 0.5), projEnd.y - arrowSize * Math.sin(angle + 0.5));
                _ctx.closePath(); _ctx.fillStyle = '#ffaa00'; _ctx.fill();
            }
            _ctx.beginPath(); _ctx.arc(proj.x, proj.y, 6, 0, 2*Math.PI);
            _ctx.fillStyle = nz.connectedLine ? '#4ade80' : '#ff8800'; _ctx.fill();
            _ctx.strokeStyle = '#fff'; _ctx.lineWidth = 1; _ctx.stroke();
            drawIsoText(`${nz.id} ${nz.diametro || obj.diameter || 3}"`, proj.x - 12, proj.y - 6, 'XY');
        });
    }

    // -------------------- 4. TEXTO ISOMÉTRICO --------------------
    function drawIsoText(text, x, y, plane = 'XY') {
        if (!text) return;
        _ctx.save();
        _ctx.font = `bold ${Math.max(12, 14 * _cam.scale)}px 'Segoe UI', monospace`;
        _ctx.textAlign = 'center'; _ctx.textBaseline = 'bottom';
        if (plane === 'XY') { _ctx.setTransform(1, 0.5, 0, 1, x, y); }
        else if (plane === 'ZY') { _ctx.setTransform(1, -0.5, 0, 1, x, y); }
        else { _ctx.setTransform(1, -0.5, 1, 0.5, x, y); }
        const tw = _ctx.measureText(text).width;
        _ctx.fillStyle = '#0f172a'; _ctx.shadowColor = '#00f2ff'; _ctx.shadowBlur = 4;
        _ctx.fillRect(-tw/2 - 6, -16, tw + 12, 20); _ctx.shadowBlur = 0;
        _ctx.strokeStyle = '#334155'; _ctx.lineWidth = 1;
        _ctx.strokeRect(-tw/2 - 6, -16, tw + 12, 20);
        _ctx.fillStyle = '#ffffff'; _ctx.fillText(text, 0, 0);
        _ctx.restore(); _ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // -------------------- 5. FLECHA DE DIRECCIÓN DE FLUJO --------------------
    function drawFlowArrow(p1, p2, diameter) {
        const proj1 = project(p1), proj2 = project(p2);
        const angle = Math.atan2(proj2.y - proj1.y, proj2.x - proj1.x);
        const midX = (proj1.x + proj2.x) / 2, midY = (proj1.y + proj2.y) / 2;
        _ctx.save(); _ctx.translate(midX, midY); _ctx.rotate(angle);
        const arrowSize = 12 * _cam.scale;
        _ctx.beginPath();
        _ctx.moveTo(-arrowSize, -arrowSize/2); _ctx.lineTo(0, 0); _ctx.lineTo(-arrowSize, arrowSize/2);
        _ctx.fillStyle = '#00f2ff'; _ctx.shadowColor = '#00f2ff'; _ctx.shadowBlur = 8;
        _ctx.fill(); _ctx.shadowBlur = 0; _ctx.restore();
    }

    // -------------------- 6. DIBUJO DE TUBERÍAS CON VOLUMEN --------------------
    function getPointAtDistance(from, to, dist) { 
        const d = Math.hypot(to.x-from.x, to.y-from.y, to.z-from.z); 
        if (d === 0) return { ...from };
        const t = Math.min(dist/d, 0.5); 
        return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t }; 
    }

    function drawDimensionTick(x, y, angle) {
        const tickSize = 8 * _cam.scale;
        _ctx.save(); _ctx.translate(x, y); _ctx.rotate(angle + Math.PI / 4);
        _ctx.beginPath(); _ctx.moveTo(0, -tickSize); _ctx.lineTo(0, tickSize);
        _ctx.strokeStyle = '#facc15'; _ctx.lineWidth = 1.5; _ctx.stroke(); _ctx.restore();
    }

    function getPipeOrientation(p1, p2) {
        const dx = Math.abs(p2.x - p1.x), dy = Math.abs(p2.y - p1.y), dz = Math.abs(p2.z - p1.z);
        return (dy > dx && dy > dz) ? 'vertical' : 'horizontal';
    }

    function isPointCollidingWithEquipment(point, margin = 1500) {
        if (!_core) return false;
        const db = _core.getDb(); if (!db || !db.equipos) return false;
        return db.equipos.some(eq => {
            if (eq.tipo === 'tanque_v' || eq.tipo === 'torre' || eq.tipo === 'reactor') {
                const dx = Math.abs(point.x - eq.posX), dz = Math.abs(point.z - eq.posZ);
                const radius = (eq.diametro / 2) + margin;
                return (dx <= radius && dz <= radius);
            } else if (eq.tipo === 'tanque_h') {
                const halfL = (eq.largo / 2) + margin, halfD = (eq.diametro / 2) + margin;
                const dx = Math.abs(point.x - eq.posX), dz = Math.abs(point.z - eq.posZ);
                return (dx <= halfL && dz <= halfD);
            } else if (eq.tipo === 'bomba' || eq.tipo === 'intercambiador' || eq.tipo === 'colector') {
                const halfL = ((eq.largo || 1000) / 2) + margin, halfW = ((eq.ancho || eq.diametro || 1000) / 2) + margin;
                const dx = Math.abs(point.x - eq.posX), dz = Math.abs(point.z - eq.posZ);
                return (dx <= halfL && dz <= halfW);
            }
            return false;
        });
    }

    function drawIsometricDimension(p1, p2, offset = 1200) {
        const orientation = getPipeOrientation(p1, p2);
        let candA, candB;
        if (orientation === 'horizontal') { candA = { dx: 0, dy: -offset, dz: 0 }; candB = { dx: 0, dy: offset, dz: 0 }; }
        else { candA = { dx: offset, dy: 0, dz: 0 }; candB = { dx: -offset, dy: 0, dz: 0 }; }
        const checkCollision = (offsetV) => {
            const midPoint = { x: (p1.x + p2.x) / 2 + offsetV.dx, y: (p1.y + p2.y) / 2 + offsetV.dy, z: (p1.z + p2.z) / 2 + offsetV.dz };
            return isPointCollidingWithEquipment(midPoint, 1200);
        };
        const finalOffset = checkCollision(candA) ? candB : candA;
        const dp1 = { x: p1.x + finalOffset.dx, y: p1.y + finalOffset.dy, z: p1.z + finalOffset.dz };
        const dp2 = { x: p2.x + finalOffset.dx, y: p2.y + finalOffset.dy, z: p2.z + finalOffset.dz };
        const pr1 = project(p1), pr2 = project(p2), prD1 = project(dp1), prD2 = project(dp2);
        _ctx.beginPath(); _ctx.setLineDash([4, 4]); _ctx.strokeStyle = '#64748b'; _ctx.lineWidth = 1;
        _ctx.moveTo(pr1.x, pr1.y); _ctx.lineTo(prD1.x, prD1.y);
        _ctx.moveTo(pr2.x, pr2.y); _ctx.lineTo(prD2.x, prD2.y); _ctx.stroke(); _ctx.setLineDash([]);
        _ctx.beginPath(); _ctx.moveTo(prD1.x, prD1.y); _ctx.lineTo(prD2.x, prD2.y);
        _ctx.strokeStyle = '#facc15'; _ctx.lineWidth = 1.5; _ctx.stroke();
        const angle = Math.atan2(prD2.y - prD1.y, prD2.x - prD1.x);
        drawDimensionTick(prD1.x, prD1.y, angle); drawDimensionTick(prD2.x, prD2.y, angle);
        const realDistMeters = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z) / 1000;
        const midX = (prD1.x + prD2.x) / 2, midY = (prD1.y + prD2.y) / 2;
        _ctx.save(); _ctx.translate(midX, midY);
        let textAngle = angle;
        if (textAngle > Math.PI/2) textAngle -= Math.PI;
        if (textAngle < -Math.PI/2) textAngle += Math.PI;
        _ctx.rotate(textAngle);
        const textStr = `${realDistMeters.toFixed(3)} m`;
        _ctx.font = `bold ${Math.max(10, 12 * _cam.scale)}px monospace`;
        const textWidth = _ctx.measureText(textStr).width;
        _ctx.fillStyle = 'rgba(10, 14, 23, 0.8)';
        _ctx.fillRect(-textWidth/2 - 4, -14, textWidth + 8, 16);
        _ctx.fillStyle = '#facc15';
        _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
        _ctx.fillText(textStr, 0, -4);
        _ctx.restore();
    }

    function lineHasAuditError(line) {
        if (!_core) return false;
        const db = _core.getDb();
        if (line.origin && line.origin.objTag) {
            const obj = db.equipos.find(e => e.tag === line.origin.objTag) || db.lines.find(l => l.tag === line.origin.objTag);
            const nz = obj?.puertos?.find(p => p.id === line.origin.portId);
            if (nz && nz.diametro !== line.diameter) return true;
        }
        if (line.destination && line.destination.objTag) {
            const obj = db.equipos.find(e => e.tag === line.destination.objTag) || db.lines.find(l => l.tag === line.destination.objTag);
            const nz = obj?.puertos?.find(p => p.id === line.destination.portId);
            if (nz && nz.diametro !== line.diameter) return true;
        }
        return false;
    }

    function drawPipeWithElbows(line) {
        const pts = line._cachedPoints || line.points3D;
        if (!pts || pts.length < 2) return;
        if (line.origin) {
            const db = _core.getDb();
            const obj = db.equipos.find(e => e.tag === line.origin.objTag) || db.lines.find(l => l.tag === line.origin.objTag);
            if (obj) {
                const puerto = obj.puertos?.find(p => p.id === line.origin.portId);
                if (puerto) {
                    const posBase = obj.posX !== undefined ? { x: obj.posX, y: obj.posY, z: obj.posZ } : (obj._cachedPoints && obj._cachedPoints.length > 0 ? obj._cachedPoints[0] : { x: 0, y: 0, z: 0 });
                    pts[0] = { x: posBase.x + (puerto.relX || puerto.relPos?.x || 0), y: posBase.y + (puerto.relY || puerto.relPos?.y || 0), z: posBase.z + (puerto.relZ || puerto.relPos?.z || 0) };
                }
            }
        }
        if (line.destination) {
            const db = _core.getDb();
            const obj = db.equipos.find(e => e.tag === line.destination.objTag) || db.lines.find(l => l.tag === line.destination.objTag);
            if (obj) {
                const puerto = obj.puertos?.find(p => p.id === line.destination.portId);
                if (puerto) {
                    const posBase = obj.posX !== undefined ? { x: obj.posX, y: obj.posY, z: obj.posZ } : (obj._cachedPoints && obj._cachedPoints.length > 0 ? obj._cachedPoints[0] : { x: 0, y: 0, z: 0 });
                    pts[pts.length - 1] = { x: posBase.x + (puerto.relX || puerto.relPos?.x || 0), y: posBase.y + (puerto.relY || puerto.relPos?.y || 0), z: posBase.z + (puerto.relZ || puerto.relPos?.z || 0) };
                }
            }
        }

        let hasClash = false;
        for (let p of pts) {
            if (isPointCollidingWithEquipment(p, 100)) {
                hasClash = true;
                break;
            }
        }

        const isPPR = line.material === 'PPR' || (line.spec && line.spec.includes('PPR'));
        const radioBase = isPPR ? (line.diameter * 25.4 * 0.8) : (line.diameter * 25.4 * 1.5);
        const radio = Math.min(radioBase, 350);
        const drawPath = () => {
            _ctx.beginPath();
            let first = project(pts[0]); _ctx.moveTo(first.x, first.y);
            for (let i = 1; i < pts.length - 1; i++) {
                const pPrev = pts[i-1], pCurr = pts[i], pNext = pts[i+1];
                if (pCurr.isControlPoint && i + 1 < pts.length) {
                    const cp = project(pCurr), nextP = project(pts[i + 1]);
                    _ctx.quadraticCurveTo(cp.x, cp.y, nextP.x, nextP.y); i++;
                } else {
                    const pIn = getPointAtDistance(pCurr, pPrev, radio), pOut = getPointAtDistance(pCurr, pNext, radio);
                    const projIn = project(pIn), projOut = project(pOut), projCurr = project(pCurr);
                    _ctx.lineTo(projIn.x, projIn.y); _ctx.quadraticCurveTo(projCurr.x, projCurr.y, projOut.x, projOut.y);
                }
            }
            const last = project(pts[pts.length-1]); _ctx.lineTo(last.x, last.y);
        };
        const baseWidth = (line.diameter || 4) * _cam.scale;
        const mainWidth = Math.max(6, baseWidth);
        _ctx.lineCap = 'round'; _ctx.lineJoin = 'round';
        const hasAuditError = lineHasAuditError(line);
        _ctx.save(); drawPath();
        _ctx.shadowColor = hasAuditError ? '#ef4444' : '#000000';
        _ctx.shadowBlur = hasAuditError ? 15 * _cam.scale : 10 * _cam.scale;
        _ctx.shadowOffsetX = 2 * _cam.scale; _ctx.shadowOffsetY = 2 * _cam.scale;
        _ctx.strokeStyle = '#000000'; _ctx.lineWidth = mainWidth + 6; _ctx.stroke(); _ctx.restore();
        drawPath(); _ctx.strokeStyle = '#0a0e17'; _ctx.lineWidth = mainWidth + 4; _ctx.stroke();
        drawPath(); _ctx.strokeStyle = '#1e293b'; _ctx.lineWidth = mainWidth + 2; _ctx.stroke();
        drawPath();
        const spec = line.spec && window.SmartFlowCatalog ? SmartFlowCatalog.getSpec(line.spec) : null;
        let mainColor;
        if (hasAuditError) mainColor = '#ef4444';
        else if (hasClash) mainColor = '#ff00ff';
        else mainColor = spec?.color || '#facc15';
        _ctx.strokeStyle = mainColor; _ctx.lineWidth = mainWidth; _ctx.stroke();
        
        if (hasClash) {
            _ctx.save();
            _ctx.shadowColor = '#ff00ff';
            _ctx.shadowBlur = 20;
            drawPath();
            _ctx.strokeStyle = '#ff00ff';
            _ctx.lineWidth = mainWidth * 0.5;
            _ctx.stroke();
            _ctx.restore();
        }

        drawPath(); _ctx.strokeStyle = '#ffffff'; _ctx.lineWidth = Math.max(2, mainWidth * 0.25); _ctx.globalAlpha = 0.7; _ctx.stroke(); _ctx.globalAlpha = 1.0;
        drawPath(); _ctx.strokeStyle = '#fef08a'; _ctx.lineWidth = Math.max(1, mainWidth * 0.1); _ctx.globalAlpha = 0.9; _ctx.stroke(); _ctx.globalAlpha = 1.0;
        if (hasAuditError && pts.length >= 2) {
            const midPt = getPointAtDistance(pts[0], pts[pts.length-1], Math.hypot(pts[pts.length-1].x - pts[0].x, pts[pts.length-1].y - pts[0].y, pts[pts.length-1].z - pts[0].z) / 2);
            const projMid = project(midPt);
            _ctx.save(); _ctx.translate(projMid.x, projMid.y - 30 * _cam.scale);
            _ctx.font = `bold ${Math.max(16, 20 * _cam.scale)}px "Segoe UI"`; _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
            _ctx.shadowColor = '#ef4444'; _ctx.shadowBlur = 10; _ctx.fillStyle = '#ef4444';
            _ctx.fillText('⚠', 0, 0); _ctx.shadowBlur = 0; _ctx.restore();
        }
        const isSelected = _core && _core.getSelected() && _core.getSelected().obj === line;
        if (line.showDimensions !== false && !isSelected) {
            const puntosReales = pts.filter(p => !p.isControlPoint);
            for (let i = 0; i < puntosReales.length - 1; i++) {
                const p1 = puntosReales[i], p2 = puntosReales[i+1];
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
                if (dist > 100) drawIsometricDimension(p1, p2, 1200);
            }
        }
        if (pts.length >= 2) drawFlowArrow(pts[0], pts[pts.length-1], line.diameter);
        if (line.tag && pts.length >= 2) {
            const midPt = getPointAtDistance(pts[0], pts[pts.length-1], Math.hypot(pts[pts.length-1].x - pts[0].x, pts[pts.length-1].y - pts[0].y, pts[pts.length-1].z - pts[0].z) / 2);
            const projMid = project(midPt);
            const dx = pts[1].x - pts[0].x, dz = pts[1].z - pts[0].z;
            const plane = Math.abs(dx) > Math.abs(dz) ? 'XY' : 'ZY';
            drawIsoText(line.tag, projMid.x, projMid.y - 25 * _cam.scale, plane);
        }
        if (line.puertos) drawPuertos(line);
    }

    function drawPipeComponents(line) {
        const pts = line._cachedPoints || line.points3D;
        if (!pts || pts.length < 2 || !line.components) return;
        let lengths = [], totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            let d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
            lengths.push(d); totalLen += d;
        }
        if (totalLen === 0) return;
        line.components.forEach(comp => {
            let targetLen = totalLen * Math.min(1, Math.max(0, comp.param || 0.5));
            let currentAccum = 0, p1, p2, t = 0;
            for (let i = 0; i < lengths.length; i++) {
                if (currentAccum + lengths[i] >= targetLen || i === lengths.length - 1) {
                    p1 = pts[i]; p2 = pts[i+1];
                    let segLen = lengths[i]; if (segLen > 0) t = (targetLen - currentAccum) / segLen; else t = 0;
                    t = Math.min(1, Math.max(0, t)); break;
                }
                currentAccum += lengths[i];
            }
            if (!p1 || !p2) return;
            const pos3D = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t, z: p1.z + (p2.z - p1.z) * t };
            const proj = project(pos3D), projP1 = project(p1), projP2 = project(p2);
            const angle = Math.atan2(projP2.y - projP1.y, projP2.x - projP1.x);
            drawSymbol(proj.x, proj.y, angle, comp);
            if (comp.tag) drawIsoText(comp.tag, proj.x, proj.y - 20 * _cam.scale, 'XY');
        });
    }

    function drawSymbol(x, y, angle, comp) {
        _ctx.save(); _ctx.translate(x, y); _ctx.rotate(angle);
        const sizeBase = 12; const s = Math.max(8, sizeBase * _cam.scale);
        _ctx.strokeStyle = '#fff'; _ctx.lineWidth = 1.5; _ctx.fillStyle = '#0f172a';
        switch (comp.type) {
            case 'GATE_VALVE': _ctx.beginPath(); _ctx.moveTo(-s, -s/2); _ctx.lineTo(s, s/2); _ctx.lineTo(s, -s/2); _ctx.lineTo(-s, s/2); _ctx.closePath(); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(0, 0); _ctx.lineTo(0, -s); _ctx.moveTo(-s/2, -s); _ctx.lineTo(s/2, -s); _ctx.stroke(); break;
            case 'GLOBE_VALVE': _ctx.beginPath(); _ctx.ellipse(0, 0, s*0.8, s*0.5, 0, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(0, -s*0.5); _ctx.lineTo(0, s*0.5); _ctx.stroke(); _ctx.fillRect(-s*0.3, -s*1.1, s*0.6, s*0.5); break;
            case 'BUTTERFLY_VALVE': _ctx.beginPath(); _ctx.arc(0, 0, s*0.8, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(-s*0.6, -s*0.4); _ctx.lineTo(s*0.6, s*0.4); _ctx.lineWidth = 3; _ctx.stroke(); _ctx.fillRect(-s*0.3, -s*1.2, s*0.6, s*0.5); _ctx.lineWidth = 1.5; break;
            case 'DIAPHRAGM_VALVE': _ctx.beginPath(); _ctx.rect(-s, -s*0.3, s*2, s*0.6); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, -s*0.5, s*0.6, 0, Math.PI, true); _ctx.fill(); _ctx.stroke(); _ctx.fillRect(-s*0.4, -s*1.0, s*0.8, s*0.4); break;
            case 'CHECK_VALVE': _ctx.strokeRect(-s, -s*0.4, s*2, s*0.8); _ctx.beginPath(); _ctx.moveTo(-s*0.5, 0); _ctx.lineTo(s*0.5, -s*0.3); _ctx.lineTo(s*0.5, s*0.3); _ctx.closePath(); _ctx.fillStyle = '#fff'; _ctx.fill(); _ctx.stroke(); _ctx.fillStyle = '#0f172a'; if (comp.subtype === 'SWING') { _ctx.beginPath(); _ctx.arc(s*0.5, 0, s*0.2, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); } break;
            case 'CONTROL_VALVE': _ctx.beginPath(); _ctx.ellipse(0, 0, s*0.8, s*0.5, 0, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, -s*0.7, s*0.6, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(0, -s*1.3); _ctx.lineTo(0, -s*0.7); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(-s*0.4, -s*1.1); _ctx.lineTo(s*0.4, -s*1.1); _ctx.stroke(); break;
            case 'BALL_VALVE': case 'VALVE_BALL': _ctx.beginPath(); _ctx.moveTo(-s, -s*0.6); _ctx.lineTo(s, s*0.6); _ctx.lineTo(s, -s*0.6); _ctx.lineTo(-s, s*0.6); _ctx.closePath(); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, 0, s*0.3, 0, Math.PI*2); _ctx.fillStyle = '#fff'; _ctx.fill(); _ctx.strokeStyle = '#fff'; _ctx.stroke(); _ctx.fillRect(-s*0.2, -s*1.1, s*0.4, s*0.5); break;
            case 'CONCENTRIC_REDUCER': case 'ECCENTRIC_REDUCER': _ctx.beginPath(); _ctx.moveTo(-s, -s*0.4); _ctx.lineTo(s, -s*0.7); _ctx.lineTo(s, s*0.7); _ctx.lineTo(-s, s*0.4); _ctx.closePath(); _ctx.fill(); _ctx.stroke(); if (comp.type === 'ECCENTRIC_REDUCER') { _ctx.beginPath(); _ctx.moveTo(-s, -s*0.4); _ctx.lineTo(-s*0.5, -s*0.4); _ctx.strokeStyle = '#facc15'; _ctx.stroke(); } break;
            case 'WELD_NECK_FLANGE': _ctx.fillRect(-s/4, -s, s/2, s*2); _ctx.strokeRect(-s/4, -s, s/2, s*2); break;
            case 'SLIP_ON_FLANGE': case 'BLIND_FLANGE': case 'LAP_JOINT_FLANGE': _ctx.beginPath(); _ctx.moveTo(-s*0.3, -s); _ctx.lineTo(-s*0.3, s); _ctx.moveTo(s*0.3, -s); _ctx.lineTo(s*0.3, s); _ctx.stroke(); _ctx.fillRect(-s*0.6, -s*0.8, s*1.2, s*1.6); _ctx.strokeRect(-s*0.6, -s*0.8, s*1.2, s*1.6); if (comp.type === 'BLIND_FLANGE') { _ctx.beginPath(); _ctx.moveTo(-s*0.4, -s*0.6); _ctx.lineTo(s*0.4, s*0.6); _ctx.moveTo(s*0.4, -s*0.6); _ctx.lineTo(-s*0.4, s*0.6); _ctx.stroke(); } break;
            case 'PRESSURE_GAUGE': _ctx.beginPath(); _ctx.arc(0, -s, s*0.8, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(0, 0); _ctx.lineTo(0, -s*0.2); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(-s*0.3, -s*0.8); _ctx.lineTo(s*0.3, -s*0.2); _ctx.stroke(); break;
            case 'TEMPERATURE_GAUGE': _ctx.beginPath(); _ctx.arc(0, -s, s*0.8, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(0, 0); _ctx.lineTo(0, -s*0.2); _ctx.stroke(); _ctx.fillStyle = '#ef4444'; _ctx.beginPath(); _ctx.arc(0, -s*0.8, s*0.15, 0, Math.PI*2); _ctx.fill(); break;
            case 'FLOW_METER': _ctx.beginPath(); _ctx.ellipse(0, 0, s*0.5, s*0.8, Math.PI/2, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, -s*1.2, s*0.5, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); _ctx.fillStyle = '#fff'; _ctx.font = `${s*0.8}px Arial`; _ctx.fillText('FM', -s*0.6, -s*1.1); break;
            case 'TEE_EQUAL': case 'TEE_REDUCING': _ctx.beginPath(); _ctx.moveTo(0, 0); _ctx.lineTo(0, -s*1.2); _ctx.moveTo(-s, 0); _ctx.lineTo(s, 0); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, 0, s*0.4, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); if (comp.type === 'TEE_REDUCING') { _ctx.fillStyle = '#facc15'; _ctx.beginPath(); _ctx.arc(0, -s*1.2, s*0.2, 0, Math.PI*2); _ctx.fill(); } break;
            case 'CROSS': _ctx.beginPath(); _ctx.moveTo(0, -s*1.2); _ctx.lineTo(0, s*1.2); _ctx.moveTo(-s*1.2, 0); _ctx.lineTo(s*1.2, 0); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, 0, s*0.4, 0, Math.PI*2); _ctx.fill(); _ctx.stroke(); break;
            case 'CAP': _ctx.beginPath(); _ctx.arc(0, 0, s*0.6, 0, Math.PI, true); _ctx.closePath(); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(-s*0.6, 0); _ctx.lineTo(-s, 0); _ctx.moveTo(s*0.6, 0); _ctx.lineTo(s, 0); _ctx.stroke(); break;
            case 'ELBOW_45': _ctx.beginPath(); _ctx.arc(0, 0, s*0.8, 0, Math.PI/4); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, 0, 2, 0, Math.PI*2); _ctx.fillStyle = '#fff'; _ctx.fill(); break;
            case 'ELBOW_90_LR': case 'ELBOW_90_SR': const radio = comp.type === 'ELBOW_90_LR' ? s*1.2 : s*0.7; _ctx.beginPath(); _ctx.arc(0, 0, radio, 0, Math.PI/2); _ctx.stroke(); _ctx.beginPath(); _ctx.arc(0, 0, 2, 0, Math.PI*2); _ctx.fillStyle = '#fff'; _ctx.fill(); break;
            case 'TRANSITION': _ctx.beginPath(); _ctx.rect(-s, -s/2, s, s); _ctx.moveTo(0, -s/2); _ctx.lineTo(s*0.8, -s/2); _ctx.lineTo(s, 0); _ctx.lineTo(s*0.8, s/2); _ctx.lineTo(0, s/2); _ctx.fill(); _ctx.stroke(); _ctx.strokeStyle = '#7c3aed'; _ctx.lineWidth = 2; _ctx.strokeRect(-s, -s/2, s, s); break;
            case 'UNION': _ctx.beginPath(); _ctx.moveTo(-s*0.3, -s); _ctx.lineTo(-s*0.3, s); _ctx.moveTo(s*0.3, -s); _ctx.lineTo(s*0.3, s); _ctx.stroke(); _ctx.strokeRect(-s*0.5, -s*0.5, s, s); break;
            case 'BULKHEAD': _ctx.beginPath(); _ctx.moveTo(-s*0.2, -s*1.2); _ctx.lineTo(-s*0.2, s*1.2); _ctx.lineWidth = 4; _ctx.strokeStyle = '#94a3b8'; _ctx.stroke(); _ctx.lineWidth = 1.5; _ctx.strokeStyle = '#fff'; _ctx.strokeRect(-s, -s*0.5, s*2, s); break;
            case 'Y_STRAINER': _ctx.beginPath(); _ctx.moveTo(-s, 0); _ctx.lineTo(0, -s*0.8); _ctx.lineTo(s, 0); _ctx.lineTo(0, s*0.3); _ctx.closePath(); _ctx.fill(); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(-s, 0); _ctx.lineTo(s, 0); _ctx.stroke(); break;
            case 'LEVEL_SWITCH_RANA': _ctx.beginPath(); _ctx.arc(0, 0, s*0.5, 0, Math.PI*2); _ctx.stroke(); _ctx.beginPath(); _ctx.moveTo(0, 0); _ctx.lineTo(-s, -s*0.5); _ctx.stroke(); _ctx.fillStyle = '#4ade80'; _ctx.fill(); break;
            default: _ctx.fillRect(-s, -s, s*2, s*2); _ctx.strokeRect(-s, -s, s*2, s*2); _ctx.fillStyle = '#fff'; _ctx.font = `${s}px Arial`; _ctx.fillText(comp.type?.substring(0,2) || '?', -s*0.5, s*0.5);
        }
        _ctx.restore();
    }

    // -------------------- 7. DETECCIÓN VOLUMÉTRICA DE CLICS --------------------
    function isPointInCylinder(p, eq) { const dx = p.x - eq.posX, dz = p.z - eq.posZ; const radius = eq.diametro / 2; if (dx*dx + dz*dz > radius*radius) return false; const halfH = eq.altura / 2; if (p.y < eq.posY - halfH || p.y > eq.posY + halfH) return false; return true; }
    function isPointInHorizontalCylinder(p, eq) { const dx = p.x - eq.posX; const halfL = eq.largo / 2; if (Math.abs(dx) > halfL) return false; const dy = p.y - eq.posY, dz = p.z - eq.posZ; const radius = eq.diametro / 2; if (dy*dy + dz*dz > radius*radius) return false; return true; }
    function isPointInBox(p, eq) { const halfL = (eq.largo || 1000) / 2, halfW = (eq.ancho || eq.diametro || 1000) / 2, halfH = (eq.altura || 1000) / 2; return Math.abs(p.x - eq.posX) <= halfL && Math.abs(p.y - eq.posY) <= halfH && Math.abs(p.z - eq.posZ) <= halfW; }

    function pickElement(mouseCanvas) {
        if (!_core) return null;
        const db = _core.getDb(); const equipos = db?.equipos || []; const lines = db?.lines || [];
        const worldClick = inverseProject(mouseCanvas.x, mouseCanvas.y);
        for (let i = equipos.length - 1; i >= 0; i--) {
            const eq = equipos[i]; let inside = false;
            if (eq.tipo === 'tanque_v' || eq.tipo === 'torre' || eq.tipo === 'reactor') inside = isPointInCylinder(worldClick, eq);
            else if (eq.tipo === 'tanque_h') inside = isPointInHorizontalCylinder(worldClick, eq);
            else inside = isPointInBox(worldClick, eq);
            if (inside) return { type: 'equipment', obj: eq };
        }
        for (let line of lines) {
            const pts = line._cachedPoints || line.points3D; if (!pts || pts.length < 2) continue;
            for (let i = 0; i < pts.length - 1; i++) {
                const p1 = pts[i], p2 = pts[i+1]; const proj1 = project(p1), proj2 = project(p2);
                const dist = pointToSegmentDistance(mouseCanvas, proj1, proj2);
                if (dist < 12) return { type: 'line', obj: line };
            }
        }
        return null;
    }
    function pointToSegmentDistance(p, a, b) { const ax = p.x - a.x, ay = p.y - a.y; const bx = b.x - a.x, by = b.y - a.y; const dot = ax * bx + ay * by; const len2 = bx * bx + by * by; if (len2 === 0) return Math.hypot(ax, ay); let t = dot / len2; t = Math.max(0, Math.min(1, t)); const projX = a.x + t * bx, projY = a.y + t * by; return Math.hypot(p.x - projX, p.y - projY); }

    // -------------------- 8. DIBUJO DE SELECCIÓN --------------------
    function drawSelection(element) {
        if (!element) return;
        _ctx.save();
        _ctx.strokeStyle = '#facc15';
        _ctx.lineWidth = 4;
        _ctx.shadowColor = '#facc15';
        _ctx.shadowBlur = 10;
        
        if (element.type === 'equipment') {
            const eq = element.obj;
            if (eq.tipo === 'colector') {
                const pIzq = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
                const pDer = project({ x: eq.posX + eq.largo, y: eq.posY, z: eq.posZ });
                _ctx.beginPath(); _ctx.moveTo(pIzq.x, pIzq.y); _ctx.lineTo(pDer.x, pDer.y); _ctx.stroke();
            } else if (eq.tipo === 'tanque_v' || eq.tipo === 'torre' || eq.tipo === 'reactor') {
                const p = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
                const w = (eq.diametro / 2) * _cam.scale;
                const h = eq.altura * _cam.scale;
                _ctx.beginPath(); _ctx.ellipse(p.x, p.y - h/2, w + 5, (w + 5) * 0.5, 0, 0, 2*Math.PI); _ctx.stroke();
                _ctx.beginPath(); _ctx.ellipse(p.x, p.y + h/2, w + 5, (w + 5) * 0.5, 0, 0, 2*Math.PI); _ctx.stroke();
            } else {
                const p = project({ x: eq.posX, y: eq.posY, z: eq.posZ });
                const w = ((eq.largo || eq.diametro || 1000) / 2) * _cam.scale + 5;
                const h = ((eq.altura || 1000) / 2) * _cam.scale + 5;
                _ctx.strokeRect(p.x - w, p.y - h, w*2, h*2);
            }
        } else if (element.type === 'line') {
            const line = element.obj;
            const pts = line._cachedPoints || line.points3D;
            if (pts && pts.length >= 2) {
                _ctx.beginPath();
                const proj = pts.map(p => project(p));
                _ctx.moveTo(proj[0].x, proj[0].y);
                for (let i = 1; i < proj.length; i++) _ctx.lineTo(proj[i].x, proj[i].y);
                _ctx.stroke();
            }
        }
        _ctx.restore();
    }

    // -------------------- 9. DIBUJO DE ACCESORIOS (FITTINGS) --------------------
    function drawFitting(fitting) {
        if (!fitting || !fitting.puertos) return;
        const center = project({ x: fitting.posX, y: fitting.posY, z: fitting.posZ });
        _ctx.save(); _ctx.beginPath();
        _ctx.strokeStyle = STYLE_FITTING.color;
        _ctx.lineWidth = STYLE_FITTING.width * _cam.scale;
        _ctx.lineCap = 'round';
        fitting.puertos.forEach(p => {
            const pProj = project({ x: fitting.posX + (p.relX || 0), y: fitting.posY + (p.relY || 0), z: fitting.posZ + (p.relZ || 0) });
            _ctx.moveTo(center.x, center.y); _ctx.lineTo(pProj.x, pProj.y);
            _ctx.strokeRect(pProj.x - 2, pProj.y - 2, 4, 4);
        });
        _ctx.stroke();
        _ctx.fillStyle = STYLE_FITTING.color;
        _ctx.font = `bold ${10 * _cam.scale}px Arial`;
        _ctx.fillText(fitting.tipo || fitting.tag || '', center.x + 10, center.y - 10);
        _ctx.restore();
    }

    // -------------------- 10. COTAS INTELIGENTES --------------------
    function drawSmartDimension(p1, p2) {
        const proj1 = project(p1), proj2 = project(p2);
        const dist = Math.sqrt(Math.pow(p2.x-p1.x,2) + Math.pow(p2.y-p1.y,2) + Math.pow(p2.z-p1.z,2));
        if (dist < 10) return;
        _ctx.save(); _ctx.setLineDash(STYLE_DIM.lineDash); _ctx.strokeStyle = STYLE_DIM.color;
        _ctx.beginPath(); _ctx.moveTo(proj1.x, proj1.y); _ctx.lineTo(proj2.x, proj2.y); _ctx.stroke();
        _ctx.setLineDash([]); _ctx.fillStyle = STYLE_DIM.color;
        _ctx.font = `${10 * _cam.scale}px monospace`;
        _ctx.fillText(`${dist.toFixed(0)}mm`, (proj1.x + proj2.x) / 2, (proj1.y + proj2.y) / 2 - 10);
        _ctx.restore();
    }

    // -------------------- 11. VISUALIZACIÓN DE PUERTOS DE CONEXIÓN --------------------
    function drawPortMarkers(item) {
        if (!item || !item.puertos) return;
        const basePos = item.posX !== undefined ? { x: item.posX, y: item.posY, z: item.posZ } : (item._cachedPoints?.[0] || { x: 0, y: 0, z: 0 });
        item.puertos.forEach(p => {
            const pProj = project({ x: basePos.x + (p.relX || 0), y: basePos.y + (p.relY || 0), z: basePos.z + (p.relZ || 0) });
            _ctx.beginPath();
            _ctx.fillStyle = (p.status === 'open') ? STYLE_PORT.open : STYLE_PORT.closed;
            _ctx.arc(pProj.x, pProj.y, STYLE_PORT.size * _cam.scale, 0, Math.PI * 2);
            _ctx.fill();
        });
    }

    // -------------------- 12. DETECCIÓN DE PUERTOS (SNAP) --------------------
    function pickPort(mouseX, mouseY) {
        const db = _core.getDb();
        const allItems = [...(db.equipos || []), ...(db.lines || [])];
        for (const item of allItems) {
            if (!item.puertos) continue;
            for (const port of item.puertos) {
                const worldPos = {
                    x: (item.posX || 0) + (port.relX || 0),
                    y: (item.posY || 0) + (port.relY || 0),
                    z: (item.posZ || 0) + (port.relZ || 0)
                };
                const screenPos = project(worldPos);
                const dist = Math.hypot(screenPos.x - mouseX, screenPos.y - mouseY);
                if (dist < SNAP_THRESHOLD) return { item, port, screenPos };
            }
        }
        return null;
    }

    // -------------------- 13. AUTO-CENTER --------------------
    function autoCenter() {
        if (!_canvas || !_core) return;
        const db = _core.getDb(); const equipos = db?.equipos || []; const lines = db?.lines || [];
        let points = [];
        equipos.forEach(eq => { const radius = (eq.diametro / 2) || 500; points.push({ x: eq.posX, y: eq.posY, z: eq.posZ }); points.push({ x: eq.posX + radius, y: eq.posY, z: eq.posZ }); points.push({ x: eq.posX - radius, y: eq.posY, z: eq.posZ }); points.push({ x: eq.posX, y: eq.posY, z: eq.posZ + radius }); points.push({ x: eq.posX, y: eq.posY, z: eq.posZ - radius }); if (eq.tipo === 'tanque_h') { const halfL = eq.largo / 2; points.push({ x: eq.posX + halfL, y: eq.posY, z: eq.posZ }); points.push({ x: eq.posX - halfL, y: eq.posY, z: eq.posZ }); } });
        let centroid = { x: 0, y: 0, z: 0 }; if (equipos.length > 0) { equipos.forEach(eq => { centroid.x += eq.posX; centroid.y += eq.posY; centroid.z += eq.posZ; }); centroid.x /= equipos.length; centroid.y /= equipos.length; centroid.z /= equipos.length; }
        const MAX_DIST = 15000;
        lines.forEach(line => { const pts = line._cachedPoints || line.points3D; if (!pts) return; pts.forEach(p => { if (equipos.length === 0) points.push(p); else { const dist = Math.hypot(p.x - centroid.x, p.y - centroid.y, p.z - centroid.z); if (dist < MAX_DIST) points.push(p); } }); });
        if (points.length === 0) points = [{ x: -2000, y: 0, z: -2000 }, { x: 2000, y: 2000, z: 2000 }];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach(p => { const rx = (p.x - p.z) * COS30, ry = (p.x + p.z) * SIN30 - p.y; if (rx < minX) minX = rx; if (rx > maxX) maxX = rx; if (ry < minY) minY = ry; if (ry > maxY) maxY = ry; });
        const mx = (maxX - minX) * 0.15, my = (maxY - minY) * 0.15; minX -= mx; maxX += mx; minY -= my; maxY += my;
        const worldW = maxX - minX, worldH = maxY - minY;
        const padding = Math.min(Math.max(_canvas.width * 0.1, 20), 80);
        let sc = Math.min((_canvas.width - padding) / worldW, (_canvas.height - padding) / worldH, 0.6, 0.12);
        _cam.scale = isFinite(sc) ? sc : 0.5;
        _cam.panX = _canvas.width / 2 - ((minX + maxX) / 2) * _cam.scale;
        _cam.panY = _canvas.height / 2 - ((minY + maxY) / 2) * _cam.scale;
        render();
    }

    function pan(dx, dy) { _cam.panX += dx; _cam.panY += dy; render(); }
    function zoom(delta) { _cam.scale *= (delta > 0 ? 1.1 : 0.9); _cam.scale = Math.min(Math.max(0.05, _cam.scale), 1.5); render(); }

    function exportPDF() {
        if (!_canvas) return;
        const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape' });
        const imgData = _canvas.toDataURL('image/png'); doc.addImage(imgData, 'PNG', 10, 10, 277, 150);
        doc.setFontSize(16); doc.text("SmartProject - Reporte Isometrico", 10, 175);
        doc.text(`Fecha: ${new Date().toLocaleString()}`, 10, 185);
        doc.save(`${window.currentProjectName || 'Proyecto'}_Isometrico_${Date.now()}.pdf`);
        _notifyUI("PDF generado correctamente.", false);
    }

    // ============================================================
    // EXPORTACIÓN PCF
    // ============================================================
    const skeyMap = {
        'GATE_VALVE': 'VAGF', 'GLOBE_VALVE': 'VGLF', 'BUTTERFLY_VALVE': 'VBAF', 'BALL_VALVE': 'VBAL',
        'VALVE_BALL': 'VBAL', 'CHECK_VALVE': 'VCFF', 'DIAPHRAGM_VALVE': 'VDIA', 'CONTROL_VALVE': 'VCON',
        'PRESSURE_RELIEF': 'VPRV', 'SAFETY_VALVE': 'VSFT', 'WELD_NECK_FLANGE': 'FLWN', 'SLIP_ON_FLANGE': 'FLSO',
        'BLIND_FLANGE': 'FLBL', 'LAP_JOINT_FLANGE': 'FLLJ', 'ELBOW_90_LR': 'ELBW', 'ELBOW_90_SR': 'ELBS',
        'ELBOW_45': 'ELL4', 'ELBOW_90_PPR': 'ELBW', 'ELBOW_45_PPR': 'ELL4', 'CODO_90_ACERO_3IN': 'ELBW',
        'CONCENTRIC_REDUCER': 'RECN', 'ECCENTRIC_REDUCER': 'REEC', 'TEE_EQUAL': 'TEE', 'TEE_REDUCING': 'TEER',
        'TEE_PPR': 'TEE', 'CROSS': 'CROS', 'CAP': 'CAPF', 'PIPE_SHOE': 'SHOE', 'U_BOLT': 'UBOL',
        'GUIDE': 'GUID', 'ANCHOR': 'ANCH', 'TRANSITION': 'TRAN', 'UNION': 'UNIO', 'BULKHEAD': 'BULK',
        'Y_STRAINER': 'STRY', 'PRESSURE_GAUGE': 'INPG', 'TEMPERATURE_GAUGE': 'INTG', 'FLOW_METER': 'INFM',
        'LEVEL_SWITCH_RANA': 'INSLS'
    };

    function calculateComponentPosition(line, param) {
        const pts = line._cachedPoints || line.points3D; if (!pts || pts.length < 2) return null;
        let lengths = [], totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) { let d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z); lengths.push(d); totalLen += d; }
        if (totalLen === 0) return null;
        const targetLen = totalLen * param; let currentAccum = 0, segIndex = 0, t = 0;
        for (let i = 0; i < lengths.length; i++) { if (currentAccum + lengths[i] >= targetLen || i === lengths.length - 1) { segIndex = i; let segLen = lengths[i]; if (segLen > 0) t = (targetLen - currentAccum) / segLen; else t = 0; t = Math.min(1, Math.max(0, t)); break; } currentAccum += lengths[i]; }
        const p1 = pts[segIndex], p2 = pts[segIndex + 1];
        const compPos = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t, z: p1.z + (p2.z - p1.z) * t };
        const dirVec = { dx: p2.x - p1.x, dy: p2.y - p1.y, dz: p2.z - p1.z }; const len = Math.hypot(dirVec.dx, dirVec.dy, dirVec.dz) || 1;
        return { p1: compPos, p2: compPos, dir: { dx: dirVec.dx/len, dy: dirVec.dy/len, dz: dirVec.dz/len } };
    }

    function generatePCFHeader(line) {
        const db = _core.getDb(); const projectName = window.currentProjectName || db?.projectName || 'ACQ-PROJECT';
        return [`ISOGEN-FILES PCF.STYLE`, `UNITS-BORMM             MM`, `UNITS-COOR              MM`, `UNITS-WEIGHT            KG`, `PIPELINE-REFERENCE      ${line.tag}`, `REVISION                ${line.revision || '0'}`, `PROJECT-IDENTIFIER      ${projectName}`, `ATTRIBUTE1              ${line.service || 'PROCESS'}`, `ATTRIBUTE2              ${line.spec || 'UNSPECIFIED'}`, `END-POSITION-CHECK      OFF`].join('\n');
    }

    function formatComponentPCF(comp, pos, diameterMM, dirVec) {
        const skey = skeyMap[comp.type] || 'MISC';
        let lines = [`${comp.type}`, `    END-POINT           ${pos.p1.x.toFixed(2)} ${pos.p1.y.toFixed(2)} ${pos.p1.z.toFixed(2)}  ${diameterMM.toFixed(2)}`, `    END-POINT           ${pos.p2.x.toFixed(2)} ${pos.p2.y.toFixed(2)} ${pos.p2.z.toFixed(2)}  ${diameterMM.toFixed(2)}`, `    SKEY                ${skey}`, `    ITEM-CODE           ${comp.itemCode || comp.type}`, `    ITEM-DESCRIPTION    ${comp.description || comp.nombre || comp.type}`];
        if (dirVec) { lines.push(`    ENTRY               ${dirVec.dx.toFixed(3)} ${dirVec.dy.toFixed(3)} ${dirVec.dz.toFixed(3)}`); lines.push(`    EXIT                ${dirVec.dx.toFixed(3)} ${dirVec.dy.toFixed(3)} ${dirVec.dz.toFixed(3)}`); }
        lines.push(`    FABRICATION-ITEM`); return lines.join('\n');
    }

    function exportPCF() {
        if (!_core) { _notifyUI("Error: Core no inicializado.", true); return; }
        const db = _core.getDb(); const lines = db?.lines || [];
        if (lines.length === 0) { _notifyUI("No hay líneas para exportar.", true); return; }
        let pcfContent = "";
        db.equipos?.forEach(eq => { if (!eq.puertos) return; eq.puertos.forEach(nz => { const pos = { x: eq.posX + (nz.relX || 0), y: eq.posY + (nz.relY || 0), z: eq.posZ + (nz.relZ || 0) }; const dir = nz.orientacion || { dx: 0, dy: 0, dz: 1 }; pcfContent += `NOZZLE\n    COMPONENT-IDENTIFIER ${eq.tag}-${nz.id}\n    END-POINT           ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)}  ${(nz.diametro*25.4).toFixed(2)}\n    DIRECTION           ${dir.dx.toFixed(3)} ${dir.dy.toFixed(3)} ${dir.dz.toFixed(3)}\n    SKEY                NOZZ\n    ITEM-DESCRIPTION    Boquilla ${nz.id} ${nz.diametro}"\n\n`; }); });
        lines.forEach(line => { const pts = line._cachedPoints || line.points3D; if (!pts || pts.length < 2) return; const diamMM = (line.diameter || 4) * 25.4; pcfContent += generatePCFHeader(line) + "\n";
            for (let i = 0; i < pts.length - 1; i++) { const p1 = pts[i], p2 = pts[i+1]; if (!p1.isControlPoint && !p2.isControlPoint) { const dirVec = { dx: p2.x - p1.x, dy: p2.y - p1.y, dz: p2.z - p1.z }; const len = Math.hypot(dirVec.dx, dirVec.dy, dirVec.dz) || 1; const dir = { dx: dirVec.dx/len, dy: dirVec.dy/len, dz: dirVec.dz/len }; pcfContent += "PIPE\n    END-POINT           " + p1.x.toFixed(2) + " " + p1.y.toFixed(2) + " " + p1.z.toFixed(2) + "  " + diamMM.toFixed(2) + "\n    END-POINT           " + p2.x.toFixed(2) + " " + p2.y.toFixed(2) + " " + p2.z.toFixed(2) + "  " + diamMM.toFixed(2) + "\n    ENTRY               " + dir.dx.toFixed(3) + " " + dir.dy.toFixed(3) + " " + dir.dz.toFixed(3) + "\n    EXIT                " + dir.dx.toFixed(3) + " " + dir.dy.toFixed(3) + " " + dir.dz.toFixed(3) + "\n    ITEM-CODE           PIPE-" + (line.material || 'PPR') + "-" + line.diameter + "IN\n    SKEY                PIPE\n    FABRICATION-ITEM\n"; } }
            if (line.components && line.components.length > 0) { line.components.forEach(comp => { const pos = calculateComponentPosition(line, comp.param || 0.5); if (pos) pcfContent += formatComponentPCF(comp, pos, diamMM, pos.dir) + "\n"; }); }
            pcfContent += "\n";
        });
        const blob = new Blob([pcfContent], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        const projectName = window.currentProjectName || 'Proyecto'; const timestamp = new Date().toISOString().slice(0,19).replace(/:/g, '-');
        a.download = `${projectName}_PCF_${timestamp}.pcf`; a.click();
        _notifyUI("Archivo PCF exportado correctamente con vectores de orientación.", false);
    }

    // ============================================================
    // FUNCIÓN PRINCIPAL DE RENDERIZADO
    // ============================================================
    function render() {
        if (!_ctx || !_canvas) return;
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        _ctx.fillStyle = '#0a0e17';
        _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
        drawGrid(_currentElevation);
        drawOrigin();
        if (!_core) return;
        const db = _core.getDb();
        if (!db) return;

        let renderQueue = [];
        (db.equipos || []).forEach(eq => {
            renderQueue.push({ type: 'EQUIPMENT', depth: eq.posX + eq.posZ + (eq.posY * 0.1), data: eq });
        });
        (db.lines || []).forEach(line => {
            const pts = line._cachedPoints || line.points3D;
            if (pts && pts.length >= 2) {
                const avgDepth = pts.reduce((acc, p) => acc + (p.x + p.z), 0) / pts.length;
                renderQueue.push({ type: 'LINE', depth: avgDepth, data: line });
            }
        });
        renderQueue.sort((a, b) => a.depth - b.depth);

        renderQueue.forEach(item => {
            if (item.data.isFitting) {
                drawFitting(item.data);
            } else if (item.type === 'EQUIPMENT') {
                const eq = item.data;
                switch (eq.tipo) {
                    case 'tanque_v': case 'torre': case 'reactor': drawTank(eq); break;
                    case 'bomba': drawBomba(eq); break;
                    case 'colector': drawColector(eq); break;
                    case 'tanque_h': drawCilindroHorizontal(eq, '#2563eb'); break;
                    default: drawRectEquip(eq, '#475569');
                }
            } else {
                drawPipeWithElbows(item.data);
                drawPipeComponents(item.data);
            }
        });

        const selected = _core.getSelected();
        if (selected) {
            drawSelection(selected);
            drawPortMarkers(selected.obj);
            if (selected.type === 'line' && selected.obj._cachedPoints) {
                const pts = selected.obj._cachedPoints;
                for (let i = 0; i < pts.length - 1; i++) drawSmartDimension(pts[i], pts[i+1]);
            }
        }

        if (_activeSnap) {
            _ctx.save();
            _ctx.beginPath();
            _ctx.strokeStyle = '#10b981';
            _ctx.lineWidth = 2;
            _ctx.arc(_activeSnap.screenPos.x, _activeSnap.screenPos.y, 8, 0, Math.PI * 2);
            _ctx.stroke();
            _ctx.fillStyle = '#10b981';
            _ctx.font = 'bold 12px Arial';
            _ctx.fillText(
                `${_activeSnap.item.tag}:${_activeSnap.port.id} (${_activeSnap.port.diametro}")`,
                _activeSnap.screenPos.x + 12,
                _activeSnap.screenPos.y - 12
            );
            _ctx.restore();
        }
    }

    // ==================== INICIALIZACIÓN ====================
    function init(canvasElement, coreInstance, notifyFn) {
        _canvas = canvasElement;
        _ctx = _canvas.getContext('2d');
        _core = coreInstance;
        _notifyUI = notifyFn || ((msg, isErr) => console.log(msg));
        _currentElevation = 0;
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        _canvas.addEventListener('mousemove', (e) => {
            const rect = _canvas.getBoundingClientRect();
            const mX = e.clientX - rect.left;
            const mY = e.clientY - rect.top;

            const snapped = pickPort(mX, mY);
            if (snapped) {
                _activeSnap = snapped;
                _canvas.style.cursor = 'crosshair';
            } else {
                _activeSnap = null;
                const item = pickElement({ x: mX, y: mY });
                _hoveredItem = item;
                _canvas.style.cursor = item ? 'pointer' : 'default';
            }
            render();
        });

        _canvas.addEventListener('click', (e) => {
            if (e.ctrlKey && _activeSnap) {
                const input = document.getElementById('commandText');
                if (input) {
                    const currentVal = input.value.trim();
                    input.value = `${currentVal} ${_activeSnap.item.tag} ${_activeSnap.port.id}`.trim();
                    input.focus();
                    _notifyUI(`Seleccionado: ${_activeSnap.item.tag} puerto ${_activeSnap.port.id}`);
                }
            }
        });

        render();
    }

    function resizeCanvas() {
        if (!_canvas) return;
        const container = _canvas.parentElement;
        if (container) {
            _canvas.width = container.clientWidth;
            _canvas.height = container.clientHeight;
        }
        render();
    }

    function setElevation(level) { _currentElevation = level; render(); }

    window.SmartFlowRenderer = {
        init, render, autoCenter, pan, zoom,
        project, inverseProject,
        setElevation, resizeCanvas,
        exportPDF, exportPCF,
        getCam: () => _cam,
        pickElement,
        getActiveSnap: () => _activeSnap,
        calculateComponentPosition
    };
    return window.SmartFlowRenderer;
})();
