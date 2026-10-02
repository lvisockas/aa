import type { EmoteKind } from '../families/types';

interface Emote {
  kind: EmoteKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  spin: number;
  color: string;
}

export interface Tag {
  x: number;
  y: number;
  text: string;
  alpha: number;
  dark: boolean;
}

const COLORS: Record<EmoteKind, string> = {
  heart: '#ff4f7b',
  sparkle: '#ffc23d',
  bang: '#ff5a3d',
  question: '#6b8cff',
  zzz: '#8f9bb3',
  note: '#9b6bff',
  sweat: '#59b7ff',
  star: '#ffcc33',
  check: '#2fbf71',
};

/** Lightweight 2D layer for emotes and name tags drawn above the 3D canvas. */
export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private items: Emote[] = [];
  private dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  spawn(kind: EmoteKind, x: number, y: number, scale = 1, now = performance.now() / 1000): void {
    const n = kind === 'sparkle' || kind === 'star' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? (i - 1) * 0.9 + (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 0.6;
      this.items.push({
        kind,
        x: x + (Math.random() - 0.5) * 10,
        y,
        vx: Math.sin(a) * 36,
        vy: -60 - Math.random() * 25,
        born: now + i * 0.05,
        life: kind === 'zzz' ? 2.2 : 1.35,
        size: (kind === 'sparkle' ? 13 : 16) * scale * (0.85 + Math.random() * 0.3),
        spin: (Math.random() - 0.5) * 2,
        color: COLORS[kind],
      });
    }
    if (this.items.length > 80) this.items.splice(0, this.items.length - 80);
  }

  draw(now: number, tags: Tag[]): void {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.dpr = dpr;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const t of tags) this.drawTag(t);
    this.items = this.items.filter((e) => now - e.born < e.life);
    for (const e of this.items) {
      const age = now - e.born;
      if (age < 0) continue;
      const k = age / e.life;
      const x = e.x + e.vx * age;
      const y = e.y + e.vy * age + 18 * age * age;
      const pop = k < 0.15 ? 0.4 + 0.6 * (k / 0.15) * (1.25 - 0.25 * (k / 0.15)) : 1;
      const alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(x, y);
      ctx.rotate(e.spin * age * 0.6);
      ctx.scale(pop, pop);
      this.shape(e, age);
      ctx.restore();
    }
  }

  private drawTag(t: Tag): void {
    if (t.alpha <= 0.01) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = t.alpha;
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const w = ctx.measureText(t.text).width + 18;
    const h = 24;
    const x = t.x - w / 2, y = t.y - h - 8;
    ctx.fillStyle = t.dark ? 'rgba(255,255,255,0.94)' : 'rgba(20,20,24,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.moveTo(t.x - 5, y + h);
    ctx.lineTo(t.x, y + h + 5);
    ctx.lineTo(t.x + 5, y + h);
    ctx.fill();
    ctx.fillStyle = t.dark ? '#111' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.text, t.x, y + h / 2 + 0.5);
    ctx.restore();
  }

  private shape(e: Emote, age: number): void {
    const ctx = this.ctx;
    const s = e.size;
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (e.kind) {
      case 'heart': {
        ctx.beginPath();
        ctx.moveTo(0, s * 0.35);
        ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.45, -s * 0.85, 0, -s * 0.38);
        ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.2, 0, s * 0.35);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(-s * 0.28, -s * 0.3, s * 0.12, s * 0.07, -0.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'sparkle':
      case 'star': {
        const spikes = e.kind === 'star' ? 5 : 4;
        const inner = e.kind === 'star' ? 0.45 : 0.28;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = (i % 2 === 0 ? 1 : inner) * s * 0.6;
          const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'bang':
      case 'question':
      case 'note':
      case 'check': {
        ctx.font = `800 ${s * 1.3}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ch = e.kind === 'bang' ? '!' : e.kind === 'question' ? '?' : e.kind === 'note' ? '♪' : '✓';
        ctx.lineWidth = s * 0.28;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(ch, 0, 0);
        ctx.fillText(ch, 0, 0);
        break;
      }
      case 'zzz': {
        ctx.font = `700 ${s}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('z', Math.sin(age * 3) * 4, 0);
        break;
      }
      case 'sweat': {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.55);
        ctx.bezierCurveTo(s * 0.45, 0, s * 0.4, s * 0.45, 0, s * 0.45);
        ctx.bezierCurveTo(-s * 0.4, s * 0.45, -s * 0.45, 0, 0, -s * 0.55);
        ctx.fill();
        break;
      }
    }
  }

  get pixelRatio(): number {
    return this.dpr;
  }
}
