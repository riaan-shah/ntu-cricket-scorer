import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ConfirmHost, ToastHost } from './components/ui';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import Matches from './pages/Matches';
import MatchView from './pages/MatchView';
import NewMatch from './pages/NewMatch';
import PlayerProfile from './pages/PlayerProfile';
import Players from './pages/Players';
import Scoring from './pages/scoring/Scoring';
import Settings from './pages/Settings';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/match/new" element={<NewMatch />} />
          <Route path="/match/:id/score" element={<Scoring />} />
          <Route path="/match/:id" element={<MatchView />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:id" element={<PlayerProfile />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
      <ToastHost />
      <ConfirmHost />
    </HashRouter>
  );
}
