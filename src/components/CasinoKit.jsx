import { createContext, useContext, useEffect, useRef } from 'react';
import { KEYS, useLocal } from '../lib/local';
import { rankLabel, isRed } from '../lib/cards';
import { play } from '../lib/sound';

export function Bet({ points, bet, setBet, disabled }) {
  const clamp = (v) => Math.max(1, Math.min(Math.max(points, 1), Math.floor(v) || 1));
  return (
    <div className="bet">
      <span className="label">Bet</span>
      <div className="bet-row">
        <button className="btn btn-sm" onClick={() => setBet(clamp(bet - 10))} disabled={disabled || bet <= 1}>−10</button>
        <input
          className="input bet-input"
          type="number"
          min={1}
          max={points}
          value={bet}
          onChange={(e) => setBet(clamp(Number(e.target.value)))}
          disabled={disabled}
          aria-label="Bet"
        />
        <button className="btn btn-sm" onClick={() => setBet(clamp(bet + 10))} disabled={disabled || bet >= points}>+10</button>
        <button className="btn btn-sm" onClick={() => setBet(clamp(bet * 2))} disabled={disabled || bet >= points}>2×</button>
        <button className="btn btn-sm" onClick={() => setBet(clamp(Math.floor(points / 2)))} disabled={disabled}>½</button>
        <button className="btn btn-sm" onClick={() => setBet(clamp(points))} disabled={disabled}>Max</button>
      </div>
    </div>
  );
}

export function Card({ card, hidden }) {
  if (hidden) return <span className="pcard pcard-back" aria-label="Face-down card" />;
  return (
    <span className={isRed(card) ? 'pcard pcard-red' : 'pcard'}>
      <b>{rankLabel(card.rank)}</b>
      <i>{card.suit}</i>
    </span>
  );
}

export function Result({ tone, children }) {
  // A sound whenever a round's verdict lands.
  useEffect(() => {
    if (tone === 'win') play('win');
    else if (tone === 'lose') play('lose');
  }, [tone, children]);

  if (!children) return null;
  return <p className={`result result-${tone}`}>{children}</p>;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Which table is open, so each game can remember its own last bet.
export const GameContext = createContext('casino');

export function useSavedBet(initial = 10) {
  const game = useContext(GameContext);
  const [bets, setBets] = useLocal(KEYS.casinoBets, {});
  const bet = Math.max(1, Math.floor(bets?.[game] || initial));
  const setBet = (value) => setBets((all) => ({ ...(all || {}), [game]: Math.max(1, Math.floor(typeof value === 'function' ? value(bet) : value) || 1) }));
  return [bet, setBet];
}

export const fmt = (n) => Math.floor(n).toLocaleString();

// One round of any game: the stake leaves the wallet when play starts, and the
// payout lands when the round resolves.
//
// Taking the stake up front means walking away mid-hand can't dodge a loss.
// Whatever the round is owed at that moment is written when the game unmounts,
// so leaving mid-spin still pays out a win that was already decided.
export function useRound(settle) {
  const pending = useRef(null);
  const settleRef = useRef(settle);
  settleRef.current = settle;

  useEffect(() => () => {
    const p = pending.current;
    pending.current = null;
    if (p) settleRef.current(p.payout, p.note, p.payout - p.bet);
  }, []);

  return {
    // Resolves false if the wallet write was refused, so the round never starts.
    stake: (bet) => settleRef.current(-bet, null),
    // What the round pays if it ends right now.
    owe: (bet, payout, note) => { pending.current = { bet, payout, note }; },
    pay: () => {
      const p = pending.current;
      pending.current = null;
      return p ? settleRef.current(p.payout, p.note, p.payout - p.bet) : Promise.resolve(true);
    }
  };
}
