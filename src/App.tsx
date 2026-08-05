import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { MinePanel } from './components/MinePanel';
import { sound } from './game/audio';
import { enemyDisplayName, facilityUpgradeCost, ITEMS, MAP_TIERS, PASSIVES, POTIONS, qualityCssClass, RECIPES, SKILLS, TALENTS } from './game/content';
import { escapeChanceFor, escapeCooldownMs, talentCost, unlockedPotionSlots } from './game/core';
import { markInstallHintSeen, shouldOfferInstallHint } from './game/installHint';
import {
  bindInstallPromptCapture,
  detectInstallPlatform,
  promptInstallApp,
  subscribeInstallPrompt
} from './game/installPrompt';
import { canAfford, mergeSources, usedSlots } from './game/inventory';
import { currentFloor } from './game/mapGenerator';
import { exportState, importState } from './game/save';
import { gameStore } from './game/store';
import type { CombatActionEvent, EquipmentSlot, GameCommand, GameState, ItemStack } from './game/types';

function playCombatActionSfx(action: CombatActionEvent): void {
  if (action.missed) {
    sound.playSfx('miss', 0.85);
    return;
  }
  if (action.kind === 'potion') {
    sound.playSfx('supportSpell', 0.7);
    return;
  }
  if (action.kind === 'escape') {
    sound.playSfx('biu', 0.75);
    return;
  }
  if (action.kind === 'skill') {
    sound.playSfx(action.critical ? 'advancedSpell' : 'basicSpell', 0.8);
    return;
  }
  sound.playSfx(action.critical ? 'swordParry' : 'flyingSword', action.critical ? 0.85 : 0.75);
}

type CavePanel = 'warehouse' | 'mine' | 'alchemy' | 'forge' | 'equipment' | 'settings' | null;
type PackTab = 'all' | 'gear' | 'material' | 'skills' | 'passives' | 'potions';

const MapView = lazy(() => import('./components/MapView'));

const SLOT_NAME: Record<EquipmentSlot, string> = {
  melee: '近战', ranged: '远程', armor: '护甲', ring: '戒指', belt: '腰带', shoes: '鞋子'
};

const EQUIP_SLOTS: EquipmentSlot[] = ['melee', 'ranged', 'armor', 'ring', 'belt', 'shoes'];

const FORGE_TABS: Array<{ id: EquipmentSlot; label: string }> = [
  { id: 'melee', label: '近战' },
  { id: 'ranged', label: '远程' },
  { id: 'armor', label: '护甲' },
  { id: 'ring', label: '戒指' },
  { id: 'belt', label: '腰带' },
  { id: 'shoes', label: '鞋子' }
];

const ALCHEMY_TABS: Array<{ id: 'heal' | 'mana' | 'escape'; label: string }> = [
  { id: 'heal', label: '血' },
  { id: 'mana', label: '灵' },
  { id: 'escape', label: '遁' }
];

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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    const frame = window.requestAnimationFrame(() => {
      // 弹层为 fixed 贴底；再滚一次弹层内容到顶部，避免长列表停在中间
      panel?.scrollTo({ top: 0 });
      panel?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header>
        {children}
      </section>
    </div>
  );
}

