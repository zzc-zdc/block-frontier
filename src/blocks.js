const blockNames = [
  'AIR', 'GRASS', 'DIRT', 'STONE', 'SAND', 'WATER', 'LOG', 'LEAVES',
  'PLANKS', 'COBBLE', 'COAL', 'IRON', 'CLAY', 'GRAVEL', 'BEDROCK', 'GLASS',
  'BRICKS', 'TORCH', 'SNOW', 'FLOWER', 'CACTUS', 'CRYSTAL', 'WORKBENCH',
  'FERN', 'PINE_LEAVES', 'PINE_LOG', 'MOSS', 'LANTERN', 'BERRY_BUSH',
  'BASALT', 'ICE', 'MUSHROOM',
];
const itemNames = [
  'STICK', 'WOOD_PICK', 'STONE_PICK', 'IRON_PICK', 'IRON_INGOT', 'COAL_LUMP',
  'BERRIES', 'GEM', 'WOOD_AXE', 'STONE_AXE', 'IRON_AXE', 'WOOD_SHOVEL',
  'STONE_SHOVEL', 'IRON_SHOVEL', 'WOOD_SWORD', 'STONE_SWORD', 'IRON_SWORD',
  'RAW_IRON', 'BREAD', 'APPLE',
];

export const B = Object.freeze(Object.fromEntries([
  ...blockNames.map((name, i) => [name, i]),
  ...itemNames.map((name, i) => [name, 64 + i]),
]));

const T = {
  GRASS: 0, TURF: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  BARK: 6, RINGS: 7, LEAVES: 8, PLANKS: 9, COBBLE: 10, COAL: 11,
  IRON: 12, CLAY: 13, GRAVEL: 14, BEDROCK: 15, GLASS: 16,
  BRICKS: 17, TORCH: 18, SNOW: 19, SNOW_TURF: 20, FLOWER: 21,
  CACTUS: 22, CACTUS_END: 23, CRYSTAL: 24, BENCH: 25,
  BENCH_FRONT: 26, BENCH_TOP: 27, FERN: 28, PINE_LEAVES: 29,
  PINE_BARK: 30, PINE_RINGS: 31, MOSS: 32, LANTERN: 33,
  BERRY_BUSH: 34, BASALT: 35, ICE: 36, MUSHROOM: 37,
};

const cube = (side, top = side, bottom = top, front = side) => [side, side, top, bottom, front, side];
const block = (name, tiles, hardness, options = {}) => ({
  name, tiles, hardness, solid: true, transparent: false, placeable: true, ...options,
});
const item = (name, options = {}) => ({
  name, hardness: 0, solid: false, transparent: true, placeable: false, ...options,
});
const plant = { solid: false, transparent: true, cutout: true };
const transparent = { transparent: true, cutout: true };

