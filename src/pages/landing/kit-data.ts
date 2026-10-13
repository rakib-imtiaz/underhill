/* The kit: one entry per piece of Underhill's field gear, for Home's "The tools behind the data" rail.
   Ported verbatim from drafts/film-fly-gear/showcase-v2/js/kit-data.js (the gear playground keeps its
   own copy there, keyed by the same ids: a card links to <experience>/gear.html?g=<id>).
   GEAR_ICONS are the inner markup of 24x24 stroke-only icons; GearIcon (Kit.tsx) renders them as JSX. */

export type KitEntry = {
  id: string;
  name: string;
  short: string;
  category: string;
  group: "core" | "reality-capture" | "water" | "precision" | "extras";
  line: string;
  status: "ready" | "awaiting-model";
  model: string | null;
  service: { label: string; href: string };
  icon: string;
  photo: string | null;
};

export const SITE = 'https://underhill.ca';

const SVC: Record<string, { label: string; href: string }> = {
  aerial: { label: 'Aerial Surveying', href: '/geospatial-services/aerial-surveying/' },
  topo: { label: 'Topographic Surveying', href: '/geospatial-services/topographic-surveying/' },
  construction: { label: 'Construction & Engineering Surveys', href: '/geospatial-services/construction-surveying/' },
  scanning: { label: 'Laser Scanning', href: '/geospatial-services/3d-laser-scanning-reality-capture/' },
  hydro: { label: 'Hydrographic Surveys', href: '/geospatial-services/hydrographic-surveying/' },
  monitoring: { label: 'Deformation Monitoring', href: '/geospatial-services/deformation-monitoring/' },
  rail: { label: 'Railway Surveying', href: '/geospatial-services/railway-surveying/' },
};

export const CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  drone: 'Survey drone',
  vtol: 'Fixed-wing VTOL',
  gnss: 'GNSS',
  'total-station': 'Total station',
  scanner: 'Laser scanner',
  'mobile-scanner': 'Mobile scanner',
  water: 'Hydrographic',
  tracker: 'Laser tracker',
  monitoring: 'Monitoring',
  rail: 'Rail',
  level: 'Levelling',
  camera: '360° capture',
  plummet: 'Plumbing',
  control: 'Ground control',
});

const e = (o: Omit<KitEntry, 'model' | 'photo'> & Partial<Pick<KitEntry, 'model' | 'photo'>>): KitEntry =>
  Object.freeze({ model: null, photo: null, ...o });

