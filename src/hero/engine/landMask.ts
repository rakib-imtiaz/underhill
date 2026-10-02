/**
 * Land/ocean mask rasterised at runtime from Natural Earth vector coastlines (world-atlas
 * topojson) — data, not a picture. Channel R = land, G = land inside the service region.
 */
import * as THREE from 'three'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import landTopo from 'world-atlas/land-50m.json'
import { REGION } from './geo'

export type LandMask = {
  texture: THREE.DataTexture
  isLand: (lat: number, lon: number) => boolean
  dispose: () => void
}

type Ring = number[][]

export function buildLandMask(width: number): LandMask {
  const W = width, Hh = width / 2
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>
  const geo = feature(topo, topo.objects.land) as unknown as {
    features: { geometry: { type: string; coordinates: Ring[] | Ring[][] } }[]
  }

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = Hh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const px = (lon: number) => ((lon + 180) / 360) * W
  const py = (lat: number) => ((90 - lat) / 180) * Hh

  const drawRing = (ring: Ring) => {
    // unwrap longitudes so antimeridian-crossing rings don't streak across the map
    let prev = ring[0][0]
    let off = 0
    ctx.moveTo(px(ring[0][0]), py(ring[0][1]))
    for (let i = 1; i < ring.length; i++) {
      let lon = ring[i][0] + off
      if (lon - prev > 180) { off -= 360; lon -= 360 } else if (lon - prev < -180) { off += 360; lon += 360 }
      prev = lon
      ctx.lineTo(px(lon), py(ring[i][1]))
    }
    ctx.closePath()
  }

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, Hh)
  ctx.fillStyle = '#fff'
  for (const f of geo.features) {
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][])
    for (const poly of polys) {
      ctx.beginPath()
      for (const ring of poly) drawRing(ring)
      ctx.fill('evenodd')
    }
  }
  const land = ctx.getImageData(0, 0, W, Hh).data

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, Hh)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  drawRing(REGION)
  ctx.fill()
  const region = ctx.getImageData(0, 0, W, Hh).data

  const data = new Uint8Array(W * Hh * 4)
  const landBits = new Uint8Array(W * Hh)
  for (let i = 0, j = 0; i < W * Hh; i++, j += 4) {
    const l = land[j]
    data[j] = l
    data[j + 1] = (l * region[j]) / 255
    data[j + 3] = 255
    landBits[i] = l > 127 ? 1 : 0
  }
  canvas.width = canvas.height = 1 // release the backing store

  const texture = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.flipY = false
  texture.needsUpdate = true

  return {
    texture,
    isLand: (lat, lon) => {
      const x = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)))
      const y = Math.min(Hh - 1, Math.max(0, Math.floor(((90 - lat) / 180) * Hh)))
      return landBits[y * W + x] === 1
    },
    dispose: () => texture.dispose(),
  }
}
