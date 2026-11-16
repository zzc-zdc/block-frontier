import { B, BLOCKS } from './blocks.js';

const SLOT_COUNT = 36;
const MAX_STACK = 999;
const STARTER = [[B.PLANKS, 8], [B.DIRT, 12], [B.TORCH, 6], [B.BERRIES, 4]];
const CREATIVE_START = [
  B.GRASS, B.STONE, B.LOG, B.PLANKS, B.GLASS, B.BRICKS, B.TORCH, B.FLOWER, B.LANTERN,
  B.DIRT, B.SAND, B.COBBLE, B.LEAVES, B.PINE_LOG, B.PINE_LEAVES, B.BASALT, B.SNOW, B.BERRY_BUSH,
  B.CACTUS, B.FERN, B.MUSHROOM, B.CLAY, B.GRAVEL, B.MOSS, B.ICE, B.WORKBENCH, B.CRYSTAL,
  B.COAL, B.IRON, B.IRON_PICK, B.IRON_AXE, B.IRON_SHOVEL, B.IRON_SWORD, B.BERRIES, B.APPLE, B.BREAD,
];
export const CREATIVE_PALETTE = Object.freeze(Object.values(B)
  .filter(id => id && id !== B.BEDROCK && id !== B.WATER));

function makeRecipe(id, output, quantity, needs, station = '') {
  return Object.freeze({
    id, name: BLOCKS[output].name, output: [output, quantity], needs, station,
  });
}

export const RECIPES = Object.freeze([
  makeRecipe('planks', B.PLANKS, 4, [[B.LOG, 1]]),
  makeRecipe('pine-planks', B.PLANKS, 4, [[B.PINE_LOG, 1]]),
  makeRecipe('sticks', B.STICK, 4, [[B.PLANKS, 2]]),
  makeRecipe('workbench', B.WORKBENCH, 1, [[B.PLANKS, 4]]),
  makeRecipe('wood-pick', B.WOOD_PICK, 1, [[B.PLANKS, 3], [B.STICK, 2]]),
  makeRecipe('wood-axe', B.WOOD_AXE, 1, [[B.PLANKS, 3], [B.STICK, 2]]),
  makeRecipe('wood-shovel', B.WOOD_SHOVEL, 1, [[B.PLANKS, 1], [B.STICK, 2]]),
  makeRecipe('wood-sword', B.WOOD_SWORD, 1, [[B.PLANKS, 2], [B.STICK, 1]]),
  makeRecipe('stone-pick', B.STONE_PICK, 1, [[B.COBBLE, 3], [B.STICK, 2]], 'bench'),
  makeRecipe('stone-axe', B.STONE_AXE, 1, [[B.COBBLE, 3], [B.STICK, 2]], 'bench'),
  makeRecipe('stone-shovel', B.STONE_SHOVEL, 1, [[B.COBBLE, 1], [B.STICK, 2]], 'bench'),
  makeRecipe('stone-sword', B.STONE_SWORD, 1, [[B.COBBLE, 2], [B.STICK, 1]], 'bench'),
  makeRecipe('torches', B.TORCH, 4, [[B.STICK, 1], [B.COAL_LUMP, 1]]),
  makeRecipe('iron-ingot', B.IRON_INGOT, 1, [[B.RAW_IRON, 1], [B.COAL_LUMP, 1]], 'bench'),
  makeRecipe('iron-pick', B.IRON_PICK, 1, [[B.IRON_INGOT, 3], [B.STICK, 2]], 'bench'),
  makeRecipe('iron-axe', B.IRON_AXE, 1, [[B.IRON_INGOT, 3], [B.STICK, 2]], 'bench'),
  makeRecipe('iron-shovel', B.IRON_SHOVEL, 1, [[B.IRON_INGOT, 1], [B.STICK, 2]], 'bench'),
  makeRecipe('iron-sword', B.IRON_SWORD, 1, [[B.IRON_INGOT, 2], [B.STICK, 1]], 'bench'),
  makeRecipe('glass', B.GLASS, 4, [[B.SAND, 4], [B.COAL_LUMP, 1]], 'bench'),
  makeRecipe('bricks', B.BRICKS, 4, [[B.CLAY, 4], [B.COAL_LUMP, 1]], 'bench'),
  makeRecipe('lantern', B.LANTERN, 2, [[B.GEM, 1], [B.GLASS, 1], [B.IRON_INGOT, 1]], 'bench'),
  makeRecipe('bread', B.BREAD, 1, [[B.BERRIES, 3], [B.MUSHROOM, 1]]),
]);

const recipeById = new Map(RECIPES.map(recipe => [recipe.id, recipe]));
const recipeFor = value => recipeById.get(typeof value === 'string' ? value : value?.id);
const validItem = id => Number.isInteger(id) && id > 0 && Boolean(BLOCKS[id]);