export const KIT: readonly KitEntry[] = Object.freeze([
  // ready now: the film's three models
  e({ id: 'm350-mapper', name: 'DJI M350 RTK + YellowScan Mapper+', short: 'M350 drone', category: 'drone', group: 'core',
    line: 'Our survey drone: RTK positioning and a LiDAR payload that sees through the canopy to the ground.',
    status: 'ready', model: 'drone', service: SVC.aerial, icon: 'drone' }),
  e({ id: 'r12i-tsc7', name: 'Trimble R12i GNSS + TSC7', short: 'R12i rover', category: 'gnss', group: 'core',
    line: 'Centimetre positions from satellites, with tilt compensation so the pole never has to be level.',
    status: 'ready', model: 'gnss', service: SVC.topo, icon: 'gnss' }),
  e({ id: 's7-robotic', name: 'Trimble S7 robotic total station', short: 'S7 robotic', category: 'total-station', group: 'extras',
    line: 'Locks on to the prism and follows it, so one surveyor can run the whole setup.',
    status: 'ready', model: 'ts', service: SVC.construction, icon: 'total-station' }),
  // the core kit, awaiting their models
  e({ id: 'sx10', name: 'Trimble SX10 scanning total station', short: 'SX10', category: 'total-station', group: 'core',
    line: 'A total station and a 3D scanner in one: angles, distances and a point cloud from one setup.',
    status: 'awaiting-model', service: SVC.construction, icon: 'scanning-station' }),
  e({ id: 'trinity-f90', name: 'Quantum Systems Trinity F90+', short: 'Trinity F90+', category: 'vtol', group: 'core',
    line: 'Takes off like a drone and flies like a plane: long corridors and big sites in one flight.',
    status: 'awaiting-model', service: SVC.aerial, icon: 'vtol' }),
  e({ id: 'navvis-vlx', name: 'NavVis VLX wearable scanner', short: 'NavVis VLX', category: 'mobile-scanner', group: 'reality-capture',
    line: 'A scanner you wear: it maps buildings, plants and tunnels at walking pace.',
    status: 'awaiting-model', service: SVC.scanning, icon: 'wearable' }),
  e({ id: 'leica-p50', name: 'Leica ScanStation P50', short: 'Leica P50', category: 'scanner', group: 'reality-capture',
    line: 'A long-range laser scanner: millions of points from each setup, out past a kilometre.',
    status: 'awaiting-model', service: SVC.scanning, icon: 'scanner',
    photo: 'gear-scanner.jpg' /* stand-in until gear-leica-p50.webp arrives */ }),
  e({ id: 'hydrone-usv', name: 'SeaFloor HyDrone + SeaRay multibeam', short: 'HyDrone USV', category: 'water', group: 'water',
    line: 'A remote-controlled survey boat that maps riverbeds and harbour floors with multibeam sonar.',
    status: 'awaiting-model', service: SVC.hydro, icon: 'boat' }),
  e({ id: 'at403-tracker', name: 'Leica AT403 laser tracker', short: 'AT403', category: 'tracker', group: 'precision',
    line: 'Follows a reflector to a few hundredths of a millimetre, for industrial alignment.',
    status: 'awaiting-model', service: SVC.construction, icon: 'tracker' }),
  e({ id: 'prism360-senceive', name: 'Leica 360° prism + Senceive tilt node', short: 'Prism + tilt node', category: 'monitoring', group: 'precision',
    line: 'Prisms and wireless tilt sensors that watch a structure for movement, day and night.',
    status: 'awaiting-model', service: SVC.monitoring, icon: 'prism' }),
  // extras
  e({ id: 'phantom4-rtk', name: 'DJI Phantom 4 RTK', short: 'Phantom 4 RTK', category: 'drone', group: 'extras',
    line: 'A compact mapping drone for small sites and quick photogrammetry.',
    status: 'awaiting-model', service: SVC.aerial, icon: 'drone-small' }),
  e({ id: 'mavic3e', name: 'DJI Mavic 3 Enterprise', short: 'Mavic 3E', category: 'drone', group: 'extras',
    line: 'Folds into a backpack: site photos, progress maps and inspections in minutes.',
    status: 'awaiting-model', service: SVC.aerial, icon: 'drone-small' }),
  e({ id: 'gedo-trolley', name: 'Trimble GEDO rail trolley', short: 'GEDO trolley', category: 'rail', group: 'extras',
    line: 'Rolls along the track measuring gauge, cant and alignment as it goes.',
    status: 'awaiting-model', service: SVC.rail, icon: 'trolley' }),
  e({ id: 'digital-level-staff', name: 'Digital level + barcode staff', short: 'Digital level', category: 'level', group: 'extras',
    line: 'Reads a barcode staff for heights to a fraction of a millimetre.',
    status: 'awaiting-model', service: SVC.construction, icon: 'level' }),
  e({ id: 'sontek-m9', name: 'SonTek RiverSurveyor M9', short: 'SonTek M9', category: 'water', group: 'extras',
    line: 'A small float that measures river flow and depth with sound.',
    status: 'awaiting-model', service: SVC.hydro, icon: 'float' }),
  e({ id: 'matterport-pro3', name: 'Matterport Pro3 360° camera', short: 'Matterport Pro3', category: 'camera', group: 'extras',
    line: 'Walk-through 3D tours of a building, for owners and designers.',
    status: 'awaiting-model', service: SVC.scanning, icon: 'camera360' }),
  e({ id: 'zenith-plummet', name: 'Zenith laser plummet', short: 'Laser plummet', category: 'plummet', group: 'extras',
    line: 'Projects a true vertical line to carry control up a tall structure.',
    status: 'awaiting-model', service: SVC.construction, icon: 'plummet' }),
  e({ id: 'gcp-target', name: 'Ground control targets', short: 'GCP targets', category: 'control', group: 'extras',
    line: 'Surveyed markers that tie every drone image to real-world coordinates.',
    status: 'awaiting-model', service: SVC.aerial, icon: 'target' }),
]);

const BY_ID = new Map(KIT.map((k) => [k.id, k]));
export const kitById = (id: string) => BY_ID.get(id);
export const serviceUrl = (entry: KitEntry) => SITE + entry.service.href;

