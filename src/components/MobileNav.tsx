import { useEffect, useState } from "react";
import SmartLink from "./SmartLink";
import { PRIMARY_NAV, CAREERS_HREF } from "../data/nav";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Replaces the mobile-menu half of the static site's js/main.js */
export default function MobileNav({ open, onClose }: Props) {
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
                  {group.children.map((child) => (
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
      </ul>
      <SmartLink className="btn" to={CAREERS_HREF} onClick={onClose}>
        Join The Team
      </SmartLink>
      <p className="mnav-foot">
        Est. <b>1913</b> — Vancouver · Kamloops · Vancouver Island · Whitehorse
      </p>
    </div>
  );
}
