/** 轻量音频管理：对齐主项目 SoundManager 的精简 Web 版。 */

export type SfxId =
  | 'click'
  | 'ding'
  | 'cardSlide'
  | 'biu'
  | 'miss'
  | 'swordParry'
  | 'victory'
  | 'fail'
  | 'flyingSword'
  | 'basicSpell'
  | 'advancedSpell'
  | 'supportSpell'
  | 'coinCascade'
  | 'mineHit';

export type BgmId = 'cave' | 'explore' | 'combat';

const MUTE_KEY = 'resign-audio-muted';
const SFX_POOL_SIZE = 6;
/** 整体音量 ×0.7；背景音再额外 ×0.7 */
const SFX_MASTER = 0.7;
const BGM_MASTER = 0.7 * 0.7;
const BGM_BASE_VOLUME = 0.45;

const SFX_PATHS: Record<SfxId, string> = {
  click: 'audio/system_sfx/click.ogg',
  ding: 'audio/system_sfx/ding.ogg',
  cardSlide: 'audio/system_sfx/card-slide-2.ogg',
  biu: 'audio/system_sfx/biu.ogg',
  miss: 'audio/system_sfx/miss.wav',
  swordParry: 'audio/system_sfx/sword-parry-1.wav',
  victory: 'audio/system_sfx/victory.wav',
  fail: 'audio/system_sfx/fail.wav',
  flyingSword: 'audio/combat_sfx/flying_sword.wav',
  basicSpell: 'audio/combat_sfx/basic_spell.wav',
  advancedSpell: 'audio/combat_sfx/advanced_spell.wav',
  supportSpell: 'audio/combat_sfx/support_spell.wav',
  coinCascade: 'audio/system_sfx/coin-cascade.wav',
  mineHit: 'audio/system_sfx/mine-hit.wav'
};

const BGM_PATHS: Record<BgmId, string> = {
  cave: 'audio/bgm/cave.m4a',
  explore: 'audio/bgm/explore.m4a',
  combat: 'audio/bgm/combat.m4a'
};

function assetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${relativePath}`;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

class SoundManager {
  private unlocked = false;
  private muted = readMuted();
  /** 切后台 / 锁屏等：临时挂起，不改用户静音偏好 */
  private suspended = false;
  private unlockBound = false;
  private lifecycleBound = false;
  private bgm: HTMLAudioElement | null = null;
  private currentBgm: BgmId | null = null;
  private sfxPool: HTMLAudioElement[] = [];
  private sfxCursor = 0;
  private cache = new Map<string, HTMLAudioElement>();
  private moveThrottleAt = 0;

  constructor() {
    for (let i = 0; i < SFX_POOL_SIZE; i += 1) {
      this.sfxPool.push(new Audio());
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeMuted(muted);
    if (muted) {
      this.stopAllPlayback();
      return;
    }
    if (!this.suspended && this.currentBgm && this.unlocked) {
      void this.bgm?.play().catch(() => undefined);
    }
  }

  /** 注册首次手势解锁（浏览器自动播放策略）。 */
  bindUnlock(): void {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  /** 离开页签 / 锁屏 / 切后台时暂停；回来再恢复（尊重静音偏好）。 */
  bindLifecycle(): void {
    if (this.lifecycleBound || typeof document === 'undefined') return;
    this.lifecycleBound = true;
    const sync = () => {
      if (document.visibilityState === 'hidden') this.suspend();
      else this.resume();
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => this.suspend());
    window.addEventListener('pageshow', () => this.resume());
    window.addEventListener('freeze', () => this.suspend());
    window.addEventListener('resume', () => this.resume());
    window.addEventListener('blur', () => {
      // iOS 锁屏有时只触发 blur；若页面仍可见则不挂起
      if (document.visibilityState === 'hidden') this.suspend();
    });
  }

  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.stopAllPlayback();
  }

  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.muted || !this.unlocked || !this.currentBgm) return;
    void this.bgm?.play().catch(() => undefined);
  }

  private stopAllPlayback(): void {
    this.bgm?.pause();
    for (const player of this.sfxPool) {
      player.pause();
      try {
        player.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.unlocked = true;
    const probe = new Audio(assetUrl(SFX_PATHS.click));
    probe.volume = 0;
    try {
      await probe.play();
      probe.pause();
    } catch {
      this.unlocked = false;
      return;
    }
    if (this.currentBgm && !this.muted && !this.suspended) {
      void this.bgm?.play().catch(() => undefined);
    }
  }

  playSfx(id: SfxId, volume = 1): void {
    if (this.muted || this.suspended) return;
    void this.unlock();
    const src = assetUrl(SFX_PATHS[id]);
    const player = this.sfxPool[this.sfxCursor];
    this.sfxCursor = (this.sfxCursor + 1) % this.sfxPool.length;
    player.pause();
    player.currentTime = 0;
    player.src = src;
    player.volume = Math.max(0, Math.min(1, volume * SFX_MASTER));
    void player.play().catch(() => undefined);
  }

  playClick(): void {
    this.playSfx('click', 0.5);
  }

  playCoinCascade(): void {
    this.playSfx('coinCascade', 0.92);
  }

  playMineHit(): void {
    this.playSfx('mineHit', 0.78);
  }

  playMove(): void {
    const now = performance.now();
    if (now - this.moveThrottleAt < 90) return;
    this.moveThrottleAt = now;
    this.playSfx('cardSlide', 0.55);
  }

  playBgm(id: BgmId): void {
    if (this.currentBgm === id && this.bgm && !this.bgm.paused) return;
    const src = assetUrl(BGM_PATHS[id]);
    if (!this.bgm) {
      this.bgm = new Audio();
      this.bgm.loop = true;
      this.bgm.preload = 'auto';
    }
    if (this.currentBgm !== id) {
      this.bgm.src = src;
      this.currentBgm = id;
    }
    this.bgm.volume = Math.max(0, Math.min(1, BGM_BASE_VOLUME * BGM_MASTER));
    if (this.muted || this.suspended || !this.unlocked) return;
    void this.bgm.play().catch(() => undefined);
  }

  stopBgm(): void {
    this.currentBgm = null;
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  /** 预热常用短音效，减少首次命中延迟。 */
  preload(): void {
    const warm: SfxId[] = ['click', 'ding', 'cardSlide', 'miss', 'flyingSword', 'basicSpell', 'victory', 'fail', 'coinCascade', 'mineHit'];
    for (const id of warm) {
      const url = assetUrl(SFX_PATHS[id]);
      if (this.cache.has(url)) continue;
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.cache.set(url, audio);
    }
  }
}

export const sound = new SoundManager();
