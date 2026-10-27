import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  applyPositionTrade,
  calculateTrueGameValue,
  cardRankLabel,
  cardSuitColor,
  cardSuitSymbol,
  cardValue,
  chooseFirstBotResponder,
  dealMarketOfCards,
  estimateGameValue,
  generateBotProfiles,
  INITIAL_TRADING_POSITION,
  makeBotQuote,
  settlePosition,
  validateCardQuote,
  type AceMode,
  type CardQuote,
  type PlayingCard,
  type TradingPosition
} from '../lib/marketOfCards';
import { createSessionSeed, SeededRandom } from '../lib/rng';

export interface MarketCardsSessionSummary {
  players: number;
  aceMode: AceMode;
  rounds: number;
  trades: number;
  finalValue: number;
  finalPnl: number;
  finalPosition: number;
  durationSeconds: number;
  playedAt: string;
}

interface MarketOfCardsProps {
  onExit: () => void;
  onComplete: (summary: MarketCardsSessionSummary) => void;
}

type Phase = 'setup' | 'ready' | 'quote' | 'bot-quote' | 'reveal' | 'finished';

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function signed(value: number): string {
  return (value > 0 ? '+' : '') + money(value);
}

function getSpread(fairValue: number): number {
  return Math.max(10, Math.abs(fairValue) * 0.05);
}

function CardFace({ card, aceMode }: { card: PlayingCard; aceMode: AceMode }) {
  const color = cardSuitColor(card.suit);
  return (
    <div className={'moc-card-face moc-card-' + color} aria-label={cardRankLabel(card.rank) + ' of ' + card.suit}>
      <span>{cardRankLabel(card.rank)}</span>
      <strong>{cardSuitSymbol(card.suit)}</strong>
      <small>{money(cardValue(card, aceMode))}</small>
    </div>
  );
}

function CardBack() {
  return <div className="moc-card-back" aria-label="Hidden card"><span>?</span></div>;
}

function initialQuote(fairValue: number): CardQuote {
  const spread = getSpread(fairValue);
  return { bid: Math.round((fairValue - spread) * 100) / 100, ask: Math.round((fairValue + spread) * 100) / 100 };
}

