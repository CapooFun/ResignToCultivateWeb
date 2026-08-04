import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ENEMIES, ITEMS, MAP_TIERS, RECIPES, SKILLS, TALENTS } from './game/content';
import { talentCost } from './game/core';
import { itemCount, mergeSources, usedSlots } from './game/inventory';
import { currentFloor } from './game/mapGenerator';
import { exportState, importState } from './game/save';
import { gameStore } from './game/store';
import type { EquipmentSlot, GameCommand, GameState, ItemStack } from './game/types';

type CavePanel = 'warehouse' | 'mine' | 'alchemy' | 'forge' | 'equipment' | 'settings' | null;

const MapView = lazy(() => import('./components/MapView'));

function useGameState(): GameState {
  return useSyncExternalStore(
    (listener) => gameStore.subscribe(listener),
    () => gameStore.getState(),
    () => gameStore.getState()
  );
}

function Bar({ value, max, kind, label }: { value: number; max: number; kind: 'hp' | 'mp'; label: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`status-bar ${kind}`} aria-label={`${label} ${value}/${max}`}>
      <span style={{ width: `${ratio * 100}%` }} />
      <b>{value} / {max}</b>
    </div>
  );
}

function ItemPills({ stacks }: { stacks: ItemStack[] }) {
  if (stacks.length === 0) return <p className="empty-note">空</p>;
  return (
    <div className="item-pills">
      {stacks.map((stack) => <span key={stack.itemId}>{ITEMS[stack.itemId]?.name ?? stack.itemId} ×{stack.count}</span>)}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header>
        {children}
      </section>
    </div>
  );
}

