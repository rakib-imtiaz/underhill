// Adapter — Total station (img2threejs; the only build).
// Model: ../../lib/total-station/totalStation.js (copied from drafts/film-fly-gear/img2threejs/total-station/src/)
import { createTotalStationModel } from '../../lib/total-station/totalStation.js';
import { ruleOf, boostEmissive } from './common.js';

// The instrument lifts off its tribrach first, then the handle, the covers and panels, the standards,
// the telescope and its optics. Then the tribrach, the tripod head hardware and finally the legs,
// telescoping out from the hinge to the spike. Two orderings are forced by geometry:
//  · the standards move out before the telescope rises (its trunnion axle runs through them);
//  · the objective leaves before the telescope's front plates (they sit just above/below it);
//  · the plumb screw drops before the hub above it; leg sections leave from the spike inward.
const STAGES = [
  [/^alidade$/, 0],
  [/^handleGrip$/, 1],
  [/^handle(Upright|Accent)/, 2],
  [/^(sideCover|sideKeypad|rearKeyboard|frontSensorBlock)/, 3],
  [/^(standardRight|standardLeft|baseHousing|centralBody)$/, 4],
  [/^telescope$/, 5],
  [/^(objectiveLens|eyepiece)$/, 6],
  [/^telescope(Top|Bottom)Plate$/, 7],
  [/^tribrach$/, 8],
  [/^(tribrachTop|levelScrew[ABC])$/, 9],
  [/^plumbScrew$/, 10],
  [/^headHub$/, 11],
  [/^leg(Front|RearRight|RearLeft)$/, 12],
  // each leg telescopes from its far end inward, so no section slides through one still seated
  [/Spike$/, 13],
  [/Shoe$/, 14],
  [/LowerTube$/, 15],
  [/Clamp$/, 16],
  [/(Cap|TubeA|TubeB|SlideRod)$/, 17],
];

export default {
  key: 'ts', object: 'ts', build: 'A',
  async create({ mobile, q }) {
    // the detailed build on balanced and high (it is the hero of close-ups); the light one on lite only
    // (and, without a tier, on phones)
    const low = q ? q.tier === 'lite' : mobile;
    const root = createTotalStationModel({ detail: low ? 'low' : 'high', castShadow: true });
    const ud = root.userData;
    boostEmissive(root, (m) => /screenGlass/.test(m.name), 2.5);
    const yaw0 = 28;

    return {
      root,
      explode: (t) => ud.explode(t),
      stageOf: (o) => ruleOf(STAGES, o.name, 13),
      // held at rest (found with js/debug.js): the model lifts the hinge lugs 2 cm up into the head
      // plate, and the base housing 1 cm up into the central body
      freeze: (o) => /^(hingeLugs(Front|RearRight|RearLeft)|baseHousing)$/.test(o.name),
      unitKeyOf: (o) => o.name,
      labels: [
        { id: 'handle', text: 'Carry handle', short: 'Handle', node: 'handleGrip', dir: [0.2, 1, 0.5] },
        { id: 'scope', text: 'Telescope with EDM rangefinder', short: 'Telescope', node: 'telescope', meshes: /^telescope:housing$/, dir: [-0.6, 0.4, 0.6] },
        { id: 'lens', text: 'Objective lens', short: 'Objective', node: 'objectiveLens', meshes: /^objectiveLens:frontRing$/, dir: [0, 0.6, 1] },
        { id: 'display', text: 'Display & keypad', short: 'Display', node: 'rearKeyboard', meshes: /^rearKeyboard:unit$/, dir: [0, 0.3, -1] },
        { id: 'keypad', text: 'Side keypad', short: 'Keypad', node: 'sideKeypad', meshes: /^sideKeypad:panel$/, dir: [-1, 0, 0] },
        { id: 'tribrach', text: 'Tribrach with levelling screws', short: 'Tribrach', node: 'levelScrewA', dir: [0.6, 0.3, 1] },
        { id: 'head', text: 'Tripod head', short: 'Head', node: 'tripodHead', meshes: /^tripodHead:plate$/, dir: [0.3, 0.2, 1] },
        { id: 'legs', text: 'Tripod legs & clamps', short: 'Legs', node: 'legFrontClamp', dir: [0.2, 0, 1] },
        { id: 'spike', text: 'Steel spikes', short: 'Spikes', node: 'legFrontSpike', dir: [0.3, 0, 1] },
      ],
      sockets: {
        objective: ud.sockets.lineOfSight,
      },
      /** yaw / tilt in degrees (tilt + = telescope up). */
      pose({ yaw = yaw0, tilt = 0 } = {}) {
        ud.setPose({ alidadeYaw: yaw, telescopeTilt: tilt });
      },
      spin() {},
      spinning: false,
      dispose: () => ud.dispose(),
    };
  },
};
