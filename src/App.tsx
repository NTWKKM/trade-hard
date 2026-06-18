import MarketChart from './components/MarketChart';
import { Activity } from 'lucide-react';

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <Activity size={24} color="#3B82F6" />
          <h1>TradeHard <span>Pro</span></h1>
        </div>
        <div className="header-actions">
          <span className="pair-badge">BTC/USDT</span>
          <div className="live-status">
            <span className="live-dot"></span> Live
          </div>
        </div>
      </header>
      
      <main className="main-content">
        <div className="chart-wrapper">
          <MarketChart />
        </div>
      </main>
    </div>
  );
}

export default App;
