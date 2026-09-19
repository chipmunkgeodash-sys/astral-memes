import { useState } from 'react';
import {
  Bomb, Spade, Layers, Coins, Cherry, Disc3, Rocket, Dices, Triangle, ArrowUpDown, Crown, Grid3x3, TrendingUp, Ticket, Star
} from 'lucide-react';
import {
  freshDeck, handValue, isBlackjack, rankHand, compareScores, randomInt
} from '../lib/cards';
import { Bet, Card, Result, useRound, useSavedBet, GameContext, fmt } from './CasinoKit';
import { KEYS, pushRecent, useLocal } from '../lib/local';
import { Slots, Roulette, Crash, Dice, Plinko, HiLo, CoinFlip, Baccarat, Keno, Limbo, Scratch } from './CasinoGames';

/* ------------------------------------------------------------ blackjack */
// Dealer draws to 17. Win pays 2x, blackjack 2.5x, push returns the stake.

function Blackjack({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [game, setGame] = useState(null);
  const [msg, setMsg] = useState({ text: 'Deal a hand, then hit or stand.', tone: 'idle' });
  const round = useRound(settle);

  const finish = (payout, text, tone) => {
    setMsg({ text, tone });
    round.owe(bet, payout, `Blackjack · ${text}`);
    round.pay();
  };

  const deal = async () => {
    if (bet < 1 || bet > points) return;
    if (!(await round.stake(bet))) return;
    round.owe(bet, 0, 'Blackjack · left mid-hand');

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
  const [bet, setBet] = useSavedBet();
  const [game, setGame] = useState(null);
  const [msg, setMsg] = useState({ text: 'Find safe tiles and cash out before hitting a mine.', tone: 'idle' });
  const round = useRound(settle);

  const payoutFor = (stake, n) => Math.floor(stake * (1 + n * 0.35));

  const start = async () => {
    if (bet < 1 || bet > points) return;
    if (!(await round.stake(bet))) return;
    round.owe(bet, bet, 'Mines · left before picking');
    const mines = new Set();
    while (mines.size < 2) mines.add(randomInt(9));
    setGame({ bet, mines: [...mines], revealed: [], dead: false });
    setMsg({ text: 'Two mines are hidden. Choose carefully.', tone: 'idle' });
  };

  const pick = (i) => {
    if (!game || game.dead || game.revealed.includes(i)) return;
    if (game.mines.includes(i)) {
      setGame({ ...game, dead: true });
      setMsg({ text: 'Mine hit. Bet lost.', tone: 'lose' });
      round.owe(game.bet, 0, 'Mines · hit a mine');
      round.pay();
      return;
    }
    const revealed = [...game.revealed, i];
    const payout = payoutFor(game.bet, revealed.length);
    if (revealed.length === 7) {
      setGame({ ...game, revealed, dead: true });
      setMsg({ text: `Cleared the board! Payout: ${fmt(payout)} coins.`, tone: 'win' });
      round.owe(game.bet, payout, 'Mines · cleared the board');
      round.pay();
      return;
    }
    // Walking away now counts as cashing out.
    round.owe(game.bet, payout, `Mines · cashed out on ${revealed.length} tile${revealed.length === 1 ? '' : 's'}`);
    setGame({ ...game, revealed });
  };

  const cashOut = () => {
    const payout = payoutFor(game.bet, game.revealed.length);
    setGame({ ...game, dead: true });
    setMsg({ text: `Cashed out safely. Payout: ${fmt(payout)} coins.`, tone: 'win' });
    round.pay();
  };

  const live = game && !game.dead;
  const next = game ? payoutFor(game.bet, game.revealed.length + 1) : 0;

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
              Cash out {game.revealed.length ? `· ${fmt(payoutFor(game.bet, game.revealed.length))}` : ''}
            </button>
            <span className="faint">Next safe tile: {fmt(next)}</span>
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
  const [bet, setBet] = useSavedBet();
  const [game, setGame] = useState(null);
  const [msg, setMsg] = useState({ text: 'Best five-card hand wins. A tie returns your bet.', tone: 'idle' });
  const round = useRound(settle);

  const deal = async () => {
    if (bet < 1 || bet > points) return;
    if (!(await round.stake(bet))) return;
    const deck = freshDeck();
    const player = Array.from({ length: 5 }, () => deck.pop());
    const dealer = Array.from({ length: 5 }, () => deck.pop());
    const mine = rankHand(player);
    const theirs = rankHand(dealer);
    const diff = compareScores(mine.score, theirs.score);

    setGame({ player, dealer, mine, theirs });
    if (diff > 0) {
      setMsg({ text: `${mine.name} beats ${theirs.name}.`, tone: 'win' });
      round.owe(bet, bet * 2, `Poker · ${mine.name} beat ${theirs.name}`);
    } else if (diff < 0) {
      setMsg({ text: `${theirs.name} beats your ${mine.name}.`, tone: 'lose' });
      round.owe(bet, 0, `Poker · lost to ${theirs.name}`);
    } else {
      setMsg({ text: `Tie — both ${mine.name}. Bet returned.`, tone: 'idle' });
      round.owe(bet, bet, `Poker · tie on ${mine.name}`);
    }
    round.pay();
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

/* --------------------------------------------------------------- floor */

const GAMES = {
  slots: { label: 'Slots', blurb: 'Three reels, 400× jackpot', icon: Cherry, Component: Slots },
  roulette: { label: 'Roulette', blurb: 'Red, black or a number', icon: Disc3, Component: Roulette },
  blackjack: { label: 'Blackjack', blurb: 'Beat the dealer to 21', icon: Spade, Component: Blackjack },
  crash: { label: 'Crash', blurb: 'Cash out before it blows', icon: Rocket, Component: Crash },
  plinko: { label: 'Plinko', blurb: 'Drop it, up to 29×', icon: Triangle, Component: Plinko },
  dice: { label: 'Dice', blurb: 'Pick your odds', icon: Dices, Component: Dice },
  keno: { label: 'Keno', blurb: 'Pick numbers, up to 1,683×', icon: Grid3x3, Component: Keno },
  limbo: { label: 'Limbo', blurb: 'Name your multiplier', icon: TrendingUp, Component: Limbo },
  scratch: { label: 'Scratch Card', blurb: 'Three of a kind, up to 50×', icon: Ticket, Component: Scratch },
  baccarat: { label: 'Baccarat', blurb: 'Player, Banker or Tie', icon: Crown, Component: Baccarat },
  hilo: { label: 'Hi-Lo', blurb: 'Higher or lower, keep going', icon: ArrowUpDown, Component: HiLo },
  mines: { label: 'Mines', blurb: 'Dodge two mines', icon: Bomb, Component: Mines },
  poker: { label: 'Poker Draw', blurb: 'Best five cards wins', icon: Layers, Component: PokerDraw },
  coinflip: { label: 'Coin Flip', blurb: 'Double or nothing', icon: Coins, Component: CoinFlip }
};

export default function Arcade({ points, only = 'all', settle, busy }) {
  const [favorites, setFavorites] = useLocal(KEYS.casinoFavorites, []);
  const [recent, setRecent] = useLocal(KEYS.casinoRecent, []);
  const [tab, setTab] = useState(only === 'all' ? ((recent || []).find((id) => GAMES[id]) || 'slots') : only);
  const active = GAMES[only === 'all' ? tab : only] ? (only === 'all' ? tab : only) : 'slots';
  const { Component, label } = GAMES[active];

  const open = (id) => { setTab(id); setRecent((r) => pushRecent(r, id, 6)); };
  const toggleFavorite = (id) => setFavorites((f) => ((f || []).includes(id) ? f.filter((x) => x !== id) : [...(f || []), id]));
  const order = Object.keys(GAMES).sort((a, b) => Number((favorites || []).includes(b)) - Number((favorites || []).includes(a)));

  return (
    <div className="stack">
      {only === 'all' && !!(recent || []).filter((id) => GAMES[id]).length && (
        <div className="row wrap recent-games">
          <span className="label">Recently played</span>
          {(recent || []).filter((id) => GAMES[id]).map((id) => (
            <button key={id} type="button" className={active === id ? 'chip chip-accent' : 'chip'} onClick={() => open(id)}>{GAMES[id].label}</button>
          ))}
        </div>
      )}
      {only === 'all' && (
        <div className="lobby" role="tablist" aria-label="Casino games">
          {order.map((id) => {
            const g = GAMES[id];
            const Icon = g.icon;
            const fav = (favorites || []).includes(id);
            return (
              <div key={id} className="lobby-cell">
                <button
                  type="button"
                  role="tab"
                  aria-selected={active === id}
                  className={active === id ? 'lobby-game lobby-on' : 'lobby-game'}
                  onClick={() => open(id)}
                >
                  <Icon size={20} />
                  <strong>{g.label}</strong>
                  <small>{g.blurb}</small>
                </button>
                <button type="button" className={fav ? 'lobby-star on' : 'lobby-star'} onClick={() => toggleFavorite(id)} aria-label={fav ? `Unfavourite ${g.label}` : `Favourite ${g.label}`} aria-pressed={fav}>
                  <Star size={13} fill={fav ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2>{label}</h2>
          <span className="chip chip-accent"><Coins size={13} /> {points.toLocaleString()}</span>

        </div>
        {/* Keyed by game so switching tables settles whatever round was open. */}
        <GameContext.Provider value={active}>
          <Component key={active} points={points} settle={settle} busy={busy} />
        </GameContext.Provider>
      </div>
    </div>
  );
}
