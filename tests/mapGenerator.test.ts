import { describe, expect, it } from 'vitest';
import { difficultyLayer, ENEMIES, ENEMIES_BY_LAYER, MAP_TIERS, validateContent } from '../src/game/content';
import { generateFloor, validateFloor } from '../src/game/mapGenerator';
import type { MapTier, Terrain } from '../src/game/types';

/** 内格与四邻同地形的平均占比；碎点噪声通常远低于成片生物群落。 */
function terrainCoherence(tiles: Array<Array<{ terrain: Terrain }>>): number {
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  let same = 0;
  let total = 0;
  for (let y = 1; y < tiles.length - 1; y += 1) {
    for (let x = 1; x < tiles[0].length - 1; x += 1) {
      const current = tiles[y][x].terrain;
      for (const delta of dirs) {
        total += 1;
        if (tiles[y + delta.y][x + delta.x].terrain === current) same += 1;
      }
    }
  }
  return same / total;
}

describe('地图生成', () => {
  for (const tier of ['S', 'M', 'L'] as MapTier[]) {
    it(`${tier} 档 100 个种子均满足尺寸、传送门和连通性`, () => {
      const config = MAP_TIERS[tier];
      for (let seed = 1; seed <= 100; seed += 1) {
        for (let floorNumber = 1; floorNumber <= config.floors; floorNumber += 1) {
          const floor = generateFloor(tier, floorNumber, seed * 7919);
          expect(floor.width).toBe(config.size);
          expect(floor.height).toBe(config.size);
          expect(floor.entities.filter((entity) => entity.kind === 'return')).toHaveLength(2);
          expect(floor.entities.filter((entity) => entity.kind === 'depth')).toHaveLength(floorNumber < config.floors ? 1 : 0);
          expect(validateFloor(floor, floorNumber < config.floors)).toBe(true);
        }
      }
    });
  }

  it('地形成片：平均邻接同地形占比明显高于碎点噪声', () => {
    let sum = 0;
    let samples = 0;
    const present = new Set<Terrain>();
    for (const tier of ['S', 'M', 'L'] as MapTier[]) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const floor = generateFloor(tier, 1, seed * 1337);
        sum += terrainCoherence(floor.tiles);
        samples += 1;
        for (const row of floor.tiles) {
          for (const tile of row) present.add(tile.terrain);
        }
      }
    }
    expect(sum / samples).toBeGreaterThan(0.55);
    expect(present.has('plain')).toBe(true);
    expect(present.has('forest')).toBe(true);
    expect(present.has('water')).toBe(true);
    expect(present.has('mountain')).toBe(true);
  });

  it('六层敌人分别对应炼气到化神强敌池', () => {
    expect(validateContent()).toEqual([]);
    expect(difficultyLayer('S', 1)).toBe(1);
    expect(difficultyLayer('M', 1)).toBe(2);
    expect(difficultyLayer('M', 2)).toBe(3);
    expect(difficultyLayer('L', 1)).toBe(4);
    expect(difficultyLayer('L', 2)).toBe(5);
    expect(difficultyLayer('L', 3)).toBe(6);

    const cases: Array<[MapTier, number, number]> = [
      ['S', 1, 1], ['M', 1, 2], ['M', 2, 3], ['L', 1, 4], ['L', 2, 5], ['L', 3, 6]
    ];
    for (const [tier, floorNumber, layer] of cases) {
      const floor = generateFloor(tier, floorNumber, 42);
      const pool = new Set(ENEMIES_BY_LAYER[layer]);
      for (const entity of floor.entities.filter((item) => item.kind === 'enemy')) {
        expect(pool.has(entity.enemyId!)).toBe(true);
      }
    }
    expect(ENEMIES.star_hydra.exp).toBeGreaterThan(ENEMIES.ash_fiend.exp * 2);
    expect(ENEMIES.immortal_colossus.maxHp).toBeGreaterThan(ENEMIES.heaven_crane.maxHp);
  });

  it('每层有精英，中大图末层有首领，小图无首领', () => {
    for (const tier of ['S', 'M', 'L'] as MapTier[]) {
      const config = MAP_TIERS[tier];
      for (let floorNumber = 1; floorNumber <= config.floors; floorNumber += 1) {
        const floor = generateFloor(tier, floorNumber, 99);
        const enemies = floor.entities.filter((entity) => entity.kind === 'enemy');
        const elites = enemies.filter((entity) => entity.enemyRank === 'elite');
        const bosses = enemies.filter((entity) => entity.enemyRank === 'boss');
        const normals = enemies.filter((entity) => (entity.enemyRank ?? 'normal') === 'normal');
        const expectedNormals = tier === 'S' ? 3 : tier === 'M' ? 5 : 7;
        expect(normals).toHaveLength(expectedNormals);
        expect(elites).toHaveLength(1);
        const expectBoss = floorNumber === config.floors && tier !== 'S';
        expect(bosses).toHaveLength(expectBoss ? 1 : 0);
      }
    }
  });
});