export class Inventory {
  constructor(mode = 'survival', serialized) {
    this.mode = mode;
    this.slots = Array(SLOT_COUNT).fill(B.AIR);
    this.counts = Object.create(null);
    const source = serialized?.counts;
    const savedSlots = serialized?.slots;
    if (Array.isArray(savedSlots) && source && typeof source === 'object') {
      const seen = new Set();
      for (let i = 0; i < Math.min(SLOT_COUNT, savedSlots.length); i++) {
        const id = savedSlots[i];
        const quantity = Math.floor(Number(source[id] ?? 0));
        if (!validItem(id) || seen.has(id) || (mode !== 'creative' && !(quantity > 0))) continue;
        this.slots[i] = id;
        this.counts[id] = mode === 'creative' ? MAX_STACK : Math.min(MAX_STACK, quantity);
        seen.add(id);
      }
    } else if (mode === 'creative') {
      for (const id of CREATIVE_START) this.add(id, MAX_STACK);
    } else {
      for (const [id, amount] of STARTER) this.add(id, amount);
    }
  }

  count(id) {
    return this.mode === 'creative' && validItem(id) ? MAX_STACK : this.counts[id] || 0;
  }

  add(id, amount = 1) {
    if (!validItem(id) || !Number.isInteger(amount) || amount <= 0) return false;
    const slot = this.slots.indexOf(id);
    const next = this.mode === 'creative' ? MAX_STACK : (this.counts[id] || 0) + amount;
    if (next > MAX_STACK) return false;
    if (slot < 0) {
      const empty = this.slots.indexOf(B.AIR);
      if (empty < 0) return false;
      this.slots[empty] = id;
    }
    this.counts[id] = next;
    return true;
  }

  take(id, amount = 1) {
    if (!validItem(id) || !Number.isInteger(amount) || amount <= 0 || this.count(id) < amount) return false;
    if (this.mode === 'creative') return true;
    this.counts[id] -= amount;
    if (this.counts[id] === 0) {
      delete this.counts[id];
      const slot = this.slots.indexOf(id);
      if (slot >= 0) this.slots[slot] = B.AIR;
    }
    return true;
  }

  swap(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from >= SLOT_COUNT || to < 0 || to >= SLOT_COUNT) return false;
    [this.slots[from], this.slots[to]] = [this.slots[to], this.slots[from]];
    return true;
  }

  equipCreative(id, slot = 0) {
    if (this.mode !== 'creative' || !CREATIVE_PALETTE.includes(id) ||
      !Number.isInteger(slot) || slot < 0 || slot >= 9) return false;
    const existing = this.slots.indexOf(id);
    if (existing >= 0) return this.swap(existing, slot);
    const displaced = this.slots[slot];
    const reserve = this.slots.indexOf(B.AIR, 9);
    if (reserve >= 0) this.slots[reserve] = displaced;
    else delete this.counts[displaced];
    this.slots[slot] = id;
    this.counts[id] = MAX_STACK;
    return true;
  }

  canCraft(value, hasBench = true) {
    const recipe = recipeFor(value);
    if (!recipe || (recipe.station && !hasBench && this.mode !== 'creative')) return false;
    if (!recipe.needs.every(([id, amount]) => this.count(id) >= amount)) return false;
    const [id, output] = recipe.output;
    if (this.mode !== 'creative' && this.count(id) + output > MAX_STACK) return false;
    return this.slots.includes(id) || this.slots.includes(B.AIR) ||
      (this.mode !== 'creative' && recipe.needs.some(([source, amount]) => this.count(source) === amount));
  }

  craft(value, hasBench = true) {
    const recipe = recipeFor(value);
    if (!this.canCraft(value, hasBench)) return false;
    for (const [id, amount] of recipe.needs) this.take(id, amount);
    return this.add(...recipe.output);
  }

  serialize() {
    return { slots: this.slots.slice(), counts: { ...this.counts } };
  }
}

export function isPlaceable(id) {
  return Boolean(BLOCKS[id]?.placeable);
}

export function canHarvest(id, toolId = B.AIR) {
  const def = BLOCKS[id];
  if (!def?.hardness || !Number.isFinite(def.hardness)) return false;
  if (!def.tier) return true;
  const tool = BLOCKS[toolId];
  return tool?.tool === def.tool && tool.tier >= def.tier;
}

export function dropFor(id, roll = Math.random()) {
  if (id === B.LEAVES) {
    if (roll < 0.13) return B.APPLE;
    if (roll < 0.24) return B.STICK;
  }
  if (id === B.PINE_LEAVES && roll < 0.20) return B.STICK;
  return BLOCKS[id]?.drop ?? id;
}

export function miningTime(id, toolId = B.AIR) {
  const def = BLOCKS[id];
  if (!def?.hardness) return Infinity;
  if (toolId === true || toolId === 'creative') return Number.isFinite(def.hardness) ? 0.05 : Infinity;
  const tool = BLOCKS[toolId];
  if (def.tool && tool?.tool === def.tool && tool.tier > 0) {
    if (def.tier && tool.tier < def.tier) return def.hardness * 1.7;
    return def.hardness / (1.26 + tool.tier * 0.85);
  }
  if (def.tier) return def.hardness * 1.9;
  return def.hardness;
}

export function foodValue(id) {
  return BLOCKS[id]?.food || 0;
}

export function attackDamage(id) {
  const def = BLOCKS[id];
  return def?.damage || (def?.tool === 'axe' ? def.tier + 2 : 1);
}