export const BLOCKS = Object.freeze(Object.assign([
  block('空气', cube(T.GLASS), 0, { solid: false, transparent: true, placeable: false }),
  block('草方块', cube(T.TURF, T.GRASS, T.DIRT), 0.46, { tool: 'shovel', drop: B.DIRT, sound: 'grass' }),
  block('泥土', cube(T.DIRT), 0.48, { tool: 'shovel', sound: 'earth' }),
  block('岩石', cube(T.STONE), 1.85, { tool: 'pick', tier: 1, drop: B.COBBLE, sound: 'stone' }),
  block('沙子', cube(T.SAND), 0.40, { tool: 'shovel', sound: 'sand' }),
  block('水', cube(T.WATER), 0, { solid: false, transparent: true, placeable: false, sound: 'water' }),
  block('橡木原木', cube(T.BARK, T.RINGS), 0.92, { tool: 'axe', sound: 'wood' }),
  block('橡树叶', cube(T.LEAVES), 0.24, { sound: 'grass' }),
  block('橡木板', cube(T.PLANKS), 0.73, { tool: 'axe', sound: 'wood' }),
  block('圆石', cube(T.COBBLE), 1.50, { tool: 'pick', tier: 1, sound: 'stone' }),
  block('煤矿石', cube(T.COAL), 1.81, { tool: 'pick', tier: 1, drop: B.COAL_LUMP, sound: 'stone' }),
  block('铁矿石', cube(T.IRON), 2.15, { tool: 'pick', tier: 2, drop: B.RAW_IRON, sound: 'stone' }),
  block('黏土', cube(T.CLAY), 0.56, { tool: 'shovel', sound: 'earth' }),
  block('砂砾', cube(T.GRAVEL), 0.51, { tool: 'shovel', sound: 'sand' }),
  block('基岩', cube(T.BEDROCK), Infinity, { placeable: false, sound: 'stone' }),
  block('玻璃', cube(T.GLASS), 0.25, { ...transparent, sound: 'glass' }),
  block('红砖', cube(T.BRICKS), 1.18, { tool: 'pick', tier: 1, sound: 'stone' }),
  block('火把', cube(T.TORCH), 0.12, { ...plant, light: 0xffb458, sound: 'wood' }),
  block('雪地', cube(T.SNOW_TURF, T.SNOW, T.DIRT), 0.28, { tool: 'shovel', sound: 'sand' }),
  block('荒野花', cube(T.FLOWER), 0.12, { ...plant, sound: 'grass' }),
  block('仙人掌', cube(T.CACTUS, T.CACTUS_END), 0.41, { sound: 'grass' }),
  block('晶矿', cube(T.CRYSTAL), 2.42, { tool: 'pick', tier: 2, drop: B.GEM, sound: 'glass' }),
  block('工作台', cube(T.BENCH, T.BENCH_TOP, T.PLANKS, T.BENCH_FRONT), 0.82, { tool: 'axe', sound: 'wood' }),
  block('蕨类', cube(T.FERN), 0.11, { ...plant, sound: 'grass' }),
  block('云杉叶', cube(T.PINE_LEAVES), 0.25, { sound: 'grass' }),
  block('云杉原木', cube(T.PINE_BARK, T.PINE_RINGS), 0.94, { tool: 'axe', sound: 'wood' }),
  block('苔藓岩', cube(T.MOSS), 1.45, { tool: 'pick', tier: 1, sound: 'stone' }),
  block('晶石灯', cube(T.LANTERN), 0.38, { light: 0xffd890, sound: 'glass' }),
  block('浆果灌木', cube(T.BERRY_BUSH), 0.29, { drop: B.BERRIES, sound: 'grass' }),
  block('玄武岩', cube(T.BASALT), 2.26, { tool: 'pick', tier: 2, sound: 'stone' }),
  block('冰', cube(T.ICE), 0.45, { ...transparent, sound: 'glass' }),
  block('伞菇', cube(T.MUSHROOM), 0.12, { ...plant, food: 2, sound: 'grass' }),
], {
  [B.STICK]: item('木棍'),
  [B.WOOD_PICK]: item('木镐', { tool: 'pick', tier: 1 }),
  [B.STONE_PICK]: item('石镐', { tool: 'pick', tier: 2 }),
  [B.IRON_PICK]: item('铁镐', { tool: 'pick', tier: 3 }),
  [B.IRON_INGOT]: item('铁锭'),
  [B.COAL_LUMP]: item('煤炭'),
  [B.BERRIES]: item('野生浆果', { food: 4 }),
  [B.GEM]: item('远境晶石'),
  [B.WOOD_AXE]: item('木斧', { tool: 'axe', tier: 1 }),
  [B.STONE_AXE]: item('石斧', { tool: 'axe', tier: 2 }),
  [B.IRON_AXE]: item('铁斧', { tool: 'axe', tier: 3 }),
  [B.WOOD_SHOVEL]: item('木铲', { tool: 'shovel', tier: 1 }),
  [B.STONE_SHOVEL]: item('石铲', { tool: 'shovel', tier: 2 }),
  [B.IRON_SHOVEL]: item('铁铲', { tool: 'shovel', tier: 3 }),
  [B.WOOD_SWORD]: item('木剑', { tool: 'sword', tier: 1, damage: 3 }),
  [B.STONE_SWORD]: item('石剑', { tool: 'sword', tier: 2, damage: 5 }),
  [B.IRON_SWORD]: item('铁剑', { tool: 'sword', tier: 3, damage: 7 }),
  [B.RAW_IRON]: item('粗铁'),
  [B.BREAD]: item('荒野面包', { food: 7 }),
  [B.APPLE]: item('野苹果', { food: 5 }),
}));

export const TILE_COLS = 8;
export const TILE_ROWS = 8;
const TILE = 32;
const PAD = 16;
const CELL = TILE + PAD * 2;
export const TILE_INSET = (PAD + 0.5) / CELL;
let atlas;
const iconCache = new Map();

