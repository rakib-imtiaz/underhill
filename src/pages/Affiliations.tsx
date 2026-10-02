import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Affiliations (`/about-underhill-geomatics/affiliations/`).
   Every organisation name, description, logo and website link is lifted from
   site_capture (text + captured markup), in source order. The source page
   ships the Health and Safety page's <title>/description by mistake, so this
   page uses its own title and its hero sentence as the description. ICBA has
   no website link on the source page, so its card renders without one.
   Shared primitives plus a page-scoped layer namespaced `.pg-aff`.
--------------------------------------------------------------------------- */
const CSS = `
.pg-aff .org-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 24px; margin-top: 46px;
}
@media (max-width: 420px) { .pg-aff .org-grid { grid-template-columns: 1fr; } }
.pg-aff .org-grid > .reveal { display: flex; }
.pg-aff .org {
  position: relative; flex: 1; display: flex; flex-direction: column;
  background: var(--white); box-shadow: var(--shadow-sm); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-aff .org::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 2;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left; transition: transform 0.45s var(--ease);
}
.pg-aff .org:hover { transform: translateY(-5px); box-shadow: var(--shadow-md); }
.pg-aff .org:hover::before { transform: scaleX(1); }
.pg-aff .org .mark {
  display: grid; place-items: center; height: 150px; padding: 22px 30px;
  background: var(--white); border-bottom: 1px solid var(--grey-100);
}
.pg-aff .org .mark img { max-height: 104px; max-width: 100%; width: auto; object-fit: contain; }
.pg-aff .org .body { display: flex; flex-direction: column; flex: 1; padding: 26px 28px 26px; }
.pg-aff .org .abbr {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--blue);
  margin-bottom: 8px; display: block;
}
.pg-aff .org h3 { margin: 0 0 12px; font-size: 19px; line-height: 1.25; }
.pg-aff .org p { font-size: 14.5px; color: var(--grey-600); margin-bottom: 12px; }
.pg-aff .org .text { flex: 1; }
.pg-aff .org .visit {
  margin-top: 8px; align-self: flex-start;
  font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  display: inline-flex; align-items: center; gap: 9px;
}
.pg-aff .org .visit::after { content: "↗"; color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-aff .org .visit:hover { color: var(--blue); }
.pg-aff .org .visit:hover::after { transform: translate(3px, -3px); }

@media (prefers-reduced-motion: reduce) {
  .pg-aff .org, .pg-aff .org::before, .pg-aff .org .visit::after { transition: none !important; }
  .pg-aff .org:hover, .pg-aff .org .visit:hover::after { transform: none; }
}
`;

type Org = {
  name: string;
  /** abbreviation shown above the name, only where the source gives one */
  abbr?: string;
  logo: string;
  logoAlt: string;
  href?: string;
  body: string[];
};

const PROFESSIONAL: Org[] = [
  {
    name: "Association of British Columbia Land Surveyors (ABCLS)",
    abbr: "ABCLS",
    logo: "/assets/uploads/2025/12/abcls-logo-1.png",
    logoAlt: "Association of British Columbia Land Surveyors logo",
    href: "https://www.abcls.ca/",
    body: [
      "The Association of British Columbia Land Surveyors (ABCLS) is a self-governing body charged with the responsibility of setting educational requirements, examining for admission, and regulating professional land surveyors to perform legal surveys within British Columbia.",
    ],
  },
  {
    name: "Association of Canada Lands Surveyors (ACLS)",
    abbr: "ACLS",
    logo: "/assets/uploads/2025/12/acls-aatc.jpg",
    logoAlt: "Association of Canada Lands Surveyors logo",
    href: "https://www.acls-aatc.ca/",
    body: [
      "The Association of Canada Lands Surveyors (ACLS) is the national licensing body for professionals surveying in the three Canadian territories, in the Federal parks, on Aboriginal reserves, on and under the surface of Canada’s oceans.",
    ],
  },
  {
    name: "Engineers & Scientists of British Columbia (EGBC)",
    abbr: "EGBC",
    logo: "/assets/uploads/2026/01/EIN-EGBC-logo-400.webp",
    logoAlt: "Engineers and Geoscientists BC logo",
    href: "https://www.egbc.ca/",
    body: [
      "Engineers and Geoscientists British Columbia is the business name of the Association of Professional Engineers and Geoscientists of the Province of British Columbia (EGBC). The association is charged with protecting the public interest by setting and maintaining high academic, experience, and professional practice standards for its members. Individuals licensed by Engineers and Geoscientists BC are the only persons permitted by law to undertake and assume responsibility for engineering and geoscience projects in BC.",
    ],
  },
  {
    name: "Engineers Yukon",
    logo: "/assets/uploads/2025/12/Engineers-Yukon-Vertical-Logo.jpg",
    logoAlt: "Engineers Yukon logo",
    href: "https://engineersyukon.ca/",
    body: [
      "Engineers Yukon is a self-governing body of Professional Engineers that regulates and governs the engineering profession in Yukon. This is achieved by setting and maintaining high academic, experience and professional practice standards for all members. Only individuals licensed by Engineers Yukon are permitted by law to undertake and assume responsibility for engineering projects in Yukon.",
    ],
  },
  {
    name: "Northwest Territories and Nunavut Association of Professional Engineers & Geoscientists (NAPEG)",
    abbr: "NAPEG",
    logo: "/assets/uploads/2025/12/napeg-logo.jpg",
    logoAlt: "NAPEG logo",
    href: "https://www.napeg.nt.ca/",
    body: [
      "NAPEG is responsible for the licensing of professional engineers and professional geoscientists in the Northwest Territories and Nunavut, the regulation of the practices of professional engineering and professional geoscience, the establishment and maintenance of standards of knowledge, skill, care and professional ethics among its registrants, in order that the interests of the public may be served and protected.",
    ],
  },
];

