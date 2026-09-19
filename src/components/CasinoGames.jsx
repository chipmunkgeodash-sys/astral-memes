import { useEffect, useRef, useState } from 'react';
import { Cherry, Disc3, Rocket, Dices, Triangle, ArrowUp, ArrowDown, Coins, Crown, Grid3x3, TrendingUp, Ticket, Repeat, Square } from 'lucide-react';
import {
  SLOT_SYMBOLS, spinSlots,
  ROULETTE_ORDER, ROULETTE_BETS, pocketColor, spinRoulette,
  crashPoint, crashCurve,
  diceMultiplier, rollDice,
  PLINKO_ROWS, PLINKO_TABLES, dropPlinko,
  hiloChance, hiloStep, drawCard,
  flipCoin,
  dealBaccarat, bacTotal,
  KENO_NUMBERS, KENO_DRAWN, KENO_TABLES, playKeno,
  LIMBO_MIN, LIMBO_MAX, limboChance, playLimbo, SCRATCH_PRIZES, dealScratch
} from '../lib/casino';
import { play } from '../lib/sound';
import { Bet, Card, Result, useRound, useSavedBet, wait, fmt } from './CasinoKit';

const outcome = (payout, bet) => (payout > bet ? 'win' : payout === bet ? 'idle' : 'lose');

/* ---------------------------------------------------------------- slots */

