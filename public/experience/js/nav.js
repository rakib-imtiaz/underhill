// Underhill's navigation model, ported from the React site (src/data/nav.ts): the same label / path
// pairs, pointed at the live site. Two paths differ from the React port: Careers and Our History are
// new pages there (/careers/, /story/), so these use the URLs that exist on underhill.ca today.

export const SITE_URL = 'https://underhill.ca';
export const CAREERS_HREF = '/about-underhill-geomatics/careers/';
export const STORY_HREF = '/history-of-underhill-geomatics/';

export const PRIMARY_NAV = [
  {
    label: 'About',
    href: '/about-underhill-geomatics/',
    children: [
      { label: 'Our Approach', href: '/our-approach/' },
      { label: 'Our Team', href: '/our-team/' },
      { label: 'Industries', href: '/about-underhill-geomatics/land-surveyors/' },
      { label: 'Careers', href: CAREERS_HREF },
      { label: 'Our History', href: STORY_HREF },
      { label: 'Health and Safety', href: '/about-underhill-geomatics/health-safety/' },
      { label: 'Affiliations', href: '/about-underhill-geomatics/affiliations/' },
      { label: 'Underhill Brand', href: '/about-underhill-geomatics/underhill-brand/' },
    ],
  },
  {
    label: 'Services',
    href: '/geospatial-services/',
    children: [
      { label: 'Aerial Surveying', href: '/geospatial-services/aerial-surveying/' },
      { label: 'Construction & Engineering Surveys', href: '/geospatial-services/construction-surveying/' },
      { label: 'Deformation Monitoring', href: '/geospatial-services/deformation-monitoring/' },
      { label: 'Hydrographic Surveys', href: '/geospatial-services/hydrographic-surveying/' },
      { label: 'Laser Scanning', href: '/geospatial-services/3d-laser-scanning-reality-capture/' },
      { label: 'Cadastral Surveys', href: '/geospatial-services/cadastral-surveying/' },
      { label: 'First Nations Surveying', href: '/geospatial-services/first-nations-land-claims-surveying/' },
      { label: 'Railway Surveying', href: '/geospatial-services/railway-surveying/' },
      { label: 'Topographic Surveying', href: '/geospatial-services/topographic-surveying/' },
    ],
  },
  {
    label: 'Projects',
    href: '/land-surveying-projects/',
    children: [
      { label: 'Construction', href: '/category/land-survey-projects/construction/' },
      { label: 'Environmental', href: '/category/land-survey-projects/environmental/' },
      { label: 'First Nations', href: '/category/land-survey-projects/first-nations/' },
      { label: 'Historical', href: '/category/land-survey-projects/historical/' },
      { label: 'Infrastructure', href: '/category/land-survey-projects/infrastructure/' },
      { label: 'Mining', href: '/category/land-survey-projects/mining/' },
      { label: 'Energy', href: '/category/land-survey-projects/energy/' },
    ],
  },
  {
    label: 'Contact',
    href: '/vancouver-land-surveyors/',
    children: [
      { label: 'Vancouver', href: '/vancouver-land-surveyors/' },
      { label: 'Vancouver Island', href: '/vancouver-island-land-surveyors/' },
      { label: 'Kamloops', href: '/kamloops-land-surveyors/' },
      { label: 'Whitehorse', href: '/whitehorse-land-surveyors/' },
    ],
  },
];

/** Absolute URL on the live site. */
export const href = (path) => SITE_URL + path;
