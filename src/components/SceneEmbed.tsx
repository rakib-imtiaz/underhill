import { memo, useEffect, useRef } from "react";
import { boot } from "../three/core.js";

type Props = {
  /** a SceneBase subclass — passed through untouched to boot() */
  scene: unknown;
  /** progress to settle on; the static pages call seek(1) */
  seekTo?: number;
  label: string;
  hint?: string;
  fallbackImage: string;
  fallbackAlt: string;
  fallbackMessage: string;
};

/**
 * Standalone (non-scroll-driven) scene host, e.g. the total station on the
 * services page. Same contract as HeroJourney: React owns the host element,
 * the effect owns the scene, unmount disposes it.
 */
function SceneEmbed({
  scene: SceneClass,
  seekTo = 1,
  label,
  hint,
  fallbackImage,
  fallbackAlt,
  fallbackMessage,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /* EMERGENCY GPU FIX, two parts:
       1. LAZY BOOT — the embed sits below the fold; booting it eagerly kept a
          full WebGL context (renderer, PMREM environment, geometry) resident
          for the whole page visit even when the user never scrolled to it.
          Defer boot() until the host is near the viewport. The fallback
          <img> below is designed to cover exactly this wait, and the scene
          still renders its settled first frame the moment it boots.
       2. FRAME-CAP CLAMP — enforce the site-wide budget (idle 24 / active 40
          fps) no matter what the scene subclass requests. start() re-reads
          the caps, so restart only if a loop is already running. */
    type LiveScene = {
      idleFps?: number;
      activeFps?: number;
      raf: number;
      start: () => void;
      seek: (p: number) => void;
      dispose: () => void;
    };
    let scene: LiveScene | null = null;
    const bootScene = () => {
      if (scene) return;
      scene = boot(host, SceneClass) as LiveScene | null;
      if (!scene) return;
      scene.idleFps = Math.min(scene.idleFps ?? 24, 24);
      scene.activeFps = Math.min(scene.activeFps ?? 40, 40);
      if (scene.raf) scene.start();
      scene.seek(seekTo);
    };

    if (!("IntersectionObserver" in window)) {
      bootScene();
      return () => scene?.dispose?.();
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        bootScene();
      },
      /* boot while still offscreen so the settled frame is ready on arrival */
      { rootMargin: "600px" }
    );
    io.observe(host);
    return () => {
      io.disconnect();
      scene?.dispose?.();
    };
  }, [SceneClass, seekTo]);

  return (
    <div className="scene-embed" ref={hostRef}>
      <div className="webgl-fallback">
        <img src={fallbackImage} alt={fallbackAlt} />
        <div className="fb-msg">{fallbackMessage}</div>
      </div>
      <div className="scene-label">{label}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export default memo(SceneEmbed);
