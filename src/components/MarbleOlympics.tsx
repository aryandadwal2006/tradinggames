import { useEffect, useMemo, useRef, useState } from 'react';
import { createSessionSeed, SeededRandom } from '../lib/rng';
import {
  applyMarbleShot,
  calculateFinalMarbleTotals,
  countGoals,
  createMarbleMatch,
  estimateMarbleFairValues,
  formatMarbleNumber,
  quoteSideBet,
  settleMainMarket,
  settleSideBetTrade,
  sideBetPayout,
  visibleSideBets,
  ZERO_MARBLE_COUNTS,
  type FinalMarbleTotals,
  type LiveMarbleCounts,
  type MarbleColor,
  type MarbleMatchSetup,
  type MarbleSessionSummary,
  type MarbleSideBetDefinition,
  type MarbleTeam
} from '../lib/marbleOlympics';

interface MarbleOlympicsProps {
  onExit: () => void;
  onComplete: (summary: MarbleSessionSummary) => void;
}

interface MainTrade {
  id: number;
  minute: number;
  direction: 'buy' | 'sell';
  size: 1 | 5 | 10;
  price: number;
  fairAtTrade: number;
  edge: number;
}

interface SideTrade {
  id: number;
  batch: number;
  minute: number;
  market: MarbleSideBetDefinition;
  direction: 'buy' | 'sell';
  size: 1 | 5 | 10;
  price: number;
  fairAtTrade: number;
  edge: number;
}

interface TimelineEntry {
  id: number;
  minute: number;
  team: MarbleTeam;
  color: MarbleColor;
  scored: boolean;
  scoreA: number;
  scoreB: number;
  fairValue: number;
}

type DurationOption = 10 | 20 | 30;
type PlaybackSpeed = 1 | 3 | 6;

function signed(value: number): string {
  return (value > 0 ? '+' : '') + formatMarbleNumber(value);
}

function durationLabel(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
}

function spreadFor(value: number): number {
  return Math.max(1, Math.abs(value) * 0.005);
}

function initialSideTradePnl(trade: SideTrade, fairValue: number): number {
  return (trade.direction === 'buy' ? 1 : -1) * (fairValue - trade.price) * trade.size;
}

function countAtMinute(entries: readonly TimelineEntry[], minute: number): { A: number; B: number } {
  const visible = entries.filter((entry) => entry.minute <= minute);
  const last = visible[visible.length - 1];
  return { A: last?.scoreA ?? 0, B: last?.scoreB ?? 0 };
}

function bracketCount(counts: { shots: number; goals: number }): string {
  return counts.goals + ' / ' + counts.shots;
}

function ShotMark({ color }: { color: MarbleColor }) {
  return <span className={'mo-shot-mark mo-shot-' + color} aria-label={color + ' marble'} />;
}

function BracketTable({ setup }: { setup: MarbleMatchSetup }) {
  return (
    <div className="mo-table-wrap">
      <table className="mo-table">
        <thead><tr><th>Round</th><th>Team</th><th>Orange</th><th>Red</th><th>Total</th></tr></thead>
        <tbody>{setup.bracket.map((round) => (
          <tr key={round.name}>
            <td rowSpan={2}>{round.name}</td>
            <td>Team A</td>
            <td>{bracketCount(round.A.orange)}</td><td>{bracketCount(round.A.red)}</td>
            <td>{round.A.orange.goals + round.A.red.goals}</td>
          </tr>
        )).flatMap((row, index) => [row, (
          <tr key={setup.bracket[index]?.name + '-b'}>
            <td>Team B</td>
            <td>{bracketCount(setup.bracket[index]!.B.orange)}</td>
            <td>{bracketCount(setup.bracket[index]!.B.red)}</td>
            <td>{setup.bracket[index]!.B.orange.goals + setup.bracket[index]!.B.red.goals}</td>
          </tr>
        )])}</tbody>
      </table>
      <p className="mo-subtle">Each cell is goals / shots from the four prior rounds. The underlying orange and red shot accuracies are hidden.</p>
    </div>
  );
}

