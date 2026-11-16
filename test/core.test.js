import assert from 'node:assert/strict';
import test from 'node:test';
import { B } from '../src/blocks.js';
import { Player, RADIUS, raycast } from '../src/game.js';
import {
  CREATIVE_PALETTE, Inventory, canHarvest, dropFor, isPlaceable, miningTime,
} from '../src/systems.js';
import { CHUNK, HEIGHT, World } from '../src/world.js';

test('the seed determines terrain independently of chunk visit order', () => {
  const earlier = new World('测试世界');
  const later = new World('测试世界');
  const different = new World('测试世界与河岸');

  earlier.getChunk(3, -2);
  later.getChunk(-4, 5);
  const chunk = earlier.getChunk(-2, -1);
  assert.deepEqual(chunk.blocks, later.getChunk(-2, -1).blocks);
  assert.deepEqual(chunk.surface, later.getChunk(-2, -1).surface);
  assert.notDeepEqual(chunk.blocks, different.getChunk(-2, -1).blocks);

  assert.equal(earlier.get(earlier.spawn.x, earlier.spawn.y, earlier.spawn.z), B.AIR);
  assert.notEqual(earlier.get(earlier.spawn.x, earlier.spawn.y - 1, earlier.spawn.z), B.AIR);
  earlier.trim(0, 0, 0);
  assert.notEqual(earlier.getChunk(-2, -1), chunk);
  assert.deepEqual(earlier.getChunk(-2, -1).blocks, chunk.blocks);
});

test('edits persist through chunk eviction and JSON without crossing coordinate boundaries', () => {
  const world = new World('edits');
  const y = HEIGHT - 2;
  assert.equal(world.get(-1, 0, -1), B.BEDROCK);
  assert.equal(world.get(0, -1, 0), B.BEDROCK);
  assert.equal(world.get(0, HEIGHT, 0), B.AIR);
  assert.equal(world.set(-1, 0, -1, B.STONE), false);
  assert.equal(world.set(0, HEIGHT, 0, B.STONE), false);
  assert.equal(world.set(0, y, 0, B.WOOD_PICK), false);

  assert.equal(world.set(-1, y, -1, B.BRICKS), true);
  assert.equal(world.set(0, y, -1, B.PLANKS), true);
  assert.equal(world.set(CHUNK, y, 0, B.GLASS), true);
  assert.equal(world.set(0, y, -1, B.PLANKS), false);
  assert.equal(world.set(CHUNK, y, 0, B.AIR), true);
  assert.equal(world.get(-1, y, 0), B.AIR);

  const spawnGround = [world.spawn.x, world.spawn.y - 1, world.spawn.z].map(Math.floor);
  assert.notEqual(world.get(...spawnGround), B.AIR);
  assert.equal(world.set(...spawnGround, B.AIR), true);

  world.trim(10, 10, 0);
  const copy = new World('edits', JSON.parse(JSON.stringify(world.edits)));
  for (const candidate of [world, copy]) {
    assert.equal(candidate.get(-1, y, -1), B.BRICKS);
    assert.equal(candidate.get(0, y, -1), B.PLANKS);
    assert.equal(candidate.get(CHUNK, y, 0), B.AIR);
    assert.equal(candidate.get(...spawnGround), B.AIR);
  }
});

function validateMesh(mesh, cx, cz) {
  const vertices = mesh.p.length / 3;
  assert.ok(Number.isInteger(vertices) && vertices > 0);
  assert.equal(mesh.n.length, vertices * 3);
  assert.equal(mesh.c.length, vertices * 3);
  assert.equal(mesh.uv.length, vertices * 2);
  assert.equal(mesh.i.length % 3, 0);
  assert.ok(mesh.i.every(index => index < vertices));
  assert.ok(mesh.uv.every(value => value > 0 && value < 1));
  for (let i = 0; i < mesh.p.length; i += 3) {
    assert.ok(mesh.p[i] >= cx * CHUNK && mesh.p[i] <= (cx + 1) * CHUNK);
    assert.ok(mesh.p[i + 1] >= 0 && mesh.p[i + 1] <= HEIGHT);
    assert.ok(mesh.p[i + 2] >= cz * CHUNK && mesh.p[i + 2] <= (cz + 1) * CHUNK);
  }
}

test('chunk meshes reference valid vertices and cull shared faces across a chunk seam', () => {
  const world = new World('seam');
  const y = HEIGHT - 2;
  const left = world.chunk(-1, -1).solid;
  const right = world.chunk(0, -1).solid;
  validateMesh(left, -1, -1);
  validateMesh(right, 0, -1);
  validateMesh(world.chunk(1, 0).water, 1, 0);

  // A lone block produces six quads. Adding an adjacent block across the seam
  // hides the two faces touching at x = 0; it must not leave either mesh stale.
  world.set(-1, y, -6, B.PLANKS);
  assert.equal(world.chunk(-1, -1).solid.i.length - left.i.length, 6 * 6);
  world.set(0, y, -6, B.PLANKS);
  assert.equal(world.chunk(-1, -1).solid.i.length - left.i.length, 5 * 6);
  assert.equal(world.chunk(0, -1).solid.i.length - right.i.length, 5 * 6);
  world.set(0, y, -6, B.AIR);
  assert.equal(world.chunk(-1, -1).solid.i.length - left.i.length, 6 * 6);
  assert.equal(world.chunk(0, -1).solid.i.length, right.i.length);
});

