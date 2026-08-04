import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ENEMIES, ITEMS } from '../game/content';
import { currentFloor } from '../game/mapGenerator';
import type { Direction, GameCommand, GameState, MapEntity, Position, Terrain } from '../game/types';

interface Bridge {
  state: GameState;
  dispatch: (command: GameCommand) => void;
}

const VIEW_COLUMNS = 7;
const VIEW_ROWS = 9;
const TILE_SIZE = 48;

const TERRAIN_COLOR: Record<Terrain, number> = {
  plain: 0xdcd2b9,
  forest: 0xaab99a,
  water: 0x91b5bf,
  mountain: 0xa49b8b
};

function directionBetween(from: Position, to: Position): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  return 'up';
}

function entityGlyph(entity: MapEntity): string {
  switch (entity.kind) {
    case 'enemy': return '妖';
    case 'resource': return entity.itemId === 'iron_ore' ? '矿' : '草';
    case 'town': return '镇';
    case 'secret': return '缘';
    case 'return': return '府';
    case 'depth': return '深';
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
      const bind = (name: string, direction: Direction) => keys[name].on('down', () => this.bridge.dispatch({ type: 'MOVE', direction }));
      bind('UP', 'up'); bind('W', 'up'); bind('DOWN', 'down'); bind('S', 'down');
      bind('LEFT', 'left'); bind('A', 'left'); bind('RIGHT', 'right'); bind('D', 'right');
    }
    this.refresh(true);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const state = this.bridge.state;
    if (!state.run || state.combat || !this.pointerStart) return;
    const dx = pointer.x - this.pointerStart.x;
    const dy = pointer.y - this.pointerStart.y;
    this.pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) {
      const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.bridge.dispatch({ type: 'MOVE', direction });
      return;
    }
    const floor = currentFloor(state.run);
    const startX = Phaser.Math.Clamp(state.run.playerPosition.x - Math.floor(VIEW_COLUMNS / 2), 0, floor.width - VIEW_COLUMNS);
    const startY = Phaser.Math.Clamp(state.run.playerPosition.y - Math.floor(VIEW_ROWS / 2), 0, floor.height - VIEW_ROWS);
    const tile = { x: startX + Math.floor(pointer.x / TILE_SIZE), y: startY + Math.floor(pointer.y / TILE_SIZE) };
    const direction = directionBetween(state.run.playerPosition, tile);
    if (direction) this.bridge.dispatch({ type: 'MOVE', direction });
  }

  refresh(force = false): void {
    const state = this.bridge.state;
    const renderKey = JSON.stringify({
      scene: state.scene,
      position: state.run?.playerPosition,
      floor: state.run?.floor,
      cleared: state.run?.floors.flatMap((floor) => floor.entities.filter((entity) => entity.cleared).map((entity) => entity.id)),
      action: state.combat?.lastAction?.id,
      hp: state.combat?.enemy.hp
    });
    if (!force && renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;
    this.layer.removeAll(true);
    if (!state.run) return;
    const floor = currentFloor(state.run);
    const startX = Phaser.Math.Clamp(state.run.playerPosition.x - Math.floor(VIEW_COLUMNS / 2), 0, floor.width - VIEW_COLUMNS);
    const startY = Phaser.Math.Clamp(state.run.playerPosition.y - Math.floor(VIEW_ROWS / 2), 0, floor.height - VIEW_ROWS);

    for (let viewY = 0; viewY < VIEW_ROWS; viewY += 1) {
      for (let viewX = 0; viewX < VIEW_COLUMNS; viewX += 1) {
        const mapX = startX + viewX;
        const mapY = startY + viewY;
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
      if (viewX < 0 || viewY < 0 || viewX >= VIEW_COLUMNS || viewY >= VIEW_ROWS) continue;
      const isEnemy = entity.kind === 'enemy';
      const markerX = viewX * TILE_SIZE + 24;
      const markerY = viewY * TILE_SIZE + 24;
      const outer = this.add.circle(markerX, markerY, 19, isEnemy ? 0x3f1918 : 0x3f5549, 0.26);
      outer.setStrokeStyle(1, isEnemy ? 0xd08a72 : 0xe0cf9d, 0.46);
      const marker = this.add.circle(markerX, markerY, 15.5, isEnemy ? 0x85342f : 0xf4ecda);
      marker.setStrokeStyle(1.5, isEnemy ? 0x5c1e1c : 0x53645a);
      if (state.combat?.enemyEntityId === entity.id) marker.setName('enemy-target');
      const glyph = this.add.text(markerX, markerY, entityGlyph(entity), {
        fontFamily: 'serif', fontSize: '17px', color: isEnemy ? '#fff7e7' : '#24352d', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.layer.add([outer, marker, glyph]);
      if (state.combat?.enemyEntityId === entity.id) {
        const barWidth = 38;
        const ratio = state.combat.enemy.hp / state.combat.enemy.maxHp;
        this.layer.add(this.add.rectangle(markerX, viewY * TILE_SIZE + 3.5, barWidth + 2, 6, 0x1c0f0e));
        this.layer.add(this.add.rectangle(markerX - barWidth * (1 - ratio) / 2, viewY * TILE_SIZE + 3.5, barWidth * ratio, 4, 0xd26050));
      }
    }

    const playerViewX = state.run.playerPosition.x - startX;
    const playerViewY = state.run.playerPosition.y - startY;
    const playerX = playerViewX * TILE_SIZE + 24;
    const playerY = playerViewY * TILE_SIZE + 24;
    const playerAura = this.add.circle(playerX, playerY, 20, 0xe1c36f, 0.12);
    playerAura.setStrokeStyle(1, 0xe8d8a8, 0.58);
    const player = this.add.rectangle(playerX, playerY, 27, 27, 0x244b3c);
    player.setRotation(Math.PI / 4).setStrokeStyle(2, 0xe8d8a8).setName('player-marker');
    const glyph = this.add.text(player.x, player.y, '我', { fontFamily: 'serif', fontSize: '18px', color: '#fff7e7', fontStyle: 'bold' }).setOrigin(0.5);
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
  const bridgeRef = useRef<Bridge>({ state, dispatch });
  const animationRef = useRef(0);
  const pendingAnimationId = state.combat?.awaitingAnimation ? (state.combat.lastAction?.id ?? 0) : 0;

  useEffect(() => {
    bridgeRef.current = { state, dispatch };
    const scene = gameRef.current?.scene.getScene('grid') as GridScene | undefined;
    if (scene?.bridge) {
      scene.bridge = bridgeRef.current;
      scene.refresh();
    }
  }, [state, dispatch]);

  useEffect(() => {
    if (pendingAnimationId <= animationRef.current) return;
    animationRef.current = pendingAnimationId;
    const timer = window.setTimeout(() => dispatch({ type: 'COMBAT_ANIMATION_DONE' }), 390);
    return () => window.clearTimeout(timer);
  }, [pendingAnimationId, dispatch]);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    let cancelled = false;
    const bootTimer = window.setTimeout(() => {
      if (cancelled || !hostRef.current || gameRef.current) return;
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: VIEW_COLUMNS * TILE_SIZE,
        height: VIEW_ROWS * TILE_SIZE,
        parent: hostRef.current,
        transparent: false,
        render: { antialias: true, pixelArt: false },
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
  }, []);

  return <div className="map-view" ref={hostRef} aria-label="探索地图：点击相邻格或滑动移动" />;
}

export default MapView;
