import { B, BLOCKS, TILE_COLS, TILE_ROWS, TILE_INSET } from './blocks.js';

export const CHUNK = 16;
export const HEIGHT = 112;
export const WATER_LEVEL = 22;
export const LANDMARK = { x: -29, z: -45 };
export const CAVE = { x: -11, y: 24, z: -12 };
const SPACING = CHUNK * CHUNK;
const SPAWN = { x: 2, z: 5, y: 39 };
const RUIN_RADIUS_X = 4;
const RUIN_RADIUS_Z = 5;
const TERRAIN_EXTENT = 128;

function hash(x, z, seed) {
  let h = Math.imul(x ^ 0x6e71513, 0x165667b1) ^ Math.imul(z, 0x27d4eb2d) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hashSeed(value) {
  let seed = 2166136261;
  for (const character of String(value ?? 'verdant')) {
    seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
  }
  return seed | 0;
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const unit = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => smooth(unit((x - a) / (b - a)));

function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const wx = smooth(x - ix), wz = smooth(z - iz);
  return lerp(
    lerp(hash(ix, iz, seed), hash(ix + 1, iz, seed), wx),
    lerp(hash(ix, iz + 1, seed), hash(ix + 1, iz + 1, seed), wx),
    wz,
  );
}

function hill(x, z, centerX, centerZ, width, length, shear = 0) {
  const dz = z - centerZ;
  return Math.exp(-(((x - centerX + shear * dz) / width) ** 2 + (dz / length) ** 2));
}

function riverX(z) {
  return 16 + 15 * Math.sin(z * 0.049) + 7 * Math.sin(z * 0.092 + 0.4);
}

function trailOffset(x, z) {
  const trailX = SPAWN.x - Math.max(0, SPAWN.z - z) * .49;
  return Math.abs(x - trailX);
}

function tileBounds(tile) {
  const col = tile % TILE_COLS, row = Math.floor(tile / TILE_COLS);
  return [
    (col + TILE_INSET) / TILE_COLS,
    1 - (row + 1 - TILE_INSET) / TILE_ROWS,
    (col + 1 - TILE_INSET) / TILE_COLS,
    1 - (row + TILE_INSET) / TILE_ROWS,
  ];
}

// Counterclockwise as seen from the outside, with an atlas tile oriented upright.
const FACES = [
  { n: [1, 0, 0], q: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: .96 },
  { n: [-1, 0, 0], q: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: .94 },
  { n: [0, 1, 0], q: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1 },
  { n: [0, -1, 0], q: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: .8 },
  { n: [0, 0, 1], q: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: .96 },
  { n: [0, 0, -1], q: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: .94 },
];

const PLANTS = new Set([B.FLOWER, B.FERN, B.MUSHROOM, B.TORCH]);
const isLight = id => Boolean(BLOCKS[id]?.light);
const AO = [1, .89, .76, .63];
const BIOMES = ['青岚谷地', '河湾湿地', '云杉高地', '白冠雪岭', '赤沙荒原', '松风林海'];
const BIOME = { VALLEY: 0, RIVER: 1, UPLAND: 2, SNOW: 3, DESERT: 4, FOREST: 5 };
const AIR = B.AIR;
const WATER = B.WATER;
const ROCK = B.STONE;
const BASEMENT = B.BEDROCK;

function meshGroup() {
  return { p: [], n: [], uv: [], c: [], i: [] };
}

function packGroup(group) {
  return {
    p: Float32Array.from(group.p), n: Float32Array.from(group.n),
    uv: Float32Array.from(group.uv), c: Float32Array.from(group.c),
    i: group.p.length / 3 > 65535 ? Uint32Array.from(group.i) : Uint16Array.from(group.i),
  };
}

function quad(group, x, y, z, points, normal, uv, shade, tint, depth = 1, opposite = false) {
  const offset = group.p.length / 3;
  for (let vertex = 0; vertex < 4; vertex++) {
    const [px, py, pz] = points[vertex];
    group.p.push(x + px, y + py * depth, z + pz);
    group.n.push(...normal);
    group.uv.push(uv[vertex === 0 || vertex === 3 ? 0 : 2], uv[vertex < 2 ? 1 : 3]);
    group.c.push(shade[vertex] * tint[0], shade[vertex] * tint[1], shade[vertex] * tint[2]);
  }
  if (shade[0] + shade[2] > shade[1] + shade[3]) {
    group.i.push(offset, offset + 1, offset + 3, offset + 1, offset + 2, offset + 3);
    if (opposite) group.i.push(offset + 3, offset + 1, offset, offset + 3, offset + 2, offset + 1);
  } else {
    group.i.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    if (opposite) group.i.push(offset + 2, offset + 1, offset, offset + 3, offset + 2, offset);
  }
}

const PLANT_PLANES = [
  [[.13, 0, .15], [.87, 0, .85], [.87, 1, .85], [.13, 1, .15]],
  [[.85, 0, .13], [.15, 0, .87], [.15, 1, .87], [.85, 1, .13]],
];
const TORCH_PLANES = [
  [[.30, 0, .30], [.70, 0, .70], [.70, 1, .70], [.30, 1, .30]],
  [[.70, 0, .30], [.30, 0, .70], [.30, 1, .70], [.70, 1, .30]],
];
const WHITE = [1, 1, 1];
const COOL = [.91, 1, 1.02];
const GOLD = [1.05, 1, .91];

export class World {
  constructor(seed, edits = {}) {
    this.seed = hashSeed(seed);
    this.edits = Object.assign(Object.create(null), edits);
    this.chunks = new Map();
    this.editIndex = new Map();
    for (const [key, id] of Object.entries(this.edits)) {
      const [x, y, z] = key.split(',').map(Number);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || !Number.isInteger(y) || y <= 0 || y >= HEIGHT || !Number.isInteger(id) || !BLOCKS[id]?.tiles) {
        delete this.edits[key];
        continue;
      }
      this.indexEdit(x, y, z, id);
    }
    this.ruinBase = this.profile(LANDMARK.x, LANDMARK.z).y;
    this.spawn = { x: SPAWN.x + .5, y: this.surface(SPAWN.x, SPAWN.z) + 1, z: SPAWN.z + .5, yaw: -.16, pitch: -.16 };
  }

  profile(x, z) {
    const seed = this.seed;
    const grain = noise(x * .121, z * .121, seed + 319) - .5;
    const folds = noise(x * .055, z * .055, seed + 719) - .5;
    const large = noise(x * .014, z * .014, seed) - .5;
    const ridgeNoise = 1 - Math.abs(noise(x * .045 + 7, z * .035, seed + 15) * 2 - 1);
    const local = 1 - smoothstep(75, TERRAIN_EXTENT, Math.hypot(x, z * .87));
    const climate = noise(x * .006, z * .006, seed + 638);
    const dry = smoothstep(.62, .84, climate);
    const drift = folds * 16;
    const west = hill(x + drift, z, -42, -39, 18, 34, .26);
    const east = hill(x + drift, z, 47, -59, 22, 49, -.21);
    const horizon = hill(x + drift, z, -18, -104, 23, 27, -.45);
    const shoulder = hill(x, z, -23, 6, 23, 22, .17);
    const profile = 31 + (west * 34 + east * 46 + horizon * 29) * (.64 + ridgeNoise * .4)
      + shoulder * 14 + folds * 7 + grain * 3;
    const basin = 29 + large * (48 - dry * 18) + folds * 13 + grain * 4
      + Math.pow(noise(x * .012, z * .012, seed + 731), 3) * (54 - dry * 27) * (.7 + ridgeNoise * .3);
    let h = lerp(basin, profile, local);

    const bankDistance = Math.abs(x - riverX(z) - folds * 4);
    const broadening = 2.5 * (1 + Math.sin(z * .068 + 1.6));
    const riverFloor = WATER_LEVEL - 4 - broadening * .24 + bankDistance * .23 + grain;
    const waterInfluence = (1 - smoothstep(4.8 + broadening, 17 + broadening, bankDistance)) * local;
    h = lerp(h, riverFloor, waterInfluence);

    const spawnDistance = Math.hypot(x - SPAWN.x, z - SPAWN.z);
    h = lerp(h, SPAWN.y, 1 - smoothstep(2, 8, spawnDistance));
    if (z >= CAVE.z - 1 && z < SPAWN.z) {
      const trailY = Math.max(CAVE.y - 1, SPAWN.y - Math.round((SPAWN.z - z) * .95));
      const strength = z < CAVE.z ? .5 : 1;
      h = lerp(h, trailY, strength * (1 - smoothstep(1, 3.8, trailOffset(x, z))));
    }
    const y = Math.max(5, Math.min(HEIGHT - 14, Math.floor(h)));
    const wet = noise(x * .021, z * .021, seed + 38);
    let biome = BIOME.VALLEY;
    if (y >= 63 - wet * 6) biome = BIOME.SNOW;
    else if (y > 47 + wet * 6) biome = BIOME.UPLAND;
    else if (y <= WATER_LEVEL + 2) biome = BIOME.RIVER;
    else if (dry > .38 && local < .4) biome = BIOME.DESERT;
    else if (wet > .57) biome = BIOME.FOREST;
    return { y, biome, wet, grain };
  }

  surface(x, z) {
    x = Math.floor(x);
    z = Math.floor(z);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (chunk) return chunk.surface[(z - cz * CHUNK) * CHUNK + x - cx * CHUNK];
    const { y } = this.profile(x, z);
    return this.ruinGround(x, z, y);
  }

  biome(x, z) {
    return BIOMES[this.profile(Math.floor(x), Math.floor(z)).biome];
  }

  ruinGround(x, z, y) {
    const dx = Math.abs(x - LANDMARK.x), dz = Math.abs(z - LANDMARK.z);
    const influence = 1 - smoothstep(1, 1.75, Math.max(dx / RUIN_RADIUS_X, dz / RUIN_RADIUS_Z));
    return Math.round(lerp(y, this.ruinBase ?? y, influence));
  }

  indexEdit(x, y, z, id) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const chunkKey = `${cx},${cz}`;
    let patch = this.editIndex.get(chunkKey);
    if (!patch) this.editIndex.set(chunkKey, patch = new Map());
    const offset = x - cx * CHUNK + (z - cz * CHUNK) * CHUNK + y * SPACING;
    patch.set(offset, id);
    return offset;
  }

  get(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0) return BASEMENT;
    if (y >= HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const { blocks } = this.getChunk(cx, cz);
    return blocks[x - cx * CHUNK + (z - cz * CHUNK) * CHUNK + y * SPACING];
  }

  set(x, y, z, id) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || !Number.isInteger(y) || y <= 0 || y >= HEIGHT || !Number.isInteger(id) || !BLOCKS[id]?.tiles) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const chunk = this.getChunk(cx, cz);
    const offset = x - cx * CHUNK + (z - cz * CHUNK) * CHUNK + y * SPACING;
    if (chunk.blocks[offset] === id) return false;
    chunk.blocks[offset] = id;
    if (isLight(id)) chunk.lights.add(offset);
    else chunk.lights.delete(offset);
    chunk.maxY = Math.max(y, chunk.maxY);
    this.edits[`${x},${y},${z}`] = id;
    this.indexEdit(x, y, z, id);
    return true;
  }

  trim(cx, cz, radius) {
    for (const [key, chunk] of this.chunks) {
      if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > radius) this.chunks.delete(key);
    }
  }

  lightNear(x, y, z, radius = 8) {
    let closest = null, minDistance = radius * radius;
    for (let cz = Math.floor((z - radius) / CHUNK); cz <= Math.floor((z + radius) / CHUNK); cz++) {
      for (let cx = Math.floor((x - radius) / CHUNK); cx <= Math.floor((x + radius) / CHUNK); cx++) {
        for (const offset of this.getChunk(cx, cz).lights) {
          const px = cx * CHUNK + offset % CHUNK;
          const py = Math.floor(offset / SPACING);
          const pz = cz * CHUNK + Math.floor((offset % SPACING) / CHUNK);
          const distance = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
          if (distance >= minDistance) continue;
          minDistance = distance;
          closest = [px, py, pz];
        }
      }
    }
    return closest;
  }

  getChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const existing = this.chunks.get(key);
    if (existing) return existing;

    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const blocks = new Uint8Array(SPACING * HEIGHT);
    const surface = new Uint8Array(SPACING);
    const lights = new Set();
    let maxY = WATER_LEVEL;
    const write = (x, y, z, id, replace = false) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      const offset = lx + lz * CHUNK + y * SPACING;
      if (!replace && blocks[offset] !== AIR) return;
      blocks[offset] = id;
      if (isLight(id)) lights.add(offset);
      else if (replace) lights.delete(offset);
      if (id !== AIR && y > maxY) maxY = y;
    };

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const column = lx + lz * CHUNK;
        const { y: original, biome, wet, grain } = this.profile(x, z);
        const y = this.ruinGround(x, z, original);
        surface[column] = y;
        if (y > maxY) maxY = y;
        this.fillColumn(blocks, column, x, z, y, biome, wet, grain);
      }
    }

    this.vegetation(x0, z0, write, surface, blocks);
    this.buildStarterCave(x0, z0, write);
    this.buildRuin(x0, z0, write);
    const edited = this.editIndex.get(key);
    if (edited) {
      for (const [offset, id] of edited) {
        blocks[offset] = id;
        if (isLight(id)) lights.add(offset);
        else lights.delete(offset);
        maxY = Math.max(maxY, Math.floor(offset / SPACING));
      }
    }
    const chunk = { cx, cz, blocks, surface, maxY, lights };
    this.chunks.set(key, chunk);
    return chunk;
  }

  fillColumn(blocks, offset, x, z, ground, biome, wet, grain) {
    const seed = this.seed;
    const shore = ground <= WATER_LEVEL + 1;
    const rocky = (biome === BIOME.SNOW && grain > .18) || (ground > 51 && grain > .23);
    let top = B.GRASS;
    if (biome === BIOME.DESERT || shore) top = B.SAND;
    if (biome === BIOME.SNOW) top = B.SNOW;
    if (rocky) top = ROCK;
    if (shore && ground < WATER_LEVEL - 1 && wet < .39) top = B.GRAVEL;
    if (shore && ground < WATER_LEVEL - 1 && wet > .59) top = B.CLAY;
    if (z >= CAVE.z && z < SPAWN.z - 1 && trailOffset(x, z) < .8) top = B.GRAVEL;

    // Fissures and chambers share smooth trajectories across chunk edges.
    const tunnelX = x + 10 * Math.sin(z * .054) - 5 * Math.cos(x * .076 + z * .08);
    const tunnelY = 14 + 5 * Math.sin(z * .077) + 4 * Math.sin(x * .049) + grain * 3;
    const warp = foldsAt(x, z, seed);
    const tunnel2X = z + 11 * Math.sin(x * .12) + warp * 7;
    const tunnel2Y = 7 + 3.5 * Math.sin(x * .084) + 2.5 * Math.cos(z * .09);
    const chamber = 1 - Math.abs(Math.sin(x * .066 + warp) * Math.cos(z * .073 - warp));
    const tube = Math.sin(tunnelX * .092) * 16;
    const tube2 = Math.cos(tunnel2X * .075) * 18;
    const underlay = (top === B.SAND || top === B.CLAY || top === B.GRAVEL) ? top : B.DIRT;

    for (let y = 0; y <= ground; y++) {
      const depth = ground - y;
      let id = ROCK;
      if (y === 0 || (y === 1 && grain < -.1)) id = BASEMENT;
      else if (y > 3 && this.isCave(y, depth, tube, tunnelY, tube2, tunnel2Y, chamber)) {
        id = AIR;
      } else if (depth === 0) id = top;
      else if (depth <= 3 && (top === B.SNOW || y < 55)) id = top === B.SNOW ? ROCK : underlay;
      else if (y <= 4 + grain * 3) id = B.BASALT;
      else {
        const ore = hash(x + Math.imul(y, 10231), z, seed + 107);
        // Correlating by small cells gives each vein several adjacent blocks.
        const vein = hash(Math.floor(x / 3) + Math.imul(Math.floor(y / 3), 3049), Math.floor(z / 3), seed + 809);
        if (y < 14 && vein < .028 && ore < .39) id = B.CRYSTAL;
        else if (y < 34 && vein < .115 && ore < .43) id = B.IRON;
        else if (vein < .24 && ore < .34) id = B.COAL;
        else if (vein > .94 && ore < .47) id = B.GRAVEL;
      }
      blocks[offset + y * SPACING] = id;
    }
    for (let y = ground + 1; y <= WATER_LEVEL; y++) blocks[offset + y * SPACING] = WATER;
  }

  isCave(y, depth, tube, ty, tube2, ty2, chamber) {
    if (depth < 4) return false;
    const flex = 2.1 + chamber * 1.8;
    if (Math.abs(y - ty) < flex && tube * tube + ((y - ty) * 1.4) ** 2 < flex * flex) return true;
    if (Math.abs(y - ty2) < 3 && tube2 * tube2 + ((y - ty2) * 1.3) ** 2 < 12) return true;
    return chamber < .085 && Math.abs(y - ty + 1) < 2.5 + (.085 - chamber) * 35;
  }

  vegetation(x0, z0, write, surface, blocks) {
    const seed = this.seed;
    const treeRadius = 3;
    const spacing = 5;
    for (let gz = Math.floor((z0 - treeRadius) / spacing); gz <= Math.floor((z0 + CHUNK - 1 + treeRadius) / spacing); gz++) {
      for (let gx = Math.floor((x0 - treeRadius) / spacing); gx <= Math.floor((x0 + CHUNK - 1 + treeRadius) / spacing); gx++) {
        const x = gx * spacing + Math.floor(hash(gx, gz, seed + 156) * spacing);
        const z = gz * spacing + Math.floor(hash(gx, gz, seed + 327) * spacing);
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4.2) continue;
        if (z < SPAWN.z && z > -13 && Math.abs(x + (SPAWN.z - z) * .15) < 6.2) continue;
        if (z >= CAVE.z && z < SPAWN.z && trailOffset(x, z) < 2.3) continue;
        if (Math.abs(x - LANDMARK.x) <= 8 && Math.abs(z - LANDMARK.z) <= 8) continue;
        if (x > CAVE.x - 6 && x <= CAVE.x + 6 && Math.abs(z - CAVE.z) < 5) continue;
        const { y, biome, wet, grain } = this.profile(x, z);
        if (y <= WATER_LEVEL + 1) continue;
        const chance = hash(gx, gz, seed + 681);
        if (biome === BIOME.DESERT) {
          if (chance < .22) for (let i = 1; i <= 2 + Math.floor(chance * 8); i++) write(x, y + i, z, B.CACTUS);
          continue;
        }
        if (biome === BIOME.SNOW && (y > 72 || grain > .06 || chance > .23)) continue;
        if (chance > .3 + wet * .47 + (biome === BIOME.FOREST ? .2 : 0)) continue;
        const pine = biome >= BIOME.UPLAND || hash(gx, gz, seed + 818) > .73;
        if (pine) this.pine(write, x, y + 1, z, chance);
        else this.canopy(write, x, y + 1, z, chance);
      }
    }

    // A small grove makes basic materials available near the starting ledge.
    for (const [x, z, type] of [[-4, 5, 'oak'], [7, 7, 'oak'], [-5, -4, 'oak'], [3, 12, 'pine']]) {
      if (x < x0 - treeRadius || x >= x0 + CHUNK + treeRadius || z < z0 - treeRadius || z >= z0 + CHUNK + treeRadius) continue;
      const y = this.profile(x, z).y + 1;
      if (type === 'pine') this.pine(write, x, y, z, .52);
      else this.canopy(write, x, y, z, .48);
    }

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const offset = lx + lz * CHUNK;
        const y = surface[offset];
        if (blocks[offset + y * SPACING] !== B.GRASS || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 2.4) continue;
        const roll = hash(x, z, seed + 427);
        const patch = noise(x * .125, z * .125, seed + 602);
        if (roll < .012 && patch > .33) write(x, y + 1, z, B.BERRY_BUSH);
        else if (roll < .024 && patch < .55) write(x, y + 1, z, B.MUSHROOM);
        else if (roll < .075 && patch > .48) write(x, y + 1, z, B.FLOWER);
        else if (roll < .28 && patch > .38) write(x, y + 1, z, B.FERN);
      }
    }
  }

  canopy(write, x, y, z, chance) {
    const height = 4 + Math.floor(chance * 5);
    for (let dy = 0; dy < height; dy++) write(x, y + dy, z, B.LOG, true);
    for (let dy = -2; dy <= 2; dy++) {
      const radius = dy === 2 ? 1 : (dy <= 0 ? 2 : 1);
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const edge = Math.abs(dx) + Math.abs(dz) === radius * 2;
          if (edge && (dy !== 0 || hash(x + dx + dy * 501, z + dz, this.seed) < .72)) continue;
          write(x + dx, y + height - 1 + dy, z + dz, B.LEAVES);
        }
      }
    }
    const branch = chance < .28 ? -1 : 1;
    write(x + branch, y + height - 3, z, B.LOG, true);
  }

  pine(write, x, y, z, chance) {
    const height = 7 + Math.floor(chance * 6);
    for (let dy = 0; dy < height; dy++) write(x, y + dy, z, B.PINE_LOG, true);
    for (let dy = 3; dy <= height; dy++) {
      const fromTop = height - dy;
      const radius = fromTop === 0 ? 0 : Math.min(3, 1 + Math.floor(fromTop / 3) - (fromTop % 3 === 1 && fromTop > 1 ? 1 : 0));
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + (radius > 1 ? 1 : 0)) continue;
          write(x + dx, y + dy, z + dz, B.PINE_LEAVES);
        }
      }
    }
  }

  buildStarterCave(x0, z0, write) {
    if (x0 > CAVE.x + 4 || x0 + CHUNK <= CAVE.x - 35 || z0 > CAVE.z + 7 || z0 + CHUNK <= CAVE.z - 4) return;
    const centerZ = (distance) => Math.round(CAVE.z + Math.sin(distance * .093) * 3);
    const floorAt = (distance) => CAVE.y - 1 - Math.floor(Math.max(0, distance) * .47);
    for (let x = Math.max(x0, CAVE.x - 36); x < Math.min(x0 + CHUNK, CAVE.x + 5); x++) {
      const distance = CAVE.x - x;
      const center = centerZ(distance), floor = floorAt(distance);
      const chamberWidth = Math.max(0, 3.45 - Math.abs(distance - 29) * .58);
      const width = 1 + Math.floor(chamberWidth);
      for (let z = Math.max(z0, center - width); z <= Math.min(z0 + CHUNK - 1, center + width); z++) {
        const edge = Math.abs(z - center);
        const ceiling = 2 + (edge < width ? 1 : 0) + Math.ceil(chamberWidth * .5);
        const stone = distance < 1 ? B.MOSS : distance > 24 ? B.BASALT : ROCK;
        write(x, floor, z, stone, true);
        for (let y = 1; y <= ceiling; y++) write(x, floor + y, z, AIR, true);
        if (distance > 24 && edge === width && hash(x, z, this.seed + 77) < .34) {
          write(x, floor + 1, z, B.CRYSTAL, true);
        }
        if (edge === width && (distance === 9 || distance === 22)) {
          write(x, floor + 1, z, B.TORCH, true);
        }
      }
    }
    // A short masonry arch marks the old mine where the path reaches the river.
    const mouth = CAVE.x + 1;
    for (const side of [-2, 2]) {
      const z = CAVE.z + side;
      for (let dy = -2; dy < 3; dy++) write(mouth, CAVE.y + dy, z, dy === 2 ? B.BRICKS : B.MOSS, true);
      write(mouth + 1, CAVE.y - 1, z, B.COBBLE, true);
      write(mouth + 1, CAVE.y, z, B.LANTERN, true);
    }
    for (let offset = -1; offset <= 1; offset++) {
      write(mouth, CAVE.y + 3, CAVE.z + offset, offset === 0 ? B.MOSS : B.BRICKS, true);
    }
  }

  buildRuin(x0, z0, write) {
    const { x, z } = LANDMARK;
    if (x + RUIN_RADIUS_X < x0 || x - RUIN_RADIUS_X >= x0 + CHUNK || z + RUIN_RADIUS_Z < z0 || z - RUIN_RADIUS_Z >= z0 + CHUNK) return;
    const y = this.ruinBase;
    for (let dz = -RUIN_RADIUS_Z; dz <= RUIN_RADIUS_Z; dz++) {
      for (let dx = -RUIN_RADIUS_X; dx <= RUIN_RADIUS_X; dx++) {
        const roll = hash(x + dx, z + dz, 380394);
        if (Math.abs(dx) === RUIN_RADIUS_X && Math.abs(dz) === RUIN_RADIUS_Z) continue;
        write(x + dx, y, z + dz, roll < .22 ? B.MOSS : B.COBBLE, true);
        for (let dy = 1; dy <= 6; dy++) write(x + dx, y + dy, z + dz, AIR, true);
        const pillar = Math.abs(dx) === 3 && Math.abs(dz) === 3;
        if (pillar) {
          const height = dz === -3 ? 4 : (dx > 0 ? 3 : 2);
          for (let dy = 1; dy <= height; dy++) write(x + dx, y + dy, z + dz, dy === 1 ? B.MOSS : B.BRICKS, true);
        } else if (Math.abs(dx) === 3 || dz === -3) {
          if (roll > .35) write(x + dx, y + 1, z + dz, B.COBBLE, true);
          if (roll > .77) write(x + dx, y + 2, z + dz, B.BRICKS, true);
        }
      }
    }
    for (let dx = -2; dx <= 2; dx++) write(x + dx, y + (dx === 0 ? 5 : 4), z - 3, B.BRICKS, true);
    write(x, y + 4, z - 3, B.BRICKS, true);
    write(x, y + 1, z, B.MOSS, true);
    write(x, y + 2, z, B.LANTERN, true);
  }

  chunk(cx, cz) {
    const solid = meshGroup(), water = meshGroup();
    const neighbors = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) neighbors.push(this.getChunk(cx + dx, cz + dz));
    }
    const chunk = neighbors[4];
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const at = (x, y, z) => {
      if (y < 0) return BASEMENT;
      if (y >= HEIGHT) return AIR;
      const dx = x < 0 ? -1 : x >= CHUNK ? 1 : 0;
      const dz = z < 0 ? -1 : z >= CHUNK ? 1 : 0;
      const block = neighbors[4 + dx + dz * 3].blocks;
      return block[x - dx * CHUNK + (z - dz * CHUNK) * CHUNK + y * SPACING];
    };
    const blocksLight = (x, y, z) => {
      const id = at(x, y, z);
      return id && id !== WATER && !PLANTS.has(id) && id !== B.GLASS;
    };
    const tiles = new Map();
    const tile = (id) => {
      if (!tiles.has(id)) tiles.set(id, tileBounds(id));
      return tiles.get(id);
    };
    const shades = [1, 1, 1, 1];
    const plantShades = [1, 1, 1, 1];

    for (let y = 0; y <= chunk.maxY; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const col = x + z * CHUNK;
          const id = chunk.blocks[col + y * SPACING];
          if (id === AIR) continue;
          const definition = BLOCKS[id];
          const gx = x0 + x, gz = z0 + z;
          const ground = chunk.surface[col];
          if (PLANTS.has(id)) {
            const uv = tile(definition.tiles[4]);
            const depth = id === B.TORCH ? .75 : id === B.MUSHROOM ? .54 : id === B.FLOWER ? .83 : .72;
            const planes = id === B.TORCH ? TORCH_PLANES : PLANT_PLANES;
            quad(solid, gx, y, gz, planes[0], [0, 1, 0], uv, plantShades, WHITE, depth, true);
            quad(solid, gx, y, gz, planes[1], [0, 1, 0], uv, plantShades, WHITE, depth, true);
            continue;
          }
          const liquid = id === WATER;
          const depth = liquid && at(x, y + 1, z) !== WATER ? .82 : 1;
          const tintRoll = (id === B.GRASS || id === B.LEAVES || id === B.PINE_LEAVES) ? hash(gx, gz, this.seed + 371) : .5;
          const tint = tintRoll < .24 ? COOL : tintRoll > .79 ? GOLD : WHITE;
          const variation = liquid ? 1 : .87 + hash(gx + Math.imul(y, 13), gz, this.seed + 524) * .16;

          for (let face = 0; face < FACES.length; face++) {
            const { n, q, shade } = FACES[face];
            const [nx, ny, nz] = n;
            const ox = x + nx, oy = y + ny, oz = z + nz;
            const next = at(ox, oy, oz);
            const open = next === AIR || PLANTS.has(next);
            if (liquid && (!open || face === 3)) continue;
            if (!liquid && !open && next !== WATER && !(BLOCKS[next].transparent && id !== next)) continue;
            if (id === B.GLASS && next !== WATER && !open && BLOCKS[next].solid && !BLOCKS[next].transparent) continue;
            const underground = Math.max(0, ground - y - 2);
            const caveShade = id === B.CRYSTAL || id === B.LANTERN ? 1 : 1 - Math.min(.62, underground * .056);
            const brightness = variation * shade * caveShade;
            if (liquid) shades.fill(1);
            else {
              for (let k = 0; k < 4; k++) {
                const [vx, vy, vz] = q[k];
                const sx = vx * 2 - 1, sy = vy * 2 - 1, sz = vz * 2 - 1;
                const sideA = nx ? blocksLight(ox, oy + sy, oz) : blocksLight(ox + sx, oy, oz);
                const sideB = nz ? blocksLight(ox, oy + sy, oz) : blocksLight(ox, oy, oz + sz);
                const corner = blocksLight(ox + (nx ? 0 : sx), oy + (ny ? 0 : sy), oz + (nz ? 0 : sz));
                const occlusion = sideA && sideB ? 3 : Number(Boolean(sideA)) + Number(Boolean(sideB)) + Number(Boolean(corner));
                shades[k] = AO[occlusion] * brightness;
              }
            }
            quad(liquid ? water : solid, gx, y, gz, q, n, tile(definition.tiles[face]), shades, tint, depth);
          }
        }
      }
    }
    return { solid: packGroup(solid), water: packGroup(water) };
  }
}

function foldsAt(x, z, seed) {
  return noise(.073 * x, .059 * z, seed + 371) - .5;
}
