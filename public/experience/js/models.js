// Lazy model manager: builds a model the first time a chapter needs it, keeps a small cache so the
// A/B switch is instant, and disposes the least recently used hidden build when over budget.
import { StagedExplode } from './explode.js';
import { resolveAnchor } from './labels.js';

const REGISTRY = {
  // one build per instrument (threejs-object-sculptor for the drone and the GNSS base, img2threejs
  // for the total station); only these are ever fetched
  drone: { B: () => import('./adapters/droneB.js') },
  gnss: { B: () => import('./adapters/gnssB.js') },
  ts: { A: () => import('./adapters/totalStation.js') },
};

export const BUILDS = {
  drone: ['B'],
  gnss: ['B'],
  ts: ['A'],
};

export class Models {
  constructor(stage, { mobile, q, defaults, budget }) {
    this.stage = stage;
    this.mobile = mobile;
    this.q = q || null;          // quality tier (quality.js), handed to each adapter's create()
    this.selected = { ...defaults };
    this.cache = new Map();      // `${object}:${build}` → entry
    this.pending = new Map();    // same key → Promise<entry>
    this.budget = budget;        // max resident instances
    this.onChange = () => {};
    this.clock = 0;
  }

  key(object, build) { return `${object}:${build}`; }

  /** Build (once) and return the entry for object/build. */
  load(object, build) {
    const k = this.key(object, build);
    if (this.cache.has(k)) return Promise.resolve(this.cache.get(k));
    if (this.pending.has(k)) return this.pending.get(k);
    const p = (async () => {
      const mod = await REGISTRY[object][build]();
      const t0 = performance.now();
      const inst = await mod.default.create({ mobile: this.mobile, q: this.q });
      inst.root.updateMatrixWorld(true);
      const staged = new StagedExplode(inst);
      // label anchors (resolved at rest) + arrival = the moment the labelled part settles
      let labels = inst.labels.map((spec) => {
        const a = resolveAnchor(inst.root, spec);
        if (!a) { console.warn(`[models] ${k}: label "${spec.id}" has no node "${spec.node}"`); return null; }
        return { ...spec, obj: a.obj, node: a.node, local: a.local, arrive: staged.settleTime(a.obj) };
      }).filter(Boolean);
      // parts that do not move in this build's explode arrive after the moving ones, in list order
      const still = labels.filter((l) => l.arrive === null);
      still.forEach((l, i) => { l.arrive = 0.55 + (0.4 * (i + 1)) / (still.length + 1); });
      labels = labels.sort((a, b) => a.arrive - b.arrive);
      const entry = { key: k, object, build, inst, staged, labels, buildMs: Math.round(performance.now() - t0), used: ++this.clock, sig: '' };
      this.cache.set(k, entry);
      this.pending.delete(k);
      this.evict(k);                // never the build that was just made (it is about to be attached)
      return entry;
    })();
    this.pending.set(k, p);
    return p;
  }

  /** Make sure the selected build of `object` is attached to its station. */
  async ensure(object) {
    const build = this.selected[object];
    const entry = await this.load(object, build);
    if (this.selected[object] !== build) return this.active(object);   // selection changed meanwhile
    const st = this.stage.stations[object];
    if (st.model !== entry.inst) {
      this.stage.setModel(object, entry.inst);
      entry.sig = '';
      this.onChange(object, entry);
    }
    entry.used = ++this.clock;
    return entry;
  }

  async select(object, build) {
    if (!BUILDS[object]?.includes(build)) return null;
    this.selected[object] = build;
    return this.ensure(object);
  }

  active(object) {
    const st = this.stage.stations[object];
    for (const e of this.cache.values()) if (e.inst === st.model) return e;
    return null;
  }

  isLoading(object) {
    return this.pending.has(this.key(object, this.selected[object]));
  }

  evict(keep = null) {
    const attached = new Set(Object.values(this.stage.stations).map((s) => s.model));
    while (this.cache.size > this.budget) {
      const victims = [...this.cache.values()].filter((e) => !attached.has(e.inst) && e.key !== keep).sort((a, b) => a.used - b.used);
      if (!victims.length) break;
      const v = victims[0];
      this.cache.delete(v.key);
      try { v.inst.dispose(); } catch (e) { console.warn('[models] dispose failed', e); }
    }
  }
}
