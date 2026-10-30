/**
 * One-finger pan, two-finger pinch, wheel and trackpad zoom over a block of content, using a
 * single CSS transform on the content so nothing re-renders while the map moves. Taps (no
 * movement, quick) are reported separately so the map can be both dragged and tapped.
 */

export interface PanZoomOptions {
  /** The clipping box; it receives the pointer events. */
  viewport: HTMLElement;
  /** The transformed child, laid out at its scale-1 size. */
  content: HTMLElement;
  /** Content size at scale 1, in px. */
  width: number;
  height: number;
  minScale: number;
  maxScale: number;
  /** How far past the content's edge the view may drag, in px. */
  margin?: number;
  /** A tap: the element under the finger when it went down, and the content point under it. */
  onTap?: (target: Element, x: number, y: number) => void;
  /** Pointers that start here (buttons, sheets over the map) are left alone. */
  ignore?: (target: Element) => boolean;
}

interface Ptr {
  x: number;
  y: number;
}

export class PanZoom {
  x = 0;
  y = 0;
  scale = 1;
  private readonly o: PanZoomOptions;
  private pointers = new Map<number, Ptr>();
  private down: { x: number; y: number; t: number; target: Element; moved: boolean } | null = null;
  private pinch: { d: number; s: number; mid: Ptr; ox: number; oy: number } | null = null;
  private samples: { t: number; x: number; y: number }[] = [];
  private raf = 0;
  private settle = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(o: PanZoomOptions) {
    this.o = o;
    const v = o.viewport;
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      v.addEventListener(t, f, opts);
      this.cleanup.push(() => v.removeEventListener(t, f, opts));
    };
    on("pointerdown", (e) => this.onDown(e));
    on("pointermove", (e) => this.onMove(e));
    on("pointerup", (e) => this.onUp(e));
    on("pointercancel", (e) => this.onUp(e, true));
    on("wheel", (e) => this.onWheel(e), { passive: false });
    o.content.style.transformOrigin = "0 0";
    o.content.style.willChange = "transform";
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const f of this.cleanup) f();
  }

  /** Scale-1 content size, when the viewport is resized. */
  resize(width: number, height: number, minScale: number, maxScale: number, margin = this.o.margin ?? 0): void {
    this.o.width = width;
    this.o.height = height;
    this.o.minScale = minScale;
    this.o.maxScale = maxScale;
    this.o.margin = margin;
    this.clamp();
    this.apply();
  }

  /** Put a content point (scale-1 px) at a viewport point, optionally at a new scale. */
  centerOn(cx: number, cy: number, scale = this.scale, at?: Ptr, animate = false): void {
    const v = this.o.viewport;
    const px = at?.x ?? v.clientWidth / 2;
    const py = at?.y ?? v.clientHeight / 2;
    this.scale = Math.min(this.o.maxScale, Math.max(this.o.minScale, scale));
    this.x = px - cx * this.scale;
    this.y = py - cy * this.scale;
    this.clamp();
    this.apply(animate);
  }

  /** Multiply the scale, keeping the viewport point (default: the centre) still. */
  zoomBy(f: number, at?: Ptr, animate = false): void {
    const v = this.o.viewport;
    const px = at?.x ?? v.clientWidth / 2;
    const py = at?.y ?? v.clientHeight / 2;
    const cx = (px - this.x) / this.scale;
    const cy = (py - this.y) / this.scale;
    this.centerOn(cx, cy, this.scale * f, { x: px, y: py }, animate);
  }

  /** Viewport px of a content point. */
  toScreen(cx: number, cy: number): Ptr {
    return { x: this.x + cx * this.scale, y: this.y + cy * this.scale };
  }

  /** Content point (scale-1 px) under a viewport point. */
  toContent(px: number, py: number): Ptr {
    return { x: (px - this.x) / this.scale, y: (py - this.y) / this.scale };
  }

  private local(e: PointerEvent | WheelEvent): Ptr {
    const r = this.o.viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.o.ignore?.(e.target as Element)) return;
    const p = this.local(e);
    try {
      this.o.viewport.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events have no active pointer to capture; moves still arrive while over the map.
    }
    this.pointers.set(e.pointerId, p);
    this.stopInertia();
    this.o.content.style.transition = "";
    if (this.pointers.size === 1) {
      this.down = { x: p.x, y: p.y, t: performance.now(), target: e.target as Element, moved: false };
      this.samples = [{ t: performance.now(), x: this.x, y: this.y }];
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), s: this.scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ox: this.x, oy: this.y };
      if (this.down) this.down.moved = true;
    }
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = Math.min(this.o.maxScale, Math.max(this.o.minScale, (this.pinch.s * d) / this.pinch.d));
      // The content point that was under the first midpoint stays under the current one.
      const cx = (this.pinch.mid.x - this.pinch.ox) / this.pinch.s;
      const cy = (this.pinch.mid.y - this.pinch.oy) / this.pinch.s;
      this.scale = s;
      this.x = mid.x - cx * s;
      this.y = mid.y - cy * s;
      this.clamp();
      this.apply();
      return;
    }
    if (this.pointers.size === 1 && this.down) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      if (!this.down.moved && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 7) this.down.moved = true;
      if (this.down.moved) {
        this.x += dx;
        this.y += dy;
        this.clamp();
        this.apply();
        const now = performance.now();
        this.samples.push({ t: now, x: this.x, y: this.y });
        while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
      }
    }
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const d = this.down;
    if (this.pointers.size === 0) {
      this.down = null;
      this.pinch = null;
      if (d && !d.moved && !cancelled && performance.now() - d.t < 450) {
        const c = this.toContent(d.x, d.y);
        this.o.onTap?.(d.target, c.x, c.y);
      } else if (d?.moved) this.fling();
    } else if (this.pointers.size === 1) {
      // Lifting one finger of a pinch: carry on panning with the other.
      this.pinch = null;
      const [p] = [...this.pointers.values()];
      this.down = { x: p.x, y: p.y, t: 0, target: this.o.viewport, moved: true };
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.stopInertia();
    // Trackpad pinches arrive as ctrl+wheel with small deltas; mouse wheels tick by ~100.
    const k = e.ctrlKey ? 0.012 : e.deltaMode === 1 ? 0.06 : 0.0022;
    this.zoomBy(Math.exp(-e.deltaY * k), this.local(e));
  }

  private fling(): void {
    const s = this.samples;
    if (s.length < 2) return;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(16, b.t - a.t);
    let vx = ((b.x - a.x) / dt) * 16;
    let vy = ((b.y - a.y) / dt) * 16;
    if (Math.hypot(vx, vy) < 1.5) return;
    const step = () => {
      vx *= 0.93;
      vy *= 0.93;
      this.x += vx;
      this.y += vy;
      this.clamp();
      this.apply();
      if (Math.hypot(vx, vy) > 0.4) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private stopInertia(): void {
    cancelAnimationFrame(this.raf);
  }

  private clamp(): void {
    const v = this.o.viewport;
    const m = this.o.margin ?? 0;
    const fit = (pos: number, content: number, view: number) => {
      if (content <= view) return (view - content) / 2;
      return Math.min(m, Math.max(view - content - m, pos));
    };
    this.x = fit(this.x, this.o.width * this.scale, v.clientWidth);
    this.y = fit(this.y, this.o.height * this.scale, v.clientHeight);
  }

  private apply(animate = false): void {
    const c = this.o.content;
    clearTimeout(this.settle);
    if (animate) {
      c.style.transition = "transform 520ms cubic-bezier(0.2, 0.7, 0.2, 1)";
      this.settle = window.setTimeout(() => (c.style.transition = ""), 560);
    }
    c.style.transform = `translate3d(${this.x.toFixed(2)}px, ${this.y.toFixed(2)}px, 0) scale(${this.scale.toFixed(4)})`;
  }
}