export function Slots({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [reels, setReels] = useState(['🍒', '🔔', '7️⃣']);
  const [stopped, setStopped] = useState([true, true, true]);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState({ text: 'Line up three of a kind for the big pays.', tone: 'idle' });
  const round = useRound(settle);

  const spin = async () => {
    if (bet < 1 || bet > points || spinning) return;
    setSpinning(true);
    if (!(await round.stake(bet))) { setSpinning(false); return; }

    const res = spinSlots(bet);
    const note = res.mult > 0 ? `Slots · ${res.line.glyph.repeat(res.count)} ×${res.mult}` : 'Slots · no line';
    round.owe(bet, res.payout, note);
    setMsg({ text: 'Spinning…', tone: 'idle' });
    setStopped([false, false, false]);

    const glyphs = SLOT_SYMBOLS.map((s) => s.glyph);
    const blur = setInterval(() => {
      setReels((cur) => cur.map(() => glyphs[Math.floor(Math.random() * glyphs.length)]));
    }, 70);

    const final = res.reels.map((s) => s.glyph);
    for (let i = 0; i < 3; i += 1) {
      await wait(i === 0 ? 650 : 380);
      setStopped((s) => s.map((v, j) => (j <= i ? true : v)));
      setReels((cur) => cur.map((g, j) => (j <= i ? final[j] : g)));
    }
    clearInterval(blur);
    setReels(final);

    await round.pay();
    setMsg(res.payout > 0
      ? { text: `${res.count === 3 ? 'Three' : 'Two'} ${res.line.glyph} — pays ${fmt(res.payout)}.`, tone: outcome(res.payout, bet) }
      : { text: 'No line. Spin again?', tone: 'lose' });
    setSpinning(false);
  };

  return (
    <div className="arcade">
      <div className="felt slots">
        <div className="reels">
          {reels.map((g, i) => (
            <span key={i} className={stopped[i] ? 'reel' : 'reel reel-spin'}>{g}</span>
          ))}
        </div>
        <div className="paytable">
          {[...SLOT_SYMBOLS].reverse().map((s) => (
            <span key={s.id}><b>{s.glyph.repeat(3)}</b> ×{s.triple}<i>{s.glyph.repeat(2)} ×{s.pair}</i></span>
          ))}
        </div>
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={spinning || busy} />
      <button className="btn btn-primary" onClick={spin} disabled={spinning || busy || points < 1 || bet > points}>
        <Cherry size={15} /> Spin
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- roulette */

export function Roulette({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [betId, setBetId] = useState('red');
  const [pick, setPick] = useState(17);
  const [shown, setShown] = useState(null);
  const [history, setHistory] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState({ text: 'Pick a bet, then spin the wheel.', tone: 'idle' });
  const round = useRound(settle);

  const def = ROULETTE_BETS.find((b) => b.id === betId);

  const spin = async () => {
    if (bet < 1 || bet > points || spinning) return;
    setSpinning(true);
    if (!(await round.stake(bet))) { setSpinning(false); return; }

    const res = spinRoulette(bet, betId, pick);
    const label = betId === 'straight' ? `#${pick}` : def.label;
    round.owe(bet, res.payout, `Roulette · ${label} · landed ${res.n} ${res.color}`);
    setMsg({ text: 'No more bets…', tone: 'idle' });

    // Tick round the wheel, slowing down, and stop on the drawn pocket.
    const start = ROULETTE_ORDER.indexOf(shown ?? 0);
    const end = ROULETTE_ORDER.indexOf(res.n);
    const steps = 37 + ((end - start + 37) % 37);
    for (let i = 1; i <= steps; i += 1) {
      setShown(ROULETTE_ORDER[(start + i) % 37]);
      const t = i / steps;
      await wait(12 + 120 * t * t * t);
    }

    await round.pay();
    setHistory((h) => [res.n, ...h].slice(0, 12));
    setMsg(res.payout > 0
      ? { text: `${res.n} ${res.color} — ${label} wins ${fmt(res.payout)}!`, tone: 'win' }
      : { text: `${res.n} ${res.color}. ${label} loses.`, tone: 'lose' });
    setSpinning(false);
  };

  return (
    <div className="arcade">
      <div className="felt roulette">
        <div className={`pocket pocket-${shown == null ? 'none' : pocketColor(shown)}${spinning ? ' pocket-spin' : ''}`}>
          {shown ?? '–'}
        </div>
        <div className="history">
          {history.map((n, i) => <span key={i} className={`chipnum chipnum-${pocketColor(n)}`}>{n}</span>)}
        </div>
      </div>

      <div className="choice-grid">
        {ROULETTE_BETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`choice${betId === b.id ? ' choice-on' : ''}${b.id === 'red' ? ' choice-red' : b.id === 'black' ? ' choice-black' : ''}`}
            onClick={() => setBetId(b.id)}
            disabled={spinning}
          >
            {b.label}<small>pays {b.pays}×</small>
          </button>
        ))}
      </div>
      {betId === 'straight' && (
        <label className="row">
          <span className="label">Number</span>
          <input
            className="input bet-input"
            type="number" min={0} max={36} value={pick}
            onChange={(e) => setPick(Math.max(0, Math.min(36, Math.floor(Number(e.target.value)) || 0)))}
            disabled={spinning}
          />
        </label>
      )}

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={spinning || busy} />
      <button className="btn btn-primary" onClick={spin} disabled={spinning || busy || points < 1 || bet > points}>
        <Disc3 size={15} /> Spin
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- crash */

export function Crash({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [auto, setAuto] = useState('2.00');
  const [mult, setMult] = useState(1);
  const [phase, setPhase] = useState('idle'); // idle | flying | cashed | crashed
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState({ text: 'Launch, then cash out before it crashes.', tone: 'idle' });
  const round = useRound(settle);
  const flight = useRef(null);

  useEffect(() => () => clearInterval(flight.current?.timer), []);

  const land = async (text, tone, finalMult, crashAt) => {
    clearInterval(flight.current.timer);
    flight.current = null;
    setMult(finalMult);
    setHistory((h) => [crashAt, ...h].slice(0, 12));
    setMsg({ text, tone });
    await round.pay();
  };

  const launch = async () => {
    if (bet < 1 || bet > points || phase === 'flying') return;
    setPhase('flying');
    if (!(await round.stake(bet))) { setPhase('idle'); return; }

    const point = crashPoint();
    const target = Number(auto) >= 1.01 ? Math.floor(Number(auto) * 100) / 100 : null;
    round.owe(bet, 0, `Crash · busted at ${point.toFixed(2)}×`);
    setMult(1);
    setMsg({ text: 'Climbing…', tone: 'idle' });

    const started = performance.now();
    const tick = () => {
      if (!flight.current) return;
      const m = crashCurve(performance.now() - started);
      if (target && target <= point && m >= target) {
        const payout = Math.floor(bet * target);
        round.owe(bet, payout, `Crash · auto cash-out at ${target.toFixed(2)}×`);
        setPhase('cashed');
        land(`Auto cash-out at ${target.toFixed(2)}× — ${fmt(payout)} coins.`, 'win', target, point);
        return;
      }
      if (m >= point) {
        setPhase('crashed');
        land(`Crashed at ${point.toFixed(2)}×.`, 'lose', point, point);
        return;
      }
      setMult(m);
    };
    // A timer rather than animation frames: those pause in a background tab,
    // which would freeze the climb while the clock keeps running.
    flight.current = { point, timer: setInterval(tick, 40) };
  };

  const cashOut = () => {
    if (!flight.current) return;
    const at = Math.min(mult, flight.current.point);
    const payout = Math.floor(bet * at);
    round.owe(bet, payout, `Crash · cashed out at ${at.toFixed(2)}×`);
    setPhase('cashed');
    land(`Cashed out at ${at.toFixed(2)}× — ${fmt(payout)} coins.`, outcome(payout, bet), at, flight.current.point);
  };

  const flying = phase === 'flying';

  return (
    <div className="arcade">
      <div className={`felt crash crash-${phase}`}>
        <Rocket size={30} className="crash-rocket" style={{ transform: `translate(${Math.min(60, (mult - 1) * 12)}px, ${-Math.min(40, (mult - 1) * 8)}px) rotate(45deg)` }} />
        <strong className="crash-mult">{mult.toFixed(2)}×</strong>
        {flying && <span className="faint">Cash out now for {fmt(bet * mult)}</span>}
        <div className="history">
          {history.map((m, i) => <span key={i} className={m >= 2 ? 'chipnum chipnum-hot' : 'chipnum'}>{m.toFixed(2)}×</span>)}
        </div>
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={flying || busy} />
      <label className="row">
        <span className="label">Auto cash-out</span>
        <input
          className="input bet-input" type="number" min={1.01} step={0.1}
          value={auto} onChange={(e) => setAuto(e.target.value)} disabled={flying}
          placeholder="off"
        />
      </label>

      {flying ? (
        <button className="btn btn-primary" onClick={cashOut}>Cash out · {fmt(bet * mult)}</button>
      ) : (
        <button className="btn btn-primary" onClick={launch} disabled={busy || points < 1 || bet > points}>
          <Rocket size={15} /> Launch
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- dice */

export function Dice({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [target, setTarget] = useState(50);
  const [roll, setRoll] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [msg, setMsg] = useState({ text: 'Roll under your number to win. Lower number, bigger pay.', tone: 'idle' });
  const round = useRound(settle);

  const multi = diceMultiplier(target);
  const [autoCount, setAutoCount] = useState(10);
  const [autoLeft, setAutoLeft] = useState(0);
  const stopAuto = useRef(false);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // One round. `fast` skips most of the rolling animation for auto-bets.
  const playOnce = async (fast = false) => {
    if (!(await round.stake(bet))) return false;
    const res = rollDice(bet, target);
    round.owe(bet, res.payout, `Dice · rolled ${res.roll.toFixed(2)} under ${target}`);
    for (let i = 0; i < (fast ? 3 : 12); i += 1) {
      setRoll(Math.floor(Math.random() * 10000) / 100);
      await wait(40);
    }
    setRoll(res.roll);
    await round.pay();
    setMsg(res.payout > 0
      ? { text: `${res.roll.toFixed(2)} — under ${target}! Won ${fmt(res.payout)}.`, tone: 'win' }
      : { text: `${res.roll.toFixed(2)} — not under ${target}.`, tone: 'lose' });
    return true;
  };

  const go = async () => {
    if (bet < 1 || bet > points || rolling) return;
    setRolling(true);
    await playOnce();
    setRolling(false);
  };

  const autoBet = async () => {
    if (rolling) return;
    const total = Math.min(1000, Math.max(1, Math.floor(autoCount) || 1));
    stopAuto.current = false;
    setRolling(true);
    for (let i = 0; i < total; i += 1) {
      if (stopAuto.current || bet > pointsRef.current) break;
      setAutoLeft(total - i);
      if (!(await playOnce(true))) break;
      await wait(120);
    }
    setAutoLeft(0);
    setRolling(false);
  };

  return (
    <div className="arcade">
      <div className="felt dice">
        <strong className={`dice-roll${roll == null ? '' : roll < target ? ' dice-win' : ' dice-lose'}`}>
          {roll == null ? '––.––' : roll.toFixed(2)}
        </strong>
        <div className="dice-bar">
          <span className="dice-win-zone" style={{ width: `${target}%` }} />
          {roll != null && <span className="dice-marker" style={{ left: `${roll}%` }} />}
        </div>
        <input
          className="dice-slider" type="range" min={2} max={95} value={target}
          onChange={(e) => setTarget(Number(e.target.value))} disabled={rolling}
          aria-label="Roll under"
        />
        <div className="dice-stats">
          <span><small>Roll under</small>{target}</span>
          <span><small>Win chance</small>{target}%</span>
          <span><small>Multiplier</small>{multi.toFixed(2)}×</span>
          <span><small>Pays</small>{fmt(bet * multi)}</span>
        </div>
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={rolling || busy} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={go} disabled={rolling || busy || points < 1 || bet > points}>
          <Dices size={15} /> Roll
        </button>
        {autoLeft > 0 ? (
          <button className="btn" onClick={() => { stopAuto.current = true; }}><Square size={13} /> Stop auto ({autoLeft} left)</button>
        ) : (
          <>
            <input className="input bet-input" type="number" min={1} max={1000} value={autoCount} onChange={(e) => setAutoCount(e.target.value)} aria-label="Auto-bet rounds" style={{ width: 80 }} />
            <button className="btn" onClick={autoBet} disabled={rolling || busy || points < 1 || bet > points}><Repeat size={13} /> Auto-bet</button>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- plinko */

const PW = 40; // horizontal gap between pegs
const PH = 30; // vertical gap between rows
const ballAt = (row, col) => ({ x: 180 + (col - row / 2) * PW, y: 16 + row * PH });

export function Plinko({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [risk, setRisk] = useState('low');
  const [ball, setBall] = useState(null);
  const [hit, setHit] = useState(null);
  const [dropping, setDropping] = useState(false);
  const [msg, setMsg] = useState({ text: 'Drop the ball. The edges pay the most.', tone: 'idle' });
  const round = useRound(settle);

  const table = PLINKO_TABLES[risk];

  const drop = async () => {
    if (bet < 1 || bet > points || dropping) return;
    setDropping(true);
    if (!(await round.stake(bet))) { setDropping(false); return; }

    const res = dropPlinko(bet, risk);
    round.owe(bet, res.payout, `Plinko · ${risk} risk · ${res.mult}×`);
    setHit(null);
    // Clear the last ball first so the new one doesn't slide back up the board.
    setBall(null);
    await wait(30);

    let col = 0;
    setBall(ballAt(0, 0));
    for (let r = 0; r < PLINKO_ROWS; r += 1) {
      await wait(130);
      col += res.path[r];
      setBall(ballAt(r + 1, col));
    }
    await wait(150);
    setHit(res.slot);
    await round.pay();
    setMsg({ text: `Landed on ${res.mult}× — ${fmt(res.payout)} coins.`, tone: outcome(res.payout, bet) });
    setDropping(false);
  };

  return (
    <div className="arcade">
      <div className="felt plinko">
        <svg viewBox="0 0 360 290" className="plinko-board" role="img" aria-label="Plinko board">
          {Array.from({ length: PLINKO_ROWS }, (_, r) =>
            Array.from({ length: r + 1 }, (_, j) => {
              const p = ballAt(r, j);
              return <circle key={`${r}-${j}`} cx={p.x} cy={p.y + PH / 2} r={3} className="peg" />;
            }))}
          {table.map((m, k) => {
            const p = ballAt(PLINKO_ROWS, k);
            const tier = m >= 3 ? 'hot' : m >= 1 ? 'warm' : 'cold';
            return (
              <g key={k} className={`plinko-slot plinko-${tier}${hit === k ? ' plinko-hit' : ''}`}>
                <rect x={p.x - 18} y={p.y + 8} width={36} height={22} rx={3} />
                <text x={p.x} y={p.y + 23} textAnchor="middle">{m}×</text>
              </g>
            );
          })}
          {ball && (
            <g className="plinko-ball" style={{ transform: `translate(${ball.x}px, ${ball.y}px)` }}>
              <circle r={7} />
            </g>
          )}
        </svg>
      </div>

      <div className="choice-grid choice-grid-2">
        {Object.keys(PLINKO_TABLES).map((k) => (
          <button key={k} type="button" className={`choice${risk === k ? ' choice-on' : ''}`}
            onClick={() => setRisk(k)} disabled={dropping}>
            {k === 'low' ? 'Low risk' : 'High risk'}<small>up to {PLINKO_TABLES[k][0]}×</small>
          </button>
        ))}
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={dropping || busy} />
      <button className="btn btn-primary" onClick={drop} disabled={dropping || busy || points < 1 || bet > points}>
        <Triangle size={15} /> Drop ball
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- hi-lo */

export function HiLo({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [game, setGame] = useState(null); // { card, pot, trail, live }
  const [msg, setMsg] = useState({ text: 'Call higher or lower. Every right call grows the pot.', tone: 'idle' });
  const round = useRound(settle);

  const start = async () => {
    if (bet < 1 || bet > points || game?.live) return;
    if (!(await round.stake(bet))) return;
    round.owe(bet, 0, 'Hi-Lo · walked away');
    setGame({ card: drawCard(), pot: bet, trail: [], live: true, steps: 0 });
    setMsg({ text: 'Higher or lower?', tone: 'idle' });
  };

  const call = async (dir) => {
    if (!game?.live) return;
    const next = drawCard();
    const right = dir === 'higher' ? next.rank >= game.card.rank : next.rank <= game.card.rank;
    const trail = [...game.trail, game.card].slice(-8);
    if (!right) {
      round.owe(bet, 0, `Hi-Lo · wrong after ${game.steps} calls`);
      setGame({ ...game, card: next, trail, live: false });
      setMsg({ text: 'Wrong call — pot lost.', tone: 'lose' });
      await round.pay();
      return;
    }
    const pot = Math.floor(game.pot * hiloStep(game.card.rank, dir));
    const steps = game.steps + 1;
    round.owe(bet, pot, `Hi-Lo · cashed out after ${steps} calls`);
    setGame({ ...game, card: next, trail, pot, steps });
    setMsg({ text: `Right! Pot is ${fmt(pot)}. Keep going or cash out.`, tone: 'win' });
  };

  const cashOut = async () => {
    if (!game?.live || !game.steps) return;
    setGame({ ...game, live: false });
    setMsg({ text: `Cashed out ${fmt(game.pot)} coins.`, tone: outcome(game.pot, bet) });
    await round.pay();
  };

  const live = game?.live;
  const r = game?.card.rank;

  return (
    <div className="arcade">
      <div className="felt hilo">
        <div className="hand-row">
          <span className="hand-label">Earlier</span>
          <div className="hand hand-trail">
            {game?.trail.length ? game.trail.map((c, i) => <Card key={i} card={c} />) : <span className="faint">—</span>}
          </div>
        </div>
        <div className="hilo-current">
          {game ? <Card card={game.card} /> : <span className="pcard pcard-back" />}
          {game && <span className="hilo-pot"><small>Pot</small>{fmt(game.pot)}</span>}
        </div>
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={!!live || busy} />

      {live ? (
        <div className="row">
          <button className="btn btn-primary" onClick={() => call('higher')} disabled={busy}>
            <ArrowUp size={15} /> Higher or same · {hiloStep(r, 'higher').toFixed(2)}×
            <small className="faint"> {Math.round(hiloChance(r, 'higher') * 100)}%</small>
          </button>
          <button className="btn btn-primary" onClick={() => call('lower')} disabled={busy}>
            <ArrowDown size={15} /> Lower or same · {hiloStep(r, 'lower').toFixed(2)}×
            <small className="faint"> {Math.round(hiloChance(r, 'lower') * 100)}%</small>
          </button>
          <button className="btn" onClick={cashOut} disabled={busy || !game.steps}>
            Cash out {game.steps ? `· ${fmt(game.pot)}` : ''}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={start} disabled={busy || points < 1 || bet > points}>
          Deal a card
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ coin flip */

export function CoinFlip({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [call, setCall] = useState('heads');
  const [side, setSide] = useState('heads');
  const [flips, setFlips] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [msg, setMsg] = useState({ text: 'Call it. Pays 1.94×.', tone: 'idle' });
  const round = useRound(settle);

  const flip = async () => {
    if (bet < 1 || bet > points || flipping) return;
    setFlipping(true);
    if (!(await round.stake(bet))) { setFlipping(false); return; }
    const res = flipCoin(bet, call);
    round.owe(bet, res.payout, `Coin flip · called ${call}, landed ${res.side}`);
    setFlips((f) => f + 1);
    setSide(res.side);
    await wait(1000);
    await round.pay();
    setMsg(res.payout > 0
      ? { text: `${res.side[0].toUpperCase()}${res.side.slice(1)}! Won ${fmt(res.payout)}.`, tone: 'win' }
      : { text: `${res.side[0].toUpperCase()}${res.side.slice(1)}. Unlucky.`, tone: 'lose' });
    setFlipping(false);
  };

  return (
    <div className="arcade">
      <div className="felt coinflip">
        <div
          className="coin"
          key={flips}
          data-side={side}
          style={{ '--turns': `${(flips ? 5 : 0) * 360 + (side === 'tails' ? 180 : 0)}deg` }}
        >
          <span className="coin-face coin-heads"><Crown size={34} /></span>
          <span className="coin-face coin-tails"><Coins size={34} /></span>
        </div>
      </div>

      <div className="choice-grid choice-grid-2">
        {['heads', 'tails'].map((s) => (
          <button key={s} type="button" className={`choice${call === s ? ' choice-on' : ''}`}
            onClick={() => setCall(s)} disabled={flipping}>
            {s === 'heads' ? 'Heads' : 'Tails'}<small>{s === 'heads' ? 'crown' : 'coins'}</small>
          </button>
        ))}
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={flipping || busy} />
      <button className="btn btn-primary" onClick={flip} disabled={flipping || busy || points < 1 || bet > points}>
        <Coins size={15} /> Flip
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- baccarat */

const BAC_SIDES = [
  { id: 'player', label: 'Player', pays: '2×' },
  { id: 'banker', label: 'Banker', pays: '1.95×' },
  { id: 'tie', label: 'Tie', pays: '9×' }
];

export function Baccarat({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [side, setSide] = useState('player');
  const [table, setTable] = useState(null); // { player, banker, done }
  const [dealing, setDealing] = useState(false);
  const [msg, setMsg] = useState({ text: 'Back the Player, the Banker, or a Tie.', tone: 'idle' });
  const round = useRound(settle);

  const deal = async () => {
    if (bet < 1 || bet > points || dealing) return;
    setDealing(true);
    if (!(await round.stake(bet))) { setDealing(false); return; }

    const res = dealBaccarat(bet, side);
    const label = BAC_SIDES.find((s) => s.id === side).label;
    round.owe(bet, res.payout, `Baccarat · ${label} · ${res.winner} ${res.p}–${res.k}`);

    // Deal in the real order: P, B, P, B, then any third cards.
    const order = [['player', 0], ['banker', 0], ['player', 1], ['banker', 1]];
    if (res.player[2]) order.push(['player', 2]);
    if (res.banker[2]) order.push(['banker', 2]);
    const shown = { player: [], banker: [] };
    setTable({ ...shown, done: false });
    for (const [who, i] of order) {
      await wait(380);
      shown[who] = [...shown[who], res[who][i]];
      setTable({ player: shown.player, banker: shown.banker, done: false });
    }
    setTable({ player: res.player, banker: res.banker, done: true });
    await round.pay();

    const verdict = res.winner === 'tie' ? `Tie at ${res.p}` : `${res.winner === 'player' ? 'Player' : 'Banker'} wins ${Math.max(res.p, res.k)}–${Math.min(res.p, res.k)}`;
    setMsg({
      text: res.payout > bet ? `${verdict}. You win ${fmt(res.payout)}!`
        : res.payout === bet ? `${verdict}. Bet returned.`
          : `${verdict}. ${label} loses.`,
      tone: outcome(res.payout, bet)
    });
    setDealing(false);
  };

  const hand = (who) => (
    <div className="hand-row">
      <span className="hand-label">
        {who === 'player' ? 'Player' : 'Banker'}{table?.[who].length ? ` · ${bacTotal(table[who])}` : ''}
      </span>
      <div className="hand">
        {table?.[who].length
          ? table[who].map((c, i) => <Card key={i} card={c} />)
          : [0, 1].map((i) => <span key={i} className="pcard pcard-empty" />)}
      </div>
    </div>
  );

  return (
    <div className="arcade">
      <div className="felt">
        {hand('player')}
        {hand('banker')}
      </div>

      <div className="choice-grid choice-grid-3">
        {BAC_SIDES.map((s) => (
          <button key={s.id} type="button" className={`choice${side === s.id ? ' choice-on' : ''}`}
            onClick={() => setSide(s.id)} disabled={dealing}>
            {s.label}<small>pays {s.pays}</small>
          </button>
        ))}
      </div>

      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={dealing || busy} />
      <button className="btn btn-primary" onClick={deal} disabled={dealing || busy || points < 1 || bet > points}>
        <Crown size={15} /> Deal
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- keno */

export function Keno({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [picks, setPicks] = useState([]);
  const [drawn, setDrawn] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [msg, setMsg] = useState({ text: 'Pick up to 10 numbers, then draw.', tone: 'idle' });
  const round = useRound(settle);

  const toggle = (n) => {
    if (drawing) return;
    setDrawn([]);
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 10 ? p : [...p, n]));
  };

  const quickPick = () => {
    if (drawing) return;
    const count = picks.length || 5;
    const pool = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    setDrawn([]);
    setPicks(pool.slice(0, count));
  };

  const draw = async () => {
    if (!picks.length || bet < 1 || bet > points || drawing) return;
    setDrawing(true);
    if (!(await round.stake(bet))) { setDrawing(false); return; }
    const res = playKeno(bet, picks);
    round.owe(bet, res.payout, `Keno · ${res.hits}/${picks.length} hits · ${res.mult}×`);
    setDrawn([]);
    for (const n of res.drawn) {
      await wait(160);
      setDrawn((d) => [...d, n]);
      if (picks.includes(n)) play('click');
    }
    await round.pay();
    setMsg(res.payout > 0
      ? { text: `${res.hits} hits — ${res.mult}× pays ${fmt(res.payout)}!`, tone: outcome(res.payout, bet) }
      : { text: `${res.hits} ${res.hits === 1 ? 'hit' : 'hits'}. No win.`, tone: 'lose' });
    setDrawing(false);
  };

  const table = picks.length ? KENO_TABLES[picks.length] : null;

  return (
    <div className="arcade">
      <div className="felt keno">
        <div className="keno-grid">
          {Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).map((n) => {
            const picked = picks.includes(n);
            const hit = drawn.includes(n);
            return (
              <button
                key={n}
                type="button"
                className={`keno-cell${picked ? ' picked' : ''}${hit ? ' drawn' : ''}${picked && hit ? ' hit' : ''}`}
                onClick={() => toggle(n)}
                disabled={drawing}
              >
                {n}
              </button>
            );
          })}
        </div>
        {table && (
          <div className="keno-table">
            {table.map((m, h) => m > 0 && <span key={h} className={drawn.length === KENO_DRAWN && picks.filter((p) => drawn.includes(p)).length === h ? 'on' : ''}><b>{h}</b> hits · {m}×</span>)}
          </div>
        )}
      </div>

      <div className="row">
        <span className="faint">{picks.length}/10 picked</span>
        <button className="btn btn-sm" onClick={quickPick} disabled={drawing}>Quick pick</button>
        <button className="btn btn-sm btn-ghost" onClick={() => { setPicks([]); setDrawn([]); }} disabled={drawing || !picks.length}>Clear</button>
      </div>
      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={drawing || busy} />
      <button className="btn btn-primary" onClick={draw} disabled={drawing || busy || !picks.length || points < 1 || bet > points}>
        <Grid3x3 size={15} /> Draw
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- limbo */

export function Limbo({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [target, setTarget] = useState('2.00');
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [msg, setMsg] = useState({ text: 'Pick a multiplier. Win it if the result reaches it.', tone: 'idle' });
  const round = useRound(settle);
  const t = Math.min(LIMBO_MAX, Math.max(LIMBO_MIN, Number(target) || LIMBO_MIN));

  const go = async () => {
    if (bet < 1 || bet > points || rolling) return;
    setRolling(true);
    if (!(await round.stake(bet))) { setRolling(false); return; }
    const res = playLimbo(bet, t);
    round.owe(bet, res.payout, `Limbo · ${res.result.toFixed(2)}× vs ${res.target.toFixed(2)}×`);
    const steps = 14;
    for (let i = 1; i <= steps; i += 1) {
      setResult(1 + (res.result - 1) * (i / steps) ** 2);
      await wait(35);
    }
    setResult(res.result);
    await round.pay();
    setMsg(res.payout > 0
      ? { text: `${res.result.toFixed(2)}× beat ${res.target.toFixed(2)}× — won ${fmt(res.payout)}!`, tone: 'win' }
      : { text: `${res.result.toFixed(2)}× fell short of ${res.target.toFixed(2)}×.`, tone: 'lose' });
    setRolling(false);
  };

  return (
    <div className="arcade">
      <div className={`felt limbo${result == null ? '' : result >= t ? ' limbo-win' : ' limbo-lose'}`}>
        <strong className="limbo-result">{result == null ? '—' : `${result.toFixed(2)}×`}</strong>
        <div className="dice-stats">
          <span><small>Target</small>{t.toFixed(2)}×</span>
          <span><small>Win chance</small>{(limboChance(t) * 100).toFixed(2)}%</span>
          <span><small>Pays</small>{fmt(bet * t)}</span>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <label className="row" style={{ gap: 6 }}>
          <span className="label">Target ×</span>
          <input className="input bet-input" type="number" min={LIMBO_MIN} max={LIMBO_MAX} step={0.01} value={target} onChange={(e) => setTarget(e.target.value)} disabled={rolling} />
        </label>
        {[1.5, 2, 5, 10, 100].map((m) => <button key={m} type="button" className="btn btn-sm" onClick={() => setTarget(String(m))} disabled={rolling}>{m}×</button>)}
      </div>
      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={rolling || busy} />
      <button className="btn btn-primary" onClick={go} disabled={rolling || busy || points < 1 || bet > points}>
        <TrendingUp size={15} /> Play
      </button>
    </div>
  );
}

/* --------------------------------------------------------- scratch card */

export function Scratch({ points, settle, busy }) {
  const [bet, setBet] = useSavedBet();
  const [card, setCard] = useState(null); // { cells, prize, payout, revealed: bool[] }
  const [msg, setMsg] = useState({ text: 'Buy a card and scratch all nine panels. Three of a kind wins.', tone: 'idle' });
  const round = useRound(settle);

  const buy = async () => {
    if (bet < 1 || bet > points || (card && card.revealed.some((r) => !r))) return;
    if (!(await round.stake(bet))) return;
    const res = dealScratch(bet);
    round.owe(bet, res.payout, res.prize ? `Scratch card · three ${res.prize.sym} · ${res.prize.mult}×` : 'Scratch card · no match');
    setCard({ ...res, bet, revealed: Array(9).fill(false) });
    setMsg({ text: 'Scratch away!', tone: 'idle' });
  };

  const finish = async (next) => {
    await round.pay();
    setMsg(next.payout > 0
      ? { text: `Three ${next.prize.sym}! You win ${fmt(next.payout)}.`, tone: next.payout > next.bet ? 'win' : 'idle' }
      : { text: 'No match this time.', tone: 'lose' });
  };

  const reveal = (i) => {
    if (!card || card.revealed[i]) return;
    const revealed = card.revealed.map((r, j) => r || j === i);
    const next = { ...card, revealed };
    setCard(next);
    play('tick');
    if (revealed.every(Boolean)) finish(next);
  };

  const revealAll = () => {
    if (!card || card.revealed.every(Boolean)) return;
    const next = { ...card, revealed: Array(9).fill(true) };
    setCard(next);
    finish(next);
  };

  const live = card && card.revealed.some((r) => !r);

  return (
    <div className="arcade">
      <div className="felt scratch">
        <div className="scratch-grid">
          {Array.from({ length: 9 }, (_, i) => {
            const shown = card?.revealed[i];
            const winning = shown && card.prize && card.cells[i] === card.prize.sym && card.revealed.every(Boolean);
            return (
              <button key={i} type="button" className={`scratch-cell${shown ? ' shown' : ''}${winning ? ' winning' : ''}`} onClick={() => reveal(i)} disabled={!live || shown}>
                {shown ? card.cells[i] : '?'}
              </button>
            );
          })}
        </div>
        <div className="keno-table">
          {SCRATCH_PRIZES.map((p) => <span key={p.sym}><b>{p.sym.repeat(3)}</b> · {p.mult}×</span>)}
        </div>
      </div>
      <Result tone={msg.tone}>{msg.text}</Result>
      <Bet points={points} bet={bet} setBet={setBet} disabled={!!live || busy} />
      <div className="row">
        {live ? (
          <button className="btn btn-primary" onClick={revealAll}>Reveal all</button>
        ) : (
          <button className="btn btn-primary" onClick={buy} disabled={busy || points < 1 || bet > points}>
            <Ticket size={15} /> Buy a card · {fmt(bet)}
          </button>
        )}
      </div>
    </div>
  );
}