const blend = (a, b, t) => {
  const r = Math.round((a >> 16) * (1 - t) + (b >> 16) * t);
  const g = Math.round((a >> 8 & 255) * (1 - t) + (b >> 8 & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
};
const clamp = value => Math.max(0, Math.min(0.99999, value));
const wrap = (value, range) => (value % range + range) % range;

function hash(x, y, seed = 0) {
  let n = Math.imul(x + 3911, 1597334677) ^ Math.imul(y + 2003, 3812015801) ^ Math.imul(seed + 17, 747796405);
  n = Math.imul(n ^ n >>> 16, 2246822519);
  return ((n ^ n >>> 15) >>> 0) / 4294967296;
}

function cellNoise(x, y, span, seed) {
  const ix = Math.floor(x / span);
  const iy = Math.floor(y / span);
  const t = (x - ix * span) / span;
  const u = (y - iy * span) / span;
  const s = t * t * (3 - 2 * t);
  const v = u * u * (3 - 2 * u);
  const count = TILE / span;
  const a = hash(wrap(ix, count), wrap(iy, count), seed);
  const b = hash(wrap(ix + 1, count), wrap(iy, count), seed);
  const c = hash(wrap(ix, count), wrap(iy + 1, count), seed);
  const d = hash(wrap(ix + 1, count), wrap(iy + 1, count), seed);
  return (a * (1 - s) + b * s) * (1 - v) + (c * (1 - s) + d * s) * v;
}

const palette = (...colors) => (value) => colors[Math.floor(clamp(value) * colors.length)];
const turfColors = palette(0x416237, 0x54763c, 0x658741, 0x729348, 0x819f50, 0x98ab59, 0xa7b267);
const dirtColors = palette(0x4e3428, 0x684735, 0x7e543a, 0x8e6242, 0x9e7050, 0xaf805c);
const stoneColors = palette(0x575e5d, 0x68706a, 0x767d73, 0x858980, 0x98998a, 0xaaac9c, 0xbcbbaa);
const sandColors = palette(0xb09160, 0xc2a572, 0xcbad79, 0xdbbe8a, 0xe4c994, 0xeed8a3);
const snowColors = palette(0xa6bdc0, 0xc2d0d0, 0xd2dddd, 0xe1e7db, 0xe9eedd, 0xf2f5e9);
const pineColors = palette(0x204941, 0x2d5949, 0x3c6850, 0x476f52, 0x587c55, 0x6b875e);
const leafColors = palette(0x2b4c29, 0x3d6332, 0x4e7638, 0x5d873e, 0x709747, 0x81a64f, 0xacb965);
const woodColors = palette(0x794731, 0x95603a, 0xac7346, 0xbb814f, 0xc88b53, 0xd89b61, 0xe1ad72);
const redColors = palette(0x723d30, 0x964b35, 0xb35c43, 0xbd6b4d, 0xce7757, 0xd68d68);

function turf(x, y) {
  const cluster = cellNoise(x, y, 4, 11);
  const micro = hash(x, y, 14);
  const tuft = hash(x, Math.floor((y + (x & 1)) / 2), 101);
  return turfColors(cellNoise(x, y, 8, 12) * 0.30 + cluster * 0.37 + micro * 0.14 + tuft * 0.19);
}

function dirt(x, y) {
  const fleck = hash(Math.floor(x / 2), Math.floor(y / 2), 16);
  if (fleck > 0.95 && hash(x, y, 44) > 0.28) return hash(x, y, 17) > 0.45 ? 0x9b8871 : 0x786a5a;
  return dirtColors(cellNoise(x, y, 8, 4) * 0.34 + cellNoise(x, y, 4, 13) * 0.34 + hash(x, y, 2) * 0.32);
}

function stone(x, y) {
  const strata = wrap(y + Math.floor(x / 5) + Math.floor(cellNoise(x, y, 8, 228) * 4), 9);
  let f = cellNoise(x, y, 8, 8) * 0.52 + cellNoise(x, y, 4, 25) * 0.26 + hash(x, y, 14) * 0.22;
  if (strata === 0 && cellNoise(x, y, 8, 99) > 0.39) f -= 0.17;
  if (strata === 1 && cellNoise(x, y, 8, 99) > 0.47) f += 0.12;
  return stoneColors(f);
}

function bark(x, y, pine) {
  const u = wrap(x + Math.floor(cellNoise(x, y, 8, 29) * 4), TILE);
  const ridge = Math.sin(u * 1.57) + Math.sin(u * 3.12);
  const f = 0.44 + ridge * 0.14 + cellNoise(x, y, 8, 87) * 0.23 + hash(x, y, 96) * 0.18;
  return pine
    ? palette(0x382c29, 0x5c4637, 0x6e5442, 0x816246, 0x967556, 0xad8661)(f)
    : palette(0x493529, 0x61432e, 0x754b31, 0x875e3c, 0x956c45, 0xaa8051)(f);
}

function rings(x, y, pine) {
  const edge = Math.min(x, y, 31 - x, 31 - y);
  if (edge < 2 + (hash(x, y, 61) > 0.8 ? 1 : 0)) return bark(x, y, pine);
  const r = Math.hypot(x - 15.2, y - 15.7) * 0.97 + Math.sin(x / 3) * 0.55 + Math.sin(y / 2.8) * 0.4;
  const grain = (Math.sin(r * 1.4) * 0.5 + 0.5) * 0.46 + cellNoise(x, y, 8, 12) * 0.29 + hash(x, y, 25) * 0.25;
  return pine
    ? palette(0x71523a, 0x936f4e, 0xa1815a, 0xb39168, 0xcfaf7b, 0xdfc191)(grain)
    : palette(0x97613c, 0xad7646, 0xbf8551, 0xcf9a66, 0xe0aa73, 0xeab980)(grain);
}

function leaves(x, y, pine, berries = false) {
  const cx = (x + Math.floor(y / 4) * 2) & 31;
  const cells = cellNoise(cx, y, 4, 11);
  const med = cellNoise(x, y, 8, 36);
  const fleck = hash(x, y, 55);
  const detailed = cells * 0.49 + med * 0.21 + fleck * 0.3;
  if (berries) {
    const sx = x % 10, sy = (y + Math.floor(x / 10) * 3) % 9;
    if ((sx - 5) ** 2 + (sy - 5) ** 2 <= 2) return sx === 4 ? 0xffac81 : sy === 6 ? 0x8c343a : 0xc95654;
  }
  const color = (pine ? pineColors : leafColors)(detailed);
  return fleck < 0.11 ? blend(color, 0x273f37, 0.37) : color;
}

function planks(x, y) {
  const row = (y / 8) | 0;
  const sy = y & 7;
  const join = (x + row * 9) & 31;
  if (sy === 0 || join === 0) return 0x6f4933;
  if (sy === 1) return 0xd49f65;
  const ripple = Math.sin(x / 8 + y) * 0.17 + Math.sin(y * 4.32 + x / 8) * 0.07;
  const knot = (x - 19 + row * 3) ** 2 / 13 + (sy - 4) ** 2 / 3;
  if (knot < 1 && ((x + y) & 1 || knot < 0.3)) return 0x865332;
  return woodColors(0.31 + ripple + cellNoise(x, y, 8, 84) * 0.23 + hash(x, y, 83) * 0.24 + hash(row, 0, 14) * 0.18);
}

function rubble(x, y, seed, dark = false) {
  const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
  let d1 = Infinity, d2 = Infinity, hue = 0, dx1 = 0, dy1 = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const ax = cx + ox, ay = cy + oy;
      const h = hash(wrap(ax, 4), wrap(ay, 4), seed);
      const dx = ax * 8 + h * 5 + 1 - x;
      const dy = ay * 8 + hash(wrap(ax, 4), wrap(ay, 4), seed + 1) * 5 + 1 - y;
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        hue = h;
        dx1 = dx;
        dy1 = dy;
      } else if (d < d2) d2 = d;
    }
  }
  const gap = Math.sqrt(d2) - Math.sqrt(d1);
  const scale = hash(x, y, 32);
  if (gap < 0.57 + scale * 0.42) return dark ? 0x242a2c : 0x494d48;
  const rim = gap < 1.9 ? (dx1 + dy1 > 0 ? 0.16 : -0.15) : 0;
  const brightness = 0.15 + hue * 0.40 + scale * 0.25 + cellNoise(x, y, 4, seed) * 0.2 + rim;
  return dark
    ? palette(0x292d2e, 0x333939, 0x414646, 0x4e5150, 0x696d68, 0x7f8176)(brightness)
    : stoneColors(brightness);
}

