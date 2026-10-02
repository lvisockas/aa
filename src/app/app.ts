import { QUALITY, Renderer, type FamilyId, type QualityName } from '../engine/renderer';
import { clamp } from '../engine/math';
import { dots } from '../families/dots';
import { grok } from '../families/grok';
import { applySpecies, muse } from '../families/muse';
import type { BaseConfig, FamilyDef } from '../families/types';
import { icons } from '../ui/icons';
import { Inspector } from '../ui/inspector';
import { researchHTML } from '../ui/research';
import { Overlay, type Tag } from './overlay';
import { Stage } from './stage';

type Route = 'home' | FamilyId;
type AnyFamily = FamilyDef<any>;

export const FAMILIES: Record<FamilyId, AnyFamily> = { dots, grok, muse };
const ORDER: FamilyId[] = ['dots', 'grok', 'muse'];
const OVERVIEW_PICK: Record<FamilyId, number[]> = { dots: [0, 1, 2, 3], grok: [0, 1, 2, 3, 4, 5, 6, 7, 8], muse: [0, 2, 4, 6] };

/** Scripted task runs that showcase each family's motion-based state language. */
const DEMO: Record<FamilyId, Array<[string, number]>> = {
  dots: [['listening', 1.8], ['thinking', 2.4], ['working', 3.2], ['awaiting', 2.6], ['complete', 2.6], ['idle', 0]],
  grok: [['thinking', 2.2], ['working', 3.0], ['orbit', 3.2], ['waiting', 2.2], ['done', 2.6], ['idle', 0]],
  muse: [['listening', 1.8], ['thinking', 2.4], ['working', 3.4], ['speaking', 2.8], ['celebrating', 2.6], ['idle', 0]],
};

const STORE = 'cute-agents:v1:';
const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(STORE + k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(STORE + k, JSON.stringify(v));
    } catch {
      /* storage unavailable (private mode, quota) - customisations just won't persist */
    }
  },
};

const clean = (c: BaseConfig) => {
  const { _from, ...rest } = c as BaseConfig & { _from?: unknown };
  void _from;
  return rest;
};

export class App {
  readonly renderer: Renderer;
  readonly overlay: Overlay;
  private stages: Stage<any>[] = [];
  private studio: Stage<any> | null = null;
  private inspector: Inspector | null = null;
  private configs = {} as Record<FamilyId, BaseConfig[]>;
  private pointer: { x: number; y: number } | null = null;
  private lastMove = -100;
  private quality: 'auto' | QualityName;
  private tier: QualityName;
  private reducedMotion: boolean;
  private ema = 1 / 60;
  private lastAdapt = 0;
  private last = performance.now() / 1000;
  private fpsAcc = 0;
  private fpsN = 0;
  private fps = 0;
  private demoTimer = 0;
  private fixedT: number | null;
  private stopAfter: number | null;
  private frames = 0;
  private main: HTMLElement;

  constructor(private root: HTMLElement) {
    const params = new URLSearchParams(location.search);
    this.fixedT = params.has('t') ? Number(params.get('t')) : null;
    this.stopAfter = params.has('stop') ? Number(params.get('stop')) : null;
    const coarse = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const q = (params.get('q') as QualityName | 'auto' | null) ?? store.get<'auto' | QualityName>('quality') ?? 'auto';
    this.quality = q in QUALITY || q === 'auto' ? q : 'auto';
    this.tier = this.quality === 'auto' ? (coarse ? 'medium' : 'high') : this.quality;

    for (const id of ORDER) {
      const defaults = FAMILIES[id].roster();
      const saved = store.get<BaseConfig[]>(`cfg:${id}`);
      this.configs[id] = defaults.map((d, i) => ({ ...d, ...(saved?.[i] ?? {}) }));
    }

    root.innerHTML = this.shell();
    this.main = root.querySelector('#main')!;
    const gl = root.querySelector<HTMLCanvasElement>('#gl')!;
    this.renderer = new Renderer(gl);
    this.renderer.quality = QUALITY[this.tier];
    this.overlay = new Overlay(root.querySelector<HTMLCanvasElement>('#fx')!);
    this.bindChrome();
    window.addEventListener('hashchange', () => this.go(this.parseRoute()));
    this.go(this.parseRoute());
    // compile every family up-front so tab switches are instant
    for (const id of ORDER) this.renderer.load(id, FAMILIES[id].shader).then(() => this.markReady(), (e) => this.fatal(e));
    requestAnimationFrame((t) => this.frame(t));
    // test / debugging hook
    (window as unknown as { __app: App }).__app = this;
  }