// Line icons (24×24, stroke only: the page sets stroke colour and width). Simple silhouettes, drawn
// to read at 40–80 px on the blueprint placeholder.
export const GEAR_ICONS: Readonly<Record<string, string>> = Object.freeze({
  drone: '<path d="M9 10h6v4H9z"/><path d="M9 10 5.5 6.5M15 10l3.5-3.5M9 14l-3.5 3.5M15 14l3.5 3.5"/><circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="6" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M10.5 14.5v2h3v-2"/>',
  'drone-small': '<rect x="9.5" y="10" width="5" height="4" rx="1"/><path d="M9.5 11 6 8M14.5 11 18 8M9.5 13 6 16M14.5 13 18 16"/><path d="M3.5 8h5M15.5 8h5M3.5 16h5M15.5 16h5"/>',
  vtol: '<path d="M12 5v14M3 11h18M8 19h8"/><path d="M12 5c1 0 1.5 1 1.5 2v6.5L12 15l-1.5-1.5V7c0-1 .5-2 1.5-2z"/><path d="M5 9v4M19 9v4M3.5 9h3M17.5 9h3"/>',
  gnss: '<path d="M8 6.5c0-1.4 1.8-2.5 4-2.5s4 1.1 4 2.5S14.2 9 12 9 8 7.9 8 6.5z"/><path d="M12 9v12"/><rect x="13.5" y="12" width="4" height="5.5" rx=".6"/><path d="M12 14h1.5"/><path d="M5 5.5a8 8 0 0 1 2-2.5M19 5.5a8 8 0 0 0-2-2.5"/>',
  'total-station': '<rect x="8.5" y="3.5" width="7" height="6" rx="1"/><circle cx="12" cy="6.5" r="1.6"/><path d="M7.5 9.5h9v2h-9z"/><path d="M12 11.5 6 21M12 11.5 18 21M12 11.5V21"/>',
  'scanning-station': '<rect x="8.5" y="3.5" width="7" height="6" rx="1"/><circle cx="12" cy="6.5" r="1.6"/><path d="M7.5 9.5h9v2h-9z"/><path d="M12 11.5 6 21M12 11.5 18 21M12 11.5V21"/><path d="M17.5 4.5 21 3M17.5 6.5H21M17.5 8.5 21 10"/>',
  scanner: '<rect x="9" y="3" width="6" height="8.5" rx="1.2"/><path d="M10.5 5.5h3M10.5 8h3"/><path d="M8 11.5h8M12 11.5 6 21M12 11.5 18 21M12 11.5V21"/>',
  wearable: '<circle cx="11" cy="4.5" r="2"/><path d="M11 7v7l-2.5 7M11 14l2.5 7M7.5 9.5 11 8l3.5 1.5"/><path d="M14 6.5h2.5V3.5M16.5 3.5l2-1M16.5 3.5l2 1"/>',
  boat: '<path d="M3 15h18l-2.5 4h-13z"/><path d="M8 15v-4h7l2 4"/><path d="M11.5 11V7h2"/><path d="M12 19.5v1.5M8 21l4-1.5 4 1.5"/>',
  float: '<path d="M4 14c2-1.5 14-1.5 16 0l-2 3H6z"/><rect x="10" y="9" width="4" height="4"/><path d="M12 9V5"/><path d="M8 20l4-3 4 3M12 17v4"/>',
  tracker: '<circle cx="12" cy="8" r="4.5"/><circle cx="12" cy="8" r="1.6"/><path d="M8 13.5h8v2H8z"/><path d="M12 15.5 7 21M12 15.5 17 21M12 15.5V21"/>',
  prism: '<path d="M12 3 18 7v6l-6 4-6-4V7z"/><circle cx="12" cy="10" r="2.2"/><path d="M12 17v4M9 21h6"/>',
  trolley: '<path d="M3 18h18M3 21h18"/><path d="M6 18v-5h12v5"/><path d="M12 13V7M9.5 7h5"/><circle cx="7.5" cy="18" r="1.2"/><circle cx="16.5" cy="18" r="1.2"/>',
  level: '<rect x="4" y="7" width="11" height="4.5" rx="1"/><circle cx="6.5" cy="9.2" r="1.2"/><path d="M9.5 11.5 6 21M9.5 11.5 13 21M9.5 11.5V21"/><path d="M19 3v18M19 5h1.5M19 8h1.5M19 11h1.5M19 14h1.5M19 17h1.5"/>',
  camera360: '<rect x="8" y="4" width="8" height="7" rx="1.5"/><circle cx="12" cy="7.5" r="2"/><path d="M12 11v2.5M12 13.5 7 21M12 13.5 17 21M12 13.5V21"/>',
  plummet: '<rect x="8" y="9" width="8" height="5" rx="1"/><path d="M12 9V2.5"/><path d="M12 14.5 7 21M12 14.5 17 21M12 14.5V21"/><path d="M10.5 4.5 12 2.5l1.5 2"/>',
  target: '<rect x="4" y="4" width="16" height="16"/><path fill="currentColor" stroke="none" d="M4 4h8v8H4zM12 12h8v8h-8z"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
});
