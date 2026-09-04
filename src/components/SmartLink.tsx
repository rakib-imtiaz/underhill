import { Link } from "react-router-dom";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  /** URLs from the source site that have no route in this port */
  unported?: boolean;
  children: ReactNode;
};

/**
 * One link component for the whole site.
 *  · in-app routes  -> <Link> (client-side navigation)
 *  · hash anchors   -> plain <a> so `#lets-talk` keeps native smooth scroll
 *  · unported pages -> plain <a>, which still resolves against the real site
 *                      structure and never produces a blank client route
 */
export default function SmartLink({ to, unported, children, ...rest }: Props) {
  const isHash = to.startsWith("#");
  const isAbsolute = /^[a-z]+:/i.test(to);
  if (isHash || isAbsolute || unported) {
    return (
      <a href={to} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}
