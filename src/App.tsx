import { useMemo, useState } from 'react';
import FermiChallenge from './components/FermiChallenge';
import FruitMarket from './components/FruitMarket';
import MakeMeAMarket from './components/MakeMeAMarket';
import MathChallenge from './components/MathChallenge';
import NextCardBetting from './components/NextCardBetting';
import ProbabilityBetting from './components/ProbabilityBetting';
import { GAMES, type GameDefinition } from './data/games';
import { saveFermiSession, saveFruitSession, saveMarketMakingSession, saveCardSession, saveProbabilitySession, saveMathSession, loadStats, type LocalStats } from './lib/storage';
import type { FermiSessionSummary } from './lib/fermiChallenge';
import type { FruitSessionSummary } from './lib/fruitMarket';
import type { MarketMakingSessionSummary } from './lib/makeMeAMarket';
import type { CardSessionSummary } from './lib/nextCardBetting';
import type { ProbabilitySessionSummary } from './lib/probabilityBetting';
import type { MathSessionSummary } from './lib/mathChallenge';

type View = 'overview' | 'math' | 'fermi' | 'fruit' | 'market-making' | 'next-card' | 'probability';

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function gameNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function App() {
  const [view, setView] = useState<View>('overview');
  const [focusedGame, setFocusedGame] = useState<GameDefinition | null>(null);
  const [stats, setStats] = useState<LocalStats>(() => loadStats());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All modules');

  const visibleGames = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return GAMES.filter((game) => {
      const matchesSearch = lowered.length === 0
        || game.title.toLowerCase().includes(lowered)
        || game.category.toLowerCase().includes(lowered)
        || game.skills.some((skill) => skill.toLowerCase().includes(lowered));
      const matchesFilter = filter === 'All modules'
        || (filter === 'Ready to play' && game.playable)
        || (filter === 'In development' && !game.playable);
      return matchesSearch && matchesFilter;
    });
  }, [filter, search]);

  const startGame = (game: GameDefinition) => {
    setFocusedGame(game);
    if (game.slug === 'math-challenge') setView('math');
    else if (game.slug === 'fermi-questions') setView('fermi');
    else if (game.slug === 'fruit-market') setView('fruit');
    else if (game.slug === 'make-me-a-market') setView('market-making');
    else if (game.slug === 'next-card-betting') setView('next-card');
    else if (game.slug === 'probability-betting') setView('probability');
    else setView('overview');
  };

  const handleComplete = (summary: MathSessionSummary) => {
    setStats(saveMathSession(summary));
  };

  const handleFermiComplete = (summary: FermiSessionSummary) => {
    setStats(saveFermiSession(summary));
  };

  const handleFruitComplete = (summary: FruitSessionSummary) => {
    setStats(saveFruitSession(summary));
  };

  const handleMarketMakingComplete = (summary: MarketMakingSessionSummary) => {
    setStats(saveMarketMakingSession(summary));
  };

  const handleCardComplete = (summary: CardSessionSummary) => {
    setStats(saveCardSession(summary));
  };

  const handleProbabilityComplete = (summary: ProbabilitySessionSummary) => {
    setStats(saveProbabilitySession(summary));
  };

  const resetFocus = () => {
    setFocusedGame(null);
    setView('overview');
  };

  if (view === 'math') {
    return (
      <div className="app-frame">
        <MathChallenge onExit={resetFocus} onComplete={handleComplete} />
      </div>
    );
  }

  if (view === 'fermi') {
    return (
      <div className="app-frame">
        <FermiChallenge onExit={resetFocus} onComplete={handleFermiComplete} />
      </div>
    );
  }

  if (view === 'fruit') {
    return (
      <div className="app-frame">
        <FruitMarket onExit={resetFocus} onComplete={handleFruitComplete} />
      </div>
    );
  }

  if (view === 'market-making') {
    return (
      <div className="app-frame">
        <MakeMeAMarket onExit={resetFocus} onComplete={handleMarketMakingComplete} />
      </div>
    );
  }

  if (view === 'next-card') {
    return (
      <div className="app-frame">
        <NextCardBetting onExit={resetFocus} onComplete={handleCardComplete} />
      </div>
    );
  }

  if (view === 'probability') {
    return (
      <div className="app-frame">
        <ProbabilityBetting onExit={resetFocus} onComplete={handleProbabilityComplete} />
      </div>
    );
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={resetFocus} aria-label="Trading Games home">
          <span className="brand-mark"><span /></span>
          <span className="brand-copy"><strong>Trading Games</strong><small>PRACTICE WORKSPACE</small></span>
        </button>

        <div className="sidebar-section-label">WORKSPACE</div>
        <button className="nav-item nav-item-active" type="button" onClick={resetFocus}>
          <span className="nav-icon">⌂</span><span>Overview</span><span className="nav-indicator" />
        </button>
        <button className="nav-item" type="button" onClick={() => { setFocusedGame(null); setFilter('All modules'); document.getElementById('game-library')?.scrollIntoView({ behavior: 'smooth' }); }}>
          <span className="nav-icon">▦</span><span>Game library</span><span className="nav-count">09</span>
        </button>
        <div className="sidebar-section-label section-label-spaced">YOUR PROGRESS</div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-icon">↗</span>
          <div><strong>{formatInteger(stats.sessions)}</strong><span>Sessions played</span></div>
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-icon">◎</span>
          <div><strong>{stats.bestScore === null ? '—' : (stats.bestScore > 0 ? '+' : '') + stats.bestScore}</strong><span>Best math score</span></div>
        </div>
        <div className="sidebar-bottom">
          <div className="local-indicator"><span /> PROGRESS SAVED LOCALLY</div>
          <p>Built for focused reps, clean feedback, and repeatable progress.</p>
          <span className="sidebar-version">VERSION 0.1.0</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><span /></span><strong>Trading Games</strong></div>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{focusedGame ? focusedGame.title : 'Overview'}</strong></div>
          <div className="topbar-right"><span className="status-dot" /> LOCAL PRACTICE <span className="topbar-divider" /><span>NO ACCOUNT REQUIRED</span></div>
        </header>

        <div className="content-wrap">
          {focusedGame && !focusedGame.playable ? (
            <GameDetails game={focusedGame} onBack={resetFocus} />
          ) : (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> YOUR TRAINING FLOOR</div>
                  <h1>Practice with <span>intent.</span></h1>
                  <p>Build the reflexes behind clear pricing, disciplined risk, and fast decisions.</p>
                </div>
                <div className="date-chip"><span className="date-chip-icon">◷</span><span><strong>Solo mode</strong><small>Runs on this device</small></span></div>
              </section>

              <section className="overview-stats" aria-label="Practice statistics">
                <StatCard label="Sessions played" value={formatInteger(stats.sessions)} note="All-time on this device" icon="↗" />
                <StatCard label="Best net score" value={stats.bestScore === null ? '—' : (stats.bestScore > 0 ? '+' : '') + stats.bestScore} note="Math Challenge" icon="⌁" />
                <StatCard label="Best Fermi calibration" value={stats.fermiBestMedianFactor === null ? '—' : '× ' + formatInteger(Math.round(stats.fermiBestMedianFactor * 100) / 100)} note={stats.fermiSessions + ' drills · lower is better'} icon="≈" />
              <StatCard label="Best Fruit score" value={stats.fruitBestScore === null ? '—' : (stats.fruitBestScore > 0 ? '+' : '') + formatInteger(Math.round(stats.fruitBestScore * 100) / 100)} note={stats.fruitSessions + ' markets · adjusted P&L'} icon="↔" />
              <StatCard label="Best market P&L" value={stats.marketMakingBestPnl === null ? '—' : (stats.marketMakingBestPnl > 0 ? '+' : '') + formatInteger(Math.round(stats.marketMakingBestPnl * 100) / 100)} note={stats.marketMakingSessions + ' market sessions'} icon="⇄" />
              <StatCard label="Best card bankroll" value={stats.nextCardBestBankroll === null ? '—' : formatInteger(stats.nextCardBestBankroll)} note={stats.nextCardSessions + ' card sessions'} icon="♠" />
              <StatCard label="Best betting bankroll" value={stats.probabilityBestBankroll === null ? '—' : formatInteger(stats.probabilityBestBankroll)} note={stats.probabilitySessions + ' betting sessions'} icon="◈" />
              </section>

              <section className="featured-section">
                <div className="section-heading"><div><div className="eyebrow">QUICK START</div><h2>Pick up a rep</h2></div><span className="small-secondary">QUICK WARM-UP</span></div>
                <button className="featured-card" type="button" onClick={() => startGame(GAMES.find((game) => game.slug === 'math-challenge') as GameDefinition)}>
                  <div className="featured-content">
                    <div className="featured-topline"><span className="module-badge">MODULE 09</span><span className="ready-badge"><span /> READY TO PLAY</span></div>
                    <h3>Math Challenge</h3>
                    <p>Train mental arithmetic with a timed stream of integer, decimal, and fraction questions.</p>
                    <div className="featured-meta"><span>◷ 6 min standard</span><span>+1 / −1 scoring</span><span>Instant review</span></div>
                    <span className="featured-cta">Start practice <span aria-hidden="true">↗</span></span>
                  </div>
                  <div className="math-art" aria-hidden="true">
                    <span className="math-symbol symbol-one">+</span>
                    <span className="math-symbol symbol-two">×</span>
                    <span className="math-symbol symbol-three">%</span>
                    <span className="math-equation">17 × 24 <i>=</i> ?</span>
                    <span className="math-axis axis-one" /><span className="math-axis axis-two" />
                  </div>
                </button>
              </section>

              <section id="game-library" className="library-section">
                <div className="section-heading library-heading">
                  <div><div className="eyebrow">THE LIBRARY</div><h2>Practice modules <span className="count-pill">09</span></h2></div>
                  <div className="library-controls">
                    <label className="sr-only" htmlFor="game-search">Search games</label>
                    <div className="search-wrap"><span aria-hidden="true">⌕</span><input id="game-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search skills or games" /></div>
                    <label className="sr-only" htmlFor="game-filter">Filter modules</label>
                    <select id="game-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
                      <option>All modules</option><option>Ready to play</option><option>In development</option>
                    </select>
                  </div>
                </div>
                <div className="games-grid">
                  {visibleGames.map((game) => <GameCard key={game.slug} game={game} onOpen={() => startGame(game)} />)}
                </div>
                {visibleGames.length === 0 && <div className="empty-state"><strong>No modules found</strong><span>Try another search or filter.</span></div>}
              </section>

              <footer className="page-footer"><span>TRADING GAMES</span><span>Practice locally. Review honestly. Repeat.</span><button type="button" onClick={() => { setStats(loadStats()); }}>Refresh stats ↻</button></footer>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: string }) {
  return <div className="stat-card"><div className="stat-card-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></div>;
}

function GameCard({ game, onOpen }: { game: GameDefinition; onOpen: () => void }) {
  const ready = game.playable;
  return (
    <article className={'game-card accent-' + game.accent + (ready ? ' game-card-ready' : '')}>
      <div className="game-card-top"><span className="game-index">{gameNumber(GAMES.findIndex((item) => item.slug === game.slug))}</span><span className={'game-state' + (ready ? ' game-state-ready' : '')}>{ready ? 'READY' : 'IN DEVELOPMENT'}</span></div>
      <div className="game-card-icon" aria-hidden="true">{iconForCategory(game.category)}</div>
      <div className="game-category">{game.category}</div>
      <h3>{game.title}</h3>
      <p>{game.description}</p>
      <div className="game-card-meta"><span>{game.difficulty}</span><span>·</span><span>{game.duration}</span></div>
      <button className={ready ? 'card-action card-action-ready' : 'card-action'} type="button" onClick={onOpen}>{ready ? 'Start practice' : 'View module'} <span aria-hidden="true">{ready ? '↗' : '→'}</span></button>
    </article>
  );
}

function iconForCategory(category: string): string {
  const icons: Record<string, string> = {
    'Market making': '↔',
    'Estimation': '≈',
    'Probability': '◌',
    'Live markets': '⌁',
    'Arbitrage': '⇄',
    'Mental math': '∑'
  };
  return icons[category] ?? '◈';
}

function GameDetails({ game, onBack }: { game: GameDefinition; onBack: () => void }) {
  return (
    <section className="module-details">
      <button className="text-button" onClick={onBack} type="button"><span aria-hidden="true">←</span> Library</button>
      <div className="details-head">
        <div className="eyebrow">MODULE {gameNumber(GAMES.findIndex((item) => item.slug === game.slug))} <span className="eyebrow-separator">/</span> {game.category.toUpperCase()}</div>
        <h1>{game.title}</h1>
        <p>{game.description}</p>
        <div className="details-meta"><span>{game.difficulty}</span><span>{game.duration}</span><span>Single-player version</span></div>
      </div>
      <div className="details-layout">
        <div className="details-main">
          <div className="detail-card"><div className="eyebrow">HOW IT WORKS</div><h2>Rules at a glance</h2><ol>{game.rules.map((rule, index) => <li key={rule}><span>{gameNumber(index)}</span><p>{rule}</p></li>)}</ol></div>
          <div className="detail-card"><div className="eyebrow">SKILLS TRAINED</div><div className="skill-tags">{game.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
        </div>
        <aside className="details-side">
          <div className="module-status-card"><span className="status-large-icon">{iconForCategory(game.category)}</span><span className="game-state">IN DEVELOPMENT</span><h3>Practice module in progress</h3><p>This game remains visible in the library while its simulation and settlement rules are implemented and tested.</p><button className="secondary-button full-width-button" onClick={onBack} type="button">Back to library</button></div>
          <div className="details-note"><strong>Build standard</strong><p>Randomized scenarios, explicit scoring, seeded tests, and reviewable decisions before release.</p></div>
        </aside>
      </div>
    </section>
  );
}

export default App;