function CaveView({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  const [panel, setPanel] = useState<CavePanel>(null);
  const available = useMemo(() => mergeSources(state.inventory.bag, state.inventory.warehouse), [state.inventory]);
  const equipmentItems = available.filter((stack) => ITEMS[stack.itemId]?.kind === 'equipment');
  const slotName: Record<EquipmentSlot, string> = { melee: '近战', ranged: '远程', armor: '护甲', ring: '戒指' };

  return (
    <main className="screen cave-screen">
      <div className="cave-atmosphere" aria-hidden="true"><span /><span /><span /></div>
      <header className="cave-title">
        <p className="eyebrow">人界 · 永久营寨</p>
        <div className="cave-emblem" aria-hidden="true">辞</div>
        <h1>洞府</h1>
        <div className="resource-line"><span>灵石</span><strong>{state.cave.spiritStones}</strong><span>寿元</span><strong>{state.player.lifespan}/{state.player.maxLifespan}</strong></div>
      </header>

      <section className="facility-grid" aria-label="洞府设施">
        <button className="facility-warehouse" onClick={() => setPanel('warehouse')}><i>仓</i><b>仓库</b><small>{usedSlots(state.inventory.warehouse)}/{state.inventory.warehouseCapacity} 格</small></button>
        <button className="facility-mine" onClick={() => setPanel('mine')}><i>矿</i><b>采矿</b><small>Lv.{state.cave.mineLevel} · 待收 {state.cave.mineStored}</small></button>
        <button className="facility-alchemy" onClick={() => setPanel('alchemy')}><i>丹</i><b>炼丹</b><small>Lv.{state.cave.alchemyLevel} · 2 配方</small></button>
        <button className="facility-forge" onClick={() => setPanel('forge')}><i>器</i><b>炼器</b><small>Lv.{state.cave.forgeLevel} · 2 配方</small></button>
      </section>

      <section className="character-summary">
        <div><span>境界</span><strong>{state.player.realm}</strong></div>
        <div><span>修为</span><strong>{state.player.exp}</strong></div>
        <div><span>身上</span><strong>{usedSlots(state.inventory.bag)}/{state.inventory.capacity}</strong></div>
      </section>

      <section className="cave-actions">
        <button className="secondary" onClick={() => setPanel('equipment')}>装配与行囊</button>
        <button className="primary" onClick={() => dispatch({ type: 'OPEN_SELECT' })}>出发寻求机缘</button>
        <button className="text-button" onClick={() => setPanel('settings')}>存档与试玩信息</button>
      </section>

      {panel === 'warehouse' && (
        <Modal title="仓库存取" onClose={() => setPanel(null)}>
          <p className="modal-intro">仓库仅在洞府开放；死亡后仓库中的物品会保留。</p>
          <div className="inventory-columns">
            <div><h3>身上 · {usedSlots(state.inventory.bag)}/{state.inventory.capacity}</h3><ItemPills stacks={state.inventory.bag} />
              {state.inventory.bag.map((stack) => <button className="row-action" key={stack.itemId} onClick={() => dispatch({ type: 'TRANSFER_ITEM', itemId: stack.itemId, direction: 'toWarehouse' })}>存入 {ITEMS[stack.itemId].name}</button>)}
            </div>
            <div><h3>仓库 · {usedSlots(state.inventory.warehouse)}/{state.inventory.warehouseCapacity}</h3><ItemPills stacks={state.inventory.warehouse} />
              {state.inventory.warehouse.map((stack) => <button className="row-action" key={stack.itemId} onClick={() => dispatch({ type: 'TRANSFER_ITEM', itemId: stack.itemId, direction: 'toBag' })}>取出 {ITEMS[stack.itemId].name}</button>)}
            </div>
          </div>
          <button className="primary wide" onClick={() => dispatch({ type: 'TRANSFER_ALL_TO_WAREHOUSE' })}>一键将身上物品入库</button>
        </Modal>
      )}

      {panel === 'mine' && (
        <Modal title="采矿" onClose={() => setPanel(null)}>
          <div className="big-number"><span>待收灵石</span><strong>{state.cave.mineStored}</strong></div>
          <p>每趟回府时，灵矿按本趟消耗寿元累计产出。当前倍率约为 ×{Math.pow(1.5, state.cave.mineLevel - 1).toFixed(2)}。</p>
          <button className="primary wide" disabled={state.cave.mineStored <= 0} onClick={() => dispatch({ type: 'COLLECT_MINE' })}>收取灵石</button>
          <button className="secondary wide" onClick={() => dispatch({ type: 'UPGRADE_FACILITY', facility: 'mine' })}>升级采矿 · {state.cave.mineLevel * 120} 灵石</button>
        </Modal>
      )}

      {(panel === 'alchemy' || panel === 'forge') && (
        <Modal title={panel === 'alchemy' ? '炼丹' : '炼器'} onClose={() => setPanel(null)}>
          <p className="modal-intro">材料可从身上和仓库共同扣除；产物直接入库。</p>
          <div className="recipe-list">
            {Object.values(RECIPES).filter((recipe) => recipe.facility === panel).map((recipe, index) => {
              const locked = index === 1 && (panel === 'alchemy' ? state.cave.alchemyLevel : state.cave.forgeLevel) < 2;
              return <button key={recipe.id} disabled={locked} onClick={() => dispatch({ type: 'CRAFT', recipeId: recipe.id })}>
                <b>{recipe.name}</b><small>{recipe.ingredients.map((i) => `${ITEMS[i.itemId].name}×${i.count}`).join(' + ')} · 灵石 {recipe.spiritStoneCost}</small><em>{locked ? '设施 2 级解锁' : `产出 ${ITEMS[recipe.output.itemId].name}×${recipe.output.count}`}</em>
              </button>;
            })}
          </div>
          <button className="secondary wide" onClick={() => dispatch({ type: 'UPGRADE_FACILITY', facility: panel })}>升级设施 · {(panel === 'alchemy' ? state.cave.alchemyLevel : state.cave.forgeLevel) * 120} 灵石</button>
        </Modal>
      )}

      {panel === 'equipment' && (
        <Modal title="装配与行囊" onClose={() => setPanel(null)}>
          <h3>法宝四槽</h3>
          <div className="equipment-grid">
            {(Object.entries(state.player.equipment) as Array<[EquipmentSlot, string | null]>).map(([slot, itemId]) => <div key={slot}><span>{slotName[slot]}</span><b>{itemId ? ITEMS[itemId].name : '未装备'}</b></div>)}
          </div>
          <div className="recipe-list compact">
            {equipmentItems.length === 0 ? <p className="empty-note">身上与仓库暂无可装备法宝。</p> : equipmentItems.map((stack) => <button key={stack.itemId} onClick={() => dispatch({ type: 'EQUIP', itemId: stack.itemId })}><b>装备 {ITEMS[stack.itemId].name}</b><small>{ITEMS[stack.itemId].description}</small></button>)}
          </div>
          <h3>秘术优先级</h3>
          <ol className="skill-order">{[...state.player.equippedSkills].sort((a, b) => SKILLS[b].priority - SKILLS[a].priority).map((id) => <li key={id}><b>{SKILLS[id].name}</b><span>{SKILLS[id].description} · CD {(SKILLS[id].cooldownMs / 1000).toFixed(1)}秒</span></li>)}</ol>
          <h3>丹药快捷</h3><ItemPills stacks={state.player.potionSlots.filter(Boolean).map((itemId) => ({ itemId: itemId!, count: itemCount(state.inventory.bag, itemId!) }))} />
        </Modal>
      )}

      {panel === 'settings' && <SettingsModal state={state} onClose={() => setPanel(null)} />}
    </main>
  );
}

function SelectView({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  return (
    <main className="screen select-screen">
      <div className="realm-atmosphere" aria-hidden="true"><span /><span /></div>
      <header><button className="back-button" onClick={() => dispatch({ type: 'CLOSE_SELECT' })}>‹ 洞府</button><p className="eyebrow">寿元 {state.player.lifespan}</p><h1>选择地界</h1><p>三档全部开放。地图越大，层数越深，回报与风险也越高。</p></header>
      <section className="tier-list">
        {(Object.entries(MAP_TIERS) as Array<[keyof typeof MAP_TIERS, (typeof MAP_TIERS)[keyof typeof MAP_TIERS]]>).map(([tier, config]) => (
          <button className={`tier-${tier.toLowerCase()}`} key={tier} onClick={() => dispatch({ type: 'START_RUN', tier })} disabled={state.player.lifespan <= config.cost}>
            <span className="tier-mark">{tier}</span><span><b>{config.name}</b><small>{config.size}×{config.size} · {config.floors} 层 · 推荐{config.recommended}</small></span><em>寿元 −{config.cost}</em>
          </button>
        ))}
      </section>
    </main>
  );
}

function CombatHud({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  const combat = state.combat;
  const clock = combat?.clockMs ?? 0;
  return (
    <section className="explore-hud">
      <div className="skill-cds">
        <span className="hud-label">秘术 CD</span>
        {state.player.equippedSkills.map((id) => {
          const skill = SKILLS[id];
          const remaining = combat ? Math.max(0, (combat.skillReadyAt[id] ?? 0) - clock) : 0;
          const cooldownProgress = remaining > 0 ? remaining / skill.cooldownMs : 0;
          return <div className={remaining > 0 ? 'cooling' : ''} style={{ '--cooldown': `${cooldownProgress * 360}deg` } as React.CSSProperties} key={id} title={skill.description}><b>{skill.name.slice(0, 1)}</b><small>{remaining > 0 ? (remaining / 1000).toFixed(1) : '就绪'}</small></div>;
        })}
      </div>
      <div className="player-bars"><span className="hud-label">血气 / 灵气</span><Bar value={state.player.hp} max={state.player.maxHp} kind="hp" label="生命" /><Bar value={state.player.mp} max={state.player.maxMp} kind="mp" label="灵气" /></div>
      <div className="potion-slots"><span className="hud-label">丹药</span>{state.player.potionSlots.map((itemId, slot) => {
        const count = itemId ? itemCount(state.inventory.bag, itemId) : 0;
        return <button key={slot} disabled={!itemId || count <= 0 || combat?.outcome !== 'active'} onClick={() => dispatch({ type: 'QUEUE_POTION', slot })}><b>{itemId ? ITEMS[itemId].name.slice(0, 1) : '空'}</b><small>×{count}</small></button>;
      })}</div>
    </section>
  );
}

function ExploreView({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  const run = state.run!;
  const floor = currentFloor(run);
  const pending = floor.entities.find((entity) => entity.id === run.pendingInteractionId);
  const enemyName = state.combat ? ENEMIES[state.combat.enemyId].name : null;
  return (
    <main className="screen explore-screen">
      <header className="explore-header"><span>寿元 <b>{state.player.lifespan}/{state.player.maxLifespan}</b></span><strong>{MAP_TIERS[run.sizeTier].name} · {run.floor}/{run.maxFloors}层</strong><span>步数 <b>{run.totalSteps}</b></span></header>
      {state.combat && <div className="combat-banner"><span><i>我</i><em>交锋</em><i>{enemyName?.slice(0, 1)}</i></span><b>{state.combat.lastAction?.name ?? '凝神对峙'}</b></div>}
      <Suspense fallback={<div className="map-loading">地界展开中…</div>}>
        <MapView state={state} dispatch={dispatch} />
      </Suspense>
      <div className="map-legend"><span>点相邻格或滑动一步</span><span>种子 {run.seed}</span></div>
      {pending && <div className="interaction-card"><b>{pending.kind === 'return' ? '回府传送阵' : '深入传送门'}</b><button onClick={() => dispatch({ type: pending.kind === 'return' ? 'RETURN_CAVE' : 'ADVANCE_FLOOR' })}>{pending.kind === 'return' ? '结束本趟并回府' : '进入下一层'}</button></div>}
      <CombatHud state={state} dispatch={dispatch} />
    </main>
  );
}

function ReincarnationView({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  return (
    <main className="screen reincarnation-screen">
      <p className="eyebrow">第 {state.reincarnation.totalDeaths} 次轮回</p><h1>轮回点</h1>
      <p>{state.reincarnation.lastDeathReason}</p><div className="karma">因果 <strong>{state.reincarnation.karma}</strong><small>本次 +{state.reincarnation.pendingKarma}</small></div>
      <section className="talent-list">
        {Object.values(TALENTS).map((talent) => {
          const level = state.reincarnation.talents[talent.id] ?? 0;
          const cost = talentCost(state, talent.id);
          return <button key={talent.id} disabled={level >= talent.maxLevel || state.reincarnation.karma < cost} onClick={() => dispatch({ type: 'BUY_TALENT', talentId: talent.id })}><b>{talent.name} · {level}/{talent.maxLevel}</b><span>{talent.description}</span><em>{level >= talent.maxLevel ? '已满' : `${cost} 因果`}</em></button>;
        })}
      </section>
      <button className="primary wide" onClick={() => dispatch({ type: 'REINCARNATE' })}>转世，回到洞府</button>
      <p className="retention-note">洞府设施、仓库和天赋已保留；身上物品与本世境界已经消散。</p>
    </main>
  );
}

function SettingsModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const download = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `辞职修仙传存档-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file: File) => {
    try { gameStore.replaceState(importState(await file.text())); onClose(); }
    catch (error) { gameStore.dispatch({ type: 'SET_MESSAGE', message: `导入失败：${error instanceof Error ? error.message : '未知错误'}` }); }
  };
  const reset = async () => {
    if (window.confirm('确定清除本机存档并重新开始吗？仓库与轮回天赋也会清空。')) { await gameStore.clearAndReset(); onClose(); }
  };
  return (
    <Modal title="存档与试玩信息" onClose={onClose}>
      <dl className="diagnostics"><div><dt>构建</dt><dd>{state.meta.buildVersion}</dd></div><div><dt>存档版本</dt><dd>{state.meta.saveVersion}</dd></div><div><dt>诊断种子</dt><dd>{state.meta.diagnosticSeed}</dd></div></dl>
      <p>存档只保存在当前设备浏览器。建议试玩一段时间后导出备份。</p>
      <button className="primary wide" onClick={download}>导出存档</button>
      <button className="secondary wide" onClick={() => inputRef.current?.click()}>导入存档</button>
      <input ref={inputRef} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
      <button className="danger wide" onClick={() => void reset()}>清除本机存档</button>
      <p className="install-note">iPhone：在 Safari 分享菜单中选择“添加到主屏幕”，可获得更稳定的全屏体验。</p>
    </Modal>
  );
}

export default function App() {
  const state = useGameState();
  const dispatch = useCallback((command: GameCommand) => gameStore.dispatch(command), []);
  const [landscapeBlocked, setLandscapeBlocked] = useState(() => window.matchMedia('(orientation: landscape) and (pointer: coarse)').matches);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape) and (pointer: coarse)');
    const update = () => setLandscapeBlocked(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!state.combat || landscapeBlocked) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (!document.hidden) dispatch({ type: 'TICK_COMBAT', deltaMs: now - previous });
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [Boolean(state.combat), landscapeBlocked, dispatch]);

  return (
    <div className="app-shell">
      {state.scene === 'cave' && <CaveView state={state} dispatch={dispatch} />}
      {state.scene === 'select' && <SelectView state={state} dispatch={dispatch} />}
      {state.scene === 'explore' && state.run && <ExploreView state={state} dispatch={dispatch} />}
      {state.scene === 'reincarnation' && <ReincarnationView state={state} dispatch={dispatch} />}
      <div className="message-strip" role="status">{state.meta.message}</div>
      {landscapeBlocked && <div className="orientation-lock"><b>请将手机转回竖屏</b><span>游戏已暂停，返回竖屏后继续。</span></div>}
      {needRefresh && <div className="update-banner"><span>发现新版本，可立即刷新。</span><button onClick={() => void updateServiceWorker(true)}>更新</button></div>}
    </div>
  );
}