const OTHER: Org[] = [
  {
    name: "Canadian Institute of Geomatics (CIG)",
    abbr: "CIG",
    logo: "/assets/uploads/2025/12/CIG-LOGO.png",
    logoAlt: "Canadian Institute of Geomatics logo",
    href: "https://www.cig-acsg.ca/",
    body: [
      "The Canadian Institute of Geomatics is the Canadian association that represents the interests of all groups in the geomatics community and is the Canadian member to the International Federation of Surveying (FIG), the International Society of Photogrammetry and remote Sensing (ISPRS) and the International Cartographic Association (ICA).",
    ],
  },
  {
    name: "Association of Consulting Engineering Companies (ACEC)",
    abbr: "ACEC",
    logo: "/assets/uploads/2025/12/Association-of-Consulting-Engineers-Logo.png",
    logoAlt: "Association of Consulting Engineering Companies logo",
    href: "https://www.acec.ca/",
    body: [
      "The Association of Consulting Engineering Companies (ACEC) represents the commercial interests of businesses that provide professional engineering services, to both the public and the private sector. Our members’ services include planning, designing and implementing all types of engineering projects, and providing independent advice and expertise in a wide range of engineering-related fields.",
    ],
  },
  {
    name: "Association for Mineral Exploration (AME)",
    abbr: "AME",
    logo: "/assets/uploads/2026/01/ame-2.webp",
    logoAlt: "Association for Mineral Exploration logo",
    href: "https://amebc.ca/",
    body: [
      "AME represents, advocates, protects, and promotes the interests of thousands of members who are engaged in mineral exploration and development in BC and throughout the world. AME encourages a safe, economically strong, and environmentally responsible industry by providing clear initiatives, policies, events, and tools to support its membership.",
    ],
  },
  {
    name: "BC Construction Safety Alliance (BCCSA)",
    abbr: "BCCSA",
    logo: "/assets/uploads/2025/06/BCCSA-COR-Certified-Logo.webp",
    logoAlt: "BCCSA COR Certified logo",
    href: "https://www.bccsa.ca/",
    body: [
      "The British Columbia Construction Safety Alliance (BCCSA) is a provincial construction safety association, developing health and safety programs, tools and resources to over 40,000 construction companies employing over 200,000 workers in British Columbia. It is dedicated to raising health and safety awareness and reducing injuries through safety consultation, risk-management, injury prevention and injury management.",
    ],
  },
  {
    name: "Northern Safety Network Yukon (NSNY)",
    abbr: "NSNY",
    logo: "/assets/uploads/2026/01/Northern-Safety-Network.png",
    logoAlt: "Northern Safety Network Yukon logo",
    href: "https://www.yukonsafety.com/",
    body: [
      "The Northern Safety Network Yukon (NSNY) is funded by the Yukon Workers’ Compensation Health and Safety Board and directed by an industry-led steering committee. The goal of the NSNY is to foster a commitment to occupational health and safety among Yukon workers and employers.",
    ],
  },
  {
    name: "Professional Surveyors Canada",
    logo: "/assets/uploads/2026/01/Professional-Surveyers-of-Canada-Logo.png",
    logoAlt: "Professional Surveyors Canada logo",
    href: "https://www.psc-gpc.ca/",
    body: [
      "Conceived, developed, and run by Canadian surveyors, Professional Surveyors Canada is dedicated to building and enabling a strong multi-faceted community of surveying professionals committed to exceeding expectations.",
    ],
  },
  {
    name: "Vancouver Island Construction Association (VICA)",
    abbr: "VICA",
    logo: "/assets/uploads/2026/01/VICABC-logo.png",
    logoAlt: "Vancouver Island Construction Association logo",
    href: "https://www.vicabc.ca/",
    body: [
      "VICA proudly serves members of the industrial, commercial, institutional, and multi-family residential construction sectors on Vancouver Island, the Gulf Islands, and other coastal communities in British Columbia",
    ],
  },
  {
    name: "Vancouver Regional Construction Association (VRCA)",
    abbr: "VRCA",
    logo: "/assets/uploads/2026/01/VRCA-Logo-Colour3.png",
    logoAlt: "Vancouver Regional Construction Association logo",
    href: "https://www.vrca.ca/",
    body: [
      "The VRCA proudly represents the general and trade contractors, manufacturers and suppliers who operate as both union and open-shop employers in B.C.’s industrial, commercial, institutional and high-rise residential construction industry.",
    ],
  },
  {
    name: "Canadian Home Builders' Association Central Interior",
    logo: "/assets/uploads/2026/01/chbaci-logo-default2.webp",
    logoAlt: "Canadian Home Builders' Association Central Interior logo",
    href: "https://www.chbaci.ca/home.htm",
    body: [
      "The Canadian Home Builders’ Association Central Interior is built on a vision of housing excellence. We provide industry leadership that creates a professional, affordable and profitable housing environment.",
      "The Canadian Home Builders’ Association of Central Interior is the leading advocate of the residential construction industry across the interior of BC.",
    ],
  },
  {
    name: "ISNetworld (ISN)",
    abbr: "ISN",
    logo: "/assets/uploads/2026/01/ISN-Logo.png",
    logoAlt: "ISNetworld logo",
    href: "https://www.isnetworld.com/en/",
    body: [
      "ISNetworld is the global resource for connecting corporations with safe, reliable contractors in capital-intensive industries. ISN collects self-reported conformance information from contractors/suppliers, verifies its accuracy, and then reports the results in an easy-to-follow format.",
    ],
  },
  {
    name: "Independent Contractors and Businesses Association",
    abbr: "ICBA",
    logo: "/assets/uploads/2026/01/ICBA-Logo-RGB-Primary-crop.png",
    logoAlt: "Independent Contractors and Businesses Association logo",
    body: [
      "For more than 50 years, ICBA has helped builders, contractors, and tradespeople grow their businesses, strengthen their teams, and shape the future of construction in British Columbia.",
    ],
  },
];