function ore(x, y, type) {
  const centers = [[4, 9], [13, 5], [24, 8], [18, 17], [6, 24], [27, 24], [15, 29]];
  const n = hash(x, y, 77);
  for (const [cx, cy] of centers) {
    const dx = x - cx, dy = y - cy;
    const d = (dx * dx + dy * dy * 1.7) * (0.8 + n * 0.55);
    if (d > 10) continue;
    const value = 0.29 + n * 0.43 + (dy < 0 ? 0.16 : -0.07);
    if (type === 'coal') return palette(0x202724, 0x293330, 0x38433c, 0x4d584b, 0x667061)(value);
    if (type === 'iron') return palette(0x754c37, 0x956345, 0xb87d54, 0xce996a, 0xe1b787)(value);
    return palette(0x254954, 0x3a7582, 0x4c9eaa, 0x61c5bc, 0x99e4cb, 0xd6f4d8)(value);
  }
  return type === 'crystal' ? blend(stone(x, y), 0x335361, 0.34) : stone(x, y);
}

function brick(x, y) {
  const row = y >> 3;
  const sy = y & 7;
  const sx = (x + ((row & 1) << 3)) & 15;
  const n = hash(x, y, 72);
  if (sy === 0 || sx === 0) return palette(0x74695b, 0x8f806a, 0xa59a80)(n);
  return redColors(0.18 + n * 0.24 + hash((x + ((row & 1) << 3)) >> 4, row, 10) * 0.30 + (sy === 1 || sx === 1 ? 0.22 : 0));
}

function tileContext(art, id) {
  const ctx = art.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate((id % TILE_COLS) * CELL + PAD, Math.floor(id / TILE_COLS) * CELL + PAD);
  return ctx;
}

function paint(art, id, sample) {
  const ctx = art.getContext('2d');
  const pixel = ctx.createImageData(CELL, CELL);
  const colorMap = new Int32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) colorMap[x + y * TILE] = sample(x, y);
  }
  for (let y = 0; y < CELL; y++) {
    const sy = Math.max(0, Math.min(TILE - 1, y - PAD));
    for (let x = 0; x < CELL; x++) {
      const sx = Math.max(0, Math.min(TILE - 1, x - PAD));
      const c = colorMap[sx + sy * TILE];
      const i = (x + y * CELL) * 4;
      if (c === -1) continue;
      pixel.data[i] = c >> 16 & 255;
      pixel.data[i + 1] = c >> 8 & 255;
      pixel.data[i + 2] = c & 255;
      pixel.data[i + 3] = (c >>> 24) || 255;
    }
  }
  ctx.putImageData(pixel, (id % TILE_COLS) * CELL, Math.floor(id / TILE_COLS) * CELL);
}

