import { ENEMIES, MAP_TIERS } from './content';
import { SeededRandom } from './prng';
import type { FloorSnapshot, MapEntity, MapTier, Position, Realm, Terrain, Tile } from './types';

export const GENERATOR_VERSION = 1;

const REALM_RANK: Record<Realm, number> = { 炼气: 1, 筑基: 2, 结丹: 3 };
const TERRAIN_RANK: Record<Terrain, number> = { plain: 1, forest: 1, water: 2, mountain: 3 };

export function canEnterTerrain(terrain: Terrain, realm: Realm): boolean {
  return REALM_RANK[realm] >= TERRAIN_RANK[terrain];
}

function key(position: Position): string {
  return `${position.x},${position.y}`;
}

function same(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y };
}

function createTiles(size: number, rng: SeededRandom): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x += 1) {
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const roll = rng.next();
      let terrain: Terrain = 'plain';
      if (border) terrain = 'mountain';
      else if (roll < 0.11) terrain = 'water';
      else if (roll < 0.19) terrain = 'mountain';
      else if (roll < 0.53) terrain = 'forest';
      row.push({ terrain, revealed: false });
    }
    tiles.push(row);
  }
  return tiles;
}

function carvePath(tiles: Tile[][], from: Position, to: Position, horizontalFirst: boolean): void {
  let x = from.x;
  let y = from.y;
  const carve = () => { tiles[y][x].terrain = 'plain'; };
  carve();
  const moveX = () => {
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      carve();
    }
  };
  const moveY = () => {
    while (y !== to.y) {
      y += Math.sign(to.y - y);
      carve();
    }
  };
  if (horizontalFirst) { moveX(); moveY(); } else { moveY(); moveX(); }
}

function revealAround(tiles: Tile[][], center: Position, radius = 2): void {
  for (let y = Math.max(0, center.y - radius); y <= Math.min(tiles.length - 1, center.y + radius); y += 1) {
    for (let x = Math.max(0, center.x - radius); x <= Math.min(tiles[0].length - 1, center.x + radius); x += 1) {
      if (Math.abs(x - center.x) + Math.abs(y - center.y) <= radius + 1) tiles[y][x].revealed = true;
    }
  }
}

function pickOpenPosition(
  tiles: Tile[][],
  rng: SeededRandom,
  occupied: Set<string>,
  predicate: (position: Position) => boolean = () => true
): Position {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const position = { x: rng.int(1, tiles[0].length - 2), y: rng.int(1, tiles.length - 2) };
    if (occupied.has(key(position))) continue;
    if (!canEnterTerrain(tiles[position.y][position.x].terrain, '炼气')) continue;
    if (!predicate(position)) continue;
    occupied.add(key(position));
    return position;
  }
  throw new Error('地图没有足够的可用位置');
}

function enemyForTier(tier: MapTier, index: number): string {
  const ids = tier === 'S'
    ? ['mountain_wolf']
    : tier === 'M'
      ? ['mountain_wolf', 'fire_crow']
      : ['fire_crow', 'stone_puppet'];
  return ids[index % ids.length] in ENEMIES ? ids[index % ids.length] : 'mountain_wolf';
}

export function generateFloor(tier: MapTier, floor: number, baseSeed: number): FloorSnapshot {
  const config = MAP_TIERS[tier];
  const seed = (baseSeed + (floor - 1) * 100000) >>> 0;
  const rng = new SeededRandom(seed);
  const tiles = createTiles(config.size, rng);
  const spawn = { x: Math.floor(config.size / 2), y: config.size - 3 };
  const returnA = { x: 2, y: 2 };
  const returnB = { x: config.size - 3, y: 2 };
  const depth = { x: Math.floor(config.size / 2), y: 2 };

  carvePath(tiles, spawn, returnA, false);
  carvePath(tiles, spawn, returnB, true);
  if (floor < config.floors) carvePath(tiles, spawn, depth, false);
  revealAround(tiles, spawn);

  const occupied = new Set<string>([key(spawn), key(returnA), key(returnB)]);
  if (floor < config.floors) occupied.add(key(depth));
  const entities: MapEntity[] = [
    { id: `return-${floor}-a`, kind: 'return', position: returnA },
    { id: `return-${floor}-b`, kind: 'return', position: returnB }
  ];
  if (floor < config.floors) entities.push({ id: `depth-${floor}`, kind: 'depth', position: depth });

  const minDistance = (position: Position) => Math.abs(position.x - spawn.x) + Math.abs(position.y - spawn.y) >= 3;
  const townPosition = pickOpenPosition(tiles, rng, occupied, minDistance);
  entities.push({ id: `town-${floor}`, kind: 'town', position: townPosition });
  const secretPosition = pickOpenPosition(tiles, rng, occupied, minDistance);
  entities.push({ id: `secret-${floor}`, kind: 'secret', position: secretPosition, rewardId: floor % 2 === 0 ? 'spirit_bow' : 'cloth_armor' });

  const resourceCount = tier === 'S' ? 3 : tier === 'M' ? 5 : 7;
  for (let i = 0; i < resourceCount; i += 1) {
    entities.push({
      id: `resource-${floor}-${i}`,
      kind: 'resource',
      position: pickOpenPosition(tiles, rng, occupied, minDistance),
      itemId: i % 2 === 0 ? 'spirit_herb' : 'iron_ore',
      count: tier === 'L' ? 2 : 1
    });
  }

  const enemyCount = tier === 'S' ? 3 : tier === 'M' ? 5 : 7;
  for (let i = 0; i < enemyCount; i += 1) {
    entities.push({
      id: `enemy-${floor}-${i}`,
      kind: 'enemy',
      position: pickOpenPosition(tiles, rng, occupied, minDistance),
      enemyId: enemyForTier(tier, i + floor - 1)
    });
  }

  const snapshot: FloorSnapshot = {
    floor,
    width: config.size,
    height: config.size,
    seed,
    tiles,
    entities,
    spawn
  };
  if (!validateFloor(snapshot, floor < config.floors)) throw new Error(`地图连通性验证失败: ${tier}/${floor}/${seed}`);
  return snapshot;
}

export function validateFloor(floor: FloorSnapshot, requiresDepth: boolean): boolean {
  const queue: Position[] = [clonePosition(floor.spawn)];
  const visited = new Set<string>([key(floor.spawn)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const delta of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      if (next.x < 0 || next.y < 0 || next.x >= floor.width || next.y >= floor.height) continue;
      if (visited.has(key(next))) continue;
      if (!canEnterTerrain(floor.tiles[next.y][next.x].terrain, '炼气')) continue;
      visited.add(key(next));
      queue.push(next);
    }
  }
  const returns = floor.entities.filter((entity) => entity.kind === 'return');
  const depths = floor.entities.filter((entity) => entity.kind === 'depth');
  if (returns.length !== 2 || !returns.every((entity) => visited.has(key(entity.position)))) return false;
  if (requiresDepth && (depths.length !== 1 || !visited.has(key(depths[0].position)))) return false;
  if (!requiresDepth && depths.length !== 0) return false;
  return true;
}

export function revealFloorAround(floor: FloorSnapshot, center: Position): void {
  revealAround(floor.tiles, center, 2);
}

export function currentFloor(run: { floor: number; floors: FloorSnapshot[] }): FloorSnapshot {
  const floor = run.floors.find((candidate) => candidate.floor === run.floor);
  if (!floor) throw new Error(`缺少第 ${run.floor} 层地图快照`);
  return floor;
}

export function entityAt(floor: FloorSnapshot, position: Position): MapEntity | undefined {
  return floor.entities.find((entity) => !entity.cleared && same(entity.position, position));
}

