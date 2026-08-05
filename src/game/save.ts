import { CONTENT_VERSION } from './content';
import { migrateGameState, SAVE_VERSION } from './core';
import type { GameState, SaveEnvelope } from './types';

const DB_NAME = 'resign-to-cultivate';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const CURRENT_KEY = 'current';
const BACKUP_KEY = 'backup';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
  });
}

async function getValue<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('读取存档失败'));
    transaction.oncomplete = () => db.close();
  });
}

async function putValue(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('保存存档失败')); };
  });
}

async function clearValues(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('清除存档失败')); };
  });
}

export function createEnvelope(state: GameState): SaveEnvelope {
  return {
    saveVersion: SAVE_VERSION,
    contentVersion: CONTENT_VERSION,
    buildVersion: state.meta.buildVersion,
    savedAt: Date.now(),
    state: { ...state, meta: { ...state.meta, updatedAt: Date.now() } }
  };
}

export function parseEnvelope(raw: unknown): SaveEnvelope {
  if (!raw || typeof raw !== 'object') throw new Error('存档根对象无效');
  const envelope = raw as Partial<SaveEnvelope>;
  if (typeof envelope.saveVersion !== 'number') throw new Error(`不支持的存档版本：${String(envelope.saveVersion)}`);
  if (envelope.saveVersion > SAVE_VERSION) throw new Error(`不支持的存档版本：${String(envelope.saveVersion)}`);
  if (!envelope.state || typeof envelope.state !== 'object') throw new Error('存档缺少游戏状态');
  // 始终走迁移以刷新派生数值（含临时背包倍率等）
  const state = migrateGameState(envelope.state);
  return {
    saveVersion: SAVE_VERSION,
    contentVersion: CONTENT_VERSION,
    buildVersion: envelope.buildVersion ?? state.meta.buildVersion,
    savedAt: envelope.savedAt ?? Date.now(),
    state
  };
}

export async function saveState(state: GameState): Promise<void> {
  const previous = await getValue<SaveEnvelope>(CURRENT_KEY);
  if (previous) await putValue(BACKUP_KEY, previous);
  await putValue(CURRENT_KEY, createEnvelope(state));
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch { /* 非阻断能力 */ }
  }
}

export async function loadState(): Promise<{ state: GameState | null; recovered: boolean }> {
  const current = await getValue<SaveEnvelope>(CURRENT_KEY);
  if (current) {
    try { return { state: parseEnvelope(current).state, recovered: false }; } catch { /* 尝试备份 */ }
  }
  const backup = await getValue<SaveEnvelope>(BACKUP_KEY);
  if (backup) return { state: parseEnvelope(backup).state, recovered: true };
  return { state: null, recovered: false };
}

export function exportState(state: GameState): string {
  return JSON.stringify(createEnvelope(state), null, 2);
}

export function importState(serialized: string): GameState {
  return parseEnvelope(JSON.parse(serialized)).state;
}

export async function clearSavedState(): Promise<void> {
  await clearValues();
}