  /** Stages currently on screen (exposed for tests). */
  get liveStages(): Stage<any>[] {
    return this.stages;
  }

  // ---------------------------------------------------------------- chrome
  private shell(): string {
    return `
      <canvas id="gl" aria-hidden="true"></canvas>
      <canvas id="fx" aria-hidden="true"></canvas>
      <header class="top">
        <a class="brand" href="#/">${icons.spark}<span>Cute Agents</span></a>
        <nav class="tabs" role="tablist" aria-label="Families">
          <button class="tab" role="tab" data-route="home">Overview</button>
          <button class="tab" role="tab" data-route="dots">Dots<small>OpenAI</small></button>
          <button class="tab" role="tab" data-route="grok">Grok Bot<small>xAI</small></button>
          <button class="tab" role="tab" data-route="muse">Muse<small>Meta</small></button>
        </nav>
        <div class="top-actions">
          <div class="menu" id="settings">
            <button class="icon-btn" aria-label="Render settings" aria-haspopup="true">${icons.gear}</button>
            <div class="menu-pop" role="dialog" aria-label="Render settings">
              <div class="row"><h4>Quality</h4>
                <div class="chips" id="quality">${(['auto', 'low', 'medium', 'high', 'ultra'] as const)
                  .map((q) => `<button data-q="${q}" aria-pressed="${q === this.quality}">${q[0].toUpperCase() + q.slice(1)}</button>`)
                  .join('')}</div>
              </div>
              <div class="row"><label class="switch"><span>Reduced motion</span><input type="checkbox" id="rm" ${this.reducedMotion ? 'checked' : ''}></label></div>
              <div class="stat" id="stat">—</div>
            </div>
          </div>
          <button class="icon-btn" id="research-btn" aria-label="Research notes">${icons.book}<span class="hide-sm">Research</span></button>
        </div>
      </header>
      <main id="main"></main>
      <div class="drawer-scrim"></div>
      <aside class="drawer" aria-label="Research notes">
        <div class="drawer-head"><h2>Research notes</h2><button class="icon-btn" id="drawer-close" aria-label="Close">${icons.close}</button></div>
        ${researchHTML}
      </aside>
      <div class="toast" role="status" aria-live="polite"></div>`;
  }

