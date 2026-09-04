import { useRef, type FormEvent } from "react";
import { Link } from "react-router-dom";
import SmartLink from "./SmartLink";
import { FOOTER_COLUMNS } from "../data/nav";

type Props = {
  /** raises the success toast — client-side only demo, same as the source */
  onSent: () => void;
};

/** Contour-line divider — decorative survey motif above the footer. */
function Contours() {
  return (
    <div className="foot-contours" aria-hidden="true">
      <svg viewBox="0 0 1440 70" preserveAspectRatio="none" fill="none">
        <path
          d="M0 62 C 180 62 220 34 420 34 C 620 34 660 58 860 58 C 1060 58 1120 22 1320 22 C 1380 22 1420 26 1440 28"
          stroke="currentColor" strokeWidth="1.4" opacity="0.35"
        />
        <path
          d="M0 52 C 200 52 260 22 460 22 C 660 22 720 48 920 48 C 1120 48 1180 12 1380 12 C 1410 12 1430 14 1440 16"
          stroke="currentColor" strokeWidth="1.2" opacity="0.25"
        />
        <path
          d="M0 42 C 220 42 300 10 500 10 C 700 10 780 38 980 38 C 1180 38 1240 4 1440 4"
          stroke="currentColor" strokeWidth="1" opacity="0.16"
        />
      </svg>
    </div>
  );
}

export default function Footer({ onSent }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    onSent();
    formRef.current?.reset();
  };

  return (
    <>
      <Contours />
      <footer className="site-foot" id="lets-talk">
        <div className="container">
          <div className="top">
            <div>
              <Link className="flogo" to="/">
                <img
                  src="/assets/uploads/2024/12/REV-UG-Horozontal-RGB.png"
                  alt="Underhill Geomatics"
                />
              </Link>
              <h2>
                Advanced Geospatial Solutions <em>Since 1913.</em>
              </h2>
              <p>
                Full-service geospatial solutions backed by more than a century of
                experience, driven by innovation, and powered by modern technology.
              </p>
              <p className="foot-line">
                Vancouver · Kamloops · Vancouver Island · <b>Whitehorse</b>
              </p>
            </div>

            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <h4>{col.title}</h4>
                <ul>
                  {col.links.map((l) => (
                    <li key={col.title + l.label}>
                      <SmartLink to={l.href} unported={l.unported}>
                        {l.label}
                      </SmartLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <h4>Let's Talk</h4>
              <form className="talk-form" ref={formRef} noValidate onSubmit={onSubmit}>
                <div className="row">
                  <input type="text" name="name" placeholder="Name *" required />
                  <input type="tel" name="phone" placeholder="Phone" />
                </div>
                <input type="email" name="email" placeholder="Email *" required />
                <select name="branch" aria-label="Branch" defaultValue="— Select a branch —" required>
                  <option>— Select a branch —</option>
                  <option>General</option>
                  <option>Kamloops</option>
                  <option>Whitehorse</option>
                  <option>Vancouver</option>
                  <option>Vancouver Island</option>
                </select>
                <textarea name="message" placeholder="Message *" required />
                <button className="btn" type="submit">
                  Submit
                </button>
              </form>
            </div>
          </div>

          <div className="bottom">
            <span>© 2026 Underhill Geomatics Ltd. All rights reserved.</span>
            <span className="dot" aria-hidden="true">·</span>
            <a href="/privacy-policy/">Privacy Policy</a>
            <span className="dot" aria-hidden="true">·</span>
            <span>49.2827° N, 123.1207° W — NAD83</span>
          </div>
        </div>
      </footer>
    </>
  );
}
