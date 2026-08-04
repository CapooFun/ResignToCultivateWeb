import { difficultyLayer, ENEMIES, ENEMIES_BY_LAYER, MAP_TIERS, PASSIVES, SKILLS } from './content';
import { Noise2D } from './noise';
import { SeededRandom } from './prng';
import type { FloorSnapshot, MapEntity, MapTier, Position, Realm, Terrain, Tile } from './types';

export const GENERATOR_VERSION = 5;

const REALM_RANK: Record<Realm, number> = { 炼气: 1, 筑基: 2, 结丹: 3, 元婴: 4, 化神: 5 };
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

/** 海拔 + 湿度双场映射地形（经典生物群落思路），再轻量合并碎点。 */
function createTiles(size: number, rng: SeededRandom): Tile[][] {
  const elevation = new Noise2D(rng.int(1, 0x7fffffff));
  const moisture = new Noise2D(rng.int(1, 0x7fffffff));
  const detail = new Noise2D(rng.int(1, 0x7fffffff));
  const ridge = new Noise2D(rng.int(1, 0x7fffffff));
  // 全图约 2.5～3.5 个主斑块，大图略密一点
  const baseFreq = (2.4 + size / 40) / size;
  const moistFreq = baseFreq * 1.15;
  const detailFreq = baseFreq * 3.2;
  const ridgeFreq = baseFreq * 1.6;

  const tiles: Tile[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x += 1) {
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        row.push({ terrain: 'mountain', revealed: false });
        continue;
      }
      const e = elevation.fbm(x * baseFreq, y * baseFreq, 4, 2.05, 0.5);
      const m = moisture.fbm(x * moistFreq + 19.7, y * moistFreq - 7.3, 3, 2.1, 0.55);
      const d = detail.fbm(x * detailFreq, y * detailFreq, 2, 2, 0.45) * 0.08;
      const r = 1 - Math.abs(ridge.fbm(x * ridgeFreq - 3.1, y * ridgeFreq + 11.4, 3, 2.2, 0.5));
      row.push({ terrain: biomeAt(e + d, m, r), revealed: false });
    }
    tiles.push(row);
  }
  coalesceOrphans(tiles);
  return tiles;
}

function biomeAt(elevation: number, moisture: number, ridged: number): Terrain {
  // elevation/moisture/ridged 约在 [-1,1]；可走地形（平原+林）占多数，山泽成片出现
  if (elevation > 0.34 || (ridged > 0.78 && elevation > 0.18)) return 'mountain';
  if (elevation < -0.38) return 'water';
  if (elevation < -0.20 && moisture > 0.10) return 'water';
  if (moisture > 0.02 || (moisture > -0.12 && elevation > -0.10 && elevation < 0.24)) return 'forest';
  return 'plain';
}

/** 去掉非边界的 1 格孤岛，地形更成片 */
function coalesceOrphans(tiles: Tile[][]): void {
  const height = tiles.length;
  const width = tiles[0].length;
  const dirs = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
  ];
  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const current = tiles[y][x].terrain;
        let same = 0;
        const counts: Partial<Record<Terrain, number>> = {};
        for (const delta of dirs) {
          const neighbor = tiles[y + delta.y][x + delta.x].terrain;
          if (neighbor === current) same += 1;
          counts[neighbor] = (counts[neighbor] ?? 0) + 1;
        }
        if (same > 0) continue;
        let best: Terrain = current;
        let bestCount = -1;
        for (const [terrain, count] of Object.entries(counts) as Array<[Terrain, number]>) {
          if (count > bestCount) {
            best = terrain;
            bestCount = count;
          }
        }
        tiles[y][x].terrain = best;
      }
    }
  }
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

function enemyForLayer(layer: number, index: number): string {
  const ids = ENEMIES_BY_LAYER[layer] ?? ENEMIES_BY_LAYER[1];
  const id = ids[index % ids.length];
  return id in ENEMIES ? id : 'mountain_wolf';
}

function bossForLayer(layer: number): string {
  const ids = ENEMIES_BY_LAYER[layer] ?? ENEMIES_BY_LAYER[1];
  return ids.reduce((best, id) => (ENEMIES[id]?.exp ?? 0) > (ENEMIES[best]?.exp ?? 0) ? id : best);
}

function pickFrom<T>(values: T[], rng: SeededRandom): T {
  return values[Math.floor(rng.next() * values.length) % values.length];
}

