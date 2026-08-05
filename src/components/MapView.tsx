import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { sound } from '../game/audio';
import { currentFloor, viewGridSize } from '../game/mapGenerator';
import type { Direction, GameCommand, GameState, MapEntity, Position, Terrain } from '../game/types';

interface Bridge {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  columns: number;
  rows: number;
}

const BASE_TILE_SIZE = 48;

const TERRAIN_COLOR: Record<Terrain, number> = {
  plain: 0xdcd2b9,
  forest: 0xaab99a,
  water: 0x91b5bf,
  mountain: 0xa49b8b
};

/** 按主轴判定朝向：点同列/同行或更远格子也能往该方向走一步（与滑动一致） */
function directionBetween(from: Position, to: Position): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function entityGlyph(entity: MapEntity): string {
  switch (entity.kind) {
    case 'enemy':
      if (entity.enemyRank === 'boss') return '王';
      if (entity.enemyRank === 'elite') return '精';
      return '妖';
    case 'resource': return entity.itemId === 'iron_ore' ? '矿' : entity.itemId === 'spirit_silk' ? '丝' : '材';
    case 'spring': return '泉';
    case 'secret': return '缘';
    case 'return': return '回';
    case 'depth': return '传';
  }
}

class GridScene extends Phaser.Scene {
  bridge!: Bridge;
  layer!: Phaser.GameObjects.Container;
  pointerStart: Position | null = null;
  lastRenderKey = '';

  constructor() {
    super('grid');
  }

  create(): void {
    this.bridge = this.game.registry.get('bridge') as Bridge;
    this.cameras.main.setBackgroundColor('#17201c');
    this.layer = this.add.container(0, 0);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerStart = { x: pointer.x, y: pointer.y };
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    const keys = this.input.keyboard?.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    if (keys) {
      const bind = (name: string, direction: Direction) => keys[name].on('down', () => {
        if (this.bridge.state.popup) return;
        this.bridge.dispatch({ type: 'MOVE', direction });
      });
      bind('UP', 'up'); bind('W', 'up'); bind('DOWN', 'down'); bind('S', 'down');
      bind('LEFT', 'left'); bind('A', 'left'); bind('RIGHT', 'right'); bind('D', 'right');
    }
    this.refresh(true);
  }