function OrgGrid({ orgs }: { orgs: Org[] }) {
  return (
    <div className="org-grid">
      {orgs.map((o, i) => (
        <div
          className="reveal"
          style={{ transitionDelay: `${(i % 3) * 80}ms` }}
          key={o.name}
        >
          <article className="org">
            <div className="mark">
              <img src={o.logo} alt={o.logoAlt} loading="lazy" />
            </div>
            <div className="body">
              {o.abbr ? <span className="abbr">{o.abbr}</span> : null}
              <h3>{o.name}</h3>
              <div className="text">
                {o.body.map((p) => (
                  <p key={p.slice(0, 32)}>{p}</p>
                ))}
              </div>
              {o.href ? (
                <a className="visit" href={o.href} target="_blank" rel="noreferrer">
                  Visit Website
                </a>
              ) : null}
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}

export default function Affiliations() {
  useDocumentMeta(
    "Affiliations | Underhill Geomatics",
    "Underhill Geomatics or its employees are members of various professional associations and other organizations."
  );

  return (
    <main id="main" className="pg-aff">
      <style>{CSS}</style>
      <PageHero
        image="/assets/uploads/2025/05/Underhill-Geomatics-Whitehorse_185_Eagle-Vision-Agency_20240515.webp"
        title="Affiliations"
        lead="Underhill Geomatics or its employees are members of various professional associations and other organizations"
        crumb={{ label: "About", href: "/about-underhill-geomatics/" }}
      >
        <div className="actions">
          <a className="btn" href="#professional">
            Professional Associations
          </a>
          <a className="btn ghost" href="#other">
            Other Organizations
          </a>
        </div>
      </PageHero>

      {/* ------------------------------------------- professional bodies */}
      <section className="section grey" id="professional">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Licensing &amp; Regulation</span>
            <h2>Professional Associations</h2>
          </div>
          <OrgGrid orgs={PROFESSIONAL} />
        </div>
      </section>

      {/* ------------------------------------------- other organisations */}
      <section className="section" id="other">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Industry &amp; Safety</span>
            <h2>Other Organizations &amp; Associations</h2>
          </div>
          <OrgGrid orgs={OTHER} />
          <div className="reveal" style={{ marginTop: 40 }}>
            <SmartLink to="/about-underhill-geomatics/health-safety/">
              Health &amp; Safety at Underhill →
            </SmartLink>
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
