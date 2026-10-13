// Underhill v2 — gear playground: the mission scripts, one per piece of kit (keyed by the kit-data id).
// Plain data, no DOM. Each script follows that gear's "Operating sequence in the field" in
// prompts/GEAR-REFERENCE-PROMPTS.md, cut down to 3–6 steps a visitor can do in a minute or two.
//
// Shape:
//   MISSIONS[id] = {
//     title:   string   what the mission is ("Set up a base and stake a corner")
//     summary: string   one line under the title
//     steps: [{
//       id:          string   stable key (rigs switch on it)
//       title:       string   short imperative ("Level the antenna")
//       instruction: string   what to do now (≤ ~90 characters: it fits 2 lines on a phone)
//       crewNote:    string   "What the crew does": the real-world practice behind the step
//       interaction: 'drag-bubble' | 'aim' | 'hold' | 'tap-target' | 'wait' | 'gesture' | 'info'
//       successText: string   shown when the step is done
//       diagram:     string   key of the step's line drawing (js/gear/diagrams.js) for the
//                             "How the crew uses it" list shown while the model is in production
//       widget?:     string   the step card's widget when the mission is interactive
//                             (vial | dials | plummet | skyplot | hold | bullseye | reticle | compute |
//                             track | taps | swipe | rotate | grid); omitted → chosen from interaction
//       target?:     string   'tap-target' on a generic model: the node-name pattern (RegExp source)
//                             to tap, e.g. '^arm-' (any part when omitted)
//       count?:      number   'tap-target': taps needed (default 1)
//       seconds?:    number   'wait' / 'hold' length (defaults 4 s / 1.2 s)
//     }],
//   }
//
// Interactions, as the generic runner (js/gear/mission.js) plays them for a model with no rig:
//   drag-bubble  drag a bubble (or dials) into the centre ring       aim   drag on the 3D view onto a target
//   hold         press and hold a button until the ring fills       wait  watch the progress complete
//   tap-target   tap the named part(s) on the model                  gesture  drag round the ring once
//   info         read, then continue
// The three gears with a model today (r12i-tsc7, s7-robotic, m350-mapper) have rigs
// (js/gear/rigs/*.js) that add the real behaviour: tilting antenna, PiP telescope, LaserShot, folding
// arms, the RTK skyplot, the stake-out game and the grid planner.

const s = (id, title, instruction, crewNote, interaction, successText, diagram, extra = {}) =>
  Object.freeze({ id, title, instruction, crewNote, interaction, successText, diagram, ...extra });

