import { useState } from 'react';
import { Bomb, Spade, Layers, Coins, RotateCcw } from 'lucide-react';
import {
  freshDeck, handValue, isBlackjack, rankHand, compareScores,
  rankLabel, isRed, randomInt
} from '../lib/cards';
import { Tabs } from './ui';

/* --------------------------------------------------------------- shared */

function Bet({ points, bet, setBet, disabled }) {
  const clamp = (v) => Math.max(1, Math.min(points, Math.floor(v) || 1));
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
        />
        <button className="btn btn-sm" onClick={() => setBet(clamp(bet + 10))} disabled={disabled || bet >= points}>+10</button>
        <button className="btn btn-sm" onClick={() => setBet(clamp(Math.floor(points / 2)))} disabled={disabled}>½</button>
        <button className="btn btn-sm" onClick={() => setBet(points)} disabled={disabled}>Max</button>
      </div>
    </div>
  );
}

function Card({ card, hidden }) {
  if (hidden) return <span className="pcard pcard-back" aria-label="Face-down card" />;
  return (
    <span className={isRed(card) ? 'pcard pcard-red' : 'pcard'}>
      <b>{rankLabel(card.rank)}</b>
      <i>{card.suit}</i>
    </span>
  );
}

function Result({ tone, children }) {
  if (!children) return null;
  return <p className={`result result-${tone}`}>{children}</p>;
}

/* ------------------------------------------------------------ blackjack */
// Dealer draws to 17. Win pays 2x, push returns the stake.

