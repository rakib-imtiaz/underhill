import type { CSSProperties, ImgHTMLAttributes, ReactNode } from "react";

/* Small shared pieces of the Home landing. */

export const PHOTOS = "/landing/photos/";

/** a stagger delay for the CSS choreography (read as --d) */
export const d = (s: number) => ({ ["--d" as string]: `${s}s` }) as CSSProperties;

export const Arrow = () => (
  <svg className="ld-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 8h11M9 4l4 4-4 4" />
  </svg>
);

export const Go = () => (
  <span className="ld-go" aria-hidden="true">
    <svg viewBox="0 0 16 16">
      <path d="M6.5 4.5 10 8l-3.5 3.5" />
    </svg>
  </span>
);

/** a headline split into lines that rise in turn, each masked (CSS: .ld-lines .ld-line > span) */
export function Line({ children, delay }: { children: ReactNode; delay?: number }) {
  return (
    <span className="ld-line">
      <span style={delay ? d(delay) : undefined}>{children}</span>
    </span>
  );
}

/**
 * A photo in AVIF with a WebP fallback. `set` lists [file stem, width] pairs (smallest first); with one
 * entry and no width the source is a plain src.
 */
export function Pic({
  set,
  sizes,
  width,
  height,
  alt = "",
  drift,
  priority,
  className,
  ...img
}: {
  set: [string, number?][];
  sizes?: string;
  width: number;
  height: number;
  alt?: string;
  drift?: number;
  priority?: boolean;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet">) {
  const srcset = (ext: string) => set.map(([n, w]) => (w ? `${PHOTOS}${n}.${ext} ${w}w` : `${PHOTOS}${n}.${ext}`)).join(", ");
  const largest = set[set.length - 1][0];
  return (
    <picture>
      <source type="image/avif" srcSet={srcset("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcset("webp")} sizes={sizes} />
      <img
        className={className}
        src={`${PHOTOS}${largest}.webp`}
        width={width}
        height={height}
        alt={alt}
        data-drift={drift}
        {...(priority ? { fetchpriority: "high" } : { loading: "lazy" as const, decoding: "async" as const })}
        {...img}
      />
    </picture>
  );
}

/* The faint topographic contour drawing behind the white sections (one drawing, its colour from the section). */
const TOPO_PATHS = [
  "M-20 60C60 20 120 90 200 70s130-80 220-40 120 60 200 30",
  "M-20 90C70 50 130 120 210 100s140-80 230-36 120 64 200 30",
  "M-20 122c90-40 150 30 230 8s150-76 240-30 110 64 170 30",
  "M-20 156c100-36 160 34 240 12s150-70 230-26 120 60 170 26",
  "M-20 192c110-30 170 36 250 14s140-60 220-20 120 56 170 22",
  "M-20 230c120-26 180 40 260 16s130-50 210-14 120 50 170 18",
  "M-20 270c120-20 190 42 270 18s120-40 200-8 120 44 170 12",
  "M-20 312c130-14 200 44 280 20s110-30 190-2 120 40 170 8",
  "M-20 356c140-10 210 44 290 22s100-22 180 4 120 34 170 4",
  "M250 150c30-30 80-24 90 6s-30 50-60 40-50-20-30-46z",
  "M268 152c18-16 48-12 54 6s-18 30-36 24-30-12-18-30z",
];
export function Topo({ className }: { className: string }) {
  return (
    <svg className={`ld-topo ${className}`} viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true" fill="none" stroke="currentColor">
      <g fill="none" stroke="currentColor" strokeWidth="1">
        {TOPO_PATHS.map((p) => (
          <path key={p} vectorEffect="non-scaling-stroke" d={p} />
        ))}
      </g>
    </svg>
  );
}
