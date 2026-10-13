// Fly Lab: count the bytes of cross-origin downloads (classic script, load it first).
// Resource Timing reports a size of 0 for cross-origin files unless the server sends
// Timing-Allow-Origin (OpenFreeMap and Google do not), so the lab also wraps fetch() and
// XMLHttpRequest and notes each response's Content-Length (a CORS-safelisted header: the compressed
// bytes on the wire), or the body's length when that header is missing. The download-size test uses
// these numbers where Resource Timing has none.
(function () {
  const net = window.__net = new Map();
  const note = (url, bytes, how) => { if (!url || bytes <= 0) return; const u = String(url); if (u.startsWith('blob:') || u.startsWith('data:')) return; const o = net.get(u); net.set(u, { bytes: Math.max(bytes, o?.bytes || 0), how }); };
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const res = await realFetch(input, init);
    try {
      const url = res.url || (typeof input === 'string' ? input : input.url);
      if (new URL(url, location.href).origin !== location.origin) {
        const cl = parseInt(res.headers.get('content-length') || '0', 10);
        if (cl > 0) note(url, cl, 'content-length');
        else res.clone().arrayBuffer().then((b) => note(url, b.byteLength, 'body')).catch(() => {});
      }
    } catch { /* never break the request */ }
    return res;
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__u = url;
    this.addEventListener('loadend', () => {
      try {
        const u = this.responseURL || this.__u;
        if (!u || new URL(u, location.href).origin === location.origin) return;
        const cl = parseInt(this.getResponseHeader('content-length') || '0', 10);
        let b = cl;
        if (!b) { const r = this.response; b = r?.byteLength ?? r?.size ?? (typeof r === 'string' ? r.length : 0); }
        note(u, b, cl ? 'content-length' : 'body');
      } catch { /* ignore */ }
    });
    return open.call(this, method, url, ...rest);
  };
})();