function px(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function stroke(ctx, color, x0, y0, x1, y1, width = 1) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    px(ctx, color, x0, y0, width, width);
    if (x0 === x1 && y0 === y1) return;
    const e2 = error * 2;
    if (e2 >= dy) { error += dy; x0 += sx; }
    if (e2 <= dx) { error += dx; y0 += sy; }
  }
}

function flower(ctx) {
  stroke(ctx, '#284331', 14, 31, 17, 10, 2);
  stroke(ctx, '#718a50', 15, 30, 18, 10);
  stroke(ctx, '#516939', 15, 22, 8, 16, 2);
  stroke(ctx, '#8fa458', 16, 26, 24, 20, 2);
  stroke(ctx, '#48623c', 18, 15, 23, 12, 2);
  px(ctx, '#bd8262', 15, 5, 7, 7);
  px(ctx, '#eab47d', 16, 4, 5, 9);
  px(ctx, '#f8d39a', 14, 7, 9, 4);
  px(ctx, '#f9dfa8', 17, 7, 4, 3);
  px(ctx, '#b76f38', 18, 8, 2, 2);
  px(ctx, '#d8a66f', 22, 10, 4, 4);
  px(ctx, '#f8ce8d', 23, 10, 3, 2);
}

function fern(ctx) {
  const branches = [[3, 19], [5, 14], [8, 10], [11, 8], [16, 6], [20, 9], [24, 12], [27, 16], [28, 21]];
  for (const [x, y] of branches) {
    const midX = Math.round((x + 15) / 2);
    const midY = Math.max(y + 4, 16);
    stroke(ctx, '#314b33', 15, 30, midX, midY, 2);
    stroke(ctx, '#57733f', midX, midY, x, y, 2);
    stroke(ctx, '#85a252', midX + 1, midY, x + 1, y);
    px(ctx, '#a1b76a', x, y, 2, 1);
    px(ctx, '#678847', midX - 1, midY + 2, 2, 1);
  }
}

function mushroom(ctx) {
  px(ctx, '#775744', 13, 20, 8, 12);
  px(ctx, '#d1b089', 14, 20, 5, 12);
  px(ctx, '#f2d0a4', 14, 22, 2, 8);
  px(ctx, '#673c33', 6, 16, 22, 6);
  px(ctx, '#ac5140', 7, 12, 20, 7);
  px(ctx, '#d96f53', 9, 9, 16, 7);
  px(ctx, '#ea8c61', 12, 7, 10, 4);
  px(ctx, '#f3b77a', 12, 9, 4, 2);
  px(ctx, '#f4dca3', 20, 12, 3, 3);
  px(ctx, '#f4dca3', 9, 15, 3, 2);
  px(ctx, '#f4dca3', 16, 10, 2, 2);
}

function torch(ctx) {
  px(ctx, '#5c3a2d', 13, 14, 6, 18);
  px(ctx, '#9b5b37', 14, 16, 4, 15);
  px(ctx, '#d58a51', 14, 17, 1, 11);
  px(ctx, '#ab5239', 12, 10, 8, 8);
  px(ctx, '#ec813f', 13, 7, 6, 11);
  px(ctx, '#ffb153', 14, 5, 3, 11);
  px(ctx, '#ffcf69', 15, 3, 2, 11);
  px(ctx, '#ffedab', 15, 10, 3, 5);
  px(ctx, '#ffbe57', 18, 9, 2, 5);
}

function bench(ctx, type) {
  if (type === T.BENCH_TOP) {
    px(ctx, '#553a2b', 1, 1, 30, 30);
    px(ctx, '#b9834f', 3, 3, 26, 26);
    for (let i = 0; i < 9; i++) {
      const x = 4 + (i % 3) * 8;
      const y = 4 + Math.floor(i / 3) * 8;
      px(ctx, '#74442f', x, y, 7, 7);
      px(ctx, i === 4 ? '#e3a979' : '#c68855', x + 1, y + 1, 5, 5);
      px(ctx, '#d49b67', x + 1, y + 1, 5, 1);
    }
    return;
  }
  px(ctx, '#66432f', 0, 0, 32, 5);
  px(ctx, '#c99763', 0, 2, 32, 1);
  px(ctx, '#79503a', 1, 6, 3, 26);
  px(ctx, '#79503a', 28, 6, 3, 26);
  px(ctx, '#79503a', 0, 27, 32, 3);
  px(ctx, '#e1aa71', 0, 30, 32, 1);
  if (type === T.BENCH_FRONT) {
    px(ctx, '#694533', 6, 9, 20, 15);
    px(ctx, '#ac7246', 7, 10, 18, 13);
    stroke(ctx, '#644535', 9, 20, 16, 13, 2);
    px(ctx, '#bac1af', 13, 11, 6, 3);
    px(ctx, '#5d655e', 15, 14, 4, 2);
    stroke(ctx, '#d0b393', 20, 12, 22, 20, 2);
  }
}

