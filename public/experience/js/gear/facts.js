// Underhill v2 — gear playground: the "Field notes" for every piece of kit (keyed by the kit-data id).
// Plain data, no DOM. Figures come from prompts/GEAR-RESEARCH.md and the "Real dimensions" blocks of
// prompts/GEAR-REFERENCE-PROMPTS.md (manufacturer / dealer sheets, checked 2026-10-09). Where the
// exact model is assumed (INFERRED in the research), `assumed` says so and the page shows it.
//
// Shape:
//   {
//     what:    string     one or two plain sentences: what it is and what it does
//     specs:   [[label, value], …]   3–5 rows; accuracy / range / weight first where they exist
//     project: { text, label, href }  "Underhill uses it at…": the project line and its source page
//     assumed: string?    a note when the model or a figure is assumed rather than confirmed
//   }
// The service page link comes from kit-data (entry.service), not from here.

const UH = 'https://underhill.ca';

export const FACTS = Object.freeze({
  'm350-mapper': {
    what: 'DJI\'s enterprise quadcopter carrying a YellowScan Mapper+ LiDAR. RTK puts every pulse on the map, and multiple returns reach the ground under trees.',
    specs: [
      ['LiDAR', 'Livox Avia, 70.4° × 4.5° field of view, up to 240k shots/s'],
      ['Positioning', 'RTK (D-RTK 2 or NTRIP from a Trimble R10 base) + Applanix APX-15'],
      ['Weight', '6.47 kg with two TB65 batteries; Mapper+ 1.1 kg'],
      ['Size', '810 × 670 × 430 mm unfolded; 895 mm wheelbase'],
    ],
    project: { text: 'Airport obstacle limitation surveys: 41 UAV LiDAR flights, about 1,600 ha across nine airports.', label: 'underhill.ca: Airport OLS surveys', href: `${UH}/airport-obstacle-limitation-surveys/` },
  },
  'r12i-tsc7': {
    what: 'A GNSS receiver that turns satellite signals into centimetre positions, run from a TSC7 field tablet. Its IMU corrects for a tilted pole, so shots are fast.',
    specs: [
      ['RTK precision', 'Under 2 cm horizontal once fixed'],
      ['Tilt compensation', 'Up to 40° (IMU, TIP)'],
      ['Weight', '1.12 kg; 3.95 kg with pole, TSC7 and bracket'],
      ['Radio', 'Internal UHF, 403–473 MHz'],
    ],
    project: { text: 'Dawson City flood mapping: Trimble R12 and R12i receivers with TSC5/TSC7 data collectors.', label: 'underhill.ca: Dawson City flood mapping', href: `${UH}/dawson-city-flood-mapping/` },
    assumed: 'This 3D model is the GNSS antenna on a base tripod; the rover pole is drawn for the stake-out.',
  },
  's7-robotic': {
    what: 'A robotic total station: it measures angles and distances to a prism, then locks on and follows it, so one surveyor runs the job from the pole.',
    specs: [
      ['Levelling', 'Electronic 2-axis level, 0.3″ resolution'],
      ['Speed', 'Face 1 to Face 2 in 2.6 s'],
      ['Tracking', 'Autolock and robotic tracking, VISION camera'],
      ['Weight', '5.5 kg instrument + 0.7 kg tribrach'],
    ],
    project: { text: 'Dawson City flood mapping: the S7 measured the shallow edges from shore with an angled rod.', label: 'underhill.ca: Dawson City flood mapping', href: `${UH}/dawson-city-flood-mapping/` },
  },
  sx10: {
    what: 'A total station and a 3D scanner in one: prism measurements, panoramas and point clouds from the same setup.',
    specs: [
      ['Angle accuracy', '1″'],
      ['Distance (prism)', '2 mm + 1.5 ppm'],
      ['Scanning', 'Up to 26,600 points/s, out to 600 m'],
      ['Weight', '7.5 kg + 0.7 kg tribrach'],
    ],
    project: { text: 'Site C slope monitoring: terrestrial scanning and prism-based monitoring with the SX10.', label: 'underhill.ca: Site C slope monitoring', href: `${UH}/site-c-hydroelectric-dam-slope-monitoring/` },
  },
  'trinity-f90': {
    what: 'A fixed-wing drone that takes off and lands like a helicopter, then flies long lines like a plane: big areas in one flight.',
    specs: [
      ['Flight time', '90+ min, cruise 17 m/s'],
      ['Wingspan', '2.394 m; max take-off 5.0 kg'],
      ['Camera', 'Sony UMC-R10C, 20.1 MP APS-C'],
      ['Positioning', 'RTK / PPK, planned in QBase 3D'],
    ],
    project: { text: 'Site C slope monitoring: large-area photogrammetry with the Trinity F90+ and the UMC-R10C.', label: 'underhill.ca: Site C slope monitoring', href: `${UH}/site-c-hydroelectric-dam-slope-monitoring/` },
  },
  'navvis-vlx': {
    what: 'A LiDAR scanner worn like a backpack. The crew walks the building and SLAM software stitches the walk into a point cloud.',
    specs: [
      ['LiDAR', '2 × 32-layer, about 1.28 M points/s each, 50 m range'],
      ['Cameras', '4 × 20 MP fisheye'],
      ['Weight', '8.5 kg with two batteries'],
      ['Battery', 'About 1.5 h per set, hot-swappable'],
    ],
    project: { text: 'Construction & Engineering: worn on a Vancouver high-rise deck for mobile LiDAR.', label: 'Underhill Construction & Engineering sheet (PDF)', href: `${UH}/wp-content/uploads/2026/04/Underhill-Construction-Engineering-Feature-Sheet-v2.pdf` },
    assumed: 'Generation assumed: VLX 3.',
  },
  'leica-p50': {
    what: 'A long-range terrestrial laser scanner: millions of points from each setup, registered together into one model.',
    specs: [
      ['Range', 'Beyond 1 km'],
      ['Speed', 'Up to 1 M points/s'],
      ['Weight', '12.25 kg without batteries'],
      ['Levelling', 'Dual-axis compensator'],
    ],
    project: { text: 'Laser scanning and reality capture with Leica, Trimble and FARO scanners.', label: 'underhill.ca: Laser scanning', href: `${UH}/geospatial-services/3d-laser-scanning-reality-capture/` },
    assumed: 'Model assumed: Underhill names Leica P-series scanners without a model number.',
  },
  'hydrone-usv': {
    what: 'A remote-controlled survey boat with a multibeam sonar that maps riverbeds and harbour floors in swaths.',
    specs: [
      ['Multibeam', 'SeaRAY: up to 130° swath, 256 beams'],
      ['Speed', 'About 2 kn surveying, 4 kn top'],
      ['Range', 'About 1 km by remote'],
      ['Hull', '1.24 × 0.74 m, 9.8 kg (HyDrone 4.5)'],
    ],
    project: { text: 'Dawson City flood mapping, June to October 2024: the SeaRAY multibeam on the HyDrone.', label: 'underhill.ca: Dawson City flood mapping', href: `${UH}/dawson-city-flood-mapping/` },
    assumed: 'Underhill\'s photographed unit is an older black hull; figures are for today\'s HyDrone 4.5.',
  },
  'at403-tracker': {
    what: 'A laser tracker: it follows a reflector ball to a few hundredths of a millimetre, for aligning turbines and machinery.',
    specs: [
      ['Accuracy', 'About ±15 µm + 6 µm/m'],
      ['Range', '320 m measurement volume (diameter)'],
      ['Weight', '7.3 kg sensor'],
      ['Rating', 'IP54, −15 to 45 °C'],
    ],
    project: { text: 'Laser tracker work with Hexagon SpatialAnalyzer: turbine alignment and penstock surveys.', label: 'Underhill AT403 sheet (PDF)', href: `${UH}/wp-content/uploads/2025/11/underhill-laser-tracker-sheet-leica-at403-v2.pdf` },
  },
  'prism360-senceive': {
    what: 'Survey prisms that a robotic total station reads on a schedule, plus wireless tilt sensors that report movement in real time.',
    specs: [
      ['Prism', 'Leica 360°, constant +23.1 mm, ATR to about 600 m'],
      ['Tilt resolution', '0.0001°'],
      ['Node battery', '12–15 years; mesh up to 300 m'],
      ['Node', '90 × 90 × 60 mm, 0.6 kg'],
    ],
    project: { text: 'Robert Campbell Bridge, Whitehorse: a real-time monitoring system of survey prisms and Senceive tilt sensors.', label: 'underhill.ca: Robert Campbell Bridge', href: `${UH}/robert-campbell-bridge-monitoring-whitehorse/` },
    assumed: 'Models assumed: Leica GRZ4 prism, Senceive FlatMesh triaxial node.',
  },
  'phantom4-rtk': {
    what: 'A compact RTK mapping drone for small sites: volumes, progress and quick topography.',
    specs: [
      ['Camera', '1-inch 20 MP, mechanical shutter'],
      ['Flight time', 'About 30 min'],
      ['Weight', '1391 g take-off'],
      ['Size', '350 mm diagonal'],
    ],
    project: { text: 'Listed in Underhill\'s drone fleet for aerial surveys.', label: 'Underhill Aerial Surveys sheet (PDF)', href: `${UH}/wp-content/uploads/2026/04/Underhill-Aerial-Surveys-Feature-Sheet-v3.pdf` },
  },
  mavic3e: {
    what: 'A folding drone that fits a backpack: site photos, progress maps and inspections in minutes.',
    specs: [
      ['Cameras', '4/3 CMOS 20 MP wide + 12 MP tele, up to 56× hybrid zoom'],
      ['Weight', '915 g'],
      ['Folded', '221 × 96.3 × 90.3 mm'],
      ['RTK', 'Optional module on top'],
    ],
    project: { text: 'Listed in Underhill\'s drone fleet for aerial surveys.', label: 'Underhill Aerial Surveys sheet (PDF)', href: `${UH}/wp-content/uploads/2026/04/Underhill-Aerial-Surveys-Feature-Sheet-v3.pdf` },
  },
  'gedo-trolley': {
    what: 'A trolley pushed along the rails. It measures gauge and cant while a total station tracks its prism for position.',
    specs: [
      ['Gauge', '±0.3 mm (range −20 to +60 mm)'],
      ['Cant', '±0.5 mm (±10°)'],
      ['Track gauges', '1000–1668 mm'],
      ['Weight', '16.0 kg; over 12 h on two batteries'],
    ],
    project: { text: 'Broadway Subway: the GEDO trolley system for high-precision rail measurement, with shim analysis for final rail positioning.', label: 'underhill.ca: Broadway Subway', href: `${UH}/broadway-subway-project/` },
  },
  'digital-level-staff': {
    what: 'A digital level reads a barcode staff and gives heights to a fraction of a millimetre, for benchmarks and settlement.',
    specs: [
      ['Accuracy', '0.2–0.3 mm/km double-run'],
      ['Focus', 'Motorised autofocus, built-in camera'],
      ['Weight', '3.9 kg with battery'],
      ['Staff', '4 m telescopic barcode staff'],
    ],
    project: { text: 'Construction elevations and benchmarks: levels are standard kit on Underhill crews.', label: 'underhill.ca: Construction & Engineering Surveys', href: `${UH}/geospatial-services/construction-surveying/` },
    assumed: 'Model assumed: Leica LS15 class (it could be a Trimble DiNi).',
  },
  'sontek-m9': {
    what: 'An acoustic Doppler current profiler: towed across a river, it measures water speed in layers and the total flow.',
    specs: [
      ['Transducers', '9: two 4-beam Janus sets (3.0 / 1.0 MHz) + a 0.5 MHz vertical beam'],
      ['Depth', '0.2–80 m'],
      ['Profiling', 'To about 30 m'],
      ['Weight', '2.3 kg in air'],
    ],
    project: { text: 'Dawson City flood mapping: ADCP flow measurements with the SonTek RiverSurveyor M9.', label: 'underhill.ca: Dawson City flood mapping', href: `${UH}/dawson-city-flood-mapping/` },
  },
  'matterport-pro3': {
    what: 'A 360° LiDAR camera on a tripod: room-by-room scans become a walk-through digital twin.',
    specs: [
      ['LiDAR', 'To about 100 m'],
      ['Camera', '20 MP'],
      ['Weight', 'About 2.2 kg'],
      ['Size', '181 × 161.4 × 76 mm'],
    ],
    project: { text: 'Construction & Engineering: 360-degree cameras and Matterport for digital twins and progress.', label: 'Underhill Construction & Engineering sheet (PDF)', href: `${UH}/wp-content/uploads/2026/04/Underhill-Construction-Engineering-Feature-Sheet-v2.pdf` },
    assumed: 'Model assumed: Matterport Pro3.',
  },
  'zenith-plummet': {
    what: 'Shoots a true vertical laser line up through holes in the floor slabs, carrying survey control up a tower.',
    specs: [
      ['Accuracy', 'About 1.0 mm at 1.5 m (reference product)'],
      ['Beam', 'Red, 635 nm'],
      ['Check', '4-position rotation: 0°, 90°, 180°, 270°'],
    ],
    project: { text: 'Construction & Engineering: building and gridline layout on tower projects.', label: 'underhill.ca: Construction & Engineering Surveys', href: `${UH}/geospatial-services/construction-surveying/` },
    assumed: 'Generic unit: Underhill\'s exact plummet is not documented.',
  },
  'gcp-target': {
    what: 'Checkered targets with surveyed centres. They tie every drone photo to real coordinates and prove the result.',
    specs: [
      ['Portable target', '600 × 600 mm, 2 × 2 checker, centre nail'],
      ['Measured with', 'R12i RTK, averaged'],
      ['Site C network', 'Over 1,000 permanent targets'],
    ],
    project: { text: 'Site C: an established network of over 1,000 permanent targets for RTK-enabled flights with many checks.', label: 'underhill.ca: Site C slope monitoring', href: `${UH}/site-c-hydroelectric-dam-slope-monitoring/` },
    assumed: 'Target design assumed: a generic 2 × 2 checker.',
  },
});

export const factsFor = (id) => FACTS[id] || null;
