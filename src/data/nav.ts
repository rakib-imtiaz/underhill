/* Navigation model — lifted verbatim from the static site's header markup so
   the label/URL pairs stay identical across header, mobile menu and footer.
   Routes that exist in this port are real React Router links; the rest keep
   their original href (they are part of the source site's IA and are marked
   `unported` so they render as plain anchors instead of dead client routes).

   Careers (`/careers/`) and Our History (`/story/`) are new pages of this
   redesign, so they are real routes now; the legacy URLs
   (`/about-underhill-geomatics/careers/`, `/history-of-underhill-geomatics/`)
   still resolve — App.tsx aliases them to the same components. */

export type NavLink = {
  label: string;
  href: string;
  /** true when no React route exists for this URL in the port */
  unported?: boolean;
};

export type NavGroup = {
  label: string;
  href: string;
  unported?: boolean;
  children?: NavLink[];
};

export const CAREERS_HREF = "/careers/";
export const STORY_HREF = "/story/";

export const PRIMARY_NAV: NavGroup[] = [
  {
    label: "About",
    href: "/about-underhill-geomatics/",
    children: [
      { label: "Our Approach", href: "/our-approach/" },
      { label: "Our Team", href: "/our-team/" },
      { label: "Industries", href: "/about-underhill-geomatics/land-surveyors/", unported: true },
      { label: "Careers", href: CAREERS_HREF },
      { label: "Our History", href: STORY_HREF },
      { label: "Health and Safety", href: "/about-underhill-geomatics/health-safety/", unported: true },
      { label: "Affiliations", href: "/about-underhill-geomatics/affiliations/", unported: true },
      { label: "Underhill Brand", href: "/about-underhill-geomatics/underhill-brand/", unported: true },
    ],
  },
  {
    label: "Services",
    href: "/geospatial-services/",
    children: [
      { label: "Aerial Surveying", href: "/geospatial-services/aerial-surveying/" },
      { label: "Construction & Engineering Surveys", href: "/geospatial-services/construction-surveying/" },
      { label: "Deformation Monitoring", href: "/geospatial-services/deformation-monitoring/" },
      { label: "Hydrographic Surveys", href: "/geospatial-services/hydrographic-surveying/" },
      { label: "Laser Scanning", href: "/geospatial-services/3d-laser-scanning-reality-capture/" },
      { label: "Cadastral Surveys", href: "/geospatial-services/cadastral-surveying/" },
      { label: "First Nations Surveying", href: "/geospatial-services/first-nations-land-claims-surveying/" },
      { label: "Railway Surveying", href: "/geospatial-services/railway-surveying/" },
      { label: "Topographic Surveying", href: "/geospatial-services/topographic-surveying/" },
    ],
  },
  {
    label: "Projects",
    href: "/land-surveying-projects/",
    children: [
      { label: "Construction", href: "/category/land-survey-projects/construction/" },
      { label: "Environmental", href: "/category/land-survey-projects/environmental/" },
      { label: "First Nations", href: "/category/land-survey-projects/first-nations/" },
      { label: "Historical", href: "/category/land-survey-projects/historical/" },
      { label: "Infrastructure", href: "/category/land-survey-projects/infrastructure/" },
      { label: "Mining", href: "/category/land-survey-projects/mining/" },
      { label: "Energy", href: "/category/land-survey-projects/energy/" },
    ],
  },
  {
    label: "Contact",
    href: "/vancouver-land-surveyors/",
    children: [
      { label: "Vancouver", href: "/vancouver-land-surveyors/" },
      { label: "Vancouver Island", href: "/vancouver-island-land-surveyors/" },
      { label: "Kamloops", href: "/kamloops-land-surveyors/" },
      { label: "Whitehorse", href: "/whitehorse-land-surveyors/" },
    ],
  },
];

/* Footer columns, straight from the static footer */
export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  {
    title: "Company",
    links: [
      { label: "About", href: "/about-underhill-geomatics/" },
      { label: "Team", href: "/our-team/" },
      { label: "Our Services", href: "/geospatial-services/" },
      { label: "Careers", href: CAREERS_HREF },
    ],
  },
  {
    title: "Locations",
    links: [
      { label: "Vancouver", href: "/vancouver-land-surveyors/" },
      { label: "Whitehorse", href: "/whitehorse-land-surveyors/" },
      { label: "Kamloops", href: "/kamloops-land-surveyors/" },
      { label: "Vancouver Island", href: "/vancouver-island-land-surveyors/" },
    ],
  },
  {
    title: "Client Access",
    links: [
      /* the source footer links Panoramas to the external client portal */
      { label: "Panoramas", href: "https://clients.underhill.ca/auth/start.html" },
    ],
  },
  {
    title: "Quick Links",
    links: [
      { label: "Map Check Tool", href: "https://underhillgeo.com/map_check.php" },
      { label: "Linkedin", href: "https://www.linkedin.com/company/underhill-geomatics-ltd/" },
    ],
  },
];