  private tileSize(): number {
    const { columns, rows } = this.bridge;
    return Math.max(28, Math.min(
      Math.floor((7 * BASE_TILE_SIZE) / columns),
      Math.floor((9 * BASE_TILE_SIZE) / rows)
    ));
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const state = this.bridge.state;
    if (!state.run || state.combat || state.popup || !this.pointerStart) {
      this.pointerStart = null;
      return;
    }
    const dx = pointer.x - this.pointerStart.x;
    const dy = pointer.y - this.pointerStart.y;
    this.pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) {
      const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.bridge.dispatch({ type: 'MOVE', direction });
      return;
    }
    const floor = currentFloor(state.run);
    const { columns, rows } = this.bridge;
    const tilePx = this.tileSize();
    const startX = Phaser.Math.Clamp(state.run.playerPosition.x - Math.floor(columns / 2), 0, Math.max(0, floor.width - columns));
    const startY = Phaser.Math.Clamp(state.run.playerPosition.y - Math.floor(rows / 2), 0, Math.max(0, floor.height - rows));
    // 用世界坐标，避免画布被 CSS 拉伸后点到错格
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;
    const tile = { x: startX + Math.floor(worldX / tilePx), y: startY + Math.floor(worldY / tilePx) };
    const direction = directionBetween(state.run.playerPosition, tile);
    if (direction) this.bridge.dispatch({ type: 'MOVE', direction });
  }

  refresh(force = false): void {
    const state = this.bridge.state;
    const { columns, rows } = this.bridge;
    const TILE_SIZE = this.tileSize();
    const renderKey = JSON.stringify({
      scene: state.scene,
      position: state.run?.playerPosition,
      floor: state.run?.floor,
      realmLevel: state.player.realmLevel,
      columns,
      rows,
      cleared: state.run?.floors.flatMap((floor) => floor.entities.filter((entity) => entity.cleared).map((entity) => entity.id)),
      action: state.combat?.lastAction?.id,
      hp: state.combat?.enemy.hp
    });
    if (!force && renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;
    this.layer.removeAll(true);
    if (!state.run) return;
    const floor = currentFloor(state.run);
    const startX = Phaser.Math.Clamp(state.run.playerPosition.x - Math.floor(columns / 2), 0, Math.max(0, floor.width - columns));
    const startY = Phaser.Math.Clamp(state.run.playerPosition.y - Math.floor(rows / 2), 0, Math.max(0, floor.height - rows));

    for (let viewY = 0; viewY < rows; viewY += 1) {
      for (let viewX = 0; viewX < columns; viewX += 1) {
        const mapX = startX + viewX;
        const mapY = startY + viewY;
        if (mapY < 0 || mapX < 0 || mapY >= floor.height || mapX >= floor.width) continue;
        const tile = floor.tiles[mapY][mapX];
        const centerX = viewX * TILE_SIZE + TILE_SIZE / 2;
        const centerY = viewY * TILE_SIZE + TILE_SIZE / 2;
        const color = tile.revealed ? TERRAIN_COLOR[tile.terrain] : 0x242d28;
        const rectangle = this.add.rectangle(centerX, centerY, TILE_SIZE - 3, TILE_SIZE - 3, color);
        rectangle.setStrokeStyle(1, tile.revealed ? 0x59685f : 0x161e19, tile.revealed ? 0.48 : 0.8);
        this.layer.add(rectangle);
        if (!tile.revealed) {
          if ((mapX + mapY) % 3 === 0) this.layer.add(this.add.circle(centerX, centerY, 1.2, 0x718076, 0.12));
          continue;
        }
        if (tile.terrain === 'forest') {
          this.layer.add(this.add.circle(centerX - 7, centerY + 3, 8, 0x3f6750, 0.14));
          this.layer.add(this.add.circle(centerX + 6, centerY - 4, 10, 0x365d49, 0.12));
        } else if (tile.terrain === 'water') {
          const wave = this.add.graphics();
          wave.lineStyle(1, 0x446f7a, 0.25);
          wave.beginPath(); wave.moveTo(centerX - 13, centerY - 4); wave.lineTo(centerX - 4, centerY - 4); wave.lineTo(centerX, centerY - 7); wave.lineTo(centerX + 5, centerY - 4); wave.lineTo(centerX + 13, centerY - 4); wave.strokePath();
          wave.beginPath(); wave.moveTo(centerX - 10, centerY + 6); wave.lineTo(centerX - 2, centerY + 6); wave.lineTo(centerX + 2, centerY + 3); wave.lineTo(centerX + 7, centerY + 6); wave.lineTo(centerX + 11, centerY + 6); wave.strokePath();
          this.layer.add(wave);
        } else if (tile.terrain === 'mountain') {
          this.layer.add(this.add.triangle(centerX, centerY + 2, -12, 9, 0, -10, 12, 9, 0x605f58, 0.16));
          this.layer.add(this.add.triangle(centerX + 8, centerY + 7, -8, 6, 0, -7, 8, 6, 0x504f49, 0.1));
        } else if ((mapX * 7 + mapY) % 4 === 0) {
          this.layer.add(this.add.circle(centerX + 11, centerY - 10, 1.6, 0x766f5c, 0.2));
        }
      }
    }

    for (const entity of floor.entities) {
      if (entity.cleared) continue;
      const tile = floor.tiles[entity.position.y][entity.position.x];
      if (!tile.revealed) continue;
      const viewX = entity.position.x - startX;
      const viewY = entity.position.y - startY;
      if (viewX < 0 || viewY < 0 || viewX >= columns || viewY >= rows) continue;
      const isEnemy = entity.kind === 'enemy';
      const isElite = isEnemy && entity.enemyRank === 'elite';
      const isBoss = isEnemy && entity.enemyRank === 'boss';
      const markerX = viewX * TILE_SIZE + TILE_SIZE / 2;
      const markerY = viewY * TILE_SIZE + TILE_SIZE / 2;
      const fill = isBoss ? 0x5a1f48 : isElite ? 0x8a4a1f : isEnemy ? 0x85342f : 0xf4ecda;
      const stroke = isBoss ? 0x3a0f2e : isElite ? 0x5c3010 : isEnemy ? 0x5c1e1c : 0x53645a;
      const aura = isBoss ? 0x4a1838 : isElite ? 0x5a3018 : isEnemy ? 0x3f1918 : 0x3f5549;
      const auraStroke = isBoss ? 0xe0a0d0 : isElite ? 0xe0b872 : isEnemy ? 0xd08a72 : 0xe0cf9d;
      const outer = this.add.circle(markerX, markerY, TILE_SIZE * 0.4, aura, 0.26);
      outer.setStrokeStyle(1, auraStroke, 0.46);
      const marker = this.add.circle(markerX, markerY, TILE_SIZE * 0.32, fill);
      marker.setStrokeStyle(1.5, stroke);
      if (state.combat?.enemyEntityId === entity.id) marker.setName('enemy-target');
      const glyph = this.add.text(markerX, markerY, entityGlyph(entity), {
        fontFamily: 'serif', fontSize: `${Math.max(12, Math.floor(TILE_SIZE * 0.35))}px`, color: isEnemy ? '#fff7e7' : '#24352d', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.layer.add([outer, marker, glyph]);
      if (state.combat?.enemyEntityId === entity.id) {
        const barWidth = TILE_SIZE * 0.8;
        const ratio = state.combat.enemy.hp / state.combat.enemy.maxHp;
        this.layer.add(this.add.rectangle(markerX, viewY * TILE_SIZE + 3.5, barWidth + 2, 6, 0x1c0f0e));
        this.layer.add(this.add.rectangle(markerX - barWidth * (1 - ratio) / 2, viewY * TILE_SIZE + 3.5, barWidth * ratio, 4, 0xd26050));
      }
    }

    const playerViewX = state.run.playerPosition.x - startX;
    const playerViewY = state.run.playerPosition.y - startY;
    const playerX = playerViewX * TILE_SIZE + TILE_SIZE / 2;
    const playerY = playerViewY * TILE_SIZE + TILE_SIZE / 2;
    const playerAura = this.add.circle(playerX, playerY, TILE_SIZE * 0.42, 0xe1c36f, 0.12);
    playerAura.setStrokeStyle(1, 0xe8d8a8, 0.58);
    const player = this.add.rectangle(playerX, playerY, TILE_SIZE * 0.56, TILE_SIZE * 0.56, 0x244b3c);
    player.setRotation(Math.PI / 4).setStrokeStyle(2, 0xe8d8a8).setName('player-marker');
    const glyph = this.add.text(player.x, player.y, '我', { fontFamily: 'serif', fontSize: `${Math.max(13, Math.floor(TILE_SIZE * 0.38))}px`, color: '#fff7e7', fontStyle: 'bold' }).setOrigin(0.5);
    this.layer.add([playerAura, player, glyph]);
    this.playLastAction();
  }

  private playLastAction(): void {
    const action = this.bridge.state.combat?.lastAction;
    if (!action) return;
    const actor = action.actor === 'player' ? this.layer.getByName('player-marker') : this.layer.getByName('enemy-target');
    if (actor) {
      this.tweens.add({ targets: actor, scaleX: 1.28, scaleY: 1.28, yoyo: true, duration: 130, ease: 'Sine.Out' });
      const label = action.missed ? '闪避' : action.kind === 'potion' ? `+${action.healing || action.mpDelta}` : `-${action.damage}${action.critical ? ' 暴' : ''}`;
      const target = action.actor === 'player' ? this.layer.getByName('enemy-target') : this.layer.getByName('player-marker');
      if (target) {
        const transform = target as unknown as Phaser.GameObjects.Components.Transform;
        const text = this.add.text(transform.x, transform.y - 18, label, {
          fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color: action.kind === 'potion' ? '#2b7a52' : '#b22f2b',
          stroke: '#fff7e7', strokeThickness: 3
        }).setOrigin(0.5);
        this.layer.add(text);
        this.tweens.add({ targets: text, y: text.y - 24, alpha: 0, duration: 380, onComplete: () => text.destroy() });
      }
    }
  }
}

interface MapViewProps {
  state: GameState;
  dispatch: (command: GameCommand) => void;
}

export function MapView({ state, dispatch }: MapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const { columns, rows } = viewGridSize(state.player.realmLevel);
  const bridgeRef = useRef<Bridge>({ state, dispatch, columns, rows });
  const animationRef = useRef(0);
  const lastStepRef = useRef<{ floor: number; x: number; y: number; steps: number } | null>(null);
  const pendingAnimationId = state.combat?.awaitingAnimation ? (state.combat.lastAction?.id ?? 0) : 0;

  useEffect(() => {
    bridgeRef.current = { state, dispatch, columns, rows };
    const scene = gameRef.current?.scene.getScene('grid') as GridScene | undefined;
    if (scene?.bridge) {
      scene.bridge = bridgeRef.current;
      scene.refresh();
    }
  }, [state, dispatch, columns, rows]);

  useEffect(() => {
    const run = state.run;
    if (!run) {
      lastStepRef.current = null;
      return;
    }
    const next = {
      floor: run.floor,
      x: run.playerPosition.x,
      y: run.playerPosition.y,
      steps: run.totalSteps
    };
    const prev = lastStepRef.current;
    lastStepRef.current = next;
    if (!prev) return;
    if (prev.floor === next.floor && prev.steps < next.steps && (prev.x !== next.x || prev.y !== next.y)) {
      sound.playMove();
    }
  }, [state.run?.floor, state.run?.playerPosition.x, state.run?.playerPosition.y, state.run?.totalSteps]);

  useEffect(() => {
    if (pendingAnimationId <= animationRef.current) return;
    animationRef.current = pendingAnimationId;
    const timer = window.setTimeout(() => dispatch({ type: 'COMBAT_ANIMATION_DONE' }), 390);
    const failsafe = window.setTimeout(() => dispatch({ type: 'COMBAT_ANIMATION_DONE' }), 800);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(failsafe);
    };
  }, [pendingAnimationId, dispatch]);

  useEffect(() => {
    if (!hostRef.current) return;
    gameRef.current?.destroy(true);
    hostRef.current.replaceChildren();
    gameRef.current = null;
    let cancelled = false;
    const bootTimer = window.setTimeout(() => {
      if (cancelled || !hostRef.current || gameRef.current) return;
      const tile = Math.max(28, Math.min(
        Math.floor((7 * BASE_TILE_SIZE) / columns),
        Math.floor((9 * BASE_TILE_SIZE) / rows)
      ));
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: columns * tile,
        height: rows * tile,
        parent: hostRef.current,
        transparent: false,
        render: { antialias: true, pixelArt: false },
        // FIT：保持比例完整显示；勿用 ENVELOP + CSS 强行拉满，否则点格方向会错、像卡住
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [GridScene],
        input: { activePointers: 2 }
      });
      game.registry.set('bridge', bridgeRef.current);
      gameRef.current = game;
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      gameRef.current?.destroy(true);
      hostRef.current?.replaceChildren();
      gameRef.current = null;
    };
  }, [columns, rows]);

  return <div className="map-view" ref={hostRef} aria-label="探索地图：点击方向格或滑动移动" />;
}

export default MapView;