function Blackjack({ points, settle, busy }) {
  const [bet, setBet] = useState(10);
  const [game, setGame] = useState(null);
  const [msg, setMsg] = useState({ text: 'Deal a hand, then hit or stand.', tone: 'idle' });

  const deal = () => {
    if (bet < 1 || bet > points) return;
    const deck = freshDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    if (isBlackjack(player) || isBlackjack(dealer)) {
      const win = isBlackjack(player) && !isBlackjack(dealer);
      const push = isBlackjack(player) && isBlackjack(dealer);
      setGame({ deck, player, dealer, done: true });
      finish(push ? bet : win ? Math.floor(bet * 2.5) : 0,
        push ? 'Push — both blackjack.' : win ? 'Blackjack!' : 'Dealer blackjack.',
        push ? 'idle' : win ? 'win' : 'lose');
      return;
    }
    setGame({ deck, player, dealer, done: false });
    setMsg({ text: 'Hit or stand.', tone: 'idle' });
  };

  const finish = (payout, text, tone) => {
    setMsg({ text, tone });
    settle(payout - bet, `Blackjack · ${text}`);
  };

  const hit = () => {
    const deck = [...game.deck];
    const player = [...game.player, deck.pop()];
    if (handValue(player) > 21) {
      setGame({ ...game, deck, player, done: true });
      finish(0, 'Bust.', 'lose');
    } else {
      setGame({ ...game, deck, player });
    }
  };

  const stand = () => {
    const deck = [...game.deck];
    const dealer = [...game.dealer];
    while (handValue(dealer) < 17) dealer.push(deck.pop());

    const me = handValue(game.player);
    const them = handValue(dealer);
    const win = them > 21 || me > them;
    const push = me === them;

    setGame({ ...game, deck, dealer, done: true });
    finish(push ? bet : win ? bet * 2 : 0,
      push ? 'Push.' : win ? 'You beat the dealer!' : 'Dealer wins.',
      push ? 'idle' : win ? 'win' : 'lose');
  };

  const live = game && !game.done;

  return (
    <div className="arcade">
      <div className="felt">
        <div className="hand-row">
          <span className="hand-label">Dealer {game?.done ? `· ${handValue(game.dealer)}` : ''}</span>
          <div className="hand">
            {game
              ? game.dealer.map((c, i) => <Card key={i} card={c} hidden={!game.done && i === 1} />)
              : <span className="pcard pcard-empty" />}
          </div>
        </div>
        <div className="hand-row">
          <span className="hand-label">You {game ? `· ${handValue(game.player)}` : ''}</span>
          <div className="hand">
            {game ? game.player.map((c, i) => <Card key={i} card={c} />) : <span className="pcard pcard-empty" />}
          </div>
        </div>
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={!!live || busy} />

      <div className="row">
        {live ? (
          <>
            <button className="btn btn-primary" onClick={hit} disabled={busy}>Hit</button>
            <button className="btn" onClick={stand} disabled={busy}>Stand</button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={deal} disabled={busy || points < 1 || bet > points}>
            <Spade size={15} /> Deal
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- mines */
// Nine tiles, two mines. Each safe tile adds 35% to the stake.

function Mines({ points, settle, busy }) {
  const [bet, setBet] = useState(10);
  const [game, setGame] = useState(null);
  const [msg, setMsg] = useState({ text: 'Find safe tiles and cash out before hitting a mine.', tone: 'idle' });

  const start = () => {
    if (bet < 1 || bet > points) return;
    const mines = new Set();
    while (mines.size < 2) mines.add(randomInt(9));
    setGame({ bet, mines: [...mines], revealed: [], dead: false });
    setMsg({ text: 'Two mines are hidden. Choose carefully.', tone: 'idle' });
  };

  const payoutFor = (n) => Math.floor(bet * (1 + n * 0.35));

  const pick = (i) => {
    if (!game || game.dead || game.revealed.includes(i)) return;
    if (game.mines.includes(i)) {
      setGame({ ...game, dead: true });
      setMsg({ text: 'Mine hit. Bet lost.', tone: 'lose' });
      settle(-bet, 'Mines · hit a mine');
      return;
    }
    const revealed = [...game.revealed, i];
    if (revealed.length === 7) {
      setGame({ ...game, revealed, dead: true });
      const payout = payoutFor(revealed.length);
      setMsg({ text: `Cleared the board! Payout: ${payout} coins.`, tone: 'win' });
      settle(payout - bet, 'Mines · cleared the board');
      return;
    }
    setGame({ ...game, revealed });
  };

  const cashOut = () => {
    const payout = payoutFor(game.revealed.length);
    setGame({ ...game, dead: true });
    setMsg({ text: `Cashed out safely. Payout: ${payout} coins.`, tone: 'win' });
    settle(payout - bet, `Mines · cashed out on ${game.revealed.length} tiles`);
  };

  const live = game && !game.dead;
  const next = game ? payoutFor(game.revealed.length + 1) : 0;

  return (
    <div className="arcade">
      <div className="mines">
        {Array.from({ length: 9 }, (_, i) => {
          const safe = game?.revealed.includes(i);
          const boom = game?.dead && game.mines.includes(i);
          return (
            <button
              key={i}
              className={`tile-mine${safe ? ' safe' : ''}${boom ? ' boom' : ''}`}
              onClick={() => pick(i)}
              disabled={!live || busy}
              aria-label={`Tile ${i + 1}`}
            >
              {boom ? <Bomb size={18} /> : safe ? <Coins size={16} /> : ''}
            </button>
          );
        })}
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={!!live || busy} />

      <div className="row">
        {live ? (
          <>
            <button className="btn btn-primary" onClick={cashOut} disabled={busy || !game.revealed.length}>
              Cash out {game.revealed.length ? `· ${payoutFor(game.revealed.length)}` : ''}
            </button>
            <span className="faint">Next safe tile: {next}</span>
          </>
        ) : (
          <button className="btn btn-primary" onClick={start} disabled={busy || points < 1 || bet > points}>
            <Bomb size={15} /> Start
          </button>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- poker draw */
// Five cards each, best hand wins. A tie returns the stake.

function PokerDraw({ points, settle, busy }) {
  const [bet, setBet] = useState(10);
  const [game, setGame] = useState(null);
  const [msg, setMsg] = useState({ text: 'Best five-card hand wins. A tie returns your bet.', tone: 'idle' });

  const deal = () => {
    if (bet < 1 || bet > points) return;
    const deck = freshDeck();
    const player = Array.from({ length: 5 }, () => deck.pop());
    const dealer = Array.from({ length: 5 }, () => deck.pop());
    const mine = rankHand(player);
    const theirs = rankHand(dealer);
    const diff = compareScores(mine.score, theirs.score);

    setGame({ player, dealer, mine, theirs });
    if (diff > 0) {
      setMsg({ text: `${mine.name} beats ${theirs.name}.`, tone: 'win' });
      settle(bet, `Poker · ${mine.name} beat ${theirs.name}`);
    } else if (diff < 0) {
      setMsg({ text: `${theirs.name} beats your ${mine.name}.`, tone: 'lose' });
      settle(-bet, `Poker · lost to ${theirs.name}`);
    } else {
      setMsg({ text: `Tie — both ${mine.name}. Bet returned.`, tone: 'idle' });
    }
  };

  return (
    <div className="arcade">
      <div className="felt">
        <div className="hand-row">
          <span className="hand-label">Dealer {game ? `· ${game.theirs.name}` : ''}</span>
          <div className="hand">
            {game ? game.dealer.map((c, i) => <Card key={i} card={c} />)
              : Array.from({ length: 5 }, (_, i) => <span key={i} className="pcard pcard-empty" />)}
          </div>
        </div>
        <div className="hand-row">
          <span className="hand-label">You {game ? `· ${game.mine.name}` : ''}</span>
          <div className="hand">
            {game ? game.player.map((c, i) => <Card key={i} card={c} />)
              : Array.from({ length: 5 }, (_, i) => <span key={i} className="pcard pcard-empty" />)}
          </div>
        </div>
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={busy} />

      <button className="btn btn-primary" onClick={deal} disabled={busy || points < 1 || bet > points}>
        <Layers size={15} /> Deal five cards
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- shell */

const GAMES = {
  blackjack: { label: 'Blackjack', Component: Blackjack },
  mines: { label: 'Mines', Component: Mines },
  poker: { label: 'Poker Draw', Component: PokerDraw }
};

export default function Arcade({ points, only = 'all', settle, busy }) {
  const [tab, setTab] = useState(only === 'all' ? 'blackjack' : only);
  const active = only === 'all' ? tab : only;
  const { Component } = GAMES[active] || GAMES.blackjack;

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 14 }}>
        {only === 'all' ? (
          <Tabs
            value={tab}
            onChange={setTab}
            options={Object.entries(GAMES).map(([value, g]) => ({ value, label: g.label }))}
          />
        ) : <h2>{GAMES[active]?.label}</h2>}
        <span className="chip chip-accent"><Coins size={13} /> {points.toLocaleString()} points</span>
      </div>

      {points < 1 ? (
        <p className="muted row"><RotateCcw size={15} /> You're out of points. Take a refill to keep playing.</p>
      ) : (
        <Component points={points} settle={settle} busy={busy} />
      )}
    </div>
  );
}
