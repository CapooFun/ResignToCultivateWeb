import { createInitialState, dispatchGameCommand } from './core';
import { clearSavedState, loadState, saveState } from './save';
import type { GameCommand, GameState } from './types';

type Listener = (state: GameState) => void;

export class GameStore {
  private state: GameState;
  private listeners = new Set<Listener>();
  private saveQueue = Promise.resolve();
  private loaded = false;

  constructor() {
    this.state = createInitialState(__BUILD_VERSION__);
  }

  getState(): GameState {
    return this.state;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  async initialize(): Promise<void> {
    try {
      const loaded = await loadState();
      if (loaded.state) {
        this.state = loaded.state;
        this.state.meta.buildVersion = __BUILD_VERSION__;
        if (loaded.recovered) this.state.meta.message = '主存档损坏，已从上一份成功存档恢复。';
        if (this.state.combat?.awaitingAnimation) {
          this.state.combat.awaitingAnimation = false;
          this.state.meta.message = '战斗已从上一个动作结算点继续。';
        }
      } else {
        await saveState(this.state);
      }
    } catch (error) {
      this.state.meta.message = `存档读取失败，已使用新档：${error instanceof Error ? error.message : '未知错误'}`;
    }
    this.loaded = true;
    this.emit();
  }

  dispatch(command: GameCommand): void {
    const result = dispatchGameCommand(this.state, command);
    this.state = result.state;
    this.emit();
    if (result.shouldSave) {
      const snapshot = structuredClone(this.state);
      this.saveQueue = this.saveQueue.then(() => saveState(snapshot)).catch((error) => {
        this.state.meta.message = `自动存档失败：${error instanceof Error ? error.message : '未知错误'}。请导出备份。`;
        this.emit();
      });
    }
  }

  replaceState(state: GameState): void {
    this.state = state;
    this.emit();
    const snapshot = structuredClone(state);
    this.saveQueue = this.saveQueue.then(() => saveState(snapshot));
  }

  async clearAndReset(): Promise<void> {
    await clearSavedState();
    this.state = createInitialState(__BUILD_VERSION__);
    await saveState(this.state);
    this.emit();
  }
}

export const gameStore = new GameStore();