/** 重要奖励 / 事件结算：点任意处关闭。 */
function RewardPopup({ title, lines, onClose }: { title: string; lines: string[]; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className="reward-popup-backdrop"
      role="presentation"
      onPointerDown={onClose}
    >
      <section
        className="reward-popup"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <p className="reward-popup-eyebrow">机缘结算</p>
        <h2>{title}</h2>
        <ul>
          {lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
        <p className="reward-popup-hint">点击任意处继续</p>
      </section>
    </div>
  );
}

/** 首次轮回重生后的「添加到主屏幕」建议。 */
function InstallHintPopup({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const [canOneTap, setCanOneTap] = useState(false);
  const [busy, setBusy] = useState(false);
  const platform = detectInstallPlatform();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => subscribeInstallPrompt(setCanOneTap), []);

  const dismiss = () => {
    markInstallHintSeen();
    onClose();
  };

  const onInstall = async () => {
    setBusy(true);
    const outcome = await promptInstallApp();
    setBusy(false);
    if (outcome === 'accepted' || outcome === 'dismissed') {
      markInstallHintSeen();
      onClose();
      return;
    }
    // 无原生提示时保持弹层，改看下方说明
    setCanOneTap(false);
  };

  const tips =
    platform === 'ios-safari'
      ? ['Safari：点底部分享 →「添加到主屏幕」', '装好后从桌面图标进，可全屏少误触']
      : platform === 'ios-chrome'
        ? ['iPhone 上的 Chrome 不能一键安装到桌面', '请用 Safari 打开同一网址，再点分享 →「添加到主屏幕」']
        : canOneTap
          ? ['点击下方按钮，按系统提示安装', '安装后可从桌面/开始菜单一键打开']
          : ['Chrome 菜单（⋮）里找「安装应用」或「添加到主屏幕」', '需用 https 正式站；局域网 http 地址通常不能一键装'];

  return (
    <div className="reward-popup-backdrop" role="presentation" onPointerDown={dismiss}>
      <section
        className="reward-popup install-hint"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="添加到主屏幕"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="reward-popup-eyebrow">轮回之后</p>
        <h2>添加到主屏幕</h2>
        <ul>
          {tips.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {canOneTap ? (
          <button type="button" className="primary wide" disabled={busy} onClick={() => void onInstall()}>
            {busy ? '唤起中…' : '一键添加到主屏幕'}
          </button>
        ) : null}
        <button type="button" className={canOneTap ? 'secondary wide' : 'primary wide'} onClick={dismiss}>
          {canOneTap ? '稍后' : '知道了'}
        </button>
      </section>
    </div>
  );
}

function ClickableStacks({
  stacks,
  onSelect,
  emptyText = '空'
}: {
  stacks: ItemStack[];
  onSelect: (itemId: string) => void;
  emptyText?: string;
}) {
  if (stacks.length === 0) return <p className="empty-note">{emptyText}</p>;
  return (
    <div className="stack-list">
      {stacks.map((stack) => {
        const item = ITEMS[stack.itemId];
        return (
          <button
            type="button"
            className={`stack-chip quality-frame ${qualityCssClass(item?.quality)}`}
            key={stack.itemId}
            onClick={() => onSelect(stack.itemId)}
          >
            <b>{item?.name ?? stack.itemId}</b>
            <small>{item?.quality ? `${item.quality} · ` : ''}×{stack.count}</small>
          </button>
        );
      })}
    </div>
  );
}

/** 炼器/炼丹预览：产物属性行 */
function craftOutputStatLines(itemId: string): string[] {
  const item = ITEMS[itemId];
  if (!item) return [];
  const lines: string[] = [];
  if (item.description) lines.push(item.description);
  if (item.physicalAttack) lines.push(`物攻 +${item.physicalAttack}`);
  if (item.spellAttack) lines.push(`法攻 +${item.spellAttack}`);
  if (item.physicalDefense) lines.push(`物防 +${item.physicalDefense}`);
  if (item.spellDefense) lines.push(`法防 +${item.spellDefense}`);
  if (item.bagSlots) lines.push(`背包格 +${item.bagSlots}`);
  if (item.potionSlotBonus) lines.push(`丹药槽 +${item.potionSlotBonus}`);
  if (item.escapeChanceBonus) lines.push(`逃跑成功率 +${Math.round(item.escapeChanceBonus * 100)}%`);
  if (item.escapeCooldownReductionMs) lines.push(`逃跑冷却 −${item.escapeCooldownReductionMs / 1000}s`);
  const potion = POTIONS[itemId];
  if (potion) {
    if (potion.healHp) lines.push(`回复气血 ${potion.healHp}`);
    if (potion.restoreMp) lines.push(`回复灵气 ${potion.restoreMp}`);
    if (potion.escapeBonus) lines.push(`下次逃跑 +${Math.round(potion.escapeBonus * 100)}%`);
  }
  return lines;
}

function EquipmentPanel({
  state,
  dispatch,
  onClose,
  fieldMode = false,
  discardMode = false,
  onDiscardModeChange
}: {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onClose: () => void;
  /** 探索非战斗：只动用身上行囊，不访问仓库 */
  fieldMode?: boolean;
  discardMode?: boolean;
  onDiscardModeChange?: (next: boolean) => void;
}) {
  const [tab, setTab] = useState<PackTab>(discardMode ? 'all' : 'gear');
  const [assignItemId, setAssignItemId] = useState<string | null>(null);
  const [focusSlot, setFocusSlot] = useState<EquipmentSlot | null>(null);

  useEffect(() => {
    if (discardMode) {
      setTab('all');
      setAssignItemId(null);
    }
  }, [discardMode]);

  const unlocked = unlockedPotionSlots(state);
  const bagMaterials = state.inventory.bag.filter((stack) => ITEMS[stack.itemId]?.kind === 'material');
  const bagPotions = state.inventory.bag.filter((stack) => ITEMS[stack.itemId]?.kind === 'potion');
  const availableEquipment = useMemo(
    () => {
      const source = fieldMode
        ? state.inventory.bag
        : mergeSources(state.inventory.bag, state.inventory.warehouse);
      return source.filter((stack) => ITEMS[stack.itemId]?.kind === 'equipment');
    },
    [state.inventory, fieldMode]
  );
  const gearForFocus = focusSlot
    ? availableEquipment.filter((stack) => ITEMS[stack.itemId]?.equipmentSlot === focusSlot)
    : availableEquipment;

  const potionGroups: Array<{ effect: 'heal' | 'mana' | 'escape'; label: string; glyph: string }> = [
    { effect: 'heal', label: '血 · 还丹', glyph: '血' },
    { effect: 'mana', label: '灵 · 聚灵', glyph: '灵' },
    { effect: 'escape', label: '遁 · 遁影', glyph: '遁' }
  ];

  const tabs: Array<{ id: PackTab; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'gear', label: '法宝' },
    { id: 'material', label: '灵材' },
    { id: 'skills', label: '秘术' },
    { id: 'passives', label: '心法' },
    { id: 'potions', label: '丹药' }
  ];

  const onBagItem = (itemId: string) => {
    if (fieldMode && discardMode) {
      dispatch({ type: 'DISCARD_BAG_ITEM', itemId });
      return;
    }
    const kind = ITEMS[itemId]?.kind;
    if (kind === 'equipment') dispatch({ type: 'EQUIP', itemId });
    else if (kind === 'potion') setAssignItemId(itemId);
  };

  return (
    <Modal title={fieldMode ? '行囊与装配' : '装配与行囊'} onClose={onClose}>
      {fieldMode && (
        <>
          <p className="modal-intro">
            {discardMode
              ? '丢弃模式：点哪个物品就丢弃哪个（整组）。点下方可关闭。'
              : '探索中可换装、换秘术、补丹药；仅身上行囊可用，洞府仓库需回府再开。'}
          </p>
          <button
            type="button"
            className={discardMode ? 'danger wide' : 'secondary wide'}
            onClick={() => onDiscardModeChange?.(!discardMode)}
          >
            {discardMode ? '关闭丢弃' : '启用丢弃'}
          </button>
        </>
      )}
      <div className="pack-tabs" role="tablist" aria-label="行囊分类">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'active' : ''}
            onClick={() => { setTab(entry.id); setAssignItemId(null); setFocusSlot(null); }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {(tab === 'all' || tab === 'material') && (
        <section className={`pack-section${discardMode ? ' discard-mode' : ''}`}>
          <h3>身上 · {usedSlots(state.inventory.bag)}/{state.inventory.capacity}</h3>
          <p className="modal-intro">
            {discardMode
              ? '点物品即可丢弃。'
              : tab === 'all' ? '点装备可直接装配；点丹药可挂到腰带槽。' : '灵材用于炼丹炼器。'}
          </p>
          <ClickableStacks
            stacks={tab === 'all' ? state.inventory.bag : bagMaterials}
            onSelect={onBagItem}
            emptyText={tab === 'all' ? '行囊为空' : '暂无灵材'}
          />
        </section>
      )}

      {tab === 'gear' && (
        <section className="pack-section">
          <div className="section-bar">法宝六槽</div>
          <p className="modal-intro">{fieldMode ? '点空槽或已装备槽，下方列出行囊中可替换的法宝。' : '点空槽或已装备槽，下方列出可替换的法宝。'}</p>
          <div className="equipment-grid six">
            {EQUIP_SLOTS.map((slot) => {
              const itemId = state.player.equipment[slot];
              const equipped = itemId ? ITEMS[itemId] : undefined;
              return (
                <button
                  type="button"
                  key={slot}
                  className={`equip-slot-card ${focusSlot === slot ? 'active' : ''} ${equipped ? `quality-frame ${qualityCssClass(equipped.quality)}` : ''}`}
                  onClick={() => setFocusSlot(slot)}
                >
                  <span>{SLOT_NAME[slot]}</span>
                  <b>{equipped ? equipped.name : '未装备'}</b>
                  <small>{equipped ? `${equipped.quality ?? '凡品'} · 点击更换` : '点击装配'}</small>
                </button>
              );
            })}
          </div>
          <div className="section-bar">{focusSlot ? `${SLOT_NAME[focusSlot]}可装` : '全部可装法宝'} · {gearForFocus.length}</div>
          <div className={`recipe-list compact${discardMode ? ' discard-mode' : ''}`}>
            {gearForFocus.length === 0
              ? <p className="empty-note">{fieldMode ? '行囊中暂无对应法宝。' : '暂无对应法宝，可去炼器或秘境寻找。'}</p>
              : gearForFocus.map((stack) => {
                const item = ITEMS[stack.itemId];
                return (
                  <button
                    key={stack.itemId}
                    className={`quality-frame ${qualityCssClass(item?.quality)}`}
                    onClick={() => {
                      if (fieldMode && discardMode) dispatch({ type: 'DISCARD_BAG_ITEM', itemId: stack.itemId });
                      else dispatch({ type: 'EQUIP', itemId: stack.itemId });
                    }}
                  >
                    <b>{discardMode ? '丢弃' : '装备'} {item.name} · {item.quality ?? '凡品'}</b>
                    <small>{item.description}</small>
                  </button>
                );
              })}
          </div>
        </section>
      )}

      {tab === 'skills' && (
        <section className="pack-section">
          <div className="section-bar">秘术 · 已装配 {state.player.equippedSkills.length}/6 · 点按切换</div>
          <p className="modal-intro">野外与秘境可领悟秘术。战斗中按优先级自动施放已装配的秘术。</p>
          <ul className="passive-list">
            {state.player.learnedSkills.map((id) => {
              const skill = SKILLS[id];
              if (!skill) return null;
              const equipped = state.player.equippedSkills.includes(id);
              return (
                <li key={id} className={`quality-frame ${qualityCssClass(skill.quality)}`}>
                  <button type="button" className={`skill-toggle ${equipped ? 'active' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_SKILL', skillId: id })}>
                    <b>{equipped ? '●' : '○'} {skill.name} · {skill.quality ?? '凡品'} · 优先 {skill.priority}</b>
                    <span>{skill.description} · CD {(skill.cooldownMs / 1000).toFixed(1)}秒 · 耗蓝 {skill.mpCost}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {state.player.learnedSkills.length < Object.keys(SKILLS).length && (
            <p className="empty-note">尚有秘术未领悟，可继续探索机缘。</p>
          )}
        </section>
      )}

      {tab === 'passives' && (
        <section className="pack-section">
          <div className="section-bar">心法（只读叠层）</div>
          <p className="modal-intro">心法不用装配。打怪与秘境都可能领悟；同名叠层强化。</p>
          {Object.keys(state.player.passives).length === 0 ? (
            <p className="empty-note">尚未领悟心法。</p>
          ) : (
            <ul className="passive-list">
              {Object.entries(state.player.passives).map(([id, stacks]) => {
                const passive = PASSIVES[id];
                if (!passive) return null;
                return (
                  <li key={id} className={`quality-frame ${qualityCssClass(passive.quality)}`}>
                    <b>{passive.name} · {passive.quality ?? '凡品'} · {stacks} 层</b>
                    <span>{passive.description}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === 'potions' && (
        <section className="pack-section">
          <div className="section-bar">腰带丹药槽 · {unlocked}/3</div>
          <p className="modal-intro">底栏「血 / 灵 / 遁」按丹药类型显示。挂上后与背包分开，战斗用尽不会自动补。</p>
          <div className="potion-belt-grid compact">
            {Array.from({ length: unlocked }, (_, slot) => {
              const belt = state.player.potionBelt[slot];
              const item = belt ? ITEMS[belt.itemId] : undefined;
              const glyph = belt ? (POTIONS[belt.itemId]?.glyph ?? '?') : '空';
              return (
                <div key={slot} className={`potion-belt-slot compact ${item ? `quality-frame ${qualityCssClass(item.quality)}` : ''}`}>
                  <span>槽 {slot + 1}{item?.quality ? ` · ${item.quality}` : ''}</span>
                  <b>{belt ? `${glyph} · ${item?.name} ×${belt.count}` : '空'}</b>
                  {belt && (
                    <button type="button" className="text-button" onClick={() => dispatch({ type: 'CLEAR_POTION_SLOT', slot })}>卸下</button>
                  )}
                </div>
              );
            })}
          </div>
          {unlocked < 3 && <p className="modal-intro">装备更高阶腰带可解锁更多丹药槽。</p>}

          <div className="typed-groups">
            {potionGroups.map((group) => {
              const owned = bagPotions.filter((stack) => POTIONS[stack.itemId]?.effect === group.effect);
              const equipped = state.player.potionBelt
                .map((belt, slot) => ({ belt, slot }))
                .filter(({ belt, slot }) => belt && slot < unlocked && POTIONS[belt.itemId]?.effect === group.effect);
              return (
                <div key={group.effect} className="typed-group">
                  <div className="section-bar sub">{group.glyph} {group.label}</div>
                  {equipped.length > 0 && (
                    <p className="equipped-note">已挂：{equipped.map(({ belt, slot }) => `槽${slot + 1} ${ITEMS[belt!.itemId].name}×${belt!.count}`).join('；')}</p>
                  )}
                  <ClickableStacks
                    stacks={owned}
                    onSelect={(itemId) => {
                      if (fieldMode && discardMode) dispatch({ type: 'DISCARD_BAG_ITEM', itemId });
                      else setAssignItemId(itemId);
                    }}
                    emptyText={`背包暂无${group.glyph}类丹药`}
                  />
                </div>
              );
            })}
          </div>

          {assignItemId && (
            <div className="assign-slot-picker">
              <p>将「{ITEMS[assignItemId].name}」挂到：</p>
              <div className="slot-number-row">
                {Array.from({ length: unlocked }, (_, slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'ASSIGN_POTION', itemId: assignItemId, slot });
                      setAssignItemId(null);
                    }}
                  >
                    {slot + 1}
                  </button>
                ))}
              </div>
              <button type="button" className="text-button" onClick={() => setAssignItemId(null)}>取消</button>
            </div>
          )}
        </section>
      )}
    </Modal>
  );
}

function CraftFacilityPanel({
  facility,
  state,
  dispatch,
  onClose
}: {
  facility: 'alchemy' | 'forge';
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onClose: () => void;
}) {
  const tabs = facility === 'forge' ? FORGE_TABS : ALCHEMY_TABS;
  const [tab, setTab] = useState(tabs[0].id);
  const [previewRecipeId, setPreviewRecipeId] = useState<string | null>(null);
  useEffect(() => {
    setTab(tabs[0].id);
    setPreviewRecipeId(null);
  }, [facility]);

  useEffect(() => {
    setPreviewRecipeId(null);
  }, [tab]);

  const recipes = Object.values(RECIPES).filter((recipe) => {
    if (recipe.facility !== facility) return false;
    const output = ITEMS[recipe.output.itemId];
    if (facility === 'forge') return output?.equipmentSlot === tab;
    return POTIONS[recipe.output.itemId]?.effect === tab;
  });
  const level = facility === 'alchemy' ? state.cave.alchemyLevel : state.cave.forgeLevel;
  const preview = previewRecipeId ? RECIPES[previewRecipeId] : null;
  const previewItem = preview ? ITEMS[preview.output.itemId] : null;
  const alchemyBonus = facility === 'alchemy' ? (state.reincarnation.talents.alchemy_gift ?? 0) : 0;
  const available = mergeSources(state.inventory.bag, state.inventory.warehouse);
  const previewAffordable = preview
    ? state.cave.spiritStones >= preview.spiritStoneCost && canAfford(available, preview.ingredients)
    : false;
  const previewLocked = preview ? (preview.requiredLevel ?? 1) > level : true;
  const previewOutputCount = preview ? preview.output.count + alchemyBonus : 0;
  const confirmLabel = facility === 'forge' ? '锻造' : '炼制';

  return (
    <Modal title={facility === 'alchemy' ? '炼丹' : '炼器'} onClose={onClose}>
      <p className="modal-intro">材料可从身上和仓库共同扣除；产物直接入库。点配方先看属性，再确认。</p>
      {!preview && (
        <div className="pack-tabs" role="tablist" aria-label={facility === 'alchemy' ? '丹药分类' : '法宝分类'}>
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? 'active' : ''}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
      {preview && previewItem ? (
        <div className="craft-preview">
          <div className={`craft-preview-card quality-frame ${qualityCssClass(previewItem.quality)}`}>
            <b>{previewItem.name} · {previewItem.quality ?? '凡品'}</b>
            <em>产出 ×{previewOutputCount}{alchemyBonus > 0 ? `（丹缘 +${alchemyBonus}）` : ''}</em>
            <ul className="craft-stat-list">
              {craftOutputStatLines(preview.output.itemId).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <small>
              材料：{preview.ingredients.map((i) => `${ITEMS[i.itemId].name}×${i.count}`).join(' + ')}
              {' · '}灵石 {preview.spiritStoneCost}
            </small>
            {previewLocked && <p className="empty-note">设施 {preview.requiredLevel} 级解锁</p>}
            {!previewLocked && !previewAffordable && <p className="empty-note">材料或灵石不足</p>}
          </div>
          <div className="craft-preview-actions">
            <button type="button" className="secondary" onClick={() => setPreviewRecipeId(null)}>取消</button>
            <button
              type="button"
              className="primary"
              disabled={previewLocked || !previewAffordable}
              onClick={() => {
                dispatch({ type: 'CRAFT', recipeId: preview.id });
                setPreviewRecipeId(null);
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="recipe-list">
            {recipes.length === 0 ? (
              <p className="empty-note">该类暂无配方。</p>
            ) : recipes.map((recipe) => {
              const locked = (recipe.requiredLevel ?? 1) > level;
              const outputCount = recipe.output.count + alchemyBonus;
              return (
                <button
                  key={recipe.id}
                  disabled={locked}
                  className={`quality-frame ${qualityCssClass(ITEMS[recipe.output.itemId]?.quality)}`}
                  onClick={() => setPreviewRecipeId(recipe.id)}
                >
                  <b>{recipe.name} · {ITEMS[recipe.output.itemId]?.quality ?? '凡品'}</b>
                  <small>{recipe.ingredients.map((i) => `${ITEMS[i.itemId].name}×${i.count}`).join(' + ')} · 灵石 {recipe.spiritStoneCost}</small>
                  <em>{locked ? `设施 ${recipe.requiredLevel} 级解锁` : `产出 ${ITEMS[recipe.output.itemId].name}×${outputCount}`}</em>
                </button>
              );
            })}
          </div>
          <button
            className="secondary wide"
            disabled={level >= 3}
            onClick={() => dispatch({ type: 'UPGRADE_FACILITY', facility })}
          >
            {level >= 3 ? '设施已满级' : `升级设施 · ${facilityUpgradeCost(level)} 灵石`}
          </button>
        </>
      )}
    </Modal>
  );
}

function CaveView({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  const [panel, setPanel] = useState<CavePanel>(null);
  const alchemyRecipes = Object.values(RECIPES).filter((recipe) => recipe.facility === 'alchemy');
  const forgeRecipes = Object.values(RECIPES).filter((recipe) => recipe.facility === 'forge');

  return (
    <main className="screen cave-screen">
      <div className="cave-atmosphere" aria-hidden="true"><span /><span /><span /></div>
      <header className="cave-title">
        <button
          type="button"
          className={`cheat-corner${state.cheatRestore ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'APPLY_CHEAT' })}
          title={state.cheatRestore ? '关闭风灵月影，恢复开启前存档' : '测试：开启最强状态（再点可关）'}
        >
          {state.cheatRestore ? '风灵月影·开' : '风灵月影'}
        </button>
        <p className="eyebrow">人界 · 永久营寨</p>
        <div className="cave-emblem" aria-hidden="true">辞</div>
        <h1>洞府</h1>
        <div className="resource-line"><span>灵石</span><strong>{state.cave.spiritStones}</strong><span>寿元</span><strong>{state.player.lifespan}/{state.player.maxLifespan}</strong></div>
      </header>

      <section className="facility-grid" aria-label="洞府设施">
        <button className="facility-mine" onClick={() => setPanel('mine')}><i>矿</i><b>采矿</b><small>Lv.{state.cave.mineLevel} · 叩击灵脉 · 待收 {state.cave.mineStored}</small></button>
        <button className="facility-alchemy" onClick={() => setPanel('alchemy')}><i>丹</i><b>炼丹</b><small>Lv.{state.cave.alchemyLevel} · {alchemyRecipes.length} 配方</small></button>
        <button className="facility-forge" onClick={() => setPanel('forge')}><i>器</i><b>炼器</b><small>Lv.{state.cave.forgeLevel} · {forgeRecipes.length} 配方</small></button>
        <button className="facility-warehouse" onClick={() => setPanel('warehouse')}><i>仓</i><b>仓库</b><small>{usedSlots(state.inventory.warehouse)}/{state.inventory.warehouseCapacity} 格</small></button>
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
          <p className="modal-intro">点击物品即可在两边转移；死亡后仓库保留。</p>
          <div className="inventory-columns">
            <div>
              <h3>身上 · {usedSlots(state.inventory.bag)}/{state.inventory.capacity}</h3>
              <ClickableStacks
                stacks={state.inventory.bag}
                onSelect={(itemId) => dispatch({ type: 'TRANSFER_ITEM', itemId, direction: 'toWarehouse' })}
              />
            </div>
            <div>
              <h3>仓库 · {usedSlots(state.inventory.warehouse)}/{state.inventory.warehouseCapacity}</h3>
              <ClickableStacks
                stacks={state.inventory.warehouse}
                onSelect={(itemId) => dispatch({ type: 'TRANSFER_ITEM', itemId, direction: 'toBag' })}
              />
            </div>
          </div>
          <button className="primary wide" onClick={() => dispatch({ type: 'TRANSFER_ALL_TO_WAREHOUSE' })}>一键将身上物品入库</button>
        </Modal>
      )}

      {panel === 'mine' && (
        <MinePanel state={state} dispatch={dispatch} onClose={() => setPanel(null)} />
      )}

      {(panel === 'alchemy' || panel === 'forge') && (
        <CraftFacilityPanel
          facility={panel}
          state={state}
          dispatch={dispatch}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'equipment' && <EquipmentPanel state={state} dispatch={dispatch} onClose={() => setPanel(null)} />}

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

function CombatHud({
  state,
  dispatch,
  onOpenPack
}: {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onOpenPack?: () => void;
}) {
  const combat = state.combat;
  const clock = combat?.clockMs ?? 0;
  const unlocked = unlockedPotionSlots(state);
  const escapeRemaining = combat ? Math.max(0, combat.escapeReadyAt - clock) : 0;
  const escapeChance = Math.round(escapeChanceFor(state) * 100);
  const skillCount = state.player.equippedSkills.length;
  const hp = combat?.player.hp ?? state.player.hp;
  const mp = combat?.player.mp ?? state.player.mp;
  const maxHp = combat?.player.maxHp ?? state.player.maxHp;
  const maxMp = combat?.player.maxMp ?? state.player.maxMp;
  const canOpenPack = Boolean(onOpenPack) && !combat;
  const bars = (
    <>
      <span className="hud-label">{canOpenPack ? '血气 / 灵气 · 点开行囊' : '血气 / 灵气'}</span>
      <Bar value={hp} max={maxHp} kind="hp" label="生命" />
      <Bar value={mp} max={maxMp} kind="mp" label="灵气" />
    </>
  );
  return (
    <section className={`explore-hud skills-${Math.min(6, Math.max(1, skillCount))}`}>
      <div className={`skill-cds count-${skillCount}`}>
        <span className="hud-label">秘术</span>
        {state.player.equippedSkills.map((id) => {
          const skill = SKILLS[id];
          const remaining = combat ? Math.max(0, (combat.skillReadyAt[id] ?? 0) - clock) : 0;
          const totalMs = Math.max(1, skill.cooldownMs);
          const ratio = remaining > 0 ? Math.min(1, remaining / totalMs) : 0;
          const cooling = ratio > 0;
          return (
            <div
              className={`skill-cd${cooling ? ' cooling' : ' ready'}`}
              style={{ '--cd': String(ratio) } as React.CSSProperties}
              key={id}
              title={`${skill.name} · CD ${(skill.cooldownMs / 1000).toFixed(1)}s`}
            >
              <b>{skill.name.slice(0, 1)}</b>
              <small>{cooling ? (remaining / 1000).toFixed(1) : ''}</small>
              <i className="skill-cd-veil" aria-hidden="true" />
            </div>
          );
        })}
      </div>
      {canOpenPack ? (
        <button type="button" className="player-bars pack-hotspot" onClick={onOpenPack} aria-label="打开行囊与装配">
          {bars}
        </button>
      ) : (
        <div className="player-bars">{bars}</div>
      )}
      <div className="potion-slots">
        <span className="hud-label">丹药</span>
        {Array.from({ length: unlocked }, (_, slot) => {
          const belt = state.player.potionBelt[slot];
          const item = belt ? ITEMS[belt.itemId] : undefined;
          const glyph = belt ? (POTIONS[belt.itemId]?.glyph ?? '?') : '空';
          const count = belt?.count ?? 0;
          return (
            <button
              key={slot}
              className={item ? `quality-frame ${qualityCssClass(item.quality)}` : undefined}
              disabled={!belt || count <= 0 || combat?.outcome !== 'active'}
              onClick={() => dispatch({ type: 'QUEUE_POTION', slot })}
              title={item ? `${item.name} · ${item.quality ?? '凡品'}` : undefined}
            >
              <b>{glyph}</b>
              <small>×{count}</small>
            </button>
          );
        })}
        <button
          className="escape-button"
          disabled={combat?.outcome !== 'active' || escapeRemaining > 0}
          title={`成功率约 ${escapeChance}% · CD ${escapeCooldownMs(state) / 1000}s`}
          onClick={() => dispatch({ type: 'ATTEMPT_ESCAPE' })}
        >
          <b>逃</b>
          <small>{escapeRemaining > 0 ? (escapeRemaining / 1000).toFixed(1) : `${escapeChance}%`}</small>
        </button>
      </div>
    </section>
  );
}

function ExploreView({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  const run = state.run!;
  const floor = currentFloor(run);
  const pending = floor.entities.find((entity) => entity.id === run.pendingInteractionId);
  const enemyName = state.combat ? enemyDisplayName(state.combat.enemyId, state.combat.enemyRank) : null;
  const [packOpen, setPackOpen] = useState(false);
  const [discardMode, setDiscardMode] = useState(false);

  useEffect(() => {
    if (state.combat) {
      setPackOpen(false);
      setDiscardMode(false);
    }
  }, [state.combat]);

  const closePack = () => {
    setPackOpen(false);
    setDiscardMode(false);
  };

  const acceptDiscardPrompt = () => {
    dispatch({ type: 'CLEAR_BAG_FULL_PROMPT' });
    setDiscardMode(true);
    setPackOpen(true);
  };

  const dismissDiscardPrompt = () => {
    dispatch({ type: 'CLEAR_BAG_FULL_PROMPT' });
  };

  return (
    <main className="screen explore-screen">
      <header className="explore-header"><span>寿元 <b>{state.player.lifespan}/{state.player.maxLifespan}</b></span><strong>{MAP_TIERS[run.sizeTier].name} · {run.floor}/{run.maxFloors}层</strong><span>步数 <b>{run.totalSteps}</b></span></header>
      {state.combat && <div className="combat-banner"><span><i>我</i><em>交锋</em><i>{state.combat.enemyRank === 'boss' ? '王' : state.combat.enemyRank === 'elite' ? '精' : enemyName?.slice(-1)}</i></span><b>{state.combat.lastAction?.name ?? '凝神对峙'}</b></div>}
      <Suspense fallback={<div className="map-loading">地界展开中…</div>}>
        <MapView state={state} dispatch={dispatch} />
      </Suspense>
      <div className="map-legend"><span>点方向格或滑动一步</span><span>种子 {run.seed}</span></div>
      {pending && <div className="interaction-card"><b>{pending.kind === 'return' ? '回府传送阵' : '传送门'}</b><button onClick={() => dispatch({ type: pending.kind === 'return' ? 'RETURN_CAVE' : 'ADVANCE_FLOOR' })}>{pending.kind === 'return' ? '结束本趟并回府' : '进入下一层'}</button></div>}
      <CombatHud state={state} dispatch={dispatch} onOpenPack={() => setPackOpen(true)} />
      {state.bagFullPrompt && !state.combat && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) dismissDiscardPrompt(); }}>
          <section className="modal bag-full-prompt" role="dialog" aria-modal="true" aria-label="行囊已满">
            <header><h2>行囊已满</h2><button className="icon-button" onClick={dismissDiscardPrompt} aria-label="关闭">×</button></header>
            <p className="modal-intro">地上的东西还在。可以丢弃行囊里暂时不需要的物品，腾出空位后再拾取。</p>
            <div className="craft-preview-actions">
              <button type="button" className="secondary" onClick={dismissDiscardPrompt}>取消</button>
              <button type="button" className="primary" onClick={acceptDiscardPrompt}>去丢弃</button>
            </div>
          </section>
        </div>
      )}
      {packOpen && !state.combat && (
        <EquipmentPanel
          state={state}
          dispatch={dispatch}
          onClose={closePack}
          fieldMode
          discardMode={discardMode}
          onDiscardModeChange={setDiscardMode}
        />
      )}
    </main>
  );
}

function ReincarnationView({ state, dispatch }: { state: GameState; dispatch: (command: GameCommand) => void }) {
  const offered = state.reincarnation.offeredTalents
    .map((id) => TALENTS[id])
    .filter(Boolean);
  return (
    <main className="screen reincarnation-screen">
      <p className="eyebrow">第 {state.reincarnation.totalDeaths} 次轮回</p><h1>轮回点</h1>
      <p>{state.reincarnation.lastDeathReason}</p>
      <div className="karma">因果 <strong>{state.reincarnation.karma}</strong><small>本次 +{state.reincarnation.pendingKarma}</small></div>
      <p className="modal-intro" style={{ color: '#c9c0ae' }}>本次仅可强化以下三项天赋，其余需来世再遇。</p>
      <section className="talent-list">
        {offered.map((talent) => {
          const level = state.reincarnation.talents[talent.id] ?? 0;
          const cost = talentCost(state, talent.id);
          return (
            <button
              key={talent.id}
              className={`quality-frame ${qualityCssClass(talent.quality)}`}
              disabled={level >= talent.maxLevel || state.reincarnation.karma < cost}
              onClick={() => dispatch({ type: 'BUY_TALENT', talentId: talent.id })}
            >
              <b>{talent.name} · {talent.quality ?? '凡品'} · {level}/{talent.maxLevel}</b>
              <span>{talent.description}</span>
              <em>{level >= talent.maxLevel ? '已满' : `${cost} 因果`}</em>
            </button>
          );
        })}
      </section>
      <button className="primary wide" onClick={() => dispatch({ type: 'REINCARNATE' })}>转世，回到洞府</button>
      <p className="retention-note">洞府设施、仓库、心法、秘术与天赋已保留；身上物品与本世境界已经消散。</p>
    </main>
  );
}

function SettingsModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [muted, setMuted] = useState(() => sound.isMuted());
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
  const toggleMute = () => {
    const next = !sound.isMuted();
    sound.setMuted(next);
    setMuted(next);
  };
  return (
    <Modal title="存档与试玩信息" onClose={onClose}>
      <dl className="diagnostics"><div><dt>构建</dt><dd>{state.meta.buildVersion}</dd></div><div><dt>存档版本</dt><dd>{state.meta.saveVersion}</dd></div><div><dt>诊断种子</dt><dd>{state.meta.diagnosticSeed}</dd></div></dl>
      <p>存档只保存在当前设备浏览器。建议试玩一段时间后导出备份。</p>
      <button className="secondary wide" onClick={toggleMute}>{muted ? '开启音效' : '关闭音效'}</button>
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
  const [installHintOpen, setInstallHintOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const lastActionIdRef = useRef(0);
  const lastOutcomeRef = useRef<string | null>(null);
  const lastPopupKeyRef = useRef<string | null>(null);
  const lastSceneRef = useRef(state.scene);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape) and (pointer: coarse)');
    const update = () => setLandscapeBlocked(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.mine-stored-collect, .vein-core')) return;
      if (target?.closest('button:not(:disabled), .stack-chip')) sound.playClick();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (showSplash) return;
    if (state.combat) {
      sound.playBgm('combat');
      return;
    }
    if (state.scene === 'explore') {
      sound.playBgm('explore');
      return;
    }
    sound.playBgm('cave');
  }, [showSplash, state.scene, Boolean(state.combat)]);

  useEffect(() => {
    const previous = lastSceneRef.current;
    if (previous === 'select' && state.scene === 'explore') {
      sound.playSfx('cardSlide', 0.7);
    }
    // 第一次死亡 → 轮回点 → 转世回洞府后，提示添加到主屏幕
    if (previous === 'reincarnation' && state.scene === 'cave' && shouldOfferInstallHint(state.reincarnation.totalDeaths)) {
      setInstallHintOpen(true);
      sound.playSfx('ding', 0.75);
    }
    lastSceneRef.current = state.scene;
  }, [state.scene, state.reincarnation.totalDeaths]);

  useEffect(() => {
    const action = state.combat?.lastAction;
    if (!action || action.id === lastActionIdRef.current) return;
    lastActionIdRef.current = action.id;
    playCombatActionSfx(action);
  }, [state.combat?.lastAction?.id]);

  useEffect(() => {
    const outcome = state.combat?.outcome ?? null;
    if (!outcome || outcome === 'active' || outcome === lastOutcomeRef.current) {
      if (!state.combat) lastOutcomeRef.current = null;
      return;
    }
    lastOutcomeRef.current = outcome;
    if (outcome === 'victory') sound.playSfx('victory', 0.85);
    else if (outcome === 'defeat') sound.playSfx('fail', 0.85);
    else if (outcome === 'fled') sound.playSfx('biu', 0.8);
  }, [state.combat?.outcome, Boolean(state.combat)]);

  useEffect(() => {
    if (!state.popup) {
      lastPopupKeyRef.current = null;
      return;
    }
    const key = `${state.popup.title}|${state.popup.lines.join('|')}`;
    if (key === lastPopupKeyRef.current) return;
    lastPopupKeyRef.current = key;
    sound.playSfx('ding', 0.8);
  }, [state.popup]);

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
      {showSplash && (
        <div className="studio-splash" aria-label="未孩游戏" role="img">
          <img
            src={`${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}ui/weihai-splash.png?v=3`}
            alt="未孩游戏"
            draggable={false}
          />
        </div>
      )}
      {state.scene === 'cave' && <CaveView state={state} dispatch={dispatch} />}
      {state.scene === 'select' && <SelectView state={state} dispatch={dispatch} />}
      {state.scene === 'explore' && state.run && <ExploreView state={state} dispatch={dispatch} />}
      {state.scene === 'reincarnation' && <ReincarnationView state={state} dispatch={dispatch} />}
      <div className="message-strip" role="status">{state.meta.message}</div>
      {state.popup && (
        <RewardPopup
          title={state.popup.title}
          lines={state.popup.lines}
          onClose={() => dispatch({ type: 'DISMISS_POPUP' })}
        />
      )}
      {installHintOpen && (
        <InstallHintPopup onClose={() => setInstallHintOpen(false)} />
      )}
      {landscapeBlocked && <div className="orientation-lock"><b>请将手机转回竖屏</b><span>游戏已暂停，返回竖屏后继续。</span></div>}
      {needRefresh && <div className="update-banner"><span>发现新版本，可立即刷新。</span><button onClick={() => void updateServiceWorker(true)}>更新</button></div>}
    </div>
  );
}
