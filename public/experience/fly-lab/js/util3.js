// Fly Lab: small WebGL helpers shared by the scenarios.

/** Mean luminance (0..1) of what was just drawn to the default framebuffer (call right after rendering). */
export function readLuma(gl, stride = 7) {
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let s = 0, n = 0;
  for (let i = 0; i < buf.length; i += 4 * stride) { s += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]; n++; }
  return s / n / 255;
}

/** Force the GPU to finish (a 1-pixel read-back), so frame timings include the GPU work. */
export function gpuSync(gl) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
