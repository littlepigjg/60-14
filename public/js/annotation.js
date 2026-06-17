class AnnotationManager {
  constructor(canvas, signaling) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.signaling = signaling;
    this.annotations = [];
    this.currentTool = 'pen';
    this.currentColor = '#ef4444';
    this.currentStroke = 3;
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.tempPoints = [];
    this.tempAnnotation = null;
    this.eraserRadius = 16;
    this._dpr = window.devicePixelRatio || 1;

    this._setupCanvas();
    this._bindEvents();
    window.addEventListener('resize', () => this._setupCanvas());
  }

  _setupCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this._dpr;
    this.canvas.height = rect.height * this._dpr;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.render();
  }

  getCoords(ev) {
    const rect = this.canvas.getBoundingClientRect();
    const touch = ev.touches ? ev.touches[0] : ev;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      normX: (touch.clientX - rect.left) / rect.width,
      normY: (touch.clientY - rect.top) / rect.height
    };
  }

  _bindEvents() {
    const down = (e) => {
      if (e.cancelable) e.preventDefault();
      this._onDown(e);
    };
    const move = (e) => {
      if (this.isDrawing && e.cancelable) e.preventDefault();
      this._onMove(e);
    };
    const up = (e) => {
      if (this.isDrawing) this._onUp(e);
    };

    this.canvas.addEventListener('mousedown', down);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    this.canvas.addEventListener('touchstart', down, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }

  _onDown(e) {
    const { x, y, normX, normY } = this.getCoords(e);
    this.isDrawing = true;
    this.startX = x;
    this.startY = y;

    if (this.currentTool === 'eraser') {
      this._eraseAt(normX, normY);
      return;
    }

    this.tempPoints = [{ x: normX, y: normY }];
    this.tempAnnotation = {
      id: crypto.randomUUID(),
      type: this.currentTool,
      color: this.currentColor,
      stroke: this.currentStroke,
      startX: normX,
      startY: normY,
      endX: normX,
      endY: normY,
      points: this.currentTool === 'pen' ? [...this.tempPoints] : undefined,
      authorName: 'me'
    };
  }

  _onMove(e) {
    if (!this.isDrawing) return;
    const { x, y, normX, normY } = this.getCoords(e);

    if (this.currentTool === 'eraser') {
      this._eraseAt(normX, normY);
      this.render();
      return;
    }

    if (this.currentTool === 'pen') {
      this.tempPoints.push({ x: normX, y: normY });
      this.tempAnnotation.points = [...this.tempPoints];
    } else {
      this.tempAnnotation.endX = normX;
      this.tempAnnotation.endY = normY;
    }
    this.render();
  }

  _onUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentTool === 'eraser') {
      this._flushErasures();
      return;
    }

    const distance = Math.hypot(
      (this.tempAnnotation.endX - this.tempAnnotation.startX),
      (this.tempAnnotation.endY - this.tempAnnotation.startY)
    );
    const hasPoints = this.tempAnnotation.points && this.tempAnnotation.points.length > 1;

    if (distance < 0.002 && !hasPoints) {
      this.tempAnnotation = null;
      this.render();
      return;
    }

    const toSend = JSON.parse(JSON.stringify(this.tempAnnotation));
    this.annotations.push(toSend);
    this.signaling.sendAnnotation(toSend);
    this.tempAnnotation = null;
    this.render();
  }

  _eraseAt(nx, ny) {
    const rect = this.canvas.getBoundingClientRect();
    const threshold = this.eraserRadius / Math.min(rect.width, rect.height);
    for (let i = this.annotations.length - 1; i >= 0; i--) {
      const a = this.annotations[i];
      if (this._annotationNearPoint(a, nx, ny, threshold)) {
        if (!a._markedForDelete) {
          a._markedForDelete = true;
          if (!this._deletedIds) this._deletedIds = [];
          this._deletedIds.push(a.id);
        }
      }
    }
  }

  _flushErasures() {
    if (this._deletedIds && this._deletedIds.length > 0) {
      const ids = new Set(this._deletedIds);
      this.annotations = this.annotations.filter(a => !ids.has(a.id));
      this._deletedIds.forEach(id => {
        this.signaling.sendAnnotation({ id, __delete: true });
      });
    }
    this._deletedIds = null;
    this.annotations.forEach(a => delete a._markedForDelete);
    this.render();
  }

  _annotationNearPoint(a, nx, ny, threshold) {
    if (a.type === 'pen' && a.points) {
      return a.points.some(p => Math.hypot(p.x - nx, p.y - ny) < threshold);
    }
    if (a.type === 'circle' || a.type === 'rect') {
      const cx = (a.startX + a.endX) / 2;
      const cy = (a.startY + a.endY) / 2;
      const rx = Math.abs(a.endX - a.startX) / 2;
      const ry = Math.abs(a.endY - a.startY) / 2;
      if (a.type === 'circle') {
        const r = Math.max(rx, ry);
        return Math.abs(Math.hypot(nx - cx, ny - cy) - r) < threshold * 2;
      } else {
        const onEdgeX = Math.abs(Math.abs(nx - cx) - rx) < threshold * 2;
        const onEdgeY = Math.abs(Math.abs(ny - cy) - ry) < threshold * 2;
        const inRangeY = Math.abs(ny - cy) <= ry + threshold * 2;
        const inRangeX = Math.abs(nx - cx) <= rx + threshold * 2;
        return (onEdgeX && inRangeY) || (onEdgeY && inRangeX);
      }
    }
    const d = this._pointToSegmentDist(nx, ny, a.startX, a.startY, a.endX, a.endY);
    return d < threshold * 2;
  }

  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D;
    const len2 = C * C + D * D || 1;
    let t = dot / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * C), py - (y1 + t * D));
  }

  receiveAnnotation(a) {
    if (a.__delete) {
      this.annotations = this.annotations.filter(x => x.id !== a.id);
    } else {
      const existing = this.annotations.findIndex(x => x.id === a.id);
      if (existing >= 0) {
        this.annotations[existing] = a;
      } else {
        this.annotations.push(a);
      }
    }
    this.render();
  }

  clearAll() {
    this.annotations = [];
    this.render();
    this.signaling.clearAnnotations();
  }

  undo() {
    const myAnns = this.annotations.filter(a => a.authorId === this.signaling.clientId);
    if (myAnns.length === 0) return;
    const last = myAnns[myAnns.length - 1];
    this.annotations = this.annotations.filter(a => a.id !== last.id);
    this.signaling.sendAnnotation({ id: last.id, __delete: true });
    this.render();
  }

  setTool(tool) {
    this.currentTool = tool;
    this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  }

  setColor(color) {
    this.currentColor = color;
  }

  setStroke(n) {
    this.currentStroke = n;
  }

  loadInitial(list) {
    this.annotations = list || [];
    this.render();
  }

  render() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    const all = [...this.annotations];
    if (this.tempAnnotation) all.push(this.tempAnnotation);
    all.forEach(a => this._drawAnnotation(a, rect));
  }

  _drawAnnotation(a, rect) {
    const W = rect.width, H = rect.height;
    const toPx = (nx, ny) => ({ x: nx * W, y: ny * H });

    this.ctx.save();
    this.ctx.strokeStyle = a.color;
    this.ctx.fillStyle = a.color;
    this.ctx.lineWidth = a.stroke || 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    const s = toPx(a.startX, a.startY);
    const e = toPx(a.endX, a.endY);

    if (a.type === 'pen' && a.points) {
      this.ctx.beginPath();
      a.points.forEach((p, i) => {
        const pt = toPx(p.x, p.y);
        if (i === 0) this.ctx.moveTo(pt.x, pt.y);
        else this.ctx.lineTo(pt.x, pt.y);
      });
      this.ctx.stroke();
    } else if (a.type === 'line') {
      this.ctx.beginPath();
      this.ctx.moveTo(s.x, s.y);
      this.ctx.lineTo(e.x, e.y);
      this.ctx.stroke();
    } else if (a.type === 'arrow') {
      this._drawArrow(s.x, s.y, e.x, e.y);
    } else if (a.type === 'circle') {
      const cx = (s.x + e.x) / 2;
      const cy = (s.y + e.y) / 2;
      const rx = Math.abs(e.x - s.x) / 2;
      const ry = Math.abs(e.y - s.y) / 2;
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (a.type === 'rect') {
      const x = Math.min(s.x, e.x);
      const y = Math.min(s.y, e.y);
      const w = Math.abs(e.x - s.x);
      const h = Math.abs(e.y - s.y);
      this.ctx.strokeRect(x, y, w, h);
    }

    this.ctx.restore();
  }

  _drawArrow(x1, y1, x2, y2) {
    const headLen = 14 + (this.ctx.lineWidth || 3) * 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    this.ctx.closePath();
    this.ctx.fill();
  }
}