  private bindChrome(): void {
    const root = this.root;
    root.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) =>
      b.addEventListener('click', () => {
        location.hash = b.dataset.route === 'home' ? '#/' : `#/${b.dataset.route}`;
      }),
    );
    const menu = root.querySelector<HTMLElement>('#settings')!;
    menu.querySelector('button')!.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.dataset.open = menu.dataset.open === 'true' ? 'false' : 'true';
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target as Node)) menu.dataset.open = 'false';
    });
    root.querySelectorAll<HTMLButtonElement>('#quality button').forEach((b) =>
      b.addEventListener('click', () => {
        this.quality = b.dataset.q as 'auto' | QualityName;
        store.set('quality', this.quality);
        root.querySelectorAll('#quality button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (this.quality !== 'auto') {
          this.tier = this.quality;
          this.renderer.scale = 1;
        }
        this.renderer.quality = QUALITY[this.tier];
      }),
    );
    root.querySelector<HTMLInputElement>('#rm')!.addEventListener('change', (e) => {
      this.reducedMotion = (e.target as HTMLInputElement).checked;
    });
    const drawer = (on: boolean) => (document.body.dataset.drawer = String(on));
    root.querySelector('#research-btn')!.addEventListener('click', () => drawer(true));
    root.querySelector('#drawer-close')!.addEventListener('click', () => drawer(false));
    root.querySelector('.drawer-scrim')!.addEventListener('click', () => drawer(false));

    window.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.lastMove = performance.now() / 1000;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => (this.pointer = null));
    window.addEventListener('blur', () => (this.pointer = null));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private parseRoute(): Route {
    const h = location.hash.replace(/^#\/?/, '');
    return (ORDER as string[]).includes(h) ? (h as FamilyId) : 'home';
  }

  private toast(msg: string): void {
    const t = this.root.querySelector<HTMLElement>('.toast')!;
    t.textContent = msg;
    t.dataset.on = 'true';
    clearTimeout((t as HTMLElement & { _h?: number })._h);
    (t as HTMLElement & { _h?: number })._h = window.setTimeout(() => (t.dataset.on = 'false'), 1800);
  }

  private fatal(e: unknown): void {
    console.error(e);
    (window as unknown as { __err: string }).__err = String(e);
    this.main.innerHTML = `<div class="fatal"><h3>Couldn't start the renderer</h3><p>This page needs WebGL2. ${String(e).slice(0, 400)}</p></div>`;
  }

  // ---------------------------------------------------------------- routing
  private go(route: Route): void {
    clearTimeout(this.demoTimer);
    const forced = new URLSearchParams(location.search).get('theme');
    const dark = forced ? forced === 'dark' : route === 'home' || FAMILIES[route].dark;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    this.root.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.route === route)));
    this.stages = [];
    this.studio = null;
    this.inspector = null;
    if (route === 'home') this.renderHome();
    else this.renderStudio(route);
    this.markReady();
    window.scrollTo(0, 0);
  }

  private markReady(): void {
    for (const s of this.stages) {
      if (s.ready || !this.renderer.isReady(s.family.id)) continue;
      s.ready = true;
      const l = s.el.querySelector<HTMLElement>('.stage-loading');
      if (l) {
        l.style.opacity = '0';
        setTimeout(() => l.remove(), 450);
      }
    }
  }

  private loader(): string {
    return `<div class="stage-loading"><div><i></i>Compiling shaders…</div></div>`;
  }

  private renderHome(): void {
    this.main.innerHTML = `
      <section class="overview">
        <div class="hero">
          <h1>Why AI agents are getting cute</h1>
          <p>OpenAI Dots, Grok Bot and Meta Muse, rebuilt as live 3D characters. Move your cursor and they'll watch you. Click to boop, hold to squish, drag to pet.</p>
        </div>
        <div class="cards">
          ${ORDER.map((id) => {
            const f = FAMILIES[id];
            return `
            <article class="card" data-dark="${f.dark}" style="background:${f.background}">
              <div class="stage" data-family="${id}" data-dark="${f.dark}" tabindex="0" role="application" aria-label="${f.name} avatars. Click one to boop it.">${this.loader()}</div>
              <div class="card-body">
                <div class="card-title"><h2>${f.name}</h2><span>${f.maker}</span></div>
                <div class="traits">${f.traits.map((t) => `<span class="trait">${t}</span>`).join('')}</div>
                <button class="open" data-open="${id}">Open studio ${icons.arrow}</button>
              </div>
            </article>`;
          }).join('')}
        </div>
        <p class="foot-note">Rendered live by a custom signed-distance-field ray marcher on WebGL2. No three.js, no meshes, no downloaded assets.</p>
      </section>`;
    this.main.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => (location.hash = `#/${b.dataset.open}`)),
    );
    ORDER.forEach((id, slot) => {
      const el = this.main.querySelector<HTMLElement>(`.stage[data-family="${id}"]`)!;
      const configs = OVERVIEW_PICK[id].map((i) => this.configs[id][i]);
      const stage = new Stage(el, FAMILIES[id], configs, this.renderer, this.overlay, {
        compact: id !== 'grok',
        tags: false,
        slot,
        onActivity: () => {},
      });
      this.stages.push(stage);
    });
  }

  private renderStudio(id: FamilyId): void {
    const f = FAMILIES[id];
    this.main.innerHTML = `
      <section class="studio">
        <div class="stage" data-family="${id}" data-dark="${f.dark}" style="background:${f.background}" tabindex="0" role="application"
             aria-label="${f.name} studio. Move the pointer and the avatars follow it. Click to boop, hold to squish, drag to pet. Arrow keys select, space boops.">
          ${this.loader()}
          <div class="stage-ui">
            <div class="stage-head">
              <div>
                <h2>${f.name}</h2>
                <p>${f.subtitle}</p>
                <div class="traits">${f.traits.map((t) => `<span class="trait">${t}</span>`).join('')}</div>
              </div>
              <div class="stage-tools">
                <button class="icon-btn" data-tool="solo" title="Focus on the selected avatar">${icons.solo}<span>Solo</span></button>
                <button class="icon-btn" data-tool="shot" title="Download a PNG snapshot" aria-label="Snapshot">${icons.camera}</button>
              </div>
            </div>
            <div class="stage-bottom">
              <div class="hint"><span><b>Move</b> they watch</span><span><b>Click</b> boop</span><span><b>Hold</b> squish</span><span><b>Drag</b> pet</span><span><b>Double-click</b> trick</span></div>
              <div class="stage-row">
              <button class="icon-btn primary" data-tool="demo" title="Run a simulated task through every state">${icons.play}<span>Run a task</span></button>
              <div class="statebar" role="group" aria-label="Agent state">
                ${Object.entries(f.states).map(([k, s]) => `<button data-state="${k}" title="${s.hint}">${s.label}</button>`).join('')}
              </div>
              </div>
            </div>
          </div>
        </div>
        <aside class="inspector" aria-label="Avatar settings"></aside>
      </section>`;
    const el = this.main.querySelector<HTMLElement>('.stage')!;
    const stage = new Stage(el, f, this.configs[id], this.renderer, this.overlay, {
      compact: false,
      insets: [150, 104],
      tags: true,
      slot: 0,
      onSelect: (i) => this.select(i),
    });
    this.stages = [stage];
    this.studio = stage;
    this.inspector = new Inspector(this.main.querySelector<HTMLElement>('.inspector')!, {
      change: (k, v) => this.change(k, v),
      select: (i) => this.select(i),
      randomize: () => this.randomize(),
      reset: () => this.reset(),
      copy: () => this.copy(),
    });
    this.inspector.show(f, stage.avatars, stage.selected);
    this.syncStateBar();

    el.querySelectorAll<HTMLButtonElement>('[data-state]').forEach((b) =>
      b.addEventListener('click', (e) => {
        clearTimeout(this.demoTimer);
        const t = performance.now() / 1000;
        const targets = e.shiftKey ? stage.avatars : [stage.avatars[stage.selected]];
        for (const a of targets) a.setState(b.dataset.state!, t);
        this.inspector?.sync('state', b.dataset.state);
        this.syncStateBar();
        this.save();
      }),
    );
    el.querySelector('[data-tool="demo"]')!.addEventListener('click', () => this.runDemo());
    el.querySelector('[data-tool="shot"]')!.addEventListener('click', () => this.snapshot());
    const soloBtn = el.querySelector<HTMLButtonElement>('[data-tool="solo"]')!;
    soloBtn.addEventListener('click', () => {
      stage.mode = stage.mode === 'solo' ? 'group' : 'solo';
      soloBtn.innerHTML = stage.mode === 'solo' ? `${icons.group}<span>Group</span>` : `${icons.solo}<span>Solo</span>`;
    });
    // keep the stage-ui controls from triggering avatar picks
    el.querySelectorAll('.stage-tools, .stage-bottom').forEach((n) => n.addEventListener('pointerdown', (e) => e.stopPropagation()));
  }

  // ---------------------------------------------------------------- studio actions
  private get current() {
    const s = this.studio;
    return s ? s.avatars[s.selected] : null;
  }

  private select(i: number): void {
    const s = this.studio;
    if (!s || !s.avatars[i]) return;
    s.selected = i;
    this.inspector?.show(s.family, s.avatars, i);
    this.syncStateBar();
  }

  private syncStateBar(): void {
    const a = this.current;
    if (!a) return;
    this.main.querySelectorAll<HTMLButtonElement>('[data-state]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.state === a.state)));
  }

  private snapshotShape(c: Record<string, unknown>) {
    return { shape: c.shape, sides: c.sides, roundness: c.roundness, aspect: c.aspect };
  }

  private change(key: string, value: unknown): void {
    const a = this.current;
    if (!a || !this.studio) return;
    const c = a.config as Record<string, unknown>;
    const t = performance.now() / 1000;
    if (key === 'state') {
      a.setState(String(value), t);
      this.syncStateBar();
    } else if (key === 'shape' && c.shape !== value) {
      c._from = this.snapshotShape(c);
      c.shape = value;
      a.markMorph();
    } else if (key === 'species' && this.studio.family.id === 'muse') {
      a.config = applySpecies(a.config as never, Number(value)) as never;
      this.inspector?.show(this.studio.family, this.studio.avatars, this.studio.selected);
    } else {
      c[key] = value;
    }
    if (key === 'expression' || key === 'eyes' || key === 'eyeTilt') a.refreshFace();
    this.save();
  }

  private randomize(): void {
    const a = this.current;
    const s = this.studio;
    if (!a || !s) return;
    const prev = a.config as Record<string, unknown>;
    const next = s.family.randomize({ ...a.config }, Math.random) as Record<string, unknown>;
    next.name = prev.name;
    next.state = prev.state;
    if (next.shape !== prev.shape) {
      next._from = this.snapshotShape(prev);
      a.config = next as never;
      a.markMorph();
    } else a.config = next as never;
    a.trick(performance.now() / 1000);
    this.inspector?.show(s.family, s.avatars, s.selected);
    this.save();
  }

  private reset(): void {
    const s = this.studio;
    const a = this.current;
    if (!s || !a) return;
    const def = s.family.roster()[s.selected];
    const prev = a.config as Record<string, unknown>;
    if (def.shape !== undefined && def.shape !== prev.shape) {
      (def as Record<string, unknown>)._from = this.snapshotShape(prev);
      a.markMorph();
    }
    a.config = def as never;
    a.setState(def.state, performance.now() / 1000);
    this.inspector?.show(s.family, s.avatars, s.selected);
    this.syncStateBar();
    this.save();
    this.toast(`${def.name} reset to default`);
  }

  private copy(): void {
    const a = this.current;
    if (!a) return;
    const json = JSON.stringify(clean(a.config), null, 2);
    navigator.clipboard?.writeText(json).then(
      () => this.toast('Config copied as JSON'),
      () => this.toast('Clipboard unavailable'),
    );
  }

  private save(): void {
    const s = this.studio;
    if (!s) return;
    const id = s.family.id;
    this.configs[id] = s.avatars.map((a) => a.config);
    store.set(`cfg:${id}`, this.configs[id].map(clean));
  }

  private runDemo(): void {
    const s = this.studio;
    const a = this.current;
    if (!s || !a) return;
    clearTimeout(this.demoTimer);
    const steps = DEMO[s.family.id];
    let i = 0;
    const next = () => {
      const [state, dur] = steps[i++];
      a.setState(state, performance.now() / 1000);
      this.inspector?.sync('state', state);
      this.syncStateBar();
      if (i < steps.length) this.demoTimer = window.setTimeout(next, dur * 1000);
      else this.save();
    };
    next();
    this.toast(`${a.config.name} is running a task…`);
  }

  private snapshot(): void {
    const s = this.studio;
    const view = s?.getView();
    if (!s || !view) return;
    this.renderer.render([view]);
    const gl = this.renderer.canvas;
    const sx = gl.width / window.innerWidth;
    const sy = gl.height / window.innerHeight;
    const r = view.rect;
    const out = document.createElement('canvas');
    out.width = Math.round(r.width * sx);
    out.height = Math.round(r.height * sy);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = s.family.background;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(gl, r.left * sx, r.top * sy, r.width * sx, r.height * sy, 0, 0, out.width, out.height);
    out.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${s.family.id}-${String(this.current?.config.name ?? 'avatar').toLowerCase().replace(/\W+/g, '-')}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
    this.toast('Snapshot saved');
  }

  private onKey(e: KeyboardEvent): void {
    const s = this.studio;
    if (!s || (e.target as HTMLElement).closest('input, select, textarea')) return;
    const t = performance.now() / 1000;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = s.avatars.length;
      this.select((s.selected + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
      e.preventDefault();
    } else if (e.key === ' ' && document.activeElement === s.el) {
      const a = this.current;
      if (a) a.boop(s.family.headLocal(a.config), t);
      e.preventDefault();
    } else if (/^[1-9]$/.test(e.key)) {
      const key = Object.keys(s.family.states)[Number(e.key) - 1];
      if (key && this.current) {
        this.current.setState(key, t);
        this.inspector?.sync('state', key);
        this.syncStateBar();
      }
    }
  }

  // ---------------------------------------------------------------- frame loop
  private frame(ms: number): void {
    const now = ms / 1000;
    let dt = clamp(now - this.last, 0, 0.1);
    this.last = now;
    const t = this.fixedT ?? now;
    if (this.fixedT !== null) dt = 1 / 60;
    const idle = performance.now() / 1000 - this.lastMove;
    const tags: Tag[] = [];
    for (const s of this.stages) {
      s.update(dt, t, this.pointer, idle, this.reducedMotion);
      tags.push(...s.tags(dt));
    }
    const views = this.stages.filter((s) => s.ready && s.isVisible()).map((s) => s.getView()!).filter(Boolean);
    this.renderer.render(views);
    this.overlay.draw(now, tags);
    this.adapt(dt, now);
    this.frames++;
    const w = window as unknown as { __frames: number };
    if (views.length) w.__frames = (w.__frames || 0) + 1;
    if (this.stopAfter !== null && (w.__frames || 0) >= this.stopAfter) return;
    requestAnimationFrame((x) => this.frame(x));
  }

  private adapt(dt: number, now: number): void {
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      const stat = this.root.querySelector('#stat');
      if (stat) stat.textContent = `${this.fps.toFixed(0)} fps · ${this.tier} · ${Math.round(this.renderer.scale * 100)}% res · ${this.renderer.canvas.width}×${this.renderer.canvas.height}`;
    }
    if (this.quality !== 'auto' || this.fixedT !== null) return;
    this.ema = this.ema * 0.9 + dt * 0.1;
    if (now - this.lastAdapt < 0.8) return;
    const order: QualityName[] = ['low', 'medium', 'high'];
    const ti = order.indexOf(this.tier);
    if (this.ema > 1 / 40) {
      if (this.renderer.scale > 0.56) this.renderer.scale = Math.max(0.55, this.renderer.scale * 0.85);
      else if (ti > 0) {
        this.tier = order[ti - 1];
        this.renderer.quality = QUALITY[this.tier];
        this.renderer.scale = 0.8;
      }
      this.lastAdapt = now;
    } else if (this.ema < 1 / 56 && now - this.lastAdapt > 2.5) {
      if (this.renderer.scale < 0.99) this.renderer.scale = Math.min(1, this.renderer.scale * 1.12);
      else if (ti >= 0 && ti < order.length - 1) {
        this.tier = order[ti + 1];
        this.renderer.quality = QUALITY[this.tier];
      }
      this.lastAdapt = now;
    }
  }
}
