import { useEffect, useRef, useState } from "react";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import "../styles/story.css";

/* GPU-safe count-up: rAF on a number, skipped entirely under reduced motion. */
function Stat({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      setN(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1500;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <div className="story-stat" ref={ref}>
      <div className="n">
        {n.toLocaleString()}
        {suffix ? <em>{suffix}</em> : null}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

/* Contour-line divider — the topographic motif between hero and story. */
function ContourDivider() {
  return (
    <svg
      className="story-contour"
      viewBox="0 0 1440 90"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 78 C 180 62 260 84 420 70 S 720 44 900 58 S 1260 80 1440 60" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M0 60 C 200 44 300 66 460 52 S 760 26 940 40 S 1280 62 1440 42" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <path d="M0 42 C 220 28 340 48 500 36 S 800 12 980 26 S 1300 44 1440 26" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
    </svg>
  );
}

type Era = {
  year: string;
  range: string;
  title: string;
  body: string[];
  img?: { src: string; alt: string; caption: string };
};

/* Curated from the firm's published history — every fact below is lifted from
   the "Our History" page, condensed for the timeline format. */
const ERAS: Era[] = [
  {
    year: "1913",
    range: "The Founding",
    title: "Underhill & Underhill",
    body: [
      "Brothers Frederic Clare Underhill (Clare) and James Theodore Underhill (J.T.) — both McGill-trained civil engineers — obtain their commissions as British Columbia Land Surveyors on 22 October 1913. Later that fall, they form a partnership and name it Underhill & Underhill.",
      "The tiny office is located in the Lumberman's Building, 811 – 509 Richards St., Vancouver. Their father, Dr. Frederick Underhill — the City of Vancouver's first full-time medical health officer — advances them money from time to time to help the fledgling venture along.",
    ],
    img: {
      src: "/assets/uploads/2019/09/1913-FC_Underhill_JT_Underhill.webp",
      alt: "F.C. Underhill and J.T. Underhill in 1913",
      caption: "From left: F.C. Underhill & J.T. Underhill, 1913.",
    },
  },
  {
    year: "1914",
    range: "The War Years",
    title: "Service Before Business",
    body: [
      "While Clare works the Britannia Mines mineral claim surveys in the mountains north of Vancouver, WWI breaks out in Europe. J.T. enlists in the East Yorkshire Regiment, seeing action at Suvla Bay, Gallipoli — where shrapnel lodged near his heart for the rest of his life — and in France, before appointment to the Canadian Expeditionary Force, Artillery. He is discharged with the rank of Captain in April 1919.",
      "Clare is commissioned as Lieutenant, Canadian Field Engineers, serving in France with the 1st Battalion, Canadian Pioneers and the Canadian Heavy Artillery until the end of the war. From 1919 onwards, the brothers pour their dedication and energy into building a firm based on personal integrity and a commitment to high standards.",
    ],
    img: {
      src: "/assets/uploads/2019/10/Metropolitan-Building-crica-1921-city-archives-Bu-N339-MAjor-MAtthew-collection_UJU-office-1919-1921.webp",
      alt: "The Metropolitan Building at 837 W. Hastings St., Vancouver, circa 1921",
      caption:
        "The Metropolitan Building at 837 W. Hastings St. was the office of Underhill & Underhill from 1919 to 1921. Photo: City of Vancouver Archives.",
    },
  },
  {
    year: "1927",
    range: "Mountains & Partnerships",
    title: "The Highest Peak in BC",
    body: [
      "Clare and J.T. obtain their Dominion Land Surveyor commissions in 1921. A year later Horace McNaughton Fraser — a professional mining engineer raised in Atlin — joins the partnership, renamed Underhill, Underhill & Fraser, and the office moves to the Williams Building at 413 Granville St.",
      "In 1927, Jim Underhill trigonometrically levels Mystery Mountain during a triangulation survey of the Klinakline River Valley. The height he surveys — 13,260 feet — establishes it as the highest peak in British Columbia. It is later named Mount Waddington. Two years later, the first recorded ascents of Whitecap Mountain and Birkenhead Peak are credited to a J.T. Underhill topographic survey.",
    ],
    img: {
      src: "/assets/uploads/2019/10/Mystery_Mtn_sketch_11Tu284.webp",
      alt: "Detail from triangulation survey 11Tu284 showing the trigonometric heighting of Mt. Waddington",
      caption:
        "Detail from Triangulation Survey (11Tu284) showing the trigonometric heighting of Mt. Waddington at 13,260 ft. J.T. Underhill, 1927.",
    },
  },
  {
    year: "1930s",
    range: "Depression & Duty",
    title: "Held Up by Gold",
    body: [
      "The collapse of world markets and the solid price of gold during the Great Depression positively impact mining investment in BC and the Yukon. Through the 30s, Underhill surveys extensively in the Bridge River area on mineral claims and related mining projects.",
      "Both brothers lead the profession through the decade: J.T. serves as President of the Corporation of Land Surveyors of BC in 1931, and Clare holds the same office in 1940 — the first of his two terms.",
    ],
    img: {
      src: "/assets/uploads/2019/10/JTU_Corp_BCLS_President_1931-1.webp",
      alt: "J.T. Underhill, President of the Corporation of Land Surveyors of BC, 1931",
      caption: "J.T. Underhill, President, Corporation of Land Surveyors of BC, 1931.",
    },
  },
  {
    year: "1950s",
    range: "Powering BC",
    title: "Five Hundred Projects for the Grid",
    body: [
      "The post-war boom is measured in concrete and kilowatts. From 1955 to 1959 the firm completes over 500 electrical utility projects for BC Engineering Co. and BC Electric Co. — major rights-of-way, easements, topographic mapping, tunnels, penstocks and dams throughout British Columbia, including the Wahleach, Cheakamus and Clowhom power developments.",
      "The next generation arrives: C.D. Underhill, Clare's son, becomes a partner in 1950, and in 1953 K.K. Wong — articled to Clare — obtains his commission, becoming the first land surveyor in BC of Chinese-Canadian descent.",
    ],
    img: {
      src: "/assets/uploads/2019/10/FC-Underhill-1952-cropped.webp",
      alt: "F.C. Underhill, President of the Corporation of Land Surveyors of BC, 1952",
      caption: "F.C. Underhill, President, Corporation of Land Surveyors of BC, 1952.",
    },
  },
  {
    year: "1960s",
    range: "The Electronic Turn",
    title: "Light Beams and Vacuum Tubes",
    body: [
      "Electronic distance measurement and computers forever change how surveys are done — and Underhill is there first. In 1962 the firm purchases a Geodimeter Model 4, the first EDM instrument in Western Canada; in 1966 it buys its first computer, a Control Data LGP-30 with a 4096-word magnetic drum memory. Decades before the internet, field data is Telexed to Vancouver, processed, and Telexed back to crews in the field.",
      "Clare and Jim retire from the partnership they founded in 1964 and are awarded Life Membership in the Corporation of Land Surveyors of BC. Underhill Engineering Co. Ltd. is incorporated in 1966.",
    ],
    img: {
      src: "/assets/uploads/2019/10/Computers-and-LPG30.webp",
      alt: "Computer programmers at Underhill's Control Data LGP-30, purchased in 1966",
      caption:
        "Computer programmers at Underhill's Control Data LGP-30, purchased in 1966. The machine weighed 800 lbs and had a 4096-word magnetic drum memory.",
    },
  },
  {
    year: "1970s",
    range: "Northward",
    title: "A Two-Year Posting in Whitehorse",
    body: [
      "Tim Koepke moves to Whitehorse in 1970 to open a new office — he is told it is for two years. The office never leaves, and in 2022 it celebrates 50 years in the Yukon.",
      "The decade brings Underhill's first strata plan (VR 61, 1973), its first overseas project — C.D. Underhill consulting in Yemen for CANCON, 1973 — and the first Air Space Parcel in British Columbia, surveyed by C.D. Underhill in 1974. In 1979, S. Thorne designs the Underhill logo still in use today: two U's for the founding brothers, and a plus sign that doubles as sighting cross-hairs.",
    ],
    img: {
      src: "/assets/uploads/2019/10/CDU-Yeman-1973.webp",
      alt: "C.D. Underhill on survey in Yemen, 1973",
      caption: "C.D. Underhill's survey in Yemen for CANCON — Underhill's first overseas project, 1973.",
    },
  },
  {
    year: "1980s",
    range: "Mega-Projects & GPS",
    title: "Expo, Tunnels, and Satellites",
    body: [
      "Government-funded mega-projects carry the firm through the recession: North East Coal at Tumbler Ridge — including two of the longest railway tunnels in BC — BC Place, Expo '86, and the TRIM mapping program. Surveying for the Expo '86 pavilions and the Cambie Bridge reshapes the Vancouver skyline.",
      "In 1986, Underhill manages the first major GPS photo control survey completed in BC, along Kootenay and Slocan Lakes — and wins its first Inuvialuit land-claim contract, opening decades of work in the North.",
    ],
    img: {
      src: "/assets/uploads/2019/10/MS_Expo86_2.webp",
      alt: "Morgan Stewart surveying during the construction of World Expo '86 in Vancouver",
      caption:
        "Surveying during the construction of World Expo '86 in Vancouver, with Science World under construction in the background. Morgan Stewart.",
    },
  },
  {
    year: "1990s",
    range: "North of 60 & the World",
    title: "Dominating the Land Claims",
    body: [
      "Underhill dominates the First Nations land claim surveys north of 60 — roughly 40% of all contracts let by Natural Resources Canada. Inuvialuit surveys carry on from the 80s; the Gwich'in, Sahtu, Nunavut and Council of Yukon First Nations claims begin. Fifty-four major contracts are completed in the Yukon, Northwest Territories and Nunavut.",
      "The firm expands into GIS — digitally mapping BC Hydro's entire electrical distribution network for Vancouver Island and the Lower Mainland, 1.5 million facilities on 5,500 map sheets, in two years — and consults internationally from Chile to T'Chad, Spain, Thailand, Turkey and Yemen. In 1998, Underhill Engineering Ltd. is renamed Underhill Geomatics Ltd.",
    ],
    img: {
      src: "/assets/uploads/2019/10/Bursa-Turkey.webp",
      alt: "GPS consulting on the cadastral reform project in Bursa, Turkey, 1997",
      caption:
        "GPS consulting expertise on IGS Corp.'s cadastral reform project for the World Bank, Bursa, Turkey, 1997.",
    },
  },
  {
    year: "2000s",
    range: "The Olympic Build-Up",
    title: "Laser Scanning Arrives",
    body: [
      "The decade is dominated by infrastructure and the build-up to the 2010 Vancouver Winter Olympics: the RAV rapid transit line (now the Canada Line), the Seymour–Capilano twin water tunnels, and the Vancouver Olympic Village. Three-dimensional laser scanning — millions of 3D positions in seconds, to millimetre accuracy — revolutionizes the firm's topographic and as-built work.",
      "In 2002 Underhill acquires Bartell & Fiedrich Land Surveying in Kamloops — exactly 50 years to the day after that firm's founding — and I.J. Royan moves to Kamloops to manage it. Copan, Underhill's free COGO tool, reaches users around the world; by 2011 it counts 10,000 users in nearly 200 countries.",
    ],
    img: {
      src: "/assets/uploads/2019/10/WhitehorseCanadaGames.webp",
      alt: "Underhill Whitehorse supporting preparations for the 2007 Canada Winter Games",
      caption:
        "Underhill Whitehorse is involved in preparations for the Canada Winter Games — hosted by Whitehorse in 2007, the first time the Games are held in one of Canada's territories.",
    },
  },
  {
    year: "2011",
    range: "A Century On",
    title: "720 Million Points Under Science World",
    body: [
      "Tasked with an as-built survey beneath the Science World facility — in a space flooded by tides and reachable only in four-hour windows around 11 PM — Underhill turns to 3D laser scanning: nineteen scans of 40 million points each, a final point cloud of over 720 million points, captured in two nights instead of an estimated seven to ten.",
      "In 2013, Underhill & Underhill marks its 100th year of business. The Comox office opens on Vancouver Island in 2020, the Whitehorse office celebrates 50 years in the Yukon in 2022 — and the principles the founding brothers set down in 1913 still hold.",
    ],
    img: {
      src: "/assets/uploads/2019/10/BC-Place-Roof-2010.jpg.jpg",
      alt: "3D laser scanning for the as-built check of a mast for the new BC Place roof, 2010",
      caption:
        "3D laser scanning for as-built check of one of the masts for the new BC Place roof, 2010.",
    },
  },
];

type Photo = { src: string; alt: string; decade: string; caption: string };

/* Captions verbatim (lightly trimmed) from the Historical Photos archive. */
const GALLERY: Photo[] = [
  {
    src: "/assets/uploads/2019/09/1913-Fording-Stikine.webp",
    alt: "Survey crew fording the Stikine River, 1913",
    decade: "1910s",
    caption: "Fording the Stikine, 1913.",
  },
  {
    src: "/assets/uploads/2019/09/1913-Caribou_Fred_Mansell_CW_Spence_W_Losee.webp",
    alt: "Fred Mansell, C.W. Spence and W. Losee with Cariboo, 1913",
    decade: "1910s",
    caption: "From left: Fred Mansell, C.W. Spence, W. Losee with Cariboo, 1913.",
  },
  {
    src: "/assets/uploads/2019/10/Williams-Building_CVA-1399-389_CA-192_A38703-3-e1571156139913.webp",
    alt: "The Williams Building at 413 Granville St., Vancouver",
    decade: "1920s",
    caption: "The Williams Building, 413 Granville St. — Underhill's office from 1922 to 1956. City of Vancouver Archives.",
  },
  {
    src: "/assets/uploads/2019/10/JWS-with-Geodimeter-Model-6_fixed-1.webp",
    alt: "J.W. Sharpe with a Geodimeter Model 6 on a BC Hydro transmission line survey",
    decade: "1960s",
    caption: "J.W. Sharpe on a Hydro transmission line survey near Lillooet, with the Geodimeter Model 6.",
  },
  {
    src: "/assets/uploads/2019/10/JMP-with-MRA3-Little-Mountain_fx.webp",
    alt: "J.M. Parnell measuring distances with a Tellurometer MRA3 at Little Mountain, Vancouver",
    decade: "1960s",
    caption: "J.M. Parnell with the Tellurometer MRA3 microwave instrument, Little Mountain, Vancouver.",
  },
  {
    src: "/assets/uploads/2019/10/JMP-and-Wang_fx.webp",
    alt: "J.M. Parnell and a programmer at the Wang WCS/20 computer",
    decade: "1970s",
    caption: "At the Wang WCS/20 — 32Kb of memory and dual 250Kb floppy drives. Survey software (TRIAX) was developed in-house.",
  },
  {
    src: "/assets/uploads/2019/10/B-Wong-C-Cryderman-I-Royan-G-Feidrich-D-Bazett.jpg",
    alt: "GPS Ltd. crew on the first TRIM GPS mapping control project, 1987",
    decade: "1980s",
    caption: "GPS Ltd. crew on the first TRIM GPS mapping control project, 1987. Photo courtesy of D. Bazett.",
  },
  {
    src: "/assets/uploads/2019/10/T2-signal-and-Hyland-Heli_fx.jpg",
    alt: "Wild T2 theodolite and Geodimeter 76 with a Highland Helicopter Bell 206 on a mountain control survey",
    decade: "1970s",
    caption: "Wild T2 and Geodimeter 76, with a Highland Helicopter Bell 206. Helicopters revolutionized mountain control surveys in BC.",
  },
  {
    src: "/assets/uploads/2019/10/Arecibo.jpg",
    alt: "The Arecibo radio telescope in Puerto Rico",
    decade: "1990s",
    caption: "Arecibo radio telescope, Puerto Rico — GPS consulting on the CRIM mapping program, 1999.",
  },
  {
    src: "/assets/uploads/2019/10/Underhill-Logo-History.webp",
    alt: "The Underhill logo designed by S. Thorne in 1979",
    decade: "1979",
    caption: "S. Thorne's 1979 logo: two U's for the founding brothers, and a plus sign for 'and' — and sighting cross-hairs.",
  },
];

export function Story() {
  useDocumentMeta(
    "Our Story — A Legacy of Integrity, Expertise, and Innovation | Underhill Geomatics",
    "From a tiny office in the Lumberman's Building in 1913 — see the journey of Underhill & Underhill from 1913 to present."
  );

  return (
    <main id="main">
      {/* ------------------------------------------------ cinematic hero */}
      <section className="story-hero">
        <div className="photo">
          <img
            src="/assets/uploads/2019/09/1913-FC_Underhill_JT_Underhill.webp"
            alt="Brothers F.C. and J.T. Underhill, founders of Underhill & Underhill, in 1913"
            loading="eager"
          />
        </div>
        <div className="grid" />
        <div className="coords tl">
          49.2827° N · 123.1207° W
          <br />
          LUMBERMAN'S BUILDING · 509 RICHARDS ST
        </div>
        <div className="coords br">
          EST. 22 OCT 1913
          <br />
          VANCOUVER, BC
        </div>
        <div className="container">
          <div className="era-mark" aria-hidden="true">
            1913
          </div>
          <h1>A Legacy of Integrity, Expertise, and Innovation</h1>
          <p className="sub">
            From a tiny office in the Lumberman's Building at 509 Richards St.,
            Vancouver — see the journey from 1913 to present.
          </p>
        </div>
        <div className="cue">Scroll</div>
      </section>

      <ContourDivider />

      {/* ------------------------------------------------------- founding */}
      <section className="section story-intro">
        <div className="container">
          <div className="split">
            <div className="reveal">
              <span className="kicker">Our History</span>
              <h2>The Founding of Underhill &amp; Underhill</h2>
              <p className="drop">
                Brothers Frederic Clare Underhill (Clare) and James Theodore Underhill
                (J.T.) established the Underhill &amp; Underhill partnership in 1913.
                From 1919 onwards, after active service in World War I, the brothers
                poured their dedication and energy into building a land surveying and
                engineering firm based on personal integrity and a commitment to
                maintaining high standards.
              </p>
              <p>
                These traits soon earned them the trust of clients across various
                industries and helped them establish Underhill as a leader in the
                industry.
              </p>
            </div>
            <blockquote className="story-quote reveal" style={{ transitionDelay: "120ms" }}>
              In the decades since, Underhill has consistently embraced technological
              innovation — expanding our services and geographic reach, all while
              upholding the principles that laid the foundation for our success.
              <cite>Underhill's Legacy</cite>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- stats band */}
      <section className="story-stats" aria-label="Underhill history in numbers">
        <div className="container">
          <Stat value={110} suffix="+" label="Years in Business" />
          <Stat value={4} label="Offices Across Canada" />
          <Stat value={54} label="Northern Claim Contracts in the 90s" />
          <Stat value={720} suffix="M" label="Points Scanned at Science World" />
        </div>
      </section>

      {/* ------------------------------------------------------- timeline */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="kicker">1913 — Today</span>
            <h2>The Journey</h2>
            <p className="lead">
              Eleven decades of firsts — the first EDM instrument in Western Canada,
              the first air space parcel in BC, the highest peak in the province —
              measured one survey at a time.
            </p>
          </div>
          <div className="story-timeline">
            {ERAS.map((e) => (
              <article className="story-era reveal" key={e.year}>
                <div className="year">
                  <span className="y">{e.year}</span>
                  <span className="r">{e.range}</span>
                </div>
                <div className="body">
                  <h3>{e.title}</h3>
                  {e.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {e.img ? (
                    <figure>
                      <img src={e.img.src} alt={e.img.alt} loading="lazy" />
                      <figcaption>{e.img.caption}</figcaption>
                    </figure>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- gallery */}
      <section className="section grey" id="historical-photos">
        <div className="container">
          <div className="reveal">
            <span className="kicker">From the Archive</span>
            <h2>Historical Photos</h2>
            <p className="lead">
              Historical photo galleries depicting the early stages of Underhill and
              the geomatics industry.
            </p>
          </div>
          <div className="story-gallery">
            {GALLERY.map((g, i) => (
              <figure className="reveal" key={g.src} style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
                <img src={g.src} alt={g.alt} loading="lazy" />
                <figcaption>
                  <span className="decade">{g.decade}</span>
                  {g.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- next chapter */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Keep Exploring</span>
            <h2>The Story Continues</h2>
          </div>
          <div className="story-next">
            <SmartLink
              to="#historical-photos"
              className="cell reveal"
            >
              <span className="tag">The Archive</span>
              <h3>Historical Photos</h3>
              <p>
                View the full historical photo gallery of our history from 1913 to
                today — decade by decade, from the Stikine to Science World.
              </p>
              <span className="go">View Photos</span>
            </SmartLink>
            <SmartLink to="/land-surveying-projects/" className="cell reveal" style={{ transitionDelay: "110ms" }}>
              <span className="tag">Today</span>
              <h3>Land Surveying Projects</h3>
              <p>
                A legacy of precision since 1913 — explore how accurate land surveying
                supports planning, compliance, and smarter project execution.
              </p>
              <span className="go">Explore Projects</span>
            </SmartLink>
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}

export default Story;
