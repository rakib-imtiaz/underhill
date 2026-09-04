import type { ReactNode } from "react";
import SmartLink from "./SmartLink";

export type Crumb = { label: string; href: string; unported?: boolean };

type Props = {
  image: string;
  title: string;
  /** lime kicker line above the h1 (takes precedence over `crumb` context) */
  eyebrow?: string;
  /** the lime sub-heading the static pages carry under the h1 */
  subtitle?: string;
  lead?: string;
  /** single parent link (legacy form — prefer `crumbs`) */
  crumb?: Crumb;
  /** full breadcrumb trail; the page title is appended as the final item */
  crumbs?: Crumb[];
  /** coordinate readout for the top-left corner; falls back to Vancouver HQ */
  coords?: string;
  children?: ReactNode;
};

/** The shared interior-page hero — eyebrow/crumbs → h1 → subtitle → lead. */
export default function PageHero({
  image,
  title,
  eyebrow,
  subtitle,
  lead,
  crumb,
  crumbs,
  coords,
  children,
}: Props) {
  const trail: Crumb[] = crumbs ?? (crumb ? [crumb] : []);
  return (
    <section className="hero">
      <div className="hero-photo">
        <img src={image} alt="" loading="eager" />
      </div>
      <div className="blueprint-grid" aria-hidden="true" />
      <div className="coords tl" aria-hidden="true">
        {coords ?? "49.2827° N · 123.1207° W"}
        <br />
        GEODETIC DATUM NAD83
      </div>
      <div className="container">
        {trail.length ? (
          <nav className="crumbs" aria-label="Breadcrumb">
            {trail.map((c, i) => (
              <span key={c.href + c.label}>
                {i > 0 ? (
                  <span className="sep" aria-hidden="true">
                    /
                  </span>
                ) : null}
                <SmartLink to={c.href} unported={c.unported}>
                  {c.label}
                </SmartLink>
              </span>
            ))}
            <span className="sep" aria-hidden="true">
              /
            </span>
            <span className="here" aria-current="page">
              {title}
            </span>
          </nav>
        ) : null}
        {eyebrow ? <span className="hero-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {subtitle ? <h2 className="hero-sub">{subtitle}</h2> : null}
        {lead ? <p className="lead on-dark">{lead}</p> : null}
        {children}
      </div>
      <div className="hero-ticks" aria-hidden="true" />
    </section>
  );
}
