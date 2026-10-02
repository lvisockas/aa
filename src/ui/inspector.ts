import type { Avatar } from '../avatar/avatar';
import type { BaseConfig, Control, FamilyDef } from '../families/types';
import { icons, shapeIcon } from './icons';

export interface InspectorHandlers {
  change(key: string, value: unknown): void;
  select(index: number): void;
  randomize(): void;
  reset(): void;
  copy(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Settings panel generated from a family's schema for the selected avatar. */
export class Inspector {
  private family: FamilyDef<any> | null = null;
  private avatar: Avatar<any> | null = null;
  private open = new Set<string>(['identity', 'shape', 'body', 'face', 'color']);

  constructor(
    readonly el: HTMLElement,
    private h: InspectorHandlers,
  ) {}

  show(family: FamilyDef<any>, avatars: Avatar<any>[], selected: number): void {
    if (this.family !== family) this.open = new Set(family.schema.slice(0, 3).map((s) => s.id));
    this.family = family;
    this.avatar = avatars[selected];
    const c = this.avatar.config as BaseConfig;
    const color = (cfg: Record<string, unknown>) => (cfg.color ?? cfg.furColor ?? '#ccc') as string;
    this.el.innerHTML = `
      <div class="insp-head">
        <div class="insp-title">
          <h3>${esc(c.name || 'Unnamed')}</h3>
          <div class="acts">
            <button class="icon-btn" data-act="random" title="Randomize" aria-label="Randomize">${icons.dice}</button>
            <button class="icon-btn" data-act="reset" title="Reset to default" aria-label="Reset">${icons.reset}</button>
            <button class="icon-btn" data-act="copy" title="Copy config as JSON" aria-label="Copy config">${icons.copy}</button>
          </div>
        </div>
        <div class="roster" role="tablist" aria-label="Roster">
          ${avatars
            .map(
              (a, i) =>
                `<button role="tab" aria-pressed="${i === selected}" data-sel="${i}"><i style="background:${color(a.config)}"></i>${esc(a.config.name || '—')}</button>`,
            )
            .join('')}
        </div>
      </div>
      ${family.schema
        .map(
          (sec) => `
        <details class="sec" data-sec="${sec.id}" ${this.open.has(sec.id) ? 'open' : ''}>
          <summary>${esc(sec.title)} ${icons.chevron}</summary>
          <div class="sec-body">${sec.controls.map((ctl) => this.control(ctl, c)).join('')}</div>
        </details>`,
        )
        .join('')}
      <div class="insp-foot">Tip: drag across an avatar to pet it, hold to squish, double-click for a trick. Changes are saved in this browser.</div>`;
    this.wire();
    this.updateVisibility();
  }

  private control(ctl: Control, c: Record<string, unknown>): string {
    const v = c[ctl.key];
    const id = `ctl-${ctl.key}`;
    const wrap = (inner: string, label = true) =>
      `<div class="ctl" data-key="${ctl.key}">${label ? `<div class="lbl"><span>${esc(ctl.label)}</span>${ctl.type === 'slider' ? `<span class="val">${this.fmt(ctl, v as number)}</span>` : ''}</div>` : ''}${inner}</div>`;
    switch (ctl.type) {
      case 'text':
        return wrap(`<input type="text" id="${id}" value="${esc(String(v ?? ''))}" maxlength="24" aria-label="${esc(ctl.label)}">`);
      case 'select':
        return wrap(
          `<select id="${id}" aria-label="${esc(ctl.label)}">${ctl.options
            .map((o) => `<option value="${o.value}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`)
            .join('')}</select>`,
        );
      case 'chips': {
        const opts = ctl.key === 'state' && this.family
          ? Object.entries(this.family.states).map(([k, s]) => ({ value: k, label: s.label }))
          : ctl.options;
        return wrap(
          `<div class="chips" role="group" aria-label="${esc(ctl.label)}">${opts
            .map((o) => `<button aria-pressed="${String(o.value) === String(v)}" data-v="${o.value}">${esc(o.label)}</button>`)
            .join('')}</div>`,
        );
      }
      case 'icons':
        return wrap(
          `<div class="icons" role="group" aria-label="${esc(ctl.label)}">${ctl.options
            .map((o) => `<button aria-pressed="${String(o.value) === String(v)}" data-v="${o.value}" title="${esc(o.label)}" aria-label="${esc(o.label)}">${shapeIcon(o.icon ?? '')}</button>`)
            .join('')}</div>`,
        );
      case 'swatches':
        return wrap(
          `<div class="swatches" role="group" aria-label="${esc(ctl.label)}">${ctl.colors
            .map((col) => `<button aria-pressed="${col.toLowerCase() === String(v).toLowerCase()}" data-v="${col}" style="background:${col}" aria-label="${col}"></button>`)
            .join('')}${ctl.custom ? `<label class="custom" title="Custom colour"><input type="color" value="${esc(String(v))}" aria-label="Custom colour"></label>` : ''}</div>`,
        );
      case 'slider': {
        const p = ((Number(v) - ctl.min) / (ctl.max - ctl.min)) * 100;
        return wrap(`<input type="range" id="${id}" min="${ctl.min}" max="${ctl.max}" step="${ctl.step}" value="${v}" style="--p:${p}%" aria-label="${esc(ctl.label)}">`);
      }
      case 'toggle':
        return wrap(`<label class="switch"><span>${esc(ctl.label)}</span><input type="checkbox" ${v ? 'checked' : ''}></label>`, false);
    }
  }

  private fmt(ctl: Control, v: number): string {
    if (ctl.type !== 'slider') return '';
    const decimals = ctl.step >= 1 ? 0 : ctl.step >= 0.01 ? 2 : 3;
    return `${Number(v).toFixed(decimals)}${ctl.unit ?? ''}`;
  }

  private findControl(key: string): Control | undefined {
    for (const s of this.family?.schema ?? []) for (const c of s.controls) if (c.key === key) return c;
    return undefined;
  }

  private wire(): void {
    const el = this.el;
    el.querySelectorAll<HTMLDetailsElement>('details.sec').forEach((d) =>
      d.addEventListener('toggle', () => {
        if (d.open) this.open.add(d.dataset.sec!);
        else this.open.delete(d.dataset.sec!);
      }),
    );
    el.querySelector('[data-act="random"]')?.addEventListener('click', () => this.h.randomize());
    el.querySelector('[data-act="reset"]')?.addEventListener('click', () => this.h.reset());
    el.querySelector('[data-act="copy"]')?.addEventListener('click', () => this.h.copy());
    el.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach((b) => b.addEventListener('click', () => this.h.select(Number(b.dataset.sel))));

    el.querySelectorAll<HTMLElement>('.ctl').forEach((wrap) => {
      const key = wrap.dataset.key!;
      const ctl = this.findControl(key);
      if (!ctl) return;
      const numeric = (raw: string) => (typeof this.avatar?.config[key] === 'number' ? Number(raw) : raw);
      if (ctl.type === 'text') {
        const input = wrap.querySelector('input')!;
        input.addEventListener('input', () => {
          this.h.change(key, input.value);
          const title = el.querySelector('.insp-title h3');
          if (title) title.textContent = input.value || 'Unnamed';
          const chip = el.querySelector<HTMLElement>('.roster [aria-pressed="true"]');
          if (chip) chip.lastChild!.textContent = input.value || '—';
        });
      } else if (ctl.type === 'select') {
        const sel = wrap.querySelector('select')!;
        sel.addEventListener('change', () => this.h.change(key, numeric(sel.value)));
      } else if (ctl.type === 'chips' || ctl.type === 'icons') {
        wrap.querySelectorAll<HTMLButtonElement>('button[data-v]').forEach((b) =>
          b.addEventListener('click', () => {
            wrap.querySelectorAll('button[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            this.h.change(key, numeric(b.dataset.v!));
            this.updateVisibility();
          }),
        );
      } else if (ctl.type === 'swatches') {
        const pick = (col: string) => {
          wrap.querySelectorAll('button[data-v]').forEach((x) => x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.v!.toLowerCase() === col.toLowerCase())));
          this.h.change(key, col);
          if (key === 'color' || key === 'furColor') {
            const dot = el.querySelector<HTMLElement>('.roster [aria-pressed="true"] i');
            if (dot) dot.style.background = col;
          }
        };
        wrap.querySelectorAll<HTMLButtonElement>('button[data-v]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.v!)));
        wrap.querySelector<HTMLInputElement>('input[type="color"]')?.addEventListener('input', (e) => pick((e.target as HTMLInputElement).value));
      } else if (ctl.type === 'slider') {
        const input = wrap.querySelector<HTMLInputElement>('input')!;
        const val = wrap.querySelector('.val')!;
        input.addEventListener('input', () => {
          const n = Number(input.value);
          val.textContent = this.fmt(ctl, n);
          input.style.setProperty('--p', `${((n - ctl.min) / (ctl.max - ctl.min)) * 100}%`);
          this.h.change(key, n);
          this.updateVisibility();
        });
      } else if (ctl.type === 'toggle') {
        const input = wrap.querySelector<HTMLInputElement>('input')!;
        input.addEventListener('change', () => {
          this.h.change(key, input.checked);
          this.updateVisibility();
        });
      }
    });
  }

  /** Reflect an externally changed value (e.g. state switched from the stage bar). */
  sync(key: string, value: unknown): void {
    const wrap = this.el.querySelector<HTMLElement>(`.ctl[data-key="${key}"]`);
    if (!wrap) return;
    wrap.querySelectorAll<HTMLElement>('button[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
    const sel = wrap.querySelector('select');
    if (sel) sel.value = String(value);
  }

  private updateVisibility(): void {
    if (!this.family || !this.avatar) return;
    const c = this.avatar.config;
    for (const s of this.family.schema)
      for (const ctl of s.controls) {
        const el = this.el.querySelector<HTMLElement>(`.ctl[data-key="${ctl.key}"]`);
        if (el) el.style.display = !ctl.when || ctl.when(c) ? '' : 'none';
      }
  }
}