export const MISSIONS = Object.freeze({
  /* ---------------------------------------------------------------------- ready: GNSS */
  'r12i-tsc7': {
    title: 'Set up a base and stake a corner',
    summary: 'Over control, level, RTK fix, a check shot, then a lot corner to 2 cm.',
    steps: [
      s('setup', 'Set up over the nail', 'Drag the tripod until the laser plummet dot sits on the control nail.',
        'Legs stamped in, head roughly level, the plummet on CP-01\'s nail.', 'aim', 'Centred on CP-01.', 'tripod', { widget: 'plummet' }),
      s('level', 'Level the antenna', 'Drag the bubble into the ring. The antenna tilts with it.',
        'Foot screws on the tribrach until the bubble sits in the ring.', 'drag-bubble', 'Level. The antenna is plumb over the nail.', 'level', { widget: 'vial' }),
      s('rtk', 'Wait for an RTK fix', 'Satellites come in; the solution goes Autonomous, Float, then Fixed.',
        'The R10 base broadcasts corrections by UHF radio; the rovers listen.', 'wait', 'RTK fixed.', 'sky', { widget: 'skyplot', seconds: 6 }),
      s('store', 'Store the point', 'Press and hold Measure while the receiver averages.',
        'Always a check shot on known control before any new work.', 'hold', 'Stored. The check is inside 1 cm.', 'measure', { widget: 'hold', seconds: 1.4 }),
      s('stake', 'Stake out PIN-07', 'Move the rover to the design point. Get within 2 cm.',
        'Follow the TSC7 arrows, drive the iron pin, set orange lath and flagging.', 'aim', 'Within 2 cm. Pin driven, lath set.', 'stake', { widget: 'bullseye' }),
    ],
  },
  /* ------------------------------------------------------------- ready: total station */
  's7-robotic': {
    title: 'Set up, measure, then let it follow',
    summary: 'Level, backsight, foresight, fire the EDM, compute, then robotic tracking.',
    steps: [
      s('level', 'Level the instrument', 'Turn the foot-screw dials to centre the electronic bubble.',
        'Screws A and B together move the bubble across; screw C moves it along.', 'drag-bubble', 'Level: inside 10″ on both axes.', 'level', { widget: 'dials' }),
      s('backsight', 'Sight the backsight', 'Drag to turn and tilt the telescope onto BS-02, then set it.',
        'A known backsight gives the station its zero direction.', 'aim', 'Backsight set on BS-02.', 'aim', { widget: 'reticle' }),
      s('foresight', 'Sight the prism', 'Turn to the 360 prism on the pole and centre the crosshair.',
        'The rod person holds the pole plumb, its bubble centred.', 'aim', 'On the prism.', 'prism', { widget: 'reticle' }),
      s('edm', 'Fire the EDM', 'Press and hold Measure to send the laser to the prism.',
        'Slope distance plus both angles in about a second.', 'hold', 'Measured.', 'beam', { widget: 'hold', seconds: 0.9 }),
      s('compute', 'Compute the point', 'Angles, distance and the station coordinates give the point.',
        'The TSC7 reduces it instantly; the crew checks the heights.', 'info', 'PR-1 stored.', 'measure', { widget: 'compute' }),
      s('robotic', 'Go robotic', 'Start Autolock and watch it follow the walking prism.',
        'One surveyor: the pole person stakes while the instrument tracks.', 'wait', 'Tracked the whole line.', 'track', { widget: 'track', seconds: 8 }),
    ],
  },
  /* --------------------------------------------------------------------- ready: drone */
  'm350-mapper': {
    title: 'Pre-flight and plan a LiDAR grid',
    summary: 'Arms, payload, batteries, compass, RTK, then a grid you can fly.',
    steps: [
      s('unfold', 'Unfold the arms', 'Tap each folded arm to swing it out and lock it.',
        'Arms out, sleeves locked, masts up, propellers unfolded.', 'tap-target', 'All four arms locked; props out.', 'unfold', { widget: 'taps', target: '^arm-(fl|fr|rl|rr)$', count: 4 }),
      s('payload', 'Mount the Mapper+', 'Swipe up to push the LiDAR onto the Skyport and twist it home.',
        'Power off for payload swaps; it clicks when locked.', 'gesture', 'Mapper+ locked on the Skyport.', 'mount', { widget: 'swipe' }),
      s('power', 'Batteries in, power on', 'Tap each TB65 slot to slide a battery in.',
        'Two hot-swap TB65s; the lights run through their check.', 'tap-target', 'Both batteries in. Systems check OK.', 'power', { widget: 'taps', target: '^body-battery-(l|r)$', count: 2 }),
      s('compass', 'Calibrate the compass', 'Turn the aircraft a full circle: drag round the ring.',
        'Away from steel and the truck; horizontal first, then nose down.', 'gesture', 'Compass calibrated.', 'calibrate', { widget: 'rotate' }),
      s('rtk', 'Wait for RTK FIX', 'Satellites lock and the base corrections arrive.',
        'D-RTK 2, or NTRIP from the Trimble R10 base.', 'wait', 'RTK FIX.', 'sky', { widget: 'skyplot', seconds: 5 }),
      s('plan', 'Plan the grid', 'Drag the box over the parcel. Pick the altitude and the overlap.',
        'LiDAR: 60–100 m with 50 % side overlap. Photos: 70/80 %.', 'info', 'Mission saved.', 'grid', { widget: 'grid' }),
    ],
  },

  /* ------------------------------------------------------------ awaiting their models */
  sx10: {
    title: 'Scan a slope from one setup',
    summary: 'Set up, level, backsight, panorama, scan, prisms.',
    steps: [
      s('setup', 'Set up over the mark', 'Stamp the yellow tripod in over the control mark; lift the SX10 onto the tribrach.',
        'Carried from the truck in its yellow backpack case.', 'aim', 'On the tribrach, clamp locked.', 'tripod'),
      s('level', 'Centre and level', 'Centre on the mark with the video plummet; level with the three foot screws.',
        'The electronic bubble shows on the TSC7.', 'drag-bubble', 'Level and centred.', 'level'),
      s('backsight', 'Backsight', 'Turn to the known prism, fire the EDM and check the residuals.',
        'Station and instrument height go into Trimble Access first.', 'aim', 'Backsight checked.', 'aim'),
      s('pano', 'Panorama', 'Capture a full-dome panorama.',
        'About 3 minutes; it becomes the canvas for picking the scan area.', 'wait', 'Panorama captured.', 'pano', { seconds: 4 }),
      s('scan', 'Scan the slope', 'Draw the scan area, pick a density and start the scan.',
        'For example 12.5 mm at 50 m: the drum spins as the alidade steps round.', 'tap-target', 'Scan running.', 'scan'),
      s('prisms', 'Prisms and close', 'Measure the monitoring prisms, re-check the backsight, pack up.',
        'Site C: scans and prisms, tied to one control network.', 'hold', 'Backsight closes. Packed.', 'prism'),
    ],
  },
  'trinity-f90': {
    title: 'Map a big block with a VTOL',
    summary: 'Assemble, plan, check, take off, fly the lines, land.',
    steps: [
      s('assemble', 'Assemble', 'Plug both wings on, insert the battery and fit the camera in the belly bay.',
        'Everything travels in one flat case.', 'tap-target', 'Wings locked, camera in.', 'assemble', { count: 3 }),
      s('plan', 'Plan the block', 'In QBase 3D: area, 2.5 cm GSD, 70/80 % overlap, terrain following.',
        'An R10 base on site for RTK / PPK.', 'info', 'Block planned.', 'grid'),
      s('check', 'Pre-flight', 'Check the control surfaces, compass, GNSS and the wind.',
        'Stay inside the published wind limit.', 'gesture', 'All green.', 'calibrate'),
      s('takeoff', 'Take off and transition', 'Lift off on three rotors, then the front rotors tilt forward.',
        'It cruises on the rear motor at about 17 m/s.', 'hold', 'In cruise.', 'vtol'),
      s('lines', 'Fly the lines', 'The lawnmower lines fly themselves; the camera fires on overlap.',
        '90+ minutes of flight covers a whole corridor.', 'wait', 'Block complete.', 'fly', { seconds: 4 }),
      s('land', 'Land and process', 'Transition back, land on the skid, then PPK and Metashape.',
        'Ground targets are the independent check.', 'info', 'Orthomosaic and DEM ready.', 'process'),
    ],
  },
  'navvis-vlx': {
    title: 'Walk a floor with SLAM',
    summary: 'Boot, wear it, initialise, walk loops, upload.',
    steps: [
      s('boot', 'Boot on the stand', 'Stand it up, insert both batteries and boot it.',
        'Batteries are hot-swappable for long days.', 'tap-target', 'Booted.', 'power', { count: 2 }),
      s('wear', 'Put it on', 'With a partner, put on the harness, set the height and buckle the belt.',
        'Comfort matters: a walk can take an hour.', 'info', 'Fitted.', 'walk'),
      s('init', 'Initialise', 'Start a dataset and stand still while it initialises.',
        'Still means still: the SLAM needs a clean start.', 'wait', 'Initialised.', 'sky', { seconds: 3 }),
      s('walk', 'Walk loops', 'Normal pace, close every loop, slow through doors, pass the checkerboards.',
        'Checkerboards tie the walk to site control.', 'aim', 'Loops closed.', 'walk'),
      s('upload', 'Upload', 'Stop the dataset, back on the stand, upload for registration.',
        'Processed and registered into one point cloud.', 'info', 'Uploaded.', 'process'),
    ],
  },
  'leica-p50': {
    title: 'Scan a structure in stations',
    summary: 'Level, targets, scan, move, register.',
    steps: [
      s('setup', 'Set up and level', 'Tripod and tribrach over the station; level with the compensator.',
        'A dual-axis compensator keeps every scan plumb.', 'drag-bubble', 'Level.', 'tripod'),
      s('targets', 'Place targets', 'Set checkerboards and spheres where two stations can see them.',
        'Common targets are how the scans line up later.', 'tap-target', 'Targets placed.', 'target', { count: 3 }),
      s('scan', 'Scan', 'Pick resolution and quality; the head turns 360° as the mirror spins.',
        'HDR images colour the points.', 'wait', 'Scan done.', 'scan', { seconds: 4 }),
      s('move', 'Next station', 'Acquire the targets, then move on with overlap.',
        'Overlap between stations keeps registration tight.', 'aim', 'Station 2 set.', 'stations'),
      s('register', 'Register', 'Register the stations in Cyclone and check the errors.',
        'Errors under a few millimetres sign the job off.', 'info', 'Registered.', 'process'),
    ],
  },
  'hydrone-usv': {
    title: 'Map a river channel',
    summary: 'Assemble, calibrate, RTK, run lines, flow transects.',
    steps: [
      s('assemble', 'Assemble', 'On the gravel bar: sonar head through the hull well, GNSS mast, batteries.',
        'Small enough for two people to launch from shore.', 'tap-target', 'Assembled.', 'assemble', { count: 3 }),
      s('calibrate', 'Calibrate', 'Sound-velocity cast, then a patch test over a feature.',
        'Roll, pitch, yaw and latency, solved before real data.', 'gesture', 'Calibrated.', 'calibrate'),
      s('rtk', 'RTK check', 'Get RTK and check it on a known point on shore.',
        'Daily check-ins by inReach on remote rivers.', 'wait', 'RTK checked.', 'sky', { seconds: 3 }),
      s('lines', 'Survey lines', 'Drive the lines at about 2 knots, watching coverage in HYPACK.',
        'Line spacing keeps the swaths overlapping.', 'aim', 'Coverage complete.', 'boat'),
      s('flow', 'Flow transects', 'For flow: tether it on a tagline and pull it across the channel.',
        'The ADCP rides along for discharge.', 'hold', 'Transect done.', 'flow'),
      s('process', 'Process', 'Recover, rinse, pack; process in HYPACK with water levels.',
        'Water-level corrections turn depths into elevations.', 'info', 'Surface ready.', 'process'),
    ],
  },
  'at403-tracker': {
    title: 'Align a turbine to design',
    summary: 'Warm up, level, lock on, measure nests, compare.',
    steps: [
      s('warm', 'Warm up', 'Set the stand on a stable floor, mount the tracker and let it warm up.',
        'A stable instrument is a stable answer.', 'wait', 'Warm and stable.', 'tracker', { seconds: 3 }),
      s('level', 'Level and connect', 'Level it and connect SpatialAnalyzer over WiFi.',
        'The software drives the whole measurement.', 'drag-bubble', 'Connected.', 'level'),
      s('lock', 'Lock on', 'Home the reflector in the birdbath and lock on.',
        'PowerLock finds the reflector again if the beam breaks.', 'hold', 'Locked.', 'nest'),
      s('nests', 'Measure the nests', 'Carry the reflector to each nest on the flange; run drift checks.',
        'Every nest, then the birdbath again for drift.', 'tap-target', 'All nests measured.', 'nest', { count: 4 }),
      s('compare', 'Compare to design', 'Build the alignment, compare with CAD and report deviations.',
        'Residuals in hundredths of a millimetre.', 'info', 'Report out.', 'process'),
    ],
  },
  'prism360-senceive': {
    title: 'Watch a bridge',
    summary: 'Install, learn, mesh, schedule, verify.',
    steps: [
      s('install', 'Install', 'Bolt prisms and tilt nodes to the piers and girders.',
        'Drill, anchor, bracket: they stay for years.', 'tap-target', 'Installed.', 'bridge', { count: 2 }),
      s('learn', 'Learn the prisms', 'Set the robotic total station on a stable pillar and learn each prism.',
        'The first cycle is the baseline.', 'aim', 'Prisms learned.', 'beam'),
      s('mesh', 'Join the mesh', 'The tilt nodes join the mesh and report through a cellular gateway.',
        'Batteries last 12–15 years.', 'wait', 'Mesh online.', 'sky', { seconds: 3 }),
      s('schedule', 'Schedule', 'Set the automatic cycles; readings stream to the dashboard with alarms.',
        'Real-time, daily, weekly or monthly.', 'info', 'Monitoring live.', 'alarm'),
      s('verify', 'Verify', 'Field-verify any alarm with a manual round of measurements.',
        'An alarm is checked by people before anyone acts.', 'hold', 'Verified.', 'measure'),
    ],
  },
  'phantom4-rtk': {
    title: 'Map a small site',
    summary: 'Props, RTK, plan, fly, process.',
    steps: [
      s('props', 'Props and battery', 'Fit each prop on its matching motor and insert the battery.',
        'Black-ring props on the black-ring motors.', 'tap-target', 'Ready.', 'unfold', { count: 2 }),
      s('rtk', 'RTK', 'Power on and connect RTK, network or D-RTK 2.',
        'RTK cuts the ground control needed.', 'wait', 'RTK fixed.', 'sky', { seconds: 3 }),
      s('plan', 'Plan the block', 'Altitude, 80/70 % overlap, camera pointing straight down.',
        'Small sites: volumes, progress, quick topo.', 'info', 'Planned.', 'grid'),
      s('fly', 'Fly', 'The block flies itself, then lands.',
        'About 30 minutes a battery.', 'wait', 'Landed.', 'fly', { seconds: 4 }),
      s('process', 'Process', 'Process with ground-control check points.',
        'Check points prove the accuracy.', 'info', 'Model ready.', 'process'),
    ],
  },
  mavic3e: {
    title: 'A quick progress flight',
    summary: 'Unfold, RTK, fly, pack.',
    steps: [
      s('unfold', 'Unfold', 'Front arms, then rear arms; take the gimbal cover off.',
        'Out of the backpack and flying in minutes.', 'tap-target', 'Unfolded.', 'unfold', { count: 2 }),
      s('rtk', 'RTK', 'Power on; connect RTK if the module is fitted.',
        'The module mounts on top.', 'wait', 'Connected.', 'sky', { seconds: 3 }),
      s('fly', 'Fly', 'A manual inspection or an automated mapping block.',
        '56× zoom for a close look from a safe distance.', 'aim', 'Captured.', 'fly'),
      s('pack', 'Pack', 'Land, fold rear then front, refit the gimbal cover.',
        'The reverse of unfolding.', 'info', 'Packed.', 'pack'),
    ],
  },
  'gedo-trolley': {
    title: 'Check the track',
    summary: 'Assemble, prism, free-station, push, report.',
    steps: [
      s('assemble', 'Assemble on the track', 'Join the beam halves on the rails and lock the centre screw.',
        'eRailSafe briefing before anyone steps on the track.', 'tap-target', 'Locked on the rails.', 'rails'),
      s('prism', 'Prism and controller', 'Mount the 360 prism and clip the controller into the handle.',
        'The prism is what the total station follows.', 'tap-target', 'Ready to roll.', 'prism'),
      s('station', 'Free-station', 'Set up the total station from the track control points.',
        'Resection to the control along the line.', 'aim', 'Station set.', 'beam'),
      s('push', 'Push and measure', 'Walk it along, stopping at each point while the station tracks.',
        'Gauge and cant come from the trolley, position from the prism.', 'hold', 'Line measured.', 'rails'),
      s('report', 'Report', 'Gauge, cant and position against design; export the shim report.',
        'Broadway Subway: shim analysis for final rail positioning.', 'info', 'Shim report out.', 'alarm'),
    ],
  },
  'digital-level-staff': {
    title: 'Run a level loop',
    summary: 'Set up, staff, backsight, foresight, close.',
    steps: [
      s('setup', 'Set up', 'Set the tripod and centre the circular bubble with the foot screws.',
        'The compensator does the fine levelling.', 'drag-bubble', 'Level.', 'level'),
      s('staff', 'Staff on the benchmark', 'The staff person holds the barcode staff plumb on the benchmark.',
        'A bubble on the staff keeps it plumb.', 'aim', 'Staff plumb.', 'staff'),
      s('bs', 'Backsight', 'Aim, focus and press measure: the level reads the barcode.',
        'Height and distance in one reading.', 'hold', 'Backsight read.', 'staff'),
      s('fs', 'Round the loop', 'Foresight a turning point, move up, repeat.',
        'Equal backsight and foresight lengths cancel errors.', 'tap-target', 'Loop run.', 'stations', { count: 3 }),
      s('close', 'Close', 'Close on the benchmark and check the misclosure.',
        'Inside tolerance, or run it again.', 'info', 'Closed inside tolerance.', 'measure'),
    ],
  },
  'sontek-m9': {
    title: "Measure a river's flow",
    summary: 'Mount, calibrate, transect, repeat, process.',
    steps: [
      s('mount', 'Mount', "Mount the M9 through the boat's well, face down; connect power and GPS.",
        'On the tethered boat for small channels.', 'tap-target', 'Mounted.', 'mount'),
      s('calibrate', 'Calibrate', 'Run the compass calibration and a moving-bed test.',
        'A moving bed would bias the flow.', 'gesture', 'Calibrated.', 'calibrate'),
      s('transect', 'Transect', 'Tow it bank to bank on a tagline at a slow, even speed.',
        'Slow and steady gives clean profiles.', 'hold', 'Transect done.', 'flow'),
      s('repeat', 'Repeat', 'Four or more transects, until the discharges agree.',
        'Agreement is the quality check.', 'wait', 'Discharges agree.', 'alarm', { seconds: 4 }),
      s('process', 'Process', 'Process in RiverSurveyor Live.',
        'Discharge for the flood model.', 'info', 'Done.', 'process'),
    ],
  },
  'matterport-pro3': {
    title: 'Capture a digital twin',
    summary: 'Mount, scan, move, upload.',
    steps: [
      s('mount', 'Mount', 'On the tripod at chest height; pair with the capture app.',
        'Chest height gives a natural walk-through view.', 'tap-target', 'Paired.', 'tripod'),
      s('scan', 'Scan', 'The camera turns 360° while the LiDAR sweeps.',
        'Under a minute a scan.', 'wait', 'Scan done.', 'pano', { seconds: 3 }),
      s('move', 'Move and repeat', 'Move 2–3 m with overlap and scan again, room by room.',
        'Overlap lets the scans join up.', 'aim', 'Rooms covered.', 'stations'),
      s('upload', 'Upload', 'Upload to build the digital twin.',
        'Owners and designers walk it online.', 'info', 'Twin built.', 'process'),
    ],
  },
  'zenith-plummet': {
    title: 'Carry control up a floor',
    summary: 'Set up, beam up, four positions, transfer.',
    steps: [
      s('setup', 'Set up', 'Over the control mark on the lower floor; level the vial.',
        'Through the plumb hole in the slab.', 'drag-bubble', 'Level.', 'level'),
      s('beam', 'Beam up', 'Switch on: the beam rises through the hole to a grid target above.',
        'A partner reads the target upstairs.', 'hold', 'Dot on the target.', 'plumb'),
      s('quad', 'Four positions', 'Rotate to 0°, 90°, 180° and 270°; mark the mean of the four dots.',
        'The mean cancels the instrument\'s own error.', 'gesture', 'Mean marked.', 'calibrate'),
      s('transfer', 'Transfer', 'Transfer the point to the new floor; repeat for the other control.',
        'Gridlines go up with the building.', 'info', 'Control transferred.', 'plumb'),
    ],
  },
  'gcp-target': {
    title: 'Tie the photos to the ground',
    summary: 'Lay out, measure, fly, check.',
    steps: [
      s('lay', 'Lay out', 'Lay the target flat in the open, away from shadows; pin the corners.',
        'Site C has over 1,000 permanent targets already.', 'tap-target', 'Pinned.', 'target', { count: 4 }),
      s('measure', 'Measure', 'Measure the centre nail with the R12i, averaged; record its ID.',
        'RTK, averaged, with the ID on a photo.', 'hold', 'Measured.', 'sky'),
      s('fly', 'Fly', 'Fly the mission over the targets.',
        'Targets show up in several photos each.', 'wait', 'Flown.', 'fly', { seconds: 3 }),
      s('check', 'Check', 'Find the centres in the images; use them as control or check points.',
        'Check points prove the map is where it says.', 'info', 'Checked.', 'process'),
    ],
  },
});

export const missionFor = (id) => MISSIONS[id] || null;
