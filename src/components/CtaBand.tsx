/** The site-wide closing CTA — the `Get It Right the First Time` band. */
export default function CtaBand() {
  return (
    <section className="cta-band">
      <span className="crosshair cta-cross a" aria-hidden="true" />
      <span className="crosshair cta-cross b" aria-hidden="true" />
      <span className="cta-coords" aria-hidden="true">
        GRID REF · 49.2827° N 123.1207° W
      </span>
      <div className="container">
        <div>
          <h2>Get It Right the First Time with Underhill</h2>
          <p>
            You need accurate data and a partner who understands the stakes. Let
            Underhill help you get it right the first time.
          </p>
        </div>
        <a className="btn" href="#lets-talk">
          Request a Consultation
        </a>
      </div>
    </section>
  );
}
