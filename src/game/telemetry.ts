import { usedSlots } from './inventory';
import type { GameCommand, GameState } from './types';

const PLAYER_KEY = 'rtc-telemetry-player';
const OPT_OUT_KEY = 'rtc-telemetry-optout';
const STATS_KEY = 'rtc-telemetry-stats';
const QUEUE_KEY = 'rtc-telemetry-queue';
const MAX_QUEUE = 50;
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
  | 'upgrade_facility'
  | 'buy_talent'
  | 'discard'
  | 'mine_collect'
  | 'cheat_on'
  | 'cheat_off'
  | 'milestone'
  | 'session_summary';

export interface DeviceProfile {
  os: 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'other';
  form: 'phone' | 'tablet' | 'desktop';
  touch: boolean;
  standalone: boolean;
  screen: string;
  lang: string;
  tz: string;
}

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
  eliteKills: number;
  bossKills: number;
  crafts: number;
  alchemyCrafts: number;
  forgeCrafts: number;
  facilityUpgrades: number;
  talentBuys: number;
  discards: number;
  mineCollects: number;
  cheatOns: number;
  cheatOffs: number;
  playTimeMs: number;
  maxStepsOneRun: number;
  maxFloorReached: number;
  tiers: Record<string, number>;
  peakRealmLevel: number;
  maxSkills: number;
  maxPassives: number;
  maxKarma: number;
  maxSpiritStones: number;
  milestones: string[];
  device: DeviceProfile | null;
  lastEventAt: number;
}

type EventData = Record<string, string | number | boolean | null>;

interface TelemetryEvent {
  name: TelemetryEventName;
  at: number;
  data?: EventData;
}

interface TelemetryPayload {
  v: 2;
  game: 'resign-to-cultivate';
  build: string;
  playerId: string;
  device: DeviceProfile | null;
  event: TelemetryEvent;
  stats: PlayStats;
  progress?: EventData;
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
    /* ignore */
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

export function captureDevice(): DeviceProfile {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let os: DeviceProfile['os'] = 'other';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
  else if (/Android/i.test(ua)) os = 'android';
  else if (/Mac OS|Macintosh/i.test(ua)) os = 'mac';
  else if (/Windows/i.test(ua)) os = 'windows';
  else if (/Linux/i.test(ua)) os = 'linux';

  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const shortSide = typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : 0;
  let form: DeviceProfile['form'] = 'desktop';
  if (touch && shortSide > 0 && shortSide < 600) form = 'phone';
  else if (touch && shortSide >= 600) form = 'tablet';

  const standalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );

  return {
    os,
    form,
    touch,
    standalone,
    screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '0x0',
    lang: typeof navigator !== 'undefined' ? navigator.language : '',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  };
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
    eliteKills: 0,
    bossKills: 0,
    crafts: 0,
    alchemyCrafts: 0,
    forgeCrafts: 0,
    facilityUpgrades: 0,
    talentBuys: 0,
    discards: 0,
    mineCollects: 0,
    cheatOns: 0,
    cheatOffs: 0,
    playTimeMs: 0,
    maxStepsOneRun: 0,
    maxFloorReached: 1,
    tiers: {},
    peakRealmLevel: 1,
    maxSkills: 2,
    maxPassives: 0,
    maxKarma: 0,
    maxSpiritStones: 0,
    milestones: [],
    device: null,
    lastEventAt: now
  };
}

function progressSnap(state: GameState): EventData {
  const talentLevels = Object.values(state.reincarnation.talents).reduce((sum, level) => sum + level, 0);
  return {
    realm: state.player.realm,
    realmLevel: state.player.realmLevel,
    peakRealmLevel: state.player.peakRealmLevel,
    skills: state.player.learnedSkills.length,
    passives: Object.keys(state.player.passives).length,
    karma: state.reincarnation.karma,
    deaths: state.reincarnation.totalDeaths,
    stones: state.cave.spiritStones,
    mineLv: state.cave.mineLevel,
    alchemyLv: state.cave.alchemyLevel,
    forgeLv: state.cave.forgeLevel,
    bagSlots: usedSlots(state.inventory.bag),
    warehouseSlots: usedSlots(state.inventory.warehouse),
    talentLevels
  };
}

function syncProgressPeaks(state: GameState): void {
  stats.peakRealmLevel = Math.max(stats.peakRealmLevel, state.player.peakRealmLevel || state.player.realmLevel || 1);
  stats.maxSkills = Math.max(stats.maxSkills, state.player.learnedSkills.length);
  stats.maxPassives = Math.max(stats.maxPassives, Object.keys(state.player.passives).length);
  stats.maxKarma = Math.max(stats.maxKarma, state.reincarnation.karma);
  stats.maxSpiritStones = Math.max(stats.maxSpiritStones, state.cave.spiritStones);
  if (state.run) {
    stats.maxStepsOneRun = Math.max(stats.maxStepsOneRun, state.run.totalSteps);
    stats.maxFloorReached = Math.max(stats.maxFloorReached, state.run.floor);
  }
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
  return {
    ...stats,
    tiers: { ...stats.tiers },
    milestones: [...stats.milestones],
    device: stats.device ? { ...stats.device } : null
  };
}

