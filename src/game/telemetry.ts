import type { GameCommand, GameState } from './types';

const PLAYER_KEY = 'rtc-telemetry-player';
const OPT_OUT_KEY = 'rtc-telemetry-optout';
const STATS_KEY = 'rtc-telemetry-stats';
const QUEUE_KEY = 'rtc-telemetry-queue';
const MAX_QUEUE = 40;
const FLUSH_EVERY_MS = 45_000;

export type TelemetryEventName =
  | 'session_start'
  | 'run_start'
  | 'run_end'
  | 'floor_advance'
  | 'combat_win'
  | 'combat_flee'
  | 'death'
  | 'reincarnate'
  | 'craft'
  | 'cheat_on'
  | 'cheat_off'
  | 'session_summary';

export interface PlayStats {
  playerId: string;
  firstSeenAt: number;
  sessions: number;
  runs: number;
  runEnds: number;
  deaths: number;
  reincarnations: number;
  combatWins: number;
  combatFlees: number;
  crafts: number;
  cheatOns: number;
  cheatOffs: number;
  playTimeMs: number;
  tiers: Record<string, number>;
  peakRealmLevel: number;
  lastEventAt: number;
}

interface TelemetryEvent {
  name: TelemetryEventName;
  at: number;
  data?: Record<string, string | number | boolean | null>;
}

interface TelemetryPayload {
  v: 1;
  game: 'resign-to-cultivate';
  build: string;
  playerId: string;
  event: TelemetryEvent;
  stats: PlayStats;
}

function webhookUrl(): string {
  const raw = import.meta.env.VITE_TELEMETRY_WEBHOOK as string | undefined;
  return typeof raw === 'string' ? raw.trim() : '';
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储满或隐私模式：忽略 */
  }
}

function ensurePlayerId(): string {
  const existing = localStorage.getItem(PLAYER_KEY);
  if (existing) return existing;
  const id = `p_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  try {
    localStorage.setItem(PLAYER_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

function emptyStats(playerId: string): PlayStats {
  const now = Date.now();
  return {
    playerId,
    firstSeenAt: now,
    sessions: 0,
    runs: 0,
    runEnds: 0,
    deaths: 0,
    reincarnations: 0,
    combatWins: 0,
    combatFlees: 0,
    crafts: 0,
    cheatOns: 0,
    cheatOffs: 0,
    playTimeMs: 0,
    tiers: {},
    peakRealmLevel: 1,
    lastEventAt: now
  };
}

let stats = emptyStats('pending');
let queue: TelemetryEvent[] = [];
let flushTimer: number | null = null;
let playAnchor = Date.now();
let started = false;

/** 仅测试用：重置模块状态 */
export function resetTelemetryForTests(): void {
  stats = emptyStats('pending');
  queue = [];
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  playAnchor = Date.now();
  started = false;
}

export function isTelemetryOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return true;
  }
}

export function setTelemetryOptOut(optOut: boolean): void {
  try {
    localStorage.setItem(OPT_OUT_KEY, optOut ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (optOut) {
    queue = [];
    writeJson(QUEUE_KEY, queue);
  }
}

export function getPlayStats(): PlayStats {
  return { ...stats, tiers: { ...stats.tiers } };
}

function persist(): void {
  writeJson(STATS_KEY, stats);
  writeJson(QUEUE_KEY, queue);
}

function bumpPlayTime(): void {
  const now = Date.now();
  if (!document.hidden) {
    stats.playTimeMs += Math.max(0, now - playAnchor);
  }
  playAnchor = now;
  stats.lastEventAt = now;
}

function enqueue(name: TelemetryEventName, data?: TelemetryEvent['data']): void {
  if (!started || isTelemetryOptedOut() || !webhookUrl()) return;
  bumpPlayTime();
  const event: TelemetryEvent = { name, at: Date.now(), data };
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  persist();
  scheduleFlush();
  if (name === 'death' || name === 'run_end' || name === 'session_summary' || name === 'cheat_on' || name === 'cheat_off') {
    void flushTelemetry();
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushTelemetry();
  }, FLUSH_EVERY_MS);
}

function toDiscordBody(payload: TelemetryPayload): string {
  const s = payload.stats;
  const mins = Math.round(s.playTimeMs / 60000);
  const lines = [
    `事件 **${payload.event.name}** · 构建 \`${payload.build}\``,
    `玩家 \`${payload.playerId}\``,
    `会话 ${s.sessions} · 探索 ${s.runs} · 回府 ${s.runEnds} · 死亡 ${s.deaths}`,
    `胜 ${s.combatWins} · 逃 ${s.combatFlees} · 炼制 ${s.crafts} · 游玩约 ${mins} 分`,
    `巅峰境界 Lv.${s.peakRealmLevel} · 图档 ${JSON.stringify(s.tiers)}`
  ];
  if (payload.event.data && Object.keys(payload.event.data).length > 0) {
    lines.push('详情：`' + JSON.stringify(payload.event.data) + '`');
  }
  return JSON.stringify({
    content: lines.join('\n')
  });
}