function canvas(width, height = width) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function makeAtlas() {
  if (atlas) return atlas;
  atlas = canvas(TILE_COLS * CELL, TILE_ROWS * CELL);
  const draw = (id, fn) => paint(atlas, id, fn);
  draw(T.GRASS, turf);
  draw(T.TURF, (x, y) => y <= 4 + Math.floor(cellNoise(x, 5, 4, 17) * 7) ? turf(x, y) : dirt(x, y));
  draw(T.DIRT, dirt);
  draw(T.STONE, stone);
  draw(T.SAND, (x, y) => sandColors(cellNoise(x, y, 8, 28) * 0.41 + hash(x, y, 21) * 0.38 + Math.sin((y + x / 8) * 0.8) * 0.08 + 0.10));
  draw(T.WATER, (x, y) => palette(0x286a77, 0x317d8a, 0x418d97, 0x4d9e9c, 0x6ab4ad)(
    cellNoise(x, y, 8, 45) * 0.57 + Math.sin((x / 7 + y / 2.5) + cellNoise(x, y, 4, 80)) * 0.15 + 0.32));
  draw(T.BARK, (x, y) => bark(x, y, false));
  draw(T.RINGS, (x, y) => rings(x, y, false));
  draw(T.LEAVES, (x, y) => leaves(x, y, false));
  draw(T.PLANKS, planks);
  draw(T.COBBLE, (x, y) => rubble(x, y, 25));
  draw(T.COAL, (x, y) => ore(x, y, 'coal'));
  draw(T.IRON, (x, y) => ore(x, y, 'iron'));
  draw(T.CLAY, (x, y) => blend(0x657d81, 0xb8b3a1, cellNoise(x, y, 8, 28) * 0.55 + hash(x, y, 21) * 0.35 + Math.sin(y * 0.7) * 0.1));
  draw(T.GRAVEL, (x, y) => blend(rubble(x, y, 51), dirt(x, y), hash(x, y, 71) * 0.6 + 0.18));
  draw(T.BEDROCK, (x, y) => rubble(x, y, 152, true));
  draw(T.GLASS, (x, y) => {
    const edge = Math.min(x, y, 31 - x, 31 - y);
    if (edge === 0) return 0x9ab9b6;
    if (edge === 1) return 0xbde0d5;
    if (x + y === 16 && x > 3 && y > 3) return 0xa4b2d4cf;
    if (x + y === 19 && x > 6 && y > 6) return 0x8abddfd8;
    return -1;
  });
  draw(T.BRICKS, brick);
  draw(T.SNOW, (x, y) => snowColors(cellNoise(x, y, 4, 19) * 0.40 + cellNoise(x, y, 8, 2) * 0.4 + hash(x, y, 15) * 0.2));
  draw(T.SNOW_TURF, (x, y) => y < 6 + Math.floor(cellNoise(x, 7, 4, 20) * 8)
    ? snowColors(cellNoise(x, y, 8, 2) * 0.6 + hash(x, y, 15) * 0.3) : stone(x, y));
  draw(T.CACTUS, (x, y) => {
    const rib = x & 7;
    if (hash(x >> 2, y >> 2, 60) > 0.91 && (y & 3) === 2 && (x & 3) === 2) return 0xc7c199;
    return palette(0x395843, 0x466e48, 0x54844b, 0x689458, 0x789d61)(
      (rib < 2 ? 0.09 : rib > 5 ? 0.48 : 0.32) + cellNoise(x, y, 8, 9) * 0.32 + hash(x, y, 12) * 0.21);
  });
  draw(T.CACTUS_END, (x, y) => {
    const d = Math.hypot(x - 15.5, y - 15.5);
    return blend(0x466749, 0xadc078, (1 - d / 24) * 0.57 + hash(x, y, 20) * 0.19);
  });
  draw(T.CRYSTAL, (x, y) => ore(x, y, 'crystal'));
  draw(T.BENCH, planks);
  draw(T.BENCH_FRONT, planks);
  draw(T.BENCH_TOP, planks);
  draw(T.PINE_LEAVES, (x, y) => leaves(x, y, true));
  draw(T.PINE_BARK, (x, y) => bark(x, y, true));
  draw(T.PINE_RINGS, (x, y) => rings(x, y, true));
  draw(T.MOSS, (x, y) => blend(rubble(x, y, 25), turf(x, y), clamp(cellNoise(x, y, 8, 33) * 2.2 - 0.38)));
  draw(T.LANTERN, (x, y) => {
    const edge = Math.min(x, y, 31 - x, 31 - y);
    if (edge < 2 || (x & 15) < 2 || y === 8 || y === 23) return edge === 0 ? 0x503d2e : 0x896449;
    const glow = 1 - Math.min(1, Math.hypot(x - 15, y - 16) / 21);
    return blend(0xbb6f3d, 0xffe4a6, glow * 0.74 + hash(x, y, 57) * 0.24);
  });
  draw(T.BERRY_BUSH, (x, y) => leaves(x, y, false, true));
  draw(T.BASALT, (x, y) => {
    const z = (x + Math.floor(cellNoise(x, y, 8, 26) * 4)) % 7;
    return palette(0x292d33, 0x363c43, 0x424954, 0x525b62, 0x686c70, 0x817f7c)(
      (z < 2 ? 0 : 0.28) + cellNoise(x, y, 8, 91) * 0.37 + hash(x, y, 18) * 0.19);
  });
  draw(T.ICE, (x, y) => {
    const vein = (Math.abs(x - y) < 2 && y > 3) || ((x + y * 2 + 9) % 21 === 0 && hash(x, y, 33) > 0.26);
    return vein ? 0xbabedfdc : 0xa88ac3d2;
  });
  for (const [id, fn] of [[T.FLOWER, flower], [T.FERN, fern], [T.MUSHROOM, mushroom], [T.TORCH, torch], ...[T.BENCH, T.BENCH_FRONT, T.BENCH_TOP].map(id => [id, ctx => bench(ctx, id)])]) {
    const ctx = tileContext(atlas, id);
    fn(ctx);
    ctx.restore();
  }
  return atlas;
}