function secretReward(layer: number, rng: SeededRandom): Pick<MapEntity, 'passiveId' | 'skillId' | 'rewardId'> {
  const roll = rng.next();
  const passivePool = Object.keys(PASSIVES);
  const skillPool = Object.keys(SKILLS);
  const grade = Math.min(6, Math.max(1, layer));
  const gear = [
    `melee_${grade}`, `ranged_${grade}`, `armor_${grade}`, `shoes_${grade}`, `ring_${grade}`, `belt_${Math.max(1, grade - 1)}`,
    `pill_heal_${grade}`, `pill_mana_${Math.max(1, grade - 1)}`
  ];
  if (roll < 0.28) {
    const offset = (grade - 1) * 2;
    return { passiveId: passivePool[(Math.floor(rng.next() * 6) + offset) % passivePool.length] };
  }
  if (roll < 0.52) {
    const offset = (grade - 1) * 2;
    return { skillId: skillPool[(Math.floor(rng.next() * 6) + offset + layer) % skillPool.length] };
  }
  return { rewardId: pickFrom(gear, rng) };
}

function resourcePoolForLayer(layer: number): readonly string[] {
  const all = [
    'spirit_herb', 'iron_ore', 'spirit_silk', 'frost_petal', 'thunder_copper',
    'dawn_root', 'cloud_sand', 'moon_dew', 'dragon_bone', 'phoenix_plume', 'void_crystal', 'immortal_ash'
  ] as const;
  const size = layer <= 1 ? 3 : layer === 2 ? 5 : layer === 3 ? 8 : layer === 4 ? 10 : 12;
  return all.slice(0, size);
}

export function generateFloor(tier: MapTier, floor: number, baseSeed: number): FloorSnapshot {
  const config = MAP_TIERS[tier];
  const layer = difficultyLayer(tier, floor);
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
  const springPosition = pickOpenPosition(tiles, rng, occupied, minDistance);
  entities.push({ id: `spring-${floor}`, kind: 'spring', position: springPosition });
  const secretPosition = pickOpenPosition(tiles, rng, occupied, minDistance);
  entities.push({ id: `secret-${floor}`, kind: 'secret', position: secretPosition, ...secretReward(layer, rng) });

  const resourceCount = tier === 'S' ? 3 : tier === 'M' ? 5 : 7;
  const pool = resourcePoolForLayer(layer);
  const resourceAmount = layer <= 2 ? 1 : layer <= 4 ? 2 : layer === 5 ? 3 : 4;
  for (let i = 0; i < resourceCount; i += 1) {
    entities.push({
      id: `resource-${floor}-${i}`,
      kind: 'resource',
      position: pickOpenPosition(tiles, rng, occupied, minDistance),
      itemId: pool[(i + floor) % pool.length],
      count: resourceAmount
    });
  }

  const enemyCount = tier === 'S' ? 3 : tier === 'M' ? 5 : 7;
  for (let i = 0; i < enemyCount; i += 1) {
    entities.push({
      id: `enemy-${floor}-${i}`,
      kind: 'enemy',
      position: pickOpenPosition(tiles, rng, occupied, minDistance),
      enemyId: enemyForLayer(layer, i),
      enemyRank: 'normal'
    });
  }

  // 每层额外 1 精英；中/大图末层再额外 1 首领（小图仅精英）
  entities.push({
    id: `elite-${floor}`,
    kind: 'enemy',
    position: pickOpenPosition(tiles, rng, occupied, minDistance),
    enemyId: enemyForLayer(layer, enemyCount),
    enemyRank: 'elite'
  });
  if (floor === config.floors && tier !== 'S') {
    entities.push({
      id: `boss-${floor}`,
      kind: 'enemy',
      position: pickOpenPosition(tiles, rng, occupied, minDistance),
      enemyId: bossForLayer(layer),
      enemyRank: 'boss'
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

export function revealFloorAround(floor: FloorSnapshot, center: Position, radius = 2): void {
  revealAround(floor.tiles, center, radius);
}

/** 炼气 0；筑基/结丹 +1；元婴 +2；化神 +3（两侧各扩一格） */
export function visionBonus(realmLevel: number): number {
  if (realmLevel >= 5) return 3;
  if (realmLevel >= 4) return 2;
  if (realmLevel >= 2) return 1;
  return 0;
}

/** 炼气/筑基 2；结丹/元婴 3；化神 4 */
export function fogRevealRadius(realmLevel: number): number {
  if (realmLevel >= 5) return 4;
  if (realmLevel >= 3) return 3;
  return 2;
}

export function viewGridSize(realmLevel: number): { columns: number; rows: number } {
  const bonus = visionBonus(realmLevel);
  return {
    columns: 7 + bonus * 2,
    rows: 9 + bonus * 2
  };
}

export function currentFloor(run: { floor: number; floors: FloorSnapshot[] }): FloorSnapshot {
  const floor = run.floors.find((candidate) => candidate.floor === run.floor);
  if (!floor) throw new Error(`缺少第 ${run.floor} 层地图快照`);
  return floor;
}

export function entityAt(floor: FloorSnapshot, position: Position): MapEntity | undefined {
  return floor.entities.find((entity) => !entity.cleared && same(entity.position, position));
}