function persist(): void {
  writeJson(STATS_KEY, stats);
  writeJson(QUEUE_KEY, queue);
}

function bumpPlayTime(): void {
  const now = Date.now();
  if (typeof document === 'undefined' || !document.hidden) {
    stats.playTimeMs += Math.max(0, now - playAnchor);
  }
  playAnchor = now;
  stats.lastEventAt = now;
}

function unlockMilestone(id: string, extra?: EventData): void {
  if (stats.milestones.includes(id)) return;
  stats.milestones.push(id);
  enqueue('milestone', { id, ...extra });
}

function enqueue(name: TelemetryEventName, data?: EventData): void {
  if (!started || isTelemetryOptedOut() || !webhookUrl()) return;
  bumpPlayTime();
  const event: TelemetryEvent = { name, at: Date.now(), data };
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  persist();
  scheduleFlush();
  if (
    name === 'death'
    || name === 'run_end'
    || name === 'session_summary'
    || name === 'milestone'
    || name === 'cheat_on'
    || name === 'cheat_off'
  ) {
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
  const d = payload.device;
  const mins = Math.round(s.playTimeMs / 60000);
  const lines = [
    `事件 **${payload.event.name}** · 构建 \`${payload.build}\``,
    `玩家 \`${payload.playerId}\`${d ? ` · ${d.os}/${d.form}${d.standalone ? '/PWA' : ''} · ${d.screen}` : ''}`,
    `会话 ${s.sessions} · 探索 ${s.runs} · 回府 ${s.runEnds} · 死亡 ${s.deaths} · 转世 ${s.reincarnations}`,
    `胜 ${s.combatWins}（精${s.eliteKills}/王${s.bossKills}）· 逃 ${s.combatFlees} · 炼制 ${s.crafts}（丹${s.alchemyCrafts}/器${s.forgeCrafts}）`,
    `游玩约 ${mins} 分 · 单趟最长 ${s.maxStepsOneRun} 步 · 最深 ${s.maxFloorReached} 层`,
    `巅峰 Lv.${s.peakRealmLevel} · 秘术≤${s.maxSkills} · 心法≤${s.maxPassives} · 因果峰值 ${s.maxKarma}`,
    `图档 ${JSON.stringify(s.tiers)} · 里程碑 ${s.milestones.length} 个`
  ];
  if (payload.progress) lines.push('进度：`' + JSON.stringify(payload.progress) + '`');
  if (payload.event.data && Object.keys(payload.event.data).length > 0) {
    lines.push('详情：`' + JSON.stringify(payload.event.data) + '`');
  }
  return JSON.stringify({ content: lines.join('\n') });
}

function toNtfyBody(payload: TelemetryPayload): string {
  const s = payload.stats;
  const mins = Math.round(s.playTimeMs / 60000);
  return [
    `[${payload.event.name}] ${payload.playerId}`,
    `${payload.device?.os}/${payload.device?.form || '?'} 会话${s.sessions} 探索${s.runs} 死亡${s.deaths} ${mins}分`,
    payload.event.data ? JSON.stringify(payload.event.data) : ''
  ].filter(Boolean).join('\n');
}

export async function flushTelemetry(progress?: EventData): Promise<void> {
  if (!started || isTelemetryOptedOut()) return;
  const url = webhookUrl();
  if (!url || queue.length === 0) return;
  bumpPlayTime();
  const batch = queue.slice();
  queue = [];
  persist();
  for (const event of batch) {
    const payload: TelemetryPayload = {
      v: 2,
      game: 'resign-to-cultivate',
      build: __BUILD_VERSION__,
      playerId: stats.playerId,
      device: stats.device,
      event,
      stats: getPlayStats(),
      progress
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

function progressSnapFallback(): EventData {
  return {
    peakRealmLevel: stats.peakRealmLevel,
    maxSkills: stats.maxSkills,
    maxPassives: stats.maxPassives,
    maxKarma: stats.maxKarma,
    deaths: stats.deaths,
    runs: stats.runs
  };
}

export function startTelemetry(state: GameState): void {
  if (started) return;
  started = true;
  const playerId = ensurePlayerId();
  const saved = readJson<Partial<PlayStats>>(STATS_KEY, {});
  stats = {
    ...emptyStats(playerId),
    ...saved,
    playerId,
    tiers: saved.tiers ?? {},
    milestones: saved.milestones ?? [],
    device: captureDevice()
  };
  queue = readJson<TelemetryEvent[]>(QUEUE_KEY, []);
  playAnchor = Date.now();
  stats.sessions += 1;
  syncProgressPeaks(state);
  persist();

  if (stats.device?.standalone) unlockMilestone('pwa_install');

  enqueue('session_start', {
    ...progressSnap(state),
    os: stats.device?.os ?? null,
    form: stats.device?.form ?? null,
    standalone: stats.device?.standalone ?? false,
    screen: stats.device?.screen ?? null
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      bumpPlayTime();
      persist();
      const snap = progressSnapFallback();
      enqueue('session_summary', { reason: 'hidden', ...snap });
      void flushTelemetry(snap);
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
  syncProgressPeaks(after);

  if (command.type === 'START_RUN' && after.run) {
    stats.runs += 1;
    stats.tiers[command.tier] = (stats.tiers[command.tier] ?? 0) + 1;
    unlockMilestone('first_run', { tier: command.tier });
    enqueue('run_start', { tier: command.tier, seed: after.run.seed, floor: after.run.floor });
  }

  if (command.type === 'RETURN_CAVE' && before.run && !after.run) {
    stats.runEnds += 1;
    stats.maxStepsOneRun = Math.max(stats.maxStepsOneRun, before.run.totalSteps);
    stats.maxFloorReached = Math.max(stats.maxFloorReached, before.run.floor);
    unlockMilestone('first_return');
    if (before.run.totalSteps >= 100) unlockMilestone('steps_100');
    if (before.run.totalSteps >= 300) unlockMilestone('steps_300');
    enqueue('run_end', {
      tier: before.run.sizeTier,
      steps: before.run.totalSteps,
      floor: before.run.floor,
      years: before.run.spentYears,
      ...progressSnap(after)
    });
  }

  if (command.type === 'ADVANCE_FLOOR' && after.run) {
    stats.maxFloorReached = Math.max(stats.maxFloorReached, after.run.floor);
    enqueue('floor_advance', { tier: after.run.sizeTier, floor: after.run.floor });
  }

  if (command.type === 'COMBAT_ANIMATION_DONE' && before.combat && !after.combat) {
    if (before.combat.outcome === 'victory') {
      stats.combatWins += 1;
      if (before.combat.enemyRank === 'elite') {
        stats.eliteKills += 1;
        unlockMilestone('kill_elite');
      }
      if (before.combat.enemyRank === 'boss') {
        stats.bossKills += 1;
        unlockMilestone('kill_boss');
      }
      enqueue('combat_win', { enemy: before.combat.enemyId, rank: before.combat.enemyRank });
    } else if (before.combat.outcome === 'fled') {
      stats.combatFlees += 1;
      unlockMilestone('first_escape');
      enqueue('combat_flee', { enemy: before.combat.enemyId, rank: before.combat.enemyRank });
    }
  }

  if (after.reincarnation.totalDeaths > before.reincarnation.totalDeaths) {
    stats.deaths += 1;
    unlockMilestone('first_death');
    enqueue('death', {
      reason: after.reincarnation.lastDeathReason,
      deaths: after.reincarnation.totalDeaths,
      realmLevel: before.player.realmLevel,
      ...progressSnap(after)
    });
  }

  if (command.type === 'REINCARNATE' && after.scene === 'cave' && before.scene === 'reincarnation') {
    stats.reincarnations += 1;
    unlockMilestone('first_reincarnate');
    enqueue('reincarnate', { deaths: after.reincarnation.totalDeaths, ...progressSnap(after) });
  }

  if (command.type === 'CRAFT') {
    stats.crafts += 1;
    if (command.recipeId.includes('pill')) stats.alchemyCrafts += 1;
    else stats.forgeCrafts += 1;
    unlockMilestone('first_craft');
    enqueue('craft', { recipeId: command.recipeId });
  }

  if (command.type === 'UPGRADE_FACILITY') {
    stats.facilityUpgrades += 1;
    enqueue('upgrade_facility', { facility: command.facility });
  }

  if (command.type === 'BUY_TALENT') {
    stats.talentBuys += 1;
    unlockMilestone('first_talent');
    enqueue('buy_talent', { talentId: command.talentId });
  }

  if (command.type === 'DISCARD_BAG_ITEM') {
    stats.discards += 1;
    unlockMilestone('first_discard');
    enqueue('discard', { itemId: command.itemId });
  }

  if (command.type === 'COLLECT_MINE') {
    stats.mineCollects += 1;
    enqueue('mine_collect', { stones: after.cave.spiritStones });
  }

  if (after.player.realmLevel >= 2) unlockMilestone('realm_筑基');
  if (after.player.realmLevel >= 3) unlockMilestone('realm_结丹');
  if (after.player.realmLevel >= 4) unlockMilestone('realm_元婴');
  if (after.player.realmLevel >= 5) unlockMilestone('realm_化神');
  if (after.player.learnedSkills.length >= 6) unlockMilestone('skills_6');
  if (Object.keys(after.player.passives).length >= 5) unlockMilestone('passives_5');

  if (before.player.learnedSkills.length < after.player.learnedSkills.length) {
    unlockMilestone('learn_skill');
  }
  if (Object.keys(before.player.passives).length < Object.keys(after.player.passives).length) {
    unlockMilestone('learn_passive');
  }

  if (command.type === 'APPLY_CHEAT') {
    if (after.cheatRestore && !before.cheatRestore) {
      stats.cheatOns += 1;
      unlockMilestone('cheat_used');
      enqueue('cheat_on');
    } else if (!after.cheatRestore && before.cheatRestore) {
      stats.cheatOffs += 1;
      enqueue('cheat_off');
    }
  }

  persist();
}
