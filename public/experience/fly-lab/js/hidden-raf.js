// Fly Lab: a requestAnimationFrame stand-in for hidden tabs (classic script, load it first).
// A hidden browser tab never runs rAF callbacks and throttles timers to once a second, so libraries
// that schedule their own work with rAF (MapLibre loads its style that way, Cesium its render loop)
// would stall when the lab is driven by automation in a background tab. While the document is hidden,
// rAF callbacks are run from a worker clock at about 30 Hz instead; in a visible tab the real rAF is
// used untouched. Pages note in their test panel when numbers were measured this way.
(function () {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  let q = new Map(), seq = 1e9, worker = null;
  function tick() {
    if (!document.hidden || !q.size) return;
    window.__hiddenRafUsed = (window.__hiddenRafUsed || 0) + 1;
    const run = q; q = new Map();
    const t = performance.now();
    for (const fn of run.values()) { try { fn(t); } catch (e) { setTimeout(() => { throw e; }); } }
  }
  function ensure() {
    if (worker) return;
    const src = 'let h=setInterval(()=>postMessage(0),33);';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = tick;
  }
  window.requestAnimationFrame = function (fn) {
    if (!document.hidden) return realRaf(fn);
    ensure();
    const id = ++seq; q.set(id, fn); return id;
  };
  // back to visible: hand anything still queued to the real rAF
  document.addEventListener('visibilitychange', () => { if (!document.hidden && q.size) { const run = q; q = new Map(); for (const fn of run.values()) realRaf(fn); } });
  window.cancelAnimationFrame = function (id) { if (id > 1e9) q.delete(id); else realCancel(id); };
})();