export default function MarbleOlympics({ onExit, onComplete }: MarbleOlympicsProps) {
  const [phase, setPhase] = useState<'setup' | 'playing' | 'finished'>('setup');
  const [duration, setDuration] = useState<DurationOption>(10);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [setup, setSetup] = useState<MarbleMatchSetup | null>(null);
  const [counts, setCounts] = useState<LiveMarbleCounts>(ZERO_MARBLE_COUNTS);
  const [realElapsedMs, setRealElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [mainMid, setMainMid] = useState(0);
  const [pendingFairValue, setPendingFairValue] = useState<number | null>(null);
  const [marketStale, setMarketStale] = useState(false);
  const [latestGoal, setLatestGoal] = useState('');
  const [mainSize, setMainSize] = useState<1 | 5 | 10>(1);
  const [sideSize, setSideSize] = useState<1 | 5 | 10>(1);
  const [mainPosition, setMainPosition] = useState({ cash: 0, inventory: 0, trades: 0 });
  const [mainTrades, setMainTrades] = useState<MainTrade[]>([]);
  const [sideTrades, setSideTrades] = useState<SideTrade[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [replayMinute, setReplayMinute] = useState(90);
  const [logTab, setLogTab] = useState<'match' | 'trades'>('match');
  const resumedAtRef = useRef(0);
  const carriedElapsedRef = useRef(0);
  const countsRef = useRef<LiveMarbleCounts>(ZERO_MARBLE_COUNTS);
  const eventIndexRef = useRef(0);
  const marketStaleRef = useRef(false);
  const lastGoalElapsedRef = useRef(0);
  const pendingFairRef = useRef<number | null>(null);
  const mainMidRef = useRef(0);
  const completionSavedRef = useRef(false);

  const gameMinute = setup
    ? Math.min(90, realElapsedMs / 60000 * playbackSpeed * (90 / setup.durationMinutes))
    : 0;
  const batchIndex = Math.floor(realElapsedMs / 60000);
  const fairSnapshot = useMemo(
    () => setup ? estimateMarbleFairValues(setup, counts) : null,
    [counts, setup]
  );
  const mainSpread = spreadFor(mainMid);
  const marketBid = mainMid - mainSpread;
  const marketAsk = mainMid + mainSpread;
  const finalTotals = useMemo(() => calculateFinalMarbleTotals(counts), [counts]);
  const estimatedMainPnl = fairSnapshot
    ? mainPosition.cash + mainPosition.inventory * fairSnapshot.mainFairValue
    : 0;
  const estimatedSidePnl = sideTrades.reduce((sum, trade) => {
    const currentFair = fairSnapshot?.expectedSideBets[trade.market.id] ?? trade.fairAtTrade;
    return sum + initialSideTradePnl(trade, currentFair);
  }, 0);
  const visibleBets = useMemo(
    () => setup && fairSnapshot ? visibleSideBets(gameMinute, batchIndex).map((market) => ({
      market,
      fair: fairSnapshot.expectedSideBets[market.id],
      quote: quoteSideBet(fairSnapshot.expectedSideBets[market.id] ?? 0)
    })) : [],
    [batchIndex, fairSnapshot, gameMinute, setup]
  );
  const replayScore = useMemo(() => countAtMinute(timeline, replayMinute), [replayMinute, timeline]);
  const replayTrades = mainTrades.filter((trade) => trade.minute <= replayMinute);
  const replaySideTrades = sideTrades.filter((trade) => trade.minute <= replayMinute);
  const finalMainPnl = settleMainMarket(mainPosition.cash, mainPosition.inventory, finalTotals);
  const finalSideBetPnl = sideTrades.reduce((sum, trade) =>
    sum + settleSideBetTrade(trade.direction, trade.size, trade.price, sideBetPayout(trade.market.id, finalTotals)), 0);
  const finalPnl = finalMainPnl + finalSideBetPnl;
  const realSecondsRemaining = setup
    ? Math.max(0, duration * 60 / Math.max(playbackSpeed, 1) - realElapsedMs / 1000)
    : duration * 60 / Math.max(playbackSpeed, 1);

  const startMatch = () => {
    const random = new SeededRandom(createSessionSeed());
    const nextSetup = createMarbleMatch(random, duration);
    const initialFair = estimateMarbleFairValues(nextSetup, ZERO_MARBLE_COUNTS).mainFairValue;
    setSetup(nextSetup);
    countsRef.current = ZERO_MARBLE_COUNTS;
    eventIndexRef.current = 0;
    marketStaleRef.current = false;
    lastGoalElapsedRef.current = 0;
    pendingFairRef.current = null;
    mainMidRef.current = initialFair;
    setCounts(ZERO_MARBLE_COUNTS);
    setRealElapsedMs(0);
    carriedElapsedRef.current = 0;
    resumedAtRef.current = Date.now();
    setMainMid(initialFair);
    setPendingFairValue(null);
    setMarketStale(false);
    setLatestGoal('');
    setMainPosition({ cash: 0, inventory: 0, trades: 0 });
    setMainTrades([]);
    setSideTrades([]);
    setTimeline([]);
    setReplayMinute(90);
    setLogTab('match');
    completionSavedRef.current = false;
    setPhase('playing');
    setRunning(true);
  };

  const pauseOrResume = () => {
    if (running) {
      const elapsed = carriedElapsedRef.current + Date.now() - resumedAtRef.current;
      carriedElapsedRef.current = elapsed;
      setRealElapsedMs(elapsed);
      setRunning(false);
    } else {
      resumedAtRef.current = Date.now();
      setRunning(true);
    }
  };

  useEffect(() => {
    if (!running || phase !== 'playing') return;
    const timer = window.setInterval(() => {
      setRealElapsedMs(carriedElapsedRef.current + Date.now() - resumedAtRef.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, running]);

  useEffect(() => {
    if (phase !== 'playing' || !setup) return;
    let cursor = eventIndexRef.current;
    let nextCounts = countsRef.current;
    const newEntries: TimelineEntry[] = [];
    let scoredGoal = false;
    while (cursor < setup.events.length && setup.events[cursor]!.minute <= gameMinute) {
      const event = setup.events[cursor]!;
      nextCounts = applyMarbleShot(nextCounts, event);
      const snapshot = estimateMarbleFairValues(setup, nextCounts);
      const entry: TimelineEntry = {
        id: event.id,
        minute: event.minute,
        team: event.team,
        color: event.color,
        scored: event.scored,
        scoreA: countGoals(nextCounts, 'A'),
        scoreB: countGoals(nextCounts, 'B'),
        fairValue: snapshot.mainFairValue
      };
      newEntries.push(entry);
      cursor += 1;
      if (event.scored) {
        scoredGoal = true;
        setLatestGoal('GOAL · Team ' + event.team + ' scored a ' + event.color + ' marble at minute ' + event.minute + '.');
        marketStaleRef.current = true;
        lastGoalElapsedRef.current = realElapsedMs;
        pendingFairRef.current = snapshot.mainFairValue;
        setPendingFairValue(snapshot.mainFairValue);
        setMarketStale(true);
      } else if (marketStaleRef.current) {
        pendingFairRef.current = snapshot.mainFairValue;
        setPendingFairValue(snapshot.mainFairValue);
      } else {
        mainMidRef.current = snapshot.mainFairValue;
        setMainMid(snapshot.mainFairValue);
      }
    }
    if (cursor !== eventIndexRef.current) {
      eventIndexRef.current = cursor;
      countsRef.current = nextCounts;
      setCounts(nextCounts);
      setTimeline((items) => [...items, ...newEntries]);
      if (marketStaleRef.current && !scoredGoal) {
        const updatedFair = estimateMarbleFairValues(setup, nextCounts).mainFairValue;
        pendingFairRef.current = updatedFair;
        setPendingFairValue(updatedFair);
      }
    }
    if (gameMinute >= 90) {
      const lastFair = estimateMarbleFairValues(setup, nextCounts).mainFairValue;
      mainMidRef.current = lastFair;
      setMainMid(lastFair);
      pendingFairRef.current = null;
      marketStaleRef.current = false;
      setPendingFairValue(null);
      setMarketStale(false);
      setRunning(false);
      setPhase('finished');
    }
  }, [gameMinute, phase, realElapsedMs, setup]);

  useEffect(() => {
    if (phase !== 'playing' || !marketStaleRef.current) return;
    if (realElapsedMs - lastGoalElapsedRef.current < 5000) return;
    const nextMid = pendingFairRef.current;
    if (nextMid !== null) {
      mainMidRef.current = nextMid;
      setMainMid(nextMid);
    }
    pendingFairRef.current = null;
    marketStaleRef.current = false;
    setPendingFairValue(null);
    setMarketStale(false);
  }, [phase, realElapsedMs]);

  useEffect(() => {
    if (phase !== 'finished' || !setup || completionSavedRef.current) return;
    completionSavedRef.current = true;
    const settledTotals = calculateFinalMarbleTotals(countsRef.current);
    const mainPnl = settleMainMarket(mainPosition.cash, mainPosition.inventory, settledTotals);
    const sidePnl = sideTrades.reduce((sum, trade) =>
      sum + settleSideBetTrade(trade.direction, trade.size, trade.price, sideBetPayout(trade.market.id, settledTotals)), 0);
    onComplete({
      durationMinutes: setup.durationMinutes,
      mainTrades: mainPosition.trades,
      sideBetTrades: sideTrades.length,
      pnl: mainPnl + sidePnl,
      mainPnl,
      sideBetPnl: sidePnl,
      finalTeamATotal: settledTotals.A.total,
      finalTeamBTotal: settledTotals.B.total,
      durationSeconds: Math.round(realElapsedMs / 1000),
      playedAt: new Date().toISOString()
    });
  }, [counts, mainPosition, onComplete, phase, realElapsedMs, setup, sideTrades]);

  const tradeMain = (direction: 'buy' | 'sell') => {
    if (phase !== 'playing' || !running || !fairSnapshot) return;
    const price = direction === 'buy' ? marketAsk : marketBid;
    const edge = direction === 'buy'
      ? fairSnapshot.mainFairValue - price
      : price - fairSnapshot.mainFairValue;
    setMainPosition((current) => ({
      cash: current.cash + (direction === 'buy' ? -1 : 1) * price * mainSize,
      inventory: current.inventory + (direction === 'buy' ? mainSize : -mainSize),
      trades: current.trades + 1
    }));
    setMainTrades((items) => [...items, {
      id: items.length + 1,
      minute: gameMinute,
      direction,
      size: mainSize,
      price,
      fairAtTrade: fairSnapshot.mainFairValue,
      edge
    }]);
    if (marketStaleRef.current && edge > 0) {
      const resetValue = pendingFairRef.current ?? fairSnapshot.mainFairValue;
      mainMidRef.current = resetValue;
      setMainMid(resetValue);
      pendingFairRef.current = null;
      marketStaleRef.current = false;
      setPendingFairValue(null);
      setMarketStale(false);
      setLatestGoal((message) => message + ' First profitable trade reset the quote.');
    }
  };

  const tradeSideBet = (market: MarbleSideBetDefinition, fair: number, direction: 'buy' | 'sell', bid: number, ask: number) => {
    if (phase !== 'playing' || !running) return;
    const alreadyTraded = sideTrades.some((trade) => trade.batch === batchIndex && trade.market.id === market.id);
    if (alreadyTraded) return;
    const price = direction === 'buy' ? ask : bid;
    const edge = direction === 'buy' ? fair - price : price - fair;
    setSideTrades((items) => [...items, {
      id: items.length + 1,
      batch: batchIndex,
      minute: gameMinute,
      market,
      direction,
      size: sideSize,
      price,
      fairAtTrade: fair,
      edge
    }]);
  };

  const currentDisplayMinute = Math.floor(gameMinute);
  const matchProgress = Math.min(100, gameMinute / 90 * 100);
  const eventTape = timeline.slice().reverse().slice(0, 8);
  const activeTimeline = timeline.filter((entry) => entry.minute <= replayMinute).slice().reverse().slice(0, 12);
  const currentMainMark = fairSnapshot ? mainPosition.cash + mainPosition.inventory * fairSnapshot.mainFairValue : 0;
  const replayPnlTrades = replayTrades.length + replaySideTrades.length;
  const replayTradeRows = [
    ...replayTrades.map((trade) => ({ id: 'main-' + trade.id, minute: trade.minute, market: 'Main market', direction: trade.direction, size: trade.size, price: trade.price, fair: trade.fairAtTrade, edge: trade.edge })),
    ...replaySideTrades.map((trade) => ({ id: 'side-' + trade.id, minute: trade.minute, market: trade.market.label, direction: trade.direction, size: trade.size, price: trade.price, fair: trade.fairAtTrade, edge: trade.edge }))
  ].sort((left, right) => right.minute - left.minute);
  const finishedFinalTotals: FinalMarbleTotals = finalTotals;

  return (
    <main className="mo-page">
      <header className="mo-header">
        <button className="mo-text-button" type="button" onClick={onExit}>← Library</button>
        <span className="mo-eyebrow">LIVE MARKETS · BAYESIAN UPDATING</span>
        <h1>The Marble Olympics</h1>
        <p>Read the four-round bracket, trade the product of both teams’ final totals, and price side bets from predictive distributions. The model never shows the hidden team accuracies.</p>
      </header>

      {phase === 'setup' && (
        <section className="mo-panel mo-setup">
          <div className="mo-panel-kicker">MATCH SETUP</div>
          <h2>Choose the match length</h2>
          <div className="mo-settings-grid">
            <label>Real-time match duration
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value) as DurationOption)}>
                <option value={10}>10 minutes · about 5 shots per team per color</option>
                <option value={20}>20 minutes · about 10 shots per team per color</option>
                <option value={30}>30 minutes · about 15 shots per team per color</option>
              </select>
            </label>
            <label>Local practice clock speed
              <select value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.target.value) as PlaybackSpeed)}>
                <option value={1}>1× · published clock pace</option>
                <option value={3}>3× · accelerated practice</option>
                <option value={6}>6× · quick practice</option>
              </select>
            </label>
          </div>
          <div className="mo-rules-note">
            <strong>Simulation settings</strong>
            <p>Team strengths and orange/red accuracies are randomly drawn and remain hidden. The four bracket results use the same underlying team accuracies with a small shot-count variation, matching the public rules’ signal structure.</p>
            <p>The public overview names example nonlinear and linear side bets but does not publish the complete market catalogue. This practice version uses the ten displayed formulas below as transparent local variants, with a 2.5% quote spread.</p>
          </div>
          <button className="mo-button mo-primary" type="button" onClick={startMatch}>Start match</button>
        </section>
      )}

      {phase === 'playing' && setup && fairSnapshot && (
        <>
          <section className="mo-scorebar">
            <div className="mo-score-team"><span className="mo-team-marker mo-orange" /> <span>Team A</span><strong>{countGoals(counts, 'A')}</strong></div>
            <div className="mo-score-middle"><span>GAME MINUTE</span><strong>{currentDisplayMinute} <small>/ 90</small></strong><div className="mo-progress"><span style={{ width: matchProgress + '%' }} /></div></div>
            <div className="mo-score-team mo-score-team-right"><span className="mo-team-marker mo-red" /><span>Team B</span><strong>{countGoals(counts, 'B')}</strong></div>
            <button className="mo-button" type="button" onClick={pauseOrResume}>{running ? 'Pause' : 'Resume'}</button>
          </section>
          {!running && <p className="mo-paused-banner">Match paused. The game clock, quote-lag timer, and side-bet batch timer are frozen.</p>}

          <section className="mo-three-col">
            <div className="mo-panel mo-main-market">
              <div className="mo-panel-heading"><div><div className="mo-panel-kicker">MAIN MARKET</div><h2>Team A × Team B</h2></div><span className={marketStale ? 'mo-status mo-status-warning' : 'mo-status'}>{marketStale ? 'STALE QUOTE' : 'LIVE'}</span></div>
              <p className="mo-subtle">Settles at final Team A total × final Team B total. Trade size can be 1, 5 or 10 units.</p>
              <div className="mo-quote-row">
                <div className="mo-quote mo-bid"><span>BID</span><strong>{formatMarbleNumber(marketBid)}</strong></div>
                <div className="mo-quote mo-mid"><span>MID</span><strong>{formatMarbleNumber(mainMid)}</strong></div>
                <div className="mo-quote mo-ask"><span>ASK</span><strong>{formatMarbleNumber(marketAsk)}</strong></div>
              </div>
              <div className="mo-fair-row"><span>Current estimated fair</span><strong>{formatMarbleNumber(fairSnapshot.mainFairValue)}</strong></div>
              {marketStale && <div className="mo-stale-note"><strong>Goal quote lag</strong><span>Fair value has moved to {formatMarbleNumber(pendingFairValue ?? fairSnapshot.mainFairValue)}. The quote has up to five real seconds to converge; the first profitable trade re-centres it.</span></div>}
              {latestGoal && <p className="mo-goal-alert">{latestGoal}</p>}
              <label className="mo-inline-select">Trade size
                <select value={mainSize} onChange={(event) => setMainSize(Number(event.target.value) as 1 | 5 | 10)}>
                  <option value={1}>1 unit</option><option value={5}>5 units</option><option value={10}>10 units</option>
                </select>
              </label>
              <div className="mo-action-row">
                <button className="mo-button mo-buy" disabled={!running} type="button" onClick={() => tradeMain('buy')}>Buy at ask</button>
                <button className="mo-button mo-sell" disabled={!running} type="button" onClick={() => tradeMain('sell')}>Sell at bid</button>
              </div>
              <div className="mo-metric-grid">
                <div><span>Inventory</span><strong>{signed(mainPosition.inventory)}</strong></div>
                <div><span>Trades</span><strong>{mainPosition.trades}</strong></div>
                <div><span>Mark-to-model P&amp;L</span><strong className={currentMainMark >= 0 ? 'mo-positive' : 'mo-negative'}>{signed(currentMainMark)}</strong></div>
              </div>
            </div>

            <div className="mo-panel mo-estimation">
              <div className="mo-panel-kicker">READ THE BRACKET</div>
              <h2>Past tournament results</h2>
              <BracketTable setup={setup} />
              <div className="mo-estimates">
                <div><span>Team A estimated final total</span><strong>{formatMarbleNumber(fairSnapshot.teamAExpected)}</strong></div>
                <div><span>Team B estimated final total</span><strong>{formatMarbleNumber(fairSnapshot.teamBExpected)}</strong></div>
                <div><span>Expected red total</span><strong>{formatMarbleNumber(fairSnapshot.expectedRedTotal)}</strong></div>
                <div><span>Expected orange total</span><strong>{formatMarbleNumber(fairSnapshot.expectedOrangeTotal)}</strong></div>
              </div>
              <p className="mo-subtle">Estimates use observed per-color scoring rates with Beta(1, 1) smoothing. Accuracy estimates are not revealed as hidden ground-truth parameters.</p>
            </div>

            <div className="mo-panel mo-side-markets">
              <div className="mo-panel-heading"><div><div className="mo-panel-kicker">SIDE BETS</div><h2>Rotating markets</h2></div><span className="mo-slot-count">{visibleBets.length} slots</span></div>
              <p className="mo-subtle">One trade per market per 60-second batch. Each market settles on the final marble counts using its displayed payout formula.</p>
              <label className="mo-inline-select">Trade size
                <select value={sideSize} onChange={(event) => setSideSize(Number(event.target.value) as 1 | 5 | 10)}>
                  <option value={1}>1 unit</option><option value={5}>5 units</option><option value={10}>10 units</option>
                </select>
              </label>
              <div className="mo-sidebet-list">
                {visibleBets.map(({ market, fair, quote }) => {
                  const alreadyTraded = sideTrades.some((trade) => trade.batch === batchIndex && trade.market.id === market.id);
                  return (
                    <article className="mo-sidebet" key={market.id}>
                      <div className="mo-sidebet-title"><strong>{market.label}</strong><span>Fair {formatMarbleNumber(fair ?? 0)}</span></div>
                      <p>{market.formula}</p>
                      <div className="mo-sidebet-quote"><span>Bid {formatMarbleNumber(quote.bid)}</span><span>Ask {formatMarbleNumber(quote.ask)}</span></div>
                      {alreadyTraded
                        ? <span className="mo-traded-label">Traded this batch</span>
                        : <div className="mo-sidebet-actions">
                          <button disabled={!running} type="button" onClick={() => tradeSideBet(market, fair ?? 0, 'buy', quote.bid, quote.ask)}>Buy</button>
                          <button disabled={!running} type="button" onClick={() => tradeSideBet(market, fair ?? 0, 'sell', quote.bid, quote.ask)}>Sell</button>
                        </div>}
                    </article>
                  );
                })}
              </div>
              <div className="mo-side-pnl"><span>Side-bet mark-to-model P&amp;L</span><strong className={estimatedSidePnl >= 0 ? 'mo-positive' : 'mo-negative'}>{signed(estimatedSidePnl)}</strong><small>{sideTrades.length} side-bet trades recorded</small></div>
            </div>
          </section>

          <section className="mo-panel mo-log-panel">
            <div className="mo-panel-heading"><div><div className="mo-panel-kicker">LIVE REVIEW</div><h2>Match and trade tape</h2></div><span className="mo-subtle">{durationLabel(realSecondsRemaining)} real-clock time remaining at selected speed</span></div>
            <div className="mo-tabs"><button className={logTab === 'match' ? 'mo-tab-active' : ''} type="button" onClick={() => setLogTab('match')}>Shot timeline ({timeline.length})</button><button className={logTab === 'trades' ? 'mo-tab-active' : ''} type="button" onClick={() => setLogTab('trades')}>Your trades ({mainTrades.length + sideTrades.length})</button></div>
            {logTab === 'match' ? (
              <div className="mo-timeline-list">{eventTape.length ? eventTape.map((entry) => (
                <div className="mo-timeline-item" key={entry.id}><span className="mo-minute-chip">{entry.minute}'</span><ShotMark color={entry.color} /><strong>Team {entry.team}</strong><span>{entry.scored ? 'GOAL' : 'Miss'}</span><span className="mo-subtle">Fair {formatMarbleNumber(entry.fairValue)}</span></div>
              )) : <p className="mo-subtle">The match timeline appears here as shots resolve.</p>}</div>
            ) : (
              <div className="mo-timeline-list">{mainTrades.length + sideTrades.length ? [
                ...mainTrades.map((trade) => ({ minute: trade.minute, id: 'm-' + trade.id, label: (trade.direction === 'buy' ? 'Bought' : 'Sold') + ' main market ×' + trade.size, price: trade.price, edge: trade.edge })),
                ...sideTrades.map((trade) => ({ minute: trade.minute, id: 's-' + trade.id, label: (trade.direction === 'buy' ? 'Bought ' : 'Sold ') + trade.market.label + ' ×' + trade.size, price: trade.price, edge: trade.edge }))
              ].sort((a, b) => b.minute - a.minute).slice(0, 12).map((trade) => (
                <div className="mo-timeline-item" key={trade.id}><span className="mo-minute-chip">{trade.minute.toFixed(1)}'</span><strong>{trade.label}</strong><span>at {formatMarbleNumber(trade.price)}</span><span className={trade.edge >= 0 ? 'mo-positive' : 'mo-negative'}>model edge {signed(trade.edge)}</span></div>
              )) : <p className="mo-subtle">No trades yet.</p>}</div>
            )}
          </section>
          <div className="mo-playing-footer"><span>{timeline.length} shots resolved</span><span>{Math.max(0, setup.events.length - timeline.length)} shots remaining in simulation</span><button type="button" onClick={pauseOrResume}>{running ? 'Pause match' : 'Resume match'}</button></div>
        </>
      )}

      {phase === 'finished' && setup && (
        <section className="mo-panel mo-results">
          <div className="mo-panel-kicker">FULL TIME · SETTLEMENT</div>
          <h2>{finishedFinalTotals.A.total} – {finishedFinalTotals.B.total}</h2>
          <p className="mo-subtle">Main market settles at {finishedFinalTotals.A.total} × {finishedFinalTotals.B.total} = {finishedFinalTotals.A.total * finishedFinalTotals.B.total}. Side bets settle using their final-count payout formulas.</p>
          <div className="mo-result-grid">
            <div><span>Total P&amp;L</span><strong className={finalPnl >= 0 ? 'mo-positive' : 'mo-negative'}>{signed(finalPnl)}</strong></div>
            <div><span>Main market P&amp;L</span><strong className={finalMainPnl >= 0 ? 'mo-positive' : 'mo-negative'}>{signed(finalMainPnl)}</strong></div>
            <div><span>Side-bet P&amp;L</span><strong className={finalSideBetPnl >= 0 ? 'mo-positive' : 'mo-negative'}>{signed(finalSideBetPnl)}</strong></div>
            <div><span>Trades</span><strong>{mainTrades.length} main · {sideTrades.length} side</strong></div>
          </div>
          <h3>Replay timeline</h3>
          <label className="mo-replay-slider">Scrub match minute: <strong>{replayMinute}</strong>
            <input type="range" min="0" max="90" step="1" value={replayMinute} onChange={(event) => setReplayMinute(Number(event.target.value))} />
          </label>
          <div className="mo-replay-score"><span>Team A <strong>{replayScore.A}</strong></span><span>Team B <strong>{replayScore.B}</strong></span><span>{activeTimeline.length} visible shot events</span><span>{replayPnlTrades} trades by minute {replayMinute}</span></div>
          <h3>Trades and information at execution</h3>
          <p className="mo-subtle">Only trades at or before the selected minute are shown. Recorded fair value and quoted price are the values available at execution, not a hindsight revaluation.</p>
          {replayTradeRows.length ? (
            <div className="mo-table-wrap">
              <table className="mo-table">
                <thead><tr><th>Minute</th><th>Market</th><th>Action / size</th><th>Trade price</th><th>Recorded fair</th><th>Edge at trade</th></tr></thead>
                <tbody>{replayTradeRows.map((trade) => (
                  <tr key={trade.id}>
                    <td>{trade.minute.toFixed(1)}'</td>
                    <td>{trade.market}</td>
                    <td>{trade.direction} ×{trade.size}</td>
                    <td>{formatMarbleNumber(trade.price)}</td>
                    <td>{formatMarbleNumber(trade.fair)}</td>
                    <td className={trade.edge >= 0 ? 'mo-positive' : 'mo-negative'}>{signed(trade.edge)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="mo-subtle">No trades had occurred at this replay time.</p>}
          <div className="mo-timeline-list">
            {activeTimeline.length ? activeTimeline.map((entry) => (
              <div className="mo-timeline-item" key={entry.id}><span className="mo-minute-chip">{entry.minute}'</span><ShotMark color={entry.color} /><strong>Team {entry.team}</strong><span>{entry.scored ? 'GOAL' : 'Miss'}</span><span className="mo-subtle">Model fair at shot: {formatMarbleNumber(entry.fairValue)}</span></div>
            )) : <p className="mo-subtle">No shots had occurred at the selected replay time.</p>}
          </div>
          <h3>Settled side bets</h3>
          {sideTrades.length ? (
            <div className="mo-table-wrap"><table className="mo-table"><thead><tr><th>Market</th><th>Trade</th><th>Price</th><th>Final payout</th><th>Settled P&amp;L</th></tr></thead>
              <tbody>{sideTrades.map((trade) => {
                const payout = sideBetPayout(trade.market.id, finishedFinalTotals);
                const pnl = settleSideBetTrade(trade.direction, trade.size, trade.price, payout);
                return <tr key={trade.id}><td>{trade.market.label}</td><td>{trade.direction} ×{trade.size}</td><td>{formatMarbleNumber(trade.price)}</td><td>{formatMarbleNumber(payout)}</td><td className={pnl >= 0 ? 'mo-positive' : 'mo-negative'}>{signed(pnl)}</td></tr>;
              })}</tbody>
            </table></div>
          ) : <p className="mo-subtle">No side bets were traded.</p>}
          <div className="mo-action-row"><button className="mo-button mo-primary" type="button" onClick={() => setPhase('setup')}>Run another match</button><button className="mo-button" type="button" onClick={onExit}>Back to library</button></div>
          <p className="mo-subtle">This is a single-player practice simulation. The published multiplayer edge-point and leaderboard system is not reproduced.</p>
        </section>
      )}
    </main>
  );
}

