import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { sound } from '../game/audio';
import { facilityUpgradeCost, manualMineStrikeTable, mineYieldPerYear } from '../game/content';
import { previewMineBreath } from '../game/core';
import type { GameCommand, GameState } from '../game/types';

type FloatBit = {
  key: number;
  amount: number;
  jackpot: boolean;
  x: number;
  drift: number;
};

type SparkBit = {
  key: number;
  x: number;
  y: number;
  angle: number;
  dist: number;
  jackpot: boolean;
};

type RippleBit = { key: number; jackpot: boolean };

function asset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

export function MinePanel({
  state,
  dispatch,
  onClose
}: {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const chamberRef = useRef<HTMLDivElement>(null);
  const lastFxId = useRef(0);
  const comboAt = useRef(0);
  const comboRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [hitPulse, setHitPulse] = useState(0);
  const [burstFlash, setBurstFlash] = useState(false);
  const [combo, setCombo] = useState(0);
  const [floats, setFloats] = useState<FloatBit[]>([]);
  const [sparks, setSparks] = useState<SparkBit[]>([]);
  const [ripples, setRipples] = useState<RippleBit[]>([]);

  const preview = previewMineBreath(state, now);
  const table = manualMineStrikeTable(state.cave.mineLevel);
  const breathRatio = preview.max > 0 ? Math.min(1, preview.breath / preview.max) : 0;
  const breathReady = preview.breath >= 1;
  const fx = state.cave.lastMineStrike;
  const canCollect = state.cave.mineStored > 0;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(timer);
  }, []);

  // 采矿打开：锁洞府页滚动；弹层内允许纵向滚，矿区禁横向拖页
  useEffect(() => {
    const touchStart = { x: 0, y: 0 };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      touchStart.x = touch.clientX;
      touchStart.y = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target) {
        event.preventDefault();
        return;
      }
      // 矿区点按：禁止拖页
      if (target.closest('.mine-chamber, .vein-core')) {
        event.preventDefault();
        return;
      }
      const modal = target.closest('.mine-modal');
      if (!modal) {
        // 点在遮罩上：禁止带动底层洞府
        event.preventDefault();
        return;
      }
      const touch = event.touches[0];
      if (touch) {
        const dx = Math.abs(touch.clientX - touchStart.x);
        const dy = Math.abs(touch.clientY - touchStart.y);
        if (dx > dy && dx > 6) {
          event.preventDefault();
          return;
        }
      }
      // 弹层本身可滚时放行；未溢出则禁橡皮筋
      if (modal.scrollHeight <= modal.clientHeight + 1) {
        event.preventDefault();
      }
    };

    document.body.classList.add('mine-lock');
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      document.body.classList.remove('mine-lock');
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  useEffect(() => {
    if (!fx || fx.id === lastFxId.current) return;
    lastFxId.current = fx.id;
    const stamp = Date.now();
    const nextCombo = stamp - comboAt.current < 900 ? comboRef.current + 1 : 1;
    comboAt.current = stamp;
    comboRef.current = nextCombo;
    setCombo(nextCombo);
    setHitPulse(fx.id);
    if (fx.jackpot) {
      setBurstFlash(true);
      window.setTimeout(() => setBurstFlash(false), 520);
    }

    const floatKey = fx.id * 10;
    setFloats((prev) => [
      ...prev.slice(-8),
      {
        key: floatKey,
        amount: fx.amount,
        jackpot: fx.jackpot,
        x: 42 + Math.random() * 16,
        drift: (Math.random() - 0.5) * 36
      }
    ]);
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((bit) => bit.key !== floatKey));
    }, fx.jackpot ? 1400 : 900);

    const rippleKey = fx.id * 10 + 1;
    setRipples((prev) => [...prev.slice(-4), { key: rippleKey, jackpot: fx.jackpot }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((bit) => bit.key !== rippleKey));
    }, 700);

    const sparkCount = fx.jackpot ? 14 : 7;
    const batch: SparkBit[] = Array.from({ length: sparkCount }, (_, index) => ({
      key: fx.id * 100 + index,
      x: 50 + (Math.random() - 0.5) * 10,
      y: 48 + (Math.random() - 0.5) * 10,
      angle: (360 / sparkCount) * index + Math.random() * 18,
      dist: 48 + Math.random() * (fx.jackpot ? 56 : 28),
      jackpot: fx.jackpot
    }));
    setSparks((prev) => [...prev.slice(-20), ...batch]);
    window.setTimeout(() => {
      setSparks((prev) => prev.filter((bit) => !batch.some((spark) => spark.key === bit.key)));
    }, 780);
  }, [fx]);

  const strike = (event?: ReactPointerEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!breathReady) {
      sound.playSfx('miss', 0.35);
      return;
    }
    sound.playMineHit();
    dispatch({ type: 'MANUAL_MINE' });
  };

  const collect = () => {
    if (!canCollect) return;
    sound.playCoinCascade();
    dispatch({ type: 'COLLECT_MINE' });
  };

  return (
    <div
      className="modal-backdrop mine-backdrop"
      role="presentation"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className={`modal mine-modal${burstFlash ? ' is-burst' : ''}`}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="采矿"
      >
        <header>
          <h2>采矿</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="mine-chamber" ref={chamberRef}>
          <div className="mine-chamber-glow" aria-hidden="true" />
          <div className="mine-chamber-dust" aria-hidden="true"><i /><i /><i /><i /></div>

          <button
            type="button"
            className={`vein-core lv-${state.cave.mineLevel}${breathReady ? '' : ' is-spent'}${hitPulse ? ' is-hit' : ''}${burstFlash ? ' is-jackpot' : ''}${combo >= 5 ? ' is-hot' : ''}`}
            onPointerDown={strike}
            disabled={!breathReady}
            aria-label={breathReady ? '叩击灵脉' : '灵息不足'}
          >
            <span className="vein-ring" aria-hidden="true" />
            <span className="vein-ring delayed" aria-hidden="true" />
            <span className="vein-ore" aria-hidden="true">
              <img className="spirit-stone-icon vein-stone" src={asset('ui/spirit-stone.png')} alt="" draggable={false} />
            </span>
            <strong>{breathReady ? '叩击灵脉' : '灵息回复中'}</strong>
            <small>Lv.{state.cave.mineLevel} · 共鸣 {combo > 0 ? `×${combo}` : '—'}</small>
          </button>

          {ripples.map((bit) => (
            <span key={bit.key} className={`vein-shock${bit.jackpot ? ' jackpot' : ''}`} aria-hidden="true" />
          ))}
          {sparks.map((bit) => (
            <span
              key={bit.key}
              className={`vein-spark${bit.jackpot ? ' jackpot' : ''}`}
              style={{
                left: `${bit.x}%`,
                top: `${bit.y}%`,
                '--spark-angle': `${bit.angle}deg`,
                '--spark-dist': `${bit.dist}px`
              } as CSSProperties}
              aria-hidden="true"
            />
          ))}
          {floats.map((bit) => (
            <span
              key={bit.key}
              className={`vein-float${bit.jackpot ? ' jackpot' : ''}`}
              style={{ left: `${bit.x}%`, '--float-drift': `${bit.drift}px` } as CSSProperties}
            >
              {bit.jackpot ? `爆发 +${bit.amount}` : `+${bit.amount}`}
            </span>
          ))}
        </div>

        <div className="mine-breath" aria-label={`灵息 ${Math.floor(preview.breath)}/${preview.max}`}>
          <div className="mine-breath-meta">
            <span>灵息</span>
            <strong>{Math.floor(preview.breath)}/{preview.max}</strong>
            <em>{(preview.regenMs / 1000).toFixed(1)}s/次</em>
          </div>
          <div className="mine-breath-track">
            <span style={{ width: `${breathRatio * 100}%` }} />
          </div>
        </div>

        <div className="mine-odds">
          <div>
            <span>普击</span>
            <strong>{table.min}–{table.max}</strong>
          </div>
          <div>
            <span>爆发 {(table.jackpotChance * 100).toFixed(0)}%</span>
            <strong>{table.jackpotMin}–{table.jackpotMax}</strong>
          </div>
        </div>

        <button
          type="button"
          className={`big-number mine-stored-block mine-stored-collect${canCollect ? ' is-ready' : ''}`}
          disabled={!canCollect}
          onClick={collect}
        >
          <span>待收灵石（点此收取）</span>
          <strong className="mine-stored-value">
            <img className="spirit-stone-icon" src={asset('ui/spirit-stone.png')} alt="" draggable={false} />
            <b>{state.cave.mineStored}</b>
          </strong>
          <small>{canCollect ? '统一入库 · 哗啦啦' : '叩击灵脉后累计于此'}</small>
        </button>
        <p className="mine-hint">
          点按灵脉矿把灵石打入待收；点下方大数字一次收取。回府年产约 {mineYieldPerYear(state.cave.mineLevel)}/年也会并入待收。
        </p>

        <button
          className="secondary wide"
          disabled={state.cave.mineLevel >= 3}
          onClick={() => dispatch({ type: 'UPGRADE_FACILITY', facility: 'mine' })}
        >
          {state.cave.mineLevel >= 3 ? '采矿已满级' : `升级采矿 · ${facilityUpgradeCost(state.cave.mineLevel)} 灵石`}
        </button>
      </section>
    </div>
  );
}