function atlasTile(ctx, id, x, y, width, height = width) {
  ctx.drawImage(makeAtlas(), (id % TILE_COLS) * CELL + PAD, Math.floor(id / TILE_COLS) * CELL + PAD,
    TILE, TILE, x, y, width, height);
}

function cubeIcon(ctx, tiles) {
  const faces = [
    [tiles[4], 0.81, [0.82, 0.41, 0, 0.88, 6, 17]],
    [tiles[0], 0.59, [0.82, -0.41, 0, 0.88, 32, 30]],
    [tiles[2], 1.05, [0.82, 0.41, -0.82, 0.41, 32, 3]],
  ];
  for (const [tile, brightness, transform] of faces) {
    ctx.save();
    ctx.transform(...transform);
    ctx.filter = 'brightness(' + brightness + ')';
    atlasTile(ctx, tile, 0, 0, 32, 32);
    ctx.restore();
  }
}

function polygon(ctx, color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}

function toolIcon(ctx, type, tier) {
  const headColors = [['#b78853', '#e9bd76', '#5b3928'], ['#929d92', '#d2d8c2', '#404c49'], ['#b3c3c3', '#e5efdf', '#536675']];
  const [mid, light, dark] = headColors[tier - 1];
  if (type === 'sword') {
    stroke(ctx, '#46302a', 4, 27, 13, 18, 4);
    stroke(ctx, '#be8954', 5, 27, 14, 18, 2);
    polygon(ctx, dark, [[10, 18], [23, 4], [29, 3], [28, 9], [15, 23]]);
    polygon(ctx, mid, [[12, 18], [24, 5], [27, 5], [26, 9], [15, 20]]);
    stroke(ctx, light, 15, 16, 26, 5);
    stroke(ctx, '#574334', 9, 17, 16, 24, 2);
    stroke(ctx, '#cba371', 10, 17, 16, 23);
    return;
  }
  stroke(ctx, '#44302b', 5, 26, 23, 8, 4);
  stroke(ctx, '#94623e', 6, 26, 24, 8, 2);
  stroke(ctx, '#d59b5c', 7, 25, 23, 9);
  if (type === 'pick') {
    polygon(ctx, dark, [[5, 5], [8, 3], [19, 4], [24, 7], [28, 12], [29, 21], [26, 25], [24, 18], [21, 12], [15, 8]]);
    polygon(ctx, mid, [[8, 5], [18, 5], [23, 8], [27, 13], [27, 21], [25, 17], [22, 11], [16, 7]]);
    stroke(ctx, light, 9, 5, 18, 5);
    stroke(ctx, light, 19, 6, 23, 8);
    stroke(ctx, light, 24, 9, 27, 14);
  } else if (type === 'axe') {
    polygon(ctx, dark, [[12, 2], [21, 3], [28, 8], [28, 13], [23, 18], [18, 15], [16, 10], [11, 7]]);
    polygon(ctx, mid, [[13, 3], [21, 4], [26, 8], [26, 13], [22, 16], [18, 13], [18, 8], [13, 6]]);
    stroke(ctx, light, 13, 3, 21, 4);
    stroke(ctx, light, 22, 5, 25, 8);
    stroke(ctx, light, 25, 13, 22, 15);
  } else {
    polygon(ctx, dark, [[18, 5], [24, 2], [29, 6], [28, 12], [23, 17], [17, 15], [15, 9]]);
    polygon(ctx, mid, [[19, 6], [24, 4], [27, 6], [26, 11], [22, 15], [18, 13], [17, 9]]);
    stroke(ctx, light, 19, 6, 25, 5);
    stroke(ctx, light, 26, 6, 25, 10);
  }
}

