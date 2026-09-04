import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { OFFICES, officeBySlug } from "../data/offices";
import "../styles/contact.css";

type Props = { slug: string };

/** Short display label for the cross-navigation rail, e.g. "Vancouver". */
const shortName = (name: string) => name.split("—")[0].trim();

/**
 * The four location/contact pages share one shell — the static site's are
 * structurally identical and differ only in copy, so the content lives in
 * data/offices.tsx and this renders it.
 */
export default function ContactPage({ slug }: Props) {
  const office = officeBySlug(slug);
  useDocumentMeta(
    office?.metaTitle ?? "Contact | Underhill Geomatics",
    office?.metaDescription
  );

  if (!office) return null;
  const { card } = office;
  const others = OFFICES.filter((o) => o.slug !== slug);

  return (
    <main id="main">
      <PageHero
        image={office.heroImage}
        title={office.title}
        lead={office.lead}
        crumb={{ label: "Contact", href: "/vancouver-land-surveyors/" }}
      />

      <section className="section">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Contact</span>
            <h2>{office.introHeading}</h2>
            <p>{office.introBody}</p>
            <a className="btn" href="#lets-talk" style={{ marginTop: 14 }}>
              Let's Talk
            </a>
          </div>
          <div className="contact-card reveal" style={{ transitionDelay: "120ms" }}>
            <span className="kicker">Office</span>
            <h3>{card.name}</h3>
            <dl>
              <dt>Address</dt>
              <dd>{card.address}</dd>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${card.phone.replace(/[^0-9+]/g, "")}`}>{card.phone}</a>
              </dd>
              {card.fax ? (
                <>
                  <dt>Fax</dt>
                  <dd>{card.fax}</dd>
                </>
              ) : null}
              <dt>Email</dt>
              <dd>Use the Let's Talk form below</dd>
            </dl>
            <a className="btn small" href="#lets-talk">
              Request Consultation
            </a>
          </div>
        </div>
      </section>

      {office.sections.map((s, i) => (
        <section className={i % 2 === 0 ? "section grey" : "section"} key={s.heading}>
          <div className="container reveal">
            <span className="kicker">Local Expertise</span>
            <h2>{s.heading}</h2>
            {s.body}
          </div>
        </section>
      ))}

      {office.people && office.people.length ? (
        <section className="section">
          <div className="container">
            <div className="reveal">
              <span className="kicker">Leadership</span>
              <h2>{office.peopleHeading}</h2>
            </div>
            <div className="contact-people">
              {office.people.map((p, i) => (
                <div
                  className="person reveal"
                  key={p.name}
                  style={{ transitionDelay: `${i * 90}ms` }}
                >
                  <h3>{p.name}</h3>
                  {p.role ? <div className="role">{p.role}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section grey">
        <div className="container reveal">
          <span className="kicker">Track Record</span>
          <h2>{office.featuredHeading}</h2>
          <ol className="contact-featured">
            {office.featured.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Locations</span>
            <h2>Our Other Offices</h2>
          </div>
          <nav className="contact-offices" aria-label="Other Underhill offices">
            {others.map((o, i) => (
              <SmartLink
                to={`/${o.slug}/`}
                key={o.slug}
                className="reveal"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <span>
                  {shortName(o.card.name)}
                  <span className="small">{o.card.address}</span>
                </span>
              </SmartLink>
            ))}
          </nav>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
