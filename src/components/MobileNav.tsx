import { useEffect, useState } from "react";
import SmartLink from "./SmartLink";
import { PRIMARY_NAV, CAREERS_HREF, IN_3D } from "../data/nav";

type Props = {
  open: boolean;
  onClose: () => void;
  /** "landing" (Home): the call to action is "Let's talk" (the Let's Talk panel) instead of careers */
  variant?: "default" | "landing";
};

/** Replaces the mobile-menu half of the static site's js/main.js */
export default function MobileNav({ open, onClose, variant = "default" }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  /* body scroll lock, exactly as the static site did it */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* Escape closes the menu */
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`mnav${open ? " open" : ""}`} aria-hidden={!open}>
      <ul>
        {PRIMARY_NAV.map((group) => {
          const isOpen = !!expanded[group.label];
          return (
            <li key={group.label} className={isOpen ? "expanded" : undefined}>
              {group.children ? (
                <button
                  type="button"
                  className="expander"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.label} menu`}
                  onClick={() =>
                    setExpanded((s) => ({ ...s, [group.label]: !s[group.label] }))
                  }
                >
                  {isOpen ? "−" : "+"}
                </button>
              ) : null}
              <SmartLink to={group.href} unported={group.unported} onClick={onClose}>
                {group.label}
              </SmartLink>
              {group.children ? (
                <ul className="sub">
                  {/* the 3D pages get their own tagged rows below, so skip them in the sub-list */}
                  {group.children.filter((child) => !IN_3D.some((l) => l.href === child.href)).map((child) => (
                    <li key={child.href + child.label}>
                      <SmartLink to={child.href} unported={child.unported} onClick={onClose}>
                        {child.label}
                      </SmartLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
        {IN_3D.map((l) => (
          <li key={l.href} className="is-3d">
            <a href={l.href} onClick={onClose}>
              {l.label}
              <span className="mnav-tag">{l.tag}</span>
            </a>
          </li>
        ))}
      </ul>
      {variant === "landing" ? (
        <a className="btn" href="#lets-talk" onClick={onClose}>
          Let's talk <span aria-hidden="true">→</span>
        </a>
      ) : (
        <SmartLink className="btn" to={CAREERS_HREF} onClick={onClose}>
          Join The Team
        </SmartLink>
      )}
      <p className="mnav-foot">
        Est. <b>1913</b> — Vancouver · Kamloops · Vancouver Island · Whitehorse
      </p>
    </div>
  );
}
