import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, Target, Trophy, RotateCcw, Palette, Calculator, Radio, Gift, FlaskConical, Check, Star, X, Coins, Gem,
  BadgeCheck, Share2, Lock
} from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import {
  AURAS, auraById, formatChance, pointsFor, coinsFor, POTIONS, PITY_AT, comboMult, sellValue, MILESTONES,
  RARITY_TIERS, aurasInTier, THEMES, REBIRTH_MAX, rebirthCost, rebirthMult, dailyTarget, targetReward,
  FREE_POTION_MS, chanceWithin, AUTO_SELL_OPTIONS
} from '../lib/rng';
import { formatWhen, millis, todayKey } from '../lib/social';
import { Tabs } from './ui';
import AuraName, { auraVars } from './AuraName';

const fmt = (n) => Math.floor(n).toLocaleString();
const pct = (p) => (p >= 0.9995 ? '100%' : p < 0.0001 ? `${(p * 100).toExponential(1)}%` : `${(p * 100).toFixed(p < 0.01 ? 3 : 1)}%`);
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
};

// Session numbers, the pity meter, the combo and the auto-roll stop controls.
function SessionTab({ stats, session, stopTarget, setStopTarget, stopAfter, setStopAfter, autoSell, setAutoSell }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const minutes = Math.max(1 / 60, (Date.now() - session.start) / 60000);
  const pity = Math.min(PITY_AT, stats.sinceRare || 0);
  const combo = stats.combo || 0;
  return (
    <div className="hub-grid">
      <div className="hub-block">
        <span className="label">This session</span>
        <div className="hub-stats">
          <span><small>Rolls</small>{fmt(session.rolls)}</span>
          <span><small>Per minute</small>{fmt(session.rolls / minutes)}</span>
          <span><small>Points</small>{fmt(session.points)}</span>
          <span><small>Coins</small>{fmt(session.coins)}</span>
          <span><small>Time</small>{clock(Date.now() - session.start)}</span>
          <span><small>Rarest</small>{session.rarest ? <AuraName aura={session.rarest.aura} /> : '—'}</span>
        </div>
      </div>

      <div className="hub-block">
        <span className="label">Pity meter · {fmt(pity)} / {fmt(PITY_AT)}</span>
        <div className="hub-bar"><i style={{ width: `${(pity / PITY_AT) * 100}%` }} /></div>
        <span className="faint">Go {fmt(PITY_AT)} rolls without a 1 in 1,000+ aura and the next roll is guaranteed one.</span>

        <span className="label" style={{ marginTop: 10 }}>Combo · ×{comboMult(combo).toFixed(1)} points</span>
        <div className="hub-combo">
          {Array.from({ length: 20 }, (_, i) => <i key={i} className={i < combo ? 'on' : ''} />)}
        </div>
        <span className="faint">Each roll of 1 in 32 or rarer in a row adds +10% points (up to ×3). Best combo: {stats.bestCombo || 0}.</span>
      </div>

      <div className="hub-block">
        <span className="label">Auto-roll stops</span>
        <label className="field">
          <span>Stop when I land</span>
          <select className="input" value={stopTarget} onChange={(e) => setStopTarget(e.target.value)}>
            <option value="">Never</option>
            {AURAS.filter((a) => a.chance >= 32).map((a) => (
              <option key={a.id} value={a.id}>{a.name} or rarer · {formatChance(a.chance)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Stop after this many rolls</span>
          <input className="input" type="number" min={0} value={stopAfter} onChange={(e) => setStopAfter(Math.max(0, Math.floor(Number(e.target.value)) || 0))} placeholder="0 = never" />
        </label>
        <label className="field">
          <span>Auto-sell duplicates</span>
          <select className="input" value={autoSell} onChange={(e) => setAutoSell(Number(e.target.value))}>
            {AUTO_SELL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="hint">Duplicates you already own below this rarity turn straight into points (×3).</span>
        </label>
      </div>
    </div>
  );
}

// Daily target, the hourly potion, roll milestones and rarity-tier rewards.
function GoalsTab({ stats, update, luck }) {
  const today = todayKey();
  const target = dailyTarget(today);
  const targetDone = stats.targetDay === today;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const potionWait = Math.max(0, (stats.potionHour || 0) + FREE_POTION_MS - Date.now());
  const lucky = POTIONS.find((p) => p.id === 'lucky');
  const claimedMilestones = stats.milestones || [];
  const claimedTiers = stats.tiersClaimed || [];

  return (
    <div className="hub-grid">
      <div className="hub-block">
        <span className="label"><Target size={13} /> Today's target</span>
        <div className={targetDone ? 'hub-target done' : 'hub-target'} style={auraVars(target)}>
          <AuraName aura={target} as="strong" />
          <small>{formatChance(target.chance)} · +{fmt(targetReward(target))} points the first time today</small>
          <small>Your odds per roll: {pct(Math.min(1, luck / target.chance))}</small>
          {targetDone && <span className="chip chip-live"><Check size={12} /> Hit today</span>}
        </div>

        <span className="label" style={{ marginTop: 10 }}><FlaskConical size={13} /> Free hourly potion</span>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={potionWait > 0}
          onClick={() => update((prev) => (Date.now() - (prev.potionHour || 0) < FREE_POTION_MS ? {} : {
            potion: { id: lucky.id, rollsLeft: lucky.rolls }, potionHour: Date.now()
          }), `${lucky.name} active for ${lucky.rolls} rolls.`, 'coin')}
        >
          <Gift size={13} /> {potionWait > 0 ? `Ready in ${clock(potionWait)}` : `Claim a free ${lucky.name}`}
        </button>
      </div>

      <div className="hub-block">
        <span className="label"><Trophy size={13} /> Roll milestones</span>
        <ul className="hub-list">
          {MILESTONES.map(([rolls, reward]) => {
            const claimed = claimedMilestones.includes(rolls);
            const ready = stats.rolls >= rolls && !claimed;
            return (
              <li key={rolls} className={claimed ? 'done' : ready ? 'ready' : ''}>
                <span className="grow">{fmt(rolls)} rolls</span>
                <small className="faint">{fmt(Math.min(stats.rolls, rolls))}/{fmt(rolls)}</small>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!ready}
                  onClick={() => update((prev) => ((prev.milestones || []).includes(rolls) ? {} : {
                    milestones: [...(prev.milestones || []), rolls],
                    points: prev.points + reward,
                    pointsEarned: (prev.pointsEarned || 0) + reward
                  }), `Milestone! +${fmt(reward)} points.`, 'rare')}
                >
                  {claimed ? <Check size={13} /> : <><Gem size={11} /> {fmt(reward)}</>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hub-block">
        <span className="label"><BadgeCheck size={13} /> Rarity sets</span>
        <ul className="hub-list">
          {RARITY_TIERS.map((tier) => {
            const auras = aurasInTier(tier);
            const have = auras.filter((a) => stats.counts[a.id]).length;
            const claimed = claimedTiers.includes(tier.id);
            const ready = have === auras.length && !claimed;
            return (
              <li key={tier.id} className={claimed ? 'done' : ready ? 'ready' : ''}>
                <span className="grow" style={{ color: tier.color }}>{tier.name}</span>
                <small className="faint">{have}/{auras.length}</small>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!ready}
                  onClick={() => update((prev) => ((prev.tiersClaimed || []).includes(tier.id) ? {} : {
                    tiersClaimed: [...(prev.tiersClaimed || []), tier.id],
                    points: prev.points + tier.reward,
                    pointsEarned: (prev.pointsEarned || 0) + tier.reward
                  }), `${tier.name} set complete! +${fmt(tier.reward)} points.`, 'epic')}
                >
                  {claimed ? <Check size={13} /> : <><Gem size={11} /> {fmt(tier.reward)}</>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function RebirthTab({ stats, update }) {
  const rebirths = stats.rebirths || 0;
  const cost = rebirthCost(rebirths);
  const maxed = rebirths >= REBIRTH_MAX;
  const affordable = stats.points >= cost;
  const rebirth = () => {
    if (!window.confirm(`Rebirth for ${fmt(cost)} points? Your points and upgrades reset to zero. Your collection and rolls stay, and you get +25% luck forever.`)) return;
    update((prev) => (prev.points < rebirthCost(prev.rebirths || 0) || (prev.rebirths || 0) >= REBIRTH_MAX ? {} : {
      rebirths: (prev.rebirths || 0) + 1,
      points: 0,
      upgrades: {}
    }), `Reborn! Luck is now ×${rebirthMult(rebirths + 1).toFixed(2)} from rebirths.`, 'epic');
  };
  return (
    <div className="hub-rebirth">
      <div className="hub-rebirth-orb" aria-hidden="true"><RotateCcw size={36} /></div>
      <div className="stack" style={{ gap: 6 }}>
        <strong>Rebirth {rebirths} / {REBIRTH_MAX}</strong>
        <span className="muted">Current rebirth luck: ×{rebirthMult(rebirths).toFixed(2)}{!maxed && ` → ×${rebirthMult(rebirths + 1).toFixed(2)} after the next one`}</span>
        <span className="faint">Rebirthing resets your points and upgrades. Your auras, rolls, themes and rewards stay.</span>
        <div className="hub-bar"><i style={{ width: `${Math.min(1, stats.points / cost) * 100}%` }} /></div>
        <div>
          <button type="button" className="btn btn-primary" onClick={rebirth} disabled={maxed || !affordable}>
            <RotateCcw size={15} /> {maxed ? 'Fully reborn' : `Rebirth for ${fmt(cost)} points`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThemesTab({ stats, update }) {
  const owned = stats.themes || ['default'];
  return (
    <div className="hub-themes">
      {THEMES.map((theme) => {
        const has = owned.includes(theme.id) || theme.cost === 0;
        const active = (stats.theme || 'default') === theme.id;
        return (
          <div key={theme.id} className={`hub-theme theme-${theme.id}${active ? ' on' : ''}`}>
            <span className="hub-theme-preview" />
            <strong>{theme.name}</strong>
            {has ? (
              <button type="button" className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm'} disabled={active} onClick={() => update(() => ({ theme: theme.id }), `${theme.name} stage on.`)}>
                {active ? 'Using' : 'Use'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                disabled={stats.points < theme.cost}
                onClick={() => update((prev) => (prev.points < theme.cost || (prev.themes || []).includes(theme.id) ? {} : {
                  points: prev.points - theme.cost,
                  themes: [...(prev.themes || ['default']), theme.id],
                  theme: theme.id
                }), `Bought ${theme.name}!`, 'coin')}
              >
                {stats.points < theme.cost ? <Lock size={12} /> : <Gem size={11} />} {fmt(theme.cost)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToolsTab({ stats, luck, onShare }) {
  const [auraId, setAuraId] = useState('glitch');
  const [rolls, setRolls] = useState(1000);
  const aura = auraById(auraId);
  const p = chanceWithin(luck, aura.chance, rolls);
  const best = auraById(stats.best);
  return (
    <div className="hub-grid">
      <div className="hub-block">
        <span className="label"><Calculator size={13} /> Luck calculator</span>
        <select className="input" value={auraId} onChange={(e) => setAuraId(e.target.value)}>
          {AURAS.filter((a) => a.chance > 1).map((a) => <option key={a.id} value={a.id}>{a.name} · {formatChance(a.chance)}</option>)}
        </select>
        <label className="row" style={{ gap: 8 }}>
          <span className="label">in</span>
          <input className="input bet-input" type="number" min={1} value={rolls} onChange={(e) => setRolls(Math.max(1, Math.floor(Number(e.target.value)) || 1))} />
          <span className="label">rolls</span>
        </label>
        <div className="hub-calc">
          <strong>{pct(p)}</strong>
          <span className="faint">chance of {aura.name} or rarer at your current luck (×{luck >= 1000 ? fmt(luck) : luck.toFixed(2)}).</span>
          <span className="faint">That's about 1 every {fmt(Math.max(1, aura.chance / luck))} rolls.</span>
        </div>
      </div>
      <div className="hub-block">
        <span className="label"><Share2 size={13} /> Brag about it</span>
        <div className="hub-share" style={auraVars(best)}>
          <small>Best roll</small>
          <AuraName aura={best} as="strong" />
          <span>1 in {fmt(stats.bestRoll || 1)}</span>
          <small className="faint">{fmt(stats.rolls)} rolls · {AURAS.filter((a) => stats.counts[a.id]).length} auras · {stats.rebirths || 0} rebirths</small>
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={onShare}><Share2 size={13} /> Copy brag text</button>
        <span className="faint">Hotkeys: Space rolls, A toggles auto, Q toggles quick.</span>
      </div>
    </div>
  );
}

// Coin-paying finds from everyone, from the shared results ledger.
function LiveTab() {
  const [rows, setRows] = useState(null);
  useEffect(() => onSnapshot(
    query(collection(db, COL.redemptions), orderBy('createdAt', 'desc'), limit(150)),
    (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.type === 'rng').slice(0, 40)),
    () => setRows([])
  ), []);
  if (rows === null) return <p className="faint">Loading…</p>;
  if (!rows.length) return <p className="faint">No rare finds yet. Land a 1 in 1,000+ aura to show up here.</p>;
  return (
    <ol className="hub-feed">
      {rows.map((r) => (
        <li key={r.id}>
          <strong>{r.displayName || 'Someone'}</strong>
          <span className="grow truncate">{(r.note || '').replace(/^RNG Roll · /, '')}</span>
          <span className="chip chip-accent"><Coins size={11} /> +{fmt(r.amount || 0)}</span>
          <small className="faint">{millis(r.createdAt) ? formatWhen(r.createdAt) : ''}</small>
        </li>
      ))}
    </ol>
  );
}

export default function RngHub(props) {
  const [tab, setTab] = useState('session');
  return (
    <section className="card rng-hub">
      <div className="spread rng-heading">
        <h2 className="rng-heading" style={{ margin: 0 }}><Activity size={15} /> RNG hub</h2>
        <div className="tabs-scroll">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'session', label: 'Session' },
              { value: 'goals', label: 'Goals' },
              { value: 'rebirth', label: 'Rebirth' },
              { value: 'themes', label: <><Palette size={12} /> Themes</> },
              { value: 'tools', label: 'Tools' },
              { value: 'live', label: <><Radio size={12} /> Live</> }
            ]}
          />
        </div>
      </div>
      {tab === 'session' && <SessionTab {...props} />}
      {tab === 'goals' && <GoalsTab {...props} />}
      {tab === 'rebirth' && <RebirthTab {...props} />}
      {tab === 'themes' && <ThemesTab {...props} />}
      {tab === 'tools' && <ToolsTab {...props} />}
      {tab === 'live' && <LiveTab />}
    </section>
  );
}

// How many of your found auras sit in each rarity bracket, plus how often you roll them.
export function RarityChart({ stats }) {
  const rows = useMemo(() => RARITY_TIERS.map((tier) => {
    const auras = aurasInTier(tier);
    return {
      tier,
      found: auras.filter((a) => stats.counts[a.id]).length,
      total: auras.length,
      rolled: auras.reduce((n, a) => n + (stats.counts[a.id] || 0), 0)
    };
  }), [stats.counts]);
  const maxRolled = Math.max(1, ...rows.map((r) => r.rolled));
  return (
    <div className="rarity-chart" aria-label="Collection by rarity">
      {rows.map((r) => (
        <div key={r.tier.id} className="rarity-row">
          <span className="rarity-name" style={{ color: r.tier.color }}>{r.tier.name}</span>
          <span className="rarity-bar"><i style={{ width: `${(r.found / r.total) * 100}%`, background: r.tier.color }} /></span>
          <small className="faint">{r.found}/{r.total} found</small>
          <span className="rarity-bar thin"><i style={{ width: `${(Math.log10(r.rolled + 1) / Math.log10(maxRolled + 1)) * 100}%`, background: r.tier.color }} /></span>
          <small className="faint">{fmt(r.rolled)} rolled</small>
        </div>
      ))}
    </div>
  );
}

// Everything about one aura, with equip, favourite and sell.
export function AuraDetail({ aura, stats, luck, magnet, titleId, onClose, onEquip, onFavorite, onSell }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const count = stats.counts[aura.id] || 0;
  const fav = (stats.favorites || []).includes(aura.id);
  const first = stats.found?.[aura.id];
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal aura-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={aura.name} style={auraVars(aura)}>
        <button className="btn btn-ghost btn-icon aura-detail-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        <div className="aura-detail-hero">
          {count ? <AuraName aura={aura} as="strong" /> : <strong className="faint">???</strong>}
          <span>{formatChance(aura.chance)}</span>
        </div>
        <div className="hub-stats">
          <span><small>Owned</small>{fmt(count)}</span>
          <span><small>First found</small>{first ? new Date(first).toLocaleDateString() : count ? 'Before tracking' : '—'}</span>
          <span><small>Points per roll</small>{fmt(pointsFor(aura))}</span>
          <span><small>Coins</small>{fmt(coinsFor(aura, magnet))}</span>
          <span><small>Sells for</small>{fmt(sellValue(aura))}</span>
          <span><small>Your odds</small>{pct(Math.min(1, luck / aura.chance))}</span>
        </div>
        <div className="row wrap" style={{ gap: 6, justifyContent: 'center' }}>
          <button type="button" className="btn btn-sm btn-primary" disabled={!count} onClick={onEquip}>
            <BadgeCheck size={13} /> {titleId === aura.id ? 'Remove title' : 'Equip as title'}
          </button>
          <button type="button" className={fav ? 'btn btn-sm btn-primary' : 'btn btn-sm'} disabled={!count} onClick={onFavorite}>
            <Star size={13} fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Favourited' : 'Favourite'}
          </button>
          <button type="button" className="btn btn-sm" disabled={count < 2} onClick={() => onSell(1)}>Sell 1 · +{fmt(sellValue(aura))}</button>
          <button type="button" className="btn btn-sm" disabled={count < 2} onClick={() => onSell(count - 1)}>Sell duplicates · +{fmt(sellValue(aura) * Math.max(0, count - 1))}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
