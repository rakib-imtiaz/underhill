// Adapter — GNSS base station, Build B (threejs-object-sculptor).
// Model: ../../lib/gnss/createGnssTripodModel.js (copied from drafts/film-fly-gear/threejs-object-sculptor/gnss/src/)
import { createGnssTripodModel, poseGnssTripod, disposeGnssTripod } from '../../lib/gnss/createGnssTripodModel.js';
import { ruleOf } from './common.js';

// Its explode lifts three modules straight up the pole axis. Top first, so nothing slides into a
// part that is still seated: antenna, then pole, then the receiver.
const STAGES = [
  [/^gnss-antenna$/, 0],
  [/^range-pole$/, 1],
  [/^receiver-unit$/, 2],
];

export default {
  key: 'gnssB', object: 'gnss', build: 'B',
  async create({ mobile }) {
    // shareMaterials:false → this instance owns its materials, so the LED boost below is not compounded
    const root = createGnssTripodModel({ textureSize: 512, shareMaterials: false });   // see droneB.js
    const rt = root.userData.sculptRuntime;
    poseGnssTripod(root, { fold: 0, explode: 0 });
    root.traverse((o) => {
      if (o.isMesh && /led-cyan|led-window/.test(o.material?.name || '')) o.material.emissiveIntensity *= 1.6;
    });

    return {
      root,
      explode: (t) => poseGnssTripod(root, { fold: 0, explode: t }),
      stageOf: (o) => ruleOf(STAGES, o.name, 3),
      unitKeyOf: (o) => o.name,
      labels: [
        { id: 'dome', text: 'Antenna dome', short: 'Dome', node: 'dome-cap', dir: [0.2, 1, 0.6] },
        { id: 'led', text: 'Status LED window', short: 'LEDs', node: 'dome-band', meshes: /^led-window$/, dir: [0, 0.1, 1] },
        { id: 'pole', text: 'Range pole', short: 'Pole', node: 'range-pole', dir: [0.3, 0, 1] },
        { id: 'radio', text: 'Radio with whip antenna', short: 'Radio', node: 'receiver-box', meshes: /^receiver-shell$/, dir: [0.3, 0.2, 1] },
        { id: 'head', text: 'Tripod head', short: 'Head', node: 'tripod-head', meshes: /^head-plate$/, dir: [0.4, 0.6, 1] },
        { id: 'legs', text: 'Carbon legs & flip-lock clamps', short: 'Legs', node: 'leg-front-lever', dir: [0, 0, 1] },
        { id: 'spike', text: 'Steel spikes', short: 'Spikes', node: 'leg-front-foot', meshes: /spike/, dir: [0, 0, 1] },
      ],
      sockets: { dome: rt.nodes['gnss-antenna'] },
      pose() {},
      spin() {},
      spinning: false,
      dispose: () => disposeGnssTripod(root, { disposeMaterials: true }),
    };
  },
};