function materialIcon(ctx, id) {
  if (id === B.STICK) {
    stroke(ctx, '#5e402f', 5, 25, 24, 6, 4);
    stroke(ctx, '#ae7547', 6, 25, 24, 7, 2);
    stroke(ctx, '#e3ae67', 7, 25, 25, 7);
    return;
  }
  if (id === B.APPLE) {
    polygon(ctx, '#6c3035', [[4, 13], [7, 9], [12, 8], [16, 10], [21, 8], [26, 10],
      [29, 14], [28, 22], [24, 27], [20, 29], [16, 27], [12, 29], [8, 27], [5, 22]]);
    polygon(ctx, '#a53e40', [[6, 14], [8, 11], [13, 10], [16, 12], [20, 10], [25, 11],
      [27, 14], [26, 22], [22, 26], [18, 26], [16, 25], [11, 27], [8, 24], [6, 20]]);
    polygon(ctx, '#d65d4a', [[7, 14], [10, 11], [13, 11], [16, 13], [21, 11], [25, 13],
      [25, 18], [21, 23], [15, 24], [9, 22], [7, 18]]);
    px(ctx, '#eba273', 9, 14, 3, 2);
    px(ctx, '#f5c18a', 10, 13, 2, 1);
    stroke(ctx, '#704936', 15, 11, 18, 4, 2);
    polygon(ctx, '#486545', [[17, 7], [20, 3], [27, 2], [25, 6], [23, 8], [19, 9]]);
    stroke(ctx, '#8da751', 19, 6, 25, 3);
    return;
  }
  if (id === B.BERRIES) {
    const centers = [[25, 57], [94, 49], [67, 94]];
    ctx.save();
    ctx.scale(0.25, 0.25);
    for (const [x, y] of centers) {
      px(ctx, '#692b38', x - 19, y - 12, 38, 35);
      px(ctx, '#a43a43', x - 16, y - 16, 32, 39);
      px(ctx, '#cf5150', x - 12, y - 15, 26, 29);
      px(ctx, '#ed8c6c', x - 10, y - 11, 10, 8);
      px(ctx, '#f3ae88', x - 6, y - 12, 8, 4);
    }
    stroke(ctx, '#3f613c', 32, 31, 62, 16, 8);
    stroke(ctx, '#85a149', 45, 26, 62, 16, 8);
    stroke(ctx, '#799842', 62, 15, 94, 32, 8);
    stroke(ctx, '#516e43', 62, 22, 64, 42, 8);
    ctx.restore();
    return;
  }
  const colors = {
    [B.GEM]: ['#244a55', '#4faab0', '#9feed5', '#d8f6db'],
    [B.IRON_INGOT]: ['#465657', '#899e9c', '#cbd9cb', '#edf1db'],
    [B.RAW_IRON]: ['#634632', '#bd8a62', '#d8af80', '#f4cba1'],
    [B.COAL_LUMP]: ['#242a2a', '#434b42', '#626c58', '#818674'],
    [B.BREAD]: ['#71502f', '#bd7e42', '#e4ae5d', '#f0cf85'],
  };
  const [dark, main, light, shine] = colors[id] || colors[B.RAW_IRON];
  if (id === B.GEM) {
    polygon(ctx, dark, [[5, 12], [15, 3], [24, 6], [29, 15], [21, 27], [12, 29], [5, 23]]);
    polygon(ctx, main, [[7, 13], [15, 5], [23, 7], [27, 15], [20, 24], [13, 27], [7, 21]]);
    polygon(ctx, light, [[8, 13], [15, 5], [23, 7], [18, 12], [11, 17]]);
    polygon(ctx, '#357e87', [[11, 17], [18, 12], [27, 15], [20, 24], [13, 27]]);
    stroke(ctx, shine, 14, 6, 8, 13);
    px(ctx, shine, 20, 8, 2, 2);
    return;
  }
  polygon(ctx, dark, [[3, 17], [8, 9], [23, 7], [28, 11], [30, 19], [22, 25], [9, 26]]);
  polygon(ctx, main, [[5, 17], [10, 11], [23, 9], [27, 13], [28, 18], [21, 23], [10, 24]]);
  polygon(ctx, light, [[5, 17], [10, 11], [23, 9], [27, 13], [21, 18], [12, 20]]);
  stroke(ctx, shine, 11, 12, 22, 10);
  if (id === B.BREAD) for (const x of [12, 16, 20]) stroke(ctx, main, x + 2, 12, x, 17);
}

export function itemIcon(id) {
  if (!id || !BLOCKS[id]) return '';
  if (iconCache.has(id)) return iconCache.get(id);
  const icon = canvas(64);
  const ctx = icon.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const def = BLOCKS[id];
  if (def.tiles) {
    if (!def.solid && id !== B.WATER) atlasTile(ctx, def.tiles[4], 6, 4, 52, 55);
    else cubeIcon(ctx, def.tiles);
  } else {
    ctx.scale(2, 2);
    if (def.tool) toolIcon(ctx, def.tool, def.tier);
    else materialIcon(ctx, id);
  }
  const url = icon.toDataURL();
  iconCache.set(id, url);
  return url;
}
