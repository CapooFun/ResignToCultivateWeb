import { describe, expect, it } from 'vitest';
import { MAP_TIERS } from '../src/game/content';
import { generateFloor, validateFloor } from '../src/game/mapGenerator';
import type { MapTier } from '../src/game/types';

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
});