function toNtfyBody(payload: TelemetryPayload): string {
  const s = payload.stats;
  const mins = Math.round(s.playTimeMs / 60000);
  return [
    `[${payload.event.name}] ${payload.playerId}`,
    `会话${s.sessions} 探索${s.runs} 死亡${s.deaths} 胜${s.combatWins} 逃${s.combatFlees} ${mins}分`,
    payload.event.data ? JSON.stringify(payload.event.data) : ''
  ].filter(Boolean).join('\n');
}

export async function flushTelemetry(): Promise<void> {
  if (!started || isTelemetryOptedOut()) return;
  const url = webhookUrl();
  if (!url || queue.length === 0) return;
  bumpPlayTime();
  const batch = queue.slice();
  queue = [];
  persist();
  for (const event of batch) {
    const payload: TelemetryPayload = {
      v: 1,
      game: 'resign-to-cultivate',
      build: __BUILD_VERSION__,
      playerId: stats.playerId,
      event,
      stats: getPlayStats()
    };
    const isDiscord = /discord(?:app)?\.com\/api\/webhooks\//i.test(url);
    const isNtfy = /ntfy\.sh\//i.test(url);
    const body = isDiscord ? toDiscordBody(payload) : isNtfy ? toNtfyBody(payload) : JSON.stringify(payload);
    const contentType = isNtfy ? 'text/plain' : 'application/json';
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
        keepalive: true,
        mode: 'cors'
      });
    } catch {
      queue = [...batch, ...queue].slice(-MAX_QUEUE);
      persist();
      break;
    }
  }
}

export function startTelemetry(state: GameState): void {
  if (started) return;
  started = true;
  const playerId = ensurePlayerId();
  stats = { ...emptyStats(playerId), ...readJson<Partial<PlayStats>>(STATS_KEY, {}), playerId };
  stats.tiers = stats.tiers ?? {};
  queue = readJson<TelemetryEvent[]>(QUEUE_KEY, []);
  playAnchor = Date.now();
  stats.sessions += 1;
  stats.peakRealmLevel = Math.max(stats.peakRealmLevel, state.player.peakRealmLevel || state.player.realmLevel || 1);
  persist();
  enqueue('session_start', {
    scene: state.scene,
    deaths: state.reincarnation.totalDeaths,
    realmLevel: state.player.realmLevel
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      bumpPlayTime();
      persist();
      enqueue('session_summary', { reason: 'hidden' });
    } else {
      playAnchor = Date.now();
    }
  });
  window.addEventListener('pagehide', () => {
    bumpPlayTime();
    persist();
    void flushTelemetry();
  });
}

export function observeTelemetry(before: GameState, after: GameState, command: GameCommand): void {
  if (!started || isTelemetryOptedOut()) return;
  stats.peakRealmLevel = Math.max(stats.peakRealmLevel, after.player.peakRealmLevel || after.player.realmLevel || 1);

  if (command.type === 'START_RUN' && after.run) {
    stats.runs += 1;
    stats.tiers[command.tier] = (stats.tiers[command.tier] ?? 0) + 1;
    enqueue('run_start', { tier: command.tier, seed: after.run.seed, floor: after.run.floor });
  }

  if (command.type === 'RETURN_CAVE' && before.run && !after.run) {
    stats.runEnds += 1;
    enqueue('run_end', {
      tier: before.run.sizeTier,
      steps: before.run.totalSteps,
      floor: before.run.floor,
      years: before.run.spentYears
    });
  }

  if (command.type === 'ADVANCE_FLOOR' && after.run) {
    enqueue('floor_advance', { tier: after.run.sizeTier, floor: after.run.floor });
  }

  if (command.type === 'COMBAT_ANIMATION_DONE' && before.combat && !after.combat) {
    if (before.combat.outcome === 'victory') {
      stats.combatWins += 1;
      enqueue('combat_win', { enemy: before.combat.enemyId, rank: before.combat.enemyRank });
    } else if (before.combat.outcome === 'fled') {
      stats.combatFlees += 1;
      enqueue('combat_flee', { enemy: before.combat.enemyId, rank: before.combat.enemyRank });
    }
  }

  if (after.reincarnation.totalDeaths > before.reincarnation.totalDeaths) {
    stats.deaths += 1;
    enqueue('death', {
      reason: after.reincarnation.lastDeathReason,
      deaths: after.reincarnation.totalDeaths,
      realmLevel: before.player.realmLevel
    });
  }

  if (command.type === 'REINCARNATE' && after.scene === 'cave' && before.scene === 'reincarnation') {
    stats.reincarnations += 1;
    enqueue('reincarnate', { deaths: after.reincarnation.totalDeaths });
  }

  if (command.type === 'CRAFT') {
    stats.crafts += 1;
    enqueue('craft', { recipeId: command.recipeId });
  }

  if (command.type === 'APPLY_CHEAT') {
    if (after.cheatRestore && !before.cheatRestore) {
      stats.cheatOns += 1;
      enqueue('cheat_on');
    } else if (!after.cheatRestore && before.cheatRestore) {
      stats.cheatOffs += 1;
      enqueue('cheat_off');
    }
  }

  persist();
}