test('raycast skips water and returns the entered face at an exact reach limit', () => {
  const blocks = new Map([
    ['-1,4,0', B.WATER],
    ['-3,4,0', B.STONE],
    ['2,4,0', B.GLASS],
  ]);
  const world = { get: (...coordinates) => blocks.get(coordinates.join(',')) ?? B.AIR };
  const origin = { x: 0.5, y: 4.5, z: 0.5 };
  const west = { x: -1, y: 0, z: 0 };
  assert.equal(raycast(world, origin, west, 2.499), null);
  assert.deepEqual(raycast(world, origin, west, 2.5), {
    x: -3, y: 4, z: 0, id: B.STONE, nx: 1, ny: 0, nz: 0, dist: 2.5,
  });
  assert.deepEqual(raycast(world, origin, { x: 1, y: 0, z: 0 }, 1.5), {
    x: 2, y: 4, z: 0, id: B.GLASS, nx: -1, ny: 0, nz: 0, dist: 1.5,
  });
});

test('player stays on the floor and stops at walls at 30, 60 and 165 updates per second', () => {
  const walk = { forward: 1, side: 0, jump: false, run: false, down: false };
  const world = { get: (x, y, z) => y <= 0 || (z === 0 && y <= 2) ? B.STONE : B.AIR };
  for (const rate of [30, 60, 165]) {
    const player = new Player({ x: 0.5, y: 2.4, z: 2.5, yaw: 0 }, 'survival');
    for (let i = 0; i < rate * 2; i++) player.update(world, walk, 1 / rate);
    assert.ok(player.ground);
    assert.ok(Math.abs(player.p.y - 1) < 0.001);
    assert.ok(Math.abs(player.p.z - 1 - RADIUS) < 0.001);
    assert.equal(player.health, 20);

    const idleJump = { ...walk, forward: 0, jump: true };
    player.update(world, idleJump, 1 / rate);
    assert.ok(player.p.y > 1);
    assert.ok(!player.ground);
    for (let i = 0; i < rate; i++) player.update(world, { ...idleJump, jump: false }, 1 / rate);
    assert.ok(player.ground);
  }
});

test('survival progression spends materials and unlocks the next ore tier', () => {
  const inventory = new Inventory();
  assert.equal(inventory.craft('wood-pick'), false);
  assert.equal(canHarvest(B.STONE), false);
  assert.ok(inventory.add(B.LOG));
  assert.ok(inventory.craft('planks'));
  assert.equal(inventory.count(B.LOG), 0);
  assert.ok(inventory.craft('sticks'));
  assert.ok(inventory.craft('wood-pick'));
  assert.equal(canHarvest(B.STONE, B.WOOD_PICK), true);
  assert.ok(miningTime(B.STONE, B.WOOD_PICK) < miningTime(B.STONE));
  assert.equal(canHarvest(B.IRON, B.WOOD_PICK), false);

  inventory.add(dropFor(B.STONE), 3);
  const previous = inventory.serialize();
  assert.equal(inventory.craft('stone-pick', false), false);
  assert.deepEqual(inventory.serialize(), previous);
  assert.ok(inventory.craft('stone-pick', true));
  assert.equal(canHarvest(B.IRON, B.STONE_PICK), true);
  assert.equal(canHarvest(B.BEDROCK, B.IRON_PICK), false);
  assert.equal(isPlaceable(B.IRON_PICK), false);

  inventory.add(dropFor(B.IRON));
  inventory.add(dropFor(B.COAL));
  assert.ok(inventory.craft('iron-ingot', true));
  assert.equal(inventory.count(B.IRON_INGOT), 1);
  assert.equal(inventory.count(B.RAW_IRON), 0);
  assert.equal(inventory.count(B.COAL_LUMP), 0);
  assert.deepEqual(new Inventory('survival', JSON.parse(JSON.stringify(inventory.serialize()))).serialize(), inventory.serialize());
});

test('a full inventory spends no materials until the output can fit', () => {
  const slots = CREATIVE_PALETTE.filter(id => id !== B.PLANKS).slice(0, 36);
  const counts = Object.fromEntries(slots.map(id => [id, 2]));
  const inventory = new Inventory('survival', { slots, counts });
  assert.equal(inventory.craft('planks'), false);
  assert.equal(inventory.count(B.LOG), 2);
  assert.equal(inventory.count(B.PLANKS), 0);

  assert.ok(inventory.take(B.LOG));
  assert.ok(inventory.craft('planks'));
  assert.equal(inventory.count(B.PLANKS), 4);
  assert.equal(inventory.count(B.LOG), 0);
});

test('creative palette can equip unlisted tools and keeps their stack unlimited', () => {
  const inventory = new Inventory('creative');
  assert.ok(!inventory.slots.includes(B.WOOD_PICK));
  assert.ok(inventory.equipCreative(B.WOOD_PICK, 2));
  assert.equal(inventory.slots[2], B.WOOD_PICK);
  assert.ok(inventory.take(B.WOOD_PICK, 5));
  assert.equal(inventory.count(B.WOOD_PICK), 999);
  assert.equal(inventory.equipCreative(B.BEDROCK, 2), false);
  assert.deepEqual(new Inventory('creative', inventory.serialize()).slots, inventory.slots);
});