export default function MarketOfCards({ onExit, onComplete }: MarketOfCardsProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [playerCount, setPlayerCount] = useState(4);
  const [aceMode, setAceMode] = useState<AceMode>('high');
  const [deal, setDeal] = useState<ReturnType<typeof dealMarketOfCards> | null>(null);
  const [revealedCenters, setRevealedCenters] = useState<PlayingCard[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [bidInput, setBidInput] = useState('');
  const [askInput, setAskInput] = useState('');
  const [tradeMessage, setTradeMessage] = useState('');
  const [error, setError] = useState('');
  const [eventLog, setEventLog] = useState<string[]>([]);
  const startedAtRef = useRef(0);
  const completionSavedRef = useRef(false);
  const rngRef = useRef<SeededRandom>(new SeededRandom(createSessionSeed()));

  const userHand = deal?.hands[0] ?? [];
  const userPosition = positions[0] ?? INITIAL_TRADING_POSITION;
  const fairValue = deal
    ? estimateGameValue(userHand, revealedCenters, playerCount, aceMode)
    : 0;
  const botMakerIndex = deal ? (roundIndex % (playerCount - 1)) + 1 : 1;
  const botMakerHand = deal?.hands[botMakerIndex] ?? [];
  const botMakerPosition = positions[botMakerIndex] ?? INITIAL_TRADING_POSITION;
  const botMakerFair = deal
    ? estimateGameValue(botMakerHand, revealedCenters, playerCount, aceMode)
    : 0;
  const botMakerQuote = useMemo(() => makeBotQuote(
    botMakerFair,
    getSpread(botMakerFair),
    botMakerPosition.inventory
  ), [botMakerFair, botMakerPosition.inventory]);
  const trueValue = deal ? calculateTrueGameValue(deal.hands, deal.centerCards, aceMode) : 0;
  const finalPnl = settlePosition(userPosition, trueValue);

  const setDefaultQuote = (value: number) => {
    const quote = initialQuote(value);
    setBidInput(String(quote.bid));
    setAskInput(String(quote.ask));
  };

  const startSession = () => {
    rngRef.current = new SeededRandom(createSessionSeed());
    const nextDeal = dealMarketOfCards(rngRef.current, playerCount);
    setDeal(nextDeal);
    setRevealedCenters([]);
    setRoundIndex(0);
    setPositions(Array.from({ length: playerCount }, () => ({ ...INITIAL_TRADING_POSITION })));
    setEventLog([]);
    setTradeMessage('');
    setError('');
    completionSavedRef.current = false;
    startedAtRef.current = Date.now();
    setDefaultQuote(estimateGameValue(nextDeal.hands[0] ?? [], [], playerCount, aceMode));
    setPhase('ready');
  };

  const beginTrading = () => {
    if (!deal) return;
    setDefaultQuote(estimateGameValue(deal.hands[0] ?? [], revealedCenters, playerCount, aceMode));
    setError('');
    setPhase('quote');
  };

  const submitUserQuote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase !== 'quote' || !deal) return;
    const quote = { bid: Number(bidInput), ask: Number(askInput) };
    if (!bidInput.trim() || !askInput.trim() || !validateCardQuote(quote)) {
      setError('Enter finite prices with the bid strictly below the ask.');
      return;
    }
    const botFairs = deal.hands.slice(1).map((hand) =>
      estimateGameValue(hand, revealedCenters, playerCount, aceMode)
    );
    const profiles = generateBotProfiles(rngRef.current, botFairs);
    const response = chooseFirstBotResponder(quote, profiles);
    if (!response) {
      setTradeMessage('No bot crossed your market. Your quote stayed unfilled.');
      setEventLog((items) => ['Round ' + (roundIndex + 1) + ': no bot traded at your quote.', ...items].slice(0, 16));
    } else {
      const botIndex = response.botId;
      const tradePrice = response.side === 'buy' ? quote.ask : quote.bid;
      const userSide = response.side === 'buy' ? 'sell' : 'buy';
      const nextPositions = [...positions];
      const currentUser = nextPositions[0] ?? { ...INITIAL_TRADING_POSITION };
      const currentBot = nextPositions[botIndex] ?? { ...INITIAL_TRADING_POSITION };
      nextPositions[0] = applyPositionTrade(currentUser, userSide, tradePrice);
      nextPositions[botIndex] = applyPositionTrade(currentBot, response.side, tradePrice);
      setPositions(nextPositions);
      const verb = response.side === 'buy' ? 'bought from your ask' : 'sold to your bid';
      const message = 'Bot ' + (botIndex + 1) + ' ' + verb + ' at ' + money(tradePrice) + '.';
      setTradeMessage(message + ' One response won the race; other bots did not trade.');
      setEventLog((items) => ['Round ' + (roundIndex + 1) + ': ' + message, ...items].slice(0, 16));
    }
    setError('');
    setPhase('bot-quote');
  };

  const respondToBotQuote = (side: 'buy' | 'sell' | 'pass') => {
    if (phase !== 'bot-quote' || !deal) return;
    if (side === 'pass') {
      const message = 'You passed on Bot ' + (botMakerIndex + 1) + '’s market.';
      setTradeMessage(message);
      setEventLog((items) => ['Round ' + (roundIndex + 1) + ': ' + message, ...items].slice(0, 16));
    } else {
      const tradePrice = side === 'buy' ? botMakerQuote.ask : botMakerQuote.bid;
      const nextPositions = [...positions];
      const currentUser = nextPositions[0] ?? { ...INITIAL_TRADING_POSITION };
      const currentBot = nextPositions[botMakerIndex] ?? { ...INITIAL_TRADING_POSITION };
      nextPositions[0] = applyPositionTrade(currentUser, side, tradePrice);
      nextPositions[botMakerIndex] = applyPositionTrade(currentBot, side === 'buy' ? 'sell' : 'buy', tradePrice);
      setPositions(nextPositions);
      const message = 'You ' + (side === 'buy' ? 'bought at the ask' : 'sold at the bid') +
        ' against Bot ' + (botMakerIndex + 1) + ' at ' + money(tradePrice) + '.';
      setTradeMessage(message);
      setEventLog((items) => ['Round ' + (roundIndex + 1) + ': ' + message, ...items].slice(0, 16));
    }
    setPhase('reveal');
  };

  const revealNextCenter = () => {
    if (!deal || phase !== 'reveal') return;
    const nextRevealed = [...revealedCenters, deal.centerCards[roundIndex]!];
    setRevealedCenters(nextRevealed);
    if (roundIndex + 1 >= deal.centerCards.length) {
      setPhase('finished');
      return;
    }
    const nextIndex = roundIndex + 1;
    setRoundIndex(nextIndex);
    setDefaultQuote(estimateGameValue(userHand, nextRevealed, playerCount, aceMode));
    setTradeMessage('');
    setError('');
    setPhase('quote');
  };

  useEffect(() => {
    if (phase !== 'finished' || !deal || completionSavedRef.current) return;
    completionSavedRef.current = true;
    onComplete({
      players: playerCount,
      aceMode,
      rounds: MARKET_CARD_CENTER_COUNT,
      trades: userPosition.trades,
      finalValue: trueValue,
      finalPnl,
      finalPosition: userPosition.inventory,
      durationSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
      playedAt: new Date().toISOString()
    });
  }, [aceMode, deal, finalPnl, onComplete, phase, playerCount, trueValue, userPosition]);

  const leaderboard = useMemo(() => {
    if (!deal) return [];
    return positions.map((position, index) => ({
      name: index === 0 ? 'You' : 'Bot ' + (index + 1),
      position: position.inventory,
      trades: position.trades,
      pnl: settlePosition(position, trueValue)
    })).sort((left, right) => right.pnl - left.pnl);
  }, [deal, positions, trueValue]);

  return (
    <main className="mc-page">
      <header className="mc-header">
        <button className="mc-text-button" type="button" onClick={onExit}>← Library</button>
        <span className="mc-eyebrow">MARKET MAKING · PRIVATE INFORMATION</span>
        <h1>Market of Cards</h1>
        <p>Estimate the total value from your hand and revealed center cards. Quote a two-sided market, then decide whether a bot’s market is worth trading.</p>
      </header>

      {phase === 'setup' && (
        <section className="mc-panel mc-setup">
          <div className="mc-panel-kicker">GAME SETUP</div>
          <h2>Configure the table</h2>
          <div className="mc-settings-grid">
            <label>Players, including you
              <select value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))}>
                {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} players</option>)}
              </select>
            </label>
            <label>Ace valuation
              <select value={aceMode} onChange={(event) => setAceMode(event.target.value as AceMode)}>
                <option value="high">Ace highest: red +140, black −140</option>
                <option value="low">Ace lowest: all suits +10</option>
              </select>
            </label>
          </div>
          <div className="mc-rules-note">
            <strong>Rules used</strong>
            <p>Two private cards per player; three center cards; 2–10 are rank × 10; face cards and high aces use suit color. Final value is the sum of every in-play hand card and all three center cards.</p>
            <p>Practice assumptions where the public rules are silent: one unit per trade, three quote rounds aligned to the three center cards, and one bot quote for you to respond to per round.</p>
          </div>
          <button className="mc-button mc-primary" type="button" onClick={startSession}>Deal cards</button>
        </section>
      )}

      {phase === 'ready' && deal && (
        <section className="mc-panel">
          <div className="mc-panel-kicker">READY PHASE · REVIEW YOUR HAND</div>
          <div className="mc-card-row">
            {userHand.map((card) => <CardFace key={card.id} card={card} aceMode={aceMode} />)}
          </div>
          <div className="mc-ready-grid">
            <div><span className="mc-muted">Your hand value</span><strong>{signed(userHand.reduce((sum, card) => sum + cardValue(card, aceMode), 0))}</strong></div>
            <div><span className="mc-muted">Estimated final game value</span><strong>{signed(fairValue)}</strong></div>
            <div><span className="mc-muted">Private opponent cards</span><strong>{(playerCount - 1) * 2} hidden</strong></div>
          </div>
          <div className="mc-center-row">{deal.centerCards.map((card, index) => <CardBack key={index} />)}</div>
          <p className="mc-muted">Other players’ hands and all center cards are hidden. Your estimate is the expected sum of the cards in play, using the remaining unseen deck.</p>
          <button className="mc-button mc-primary" type="button" onClick={beginTrading}>Begin trading</button>
        </section>
      )}

      {['quote', 'bot-quote', 'reveal'].includes(phase) && deal && (
        <>
          <section className="mc-summary-strip">
            <div><span>ROUND</span><strong>{roundIndex + 1} / {MARKET_CARD_CENTER_COUNT}</strong></div>
            <div><span>YOUR FAIR VALUE</span><strong>{signed(fairValue)}</strong></div>
            <div><span>INVENTORY</span><strong>{signed(userPosition.inventory)}</strong></div>
            <div><span>TRADES</span><strong>{userPosition.trades}</strong></div>
          </section>
          <section className="mc-game-grid">
            <div className="mc-panel">
              <div className="mc-panel-kicker">YOUR PRIVATE HAND</div>
              <div className="mc-card-row">{userHand.map((card) => <CardFace key={card.id} card={card} aceMode={aceMode} />)}</div>
              <div className="mc-center-heading"><strong>Center cards</strong><span>{revealedCenters.length} revealed · {MARKET_CARD_CENTER_COUNT - revealedCenters.length} hidden</span></div>
              <div className="mc-center-row">
                {deal.centerCards.map((card, index) => index < revealedCenters.length
                  ? <CardFace key={card.id} card={card} aceMode={aceMode} />
                  : <CardBack key={index} />)}
              </div>
              <div className="mc-value-breakdown">
                <span>Your known cards <strong>{signed(userHand.reduce((sum, card) => sum + cardValue(card, aceMode), 0))}</strong></span>
                <span>Revealed center <strong>{signed(revealedCenters.reduce((sum, card) => sum + cardValue(card, aceMode), 0))}</strong></span>
                <span>Estimated hidden in-play cards <strong>{signed(fairValue - userHand.reduce((sum, card) => sum + cardValue(card, aceMode), 0) - revealedCenters.reduce((sum, card) => sum + cardValue(card, aceMode), 0))}</strong></span>
              </div>
            </div>

            <div className="mc-panel">
              {phase === 'quote' && (
                <>
                  <div className="mc-panel-kicker">MAKE A MARKET</div>
                  <h2>Set your bid and ask</h2>
                  <p className="mc-muted">Other bots value the same total using their own private hands. Only the quickest qualifying response trades.</p>
                  <form className="mc-quote-form" onSubmit={submitUserQuote}>
                    <label>Bid<input type="number" step="0.01" value={bidInput} onChange={(event) => setBidInput(event.target.value)} required /></label>
                    <label>Ask<input type="number" step="0.01" value={askInput} onChange={(event) => setAskInput(event.target.value)} required /></label>
                    {error && <p className="mc-error" role="alert">{error}</p>}
                    <button className="mc-button mc-primary" type="submit">Publish market</button>
                  </form>
                  <div className="mc-quote-preview"><span>Spread</span><strong>{money(Number(askInput) - Number(bidInput))}</strong><span>Midpoint</span><strong>{money((Number(askInput) + Number(bidInput)) / 2)}</strong></div>
                </>
              )}
              {phase === 'bot-quote' && (
                <>
                  <div className="mc-panel-kicker">RESPOND TO BOT {botMakerIndex + 1}</div>
                  <h2>Bot market</h2>
                  <p className="mc-muted">This bot uses its two private cards and the center cards already revealed. Choose one side or pass.</p>
                  <div className="mc-live-quote"><div><span>BID</span><strong>{money(botMakerQuote.bid)}</strong></div><div><span>ASK</span><strong>{money(botMakerQuote.ask)}</strong></div></div>
                  <div className="mc-action-row">
                    <button className="mc-button mc-buy" type="button" onClick={() => respondToBotQuote('buy')}>Buy at ask</button>
                    <button className="mc-button mc-sell" type="button" onClick={() => respondToBotQuote('sell')}>Sell at bid</button>
                    <button className="mc-button" type="button" onClick={() => respondToBotQuote('pass')}>Pass</button>
                  </div>
                </>
              )}
              {phase === 'reveal' && (
                <>
                  <div className="mc-panel-kicker">ROUND SETTLEMENT</div>
                  <h2>Center card revealed</h2>
                  <div className="mc-card-row mc-reveal-card"><CardFace card={deal.centerCards[roundIndex]!} aceMode={aceMode} /></div>
                  <p className="mc-reveal-value">Value added to the known table: <strong>{signed(cardValue(deal.centerCards[roundIndex]!, aceMode))}</strong></p>
                  <p className="mc-muted">{tradeMessage}</p>
                  <button className="mc-button mc-primary" type="button" onClick={revealNextCenter}>
                    {roundIndex + 1 === MARKET_CARD_CENTER_COUNT ? 'Settle game' : 'Reveal and continue'}
                  </button>
                </>
              )}
              {tradeMessage && phase !== 'reveal' && <p className="mc-feedback">{tradeMessage}</p>}
            </div>
          </section>
        </>
      )}

      {phase === 'finished' && deal && (
        <section className="mc-panel mc-results">
          <div className="mc-panel-kicker">FINAL SCORING</div>
          <h2>Settled against the total in-play card value</h2>
          <div className="mc-result-grid">
            <div><span>Final game value</span><strong>{signed(trueValue)}</strong></div>
            <div><span>Your final P&amp;L</span><strong className={finalPnl >= 0 ? 'mc-positive' : 'mc-negative'}>{signed(finalPnl)}</strong></div>
            <div><span>Final position</span><strong>{signed(userPosition.inventory)}</strong></div>
            <div><span>Trades</span><strong>{userPosition.trades}</strong></div>
          </div>
          <h3>Table standings · positions settled at final game value</h3>
          <div className="mc-table-wrap"><table className="mc-table"><thead><tr><th>Player</th><th>Trades</th><th>Inventory</th><th>Final P&amp;L</th></tr></thead>
            <tbody>{leaderboard.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.trades}</td><td>{signed(row.position)}</td><td className={row.pnl >= 0 ? 'mc-positive' : 'mc-negative'}>{signed(row.pnl)}</td></tr>)}</tbody>
          </table></div>
          <h3>Trade and reveal log</h3>
          {eventLog.length ? <ol className="mc-event-log">{eventLog.map((entry, index) => <li key={index}>{entry}</li>)}</ol> : <p className="mc-muted">No fills occurred during this session.</p>}
          <div className="mc-action-row"><button className="mc-button mc-primary" type="button" onClick={() => setPhase('setup')}>Play again</button><button className="mc-button" type="button" onClick={onExit}>Back to library</button></div>
        </section>
      )}
    </main>
  );
}

