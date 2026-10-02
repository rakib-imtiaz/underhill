/* Copy for the Our Team page. People, titles, credentials and bios are Underhill's own (underhill.ca/our-team);
   milestones come from the company history (underhill.ca/history-of-underhill-geomatics). */

export const YOUTUBE_ID = "xii2tc6JtaI"; // the team film linked from the live page

export type Leader = {
  id: string;
  name: string;
  creds: string;
  role: string;
  base?: string;
  img: string;
  summary: string;
  bio: string[];
};

export const LEADERS: Leader[] = [
  {
    id: "chris",
    name: "Chris El-Araj",
    creds: "BCLS, CLS",
    role: "President",
    base: "Underhill Group of Companies",
    img: "/team/leader-chris-card.webp",
    summary: "25+ years in land surveying and geomatics.",
    bio: [
      "Chris El-Araj, BCLS, CLS, is the President of the Underhill Group of Companies, where he leads the firm with a commitment to professionalism, technical excellence, innovation, and client-focused service. With more than twenty-five years of experience in land surveying and geomatics, he specializes in cadastral and engineering surveys and is recognized as a trusted authority in the field.",
      "Chris holds a Diploma of Technology in Geomatics from the British Columbia Institute of Technology and earned his BC Land Surveyor (BCLS) commission in 2009 and his Canada Land Surveyor (CLS) commission in 2026. Since joining Underhill, he has advanced the company’s technical capabilities and supported its growth across Western Canada. His work spans major infrastructure, transportation, and land development projects.",
    ],
  },
  {
    id: "sandy",
    name: "Sandy Cooke",
    creds: "P.Eng.",
    role: "Vice President",
    base: "Managing Partner, Whitehorse",
    img: "/team/leader-sandy.webp",
    summary: "Geodesy and Geomatics Engineering (UNB).",
    bio: [
      "Sandy Cooke, P.Eng., is the Vice President and Managing Partner of the Whitehorse office. A Professional Engineer with a degree in Geodesy and Geomatics Engineering from the University of New Brunswick, he has embodied the company’s values of innovation, collaboration, and professional excellence.",
      "Since joining Underhill in 2008—later becoming a partner in 2018— Sandy delivers precise and practical engineering solutions across diverse projects. He is known for fostering strong collaboration among clients, project teams, and stakeholders, ensuring that each assignment meets the highest standards of quality and care.",
      "Driven by a passion for advancing the geomatics industry, Sandy contributes to Underhill’s ongoing reputation for forward-thinking approaches and exceptional client service.",
    ],
  },
  {
    id: "jon",
    name: "Jon Cormier",
    creds: "BCLS",
    role: "Partner",
    base: "Vancouver",
    img: "/team/leader-jon.webp",
    summary: "BC Land Surveyor since 2015.",
    bio: [
      "Jon Cormier, BCLS, is a Partner based at our Vancouver office, and an experienced BC Land Surveyor who has worked in the industry since 2005. Jon joined Underhill in 2010 and progressed from field surveyor to project manager before becoming a partner. Jon earned his BCLS commission in 2015, following a Diploma in Surveying Engineering Technology from the College of the North Atlantic and a Bachelor of Technology in Geomatics from BCIT.",
      "Jon serves as a technical lead on a wide range of projects, including topographic, cadastral, 3D laser scanning, bathymetric, and engineering surveys. His comprehensive experience across Western Canada includes work with land developers, public utilities, railways, port facilities, industrial sites, municipalities, and government agencies.",
      "Known for his meticulous approach and broad technical expertise, Jon contributes significantly to Underhill’s reputation for high-quality, dependable surveying services.",
    ],
  },
  {
    id: "ryan",
    name: "Ryan Schuler",
    creds: "P.Eng., CLS",
    role: "Partner",
    base: "Managing Partner, Kamloops",
    img: "/team/leader-ryan.webp",
    summary: "Leads geomatics for BC Hydro’s Site C.",
    bio: [
      "Ryan Schuler, P.Eng., CLS is the Managing Partner of Underhill’s Kamloops office, guiding regional operations with a strong focus on quality, technology integration, and team development. He is also the Managing Partner of the Fort St. John office and leads geomatics operations for the BC Hydro Site C Clean Energy Project. His leadership has advanced major technical initiatives, including the development of a UAV mapping program, infrastructure monitoring systems, and extensive quality assurance surveys—supporting one of Canada’s largest infrastructure projects.",
      "His broader career spans Northern Canada, where he has delivered large-scale topographic surveys, environmental monitoring programs, offshore marine work, and Arctic ice road assessments. Ryan has received two David Thompson National Geomatics Awards for Innovation in Geomatics and Contribution to Society.",
      "A strong advocate for mentorship and professional development, Ryan has served as Chair of the ACLS Practice Review Committee and as a Council Member for NAPEG. He remains committed to advancing the surveying profession through innovation and leadership.",
    ],
  },
];

export const MILESTONES = [
  { year: "1913", label: "Underhill & Underhill", note: "Clare and J.T. Underhill open their Vancouver practice", img: "/assets/uploads/2019/09/1913-FC_Underhill_JT_Underhill.webp" },
  { year: "1927", label: "BC’s highest peak", note: "J.T. Underhill heights Mystery Mountain — Mt. Waddington", img: "/assets/uploads/2019/10/Mystery_Mtn_sketch_11Tu284.webp" },
  { year: "1970s", label: "North and abroad", note: "The Whitehorse office opens; first survey overseas, Yemen 1973", img: "/assets/uploads/2019/10/CDU-Yeman-1973.webp" },
  { year: "2011", label: "720 million points", note: "3D laser scanning beneath Science World, in two nights", img: "/assets/uploads/2019/10/BC-Place-Roof-2010.jpg.jpg" },
  { year: "Today", label: "Four offices", note: "Vancouver, Vancouver Island, Kamloops and Whitehorse", img: "/team/x-land.webp" },
];

export const EXPERTISE = [
  { key: "land", title: "Land", sub: "Legal, topographic & construction surveys", href: "/geospatial-services/topographic-surveying/", img: "/team/x-land.webp" },
  { key: "water", title: "Water", sub: "Hydrographic & bathymetric surveys", href: "/geospatial-services/hydrographic-surveying/", img: "/team/x-water.webp" },
  { key: "air", title: "Air", sub: "UAV LiDAR & photogrammetry", href: "/geospatial-services/aerial-surveying/", img: "/team/x-air.webp" },
  { key: "data", title: "Data", sub: "3D laser scanning, BIM & GIS", href: "/geospatial-services/3d-laser-scanning-reality-capture/", img: "/team/x-data.webp" },
] as const;

export const CULTURE = [
  { src: "/team/c-fog.webp", alt: "An Underhill surveyor with a GNSS rover in driving snow beside an excavator" },
  { src: "/team/c-shore.webp", alt: "An Underhill surveyor with a field tablet on the Vancouver Island shoreline" },
  { src: "/team/c-yukon.webp", alt: "An Underhill surveyor in the Yukon, smiling under a hard hat" },
  { src: "/team/c-forest.webp", alt: "Two Underhill surveyors working through forest undergrowth" },
  { src: "/team/c-kamloops.webp", alt: "An Underhill surveyor setting up beside the field truck in open hill country" },
];
