import { useState, useEffect } from 'react';
import axios from 'axios';
import Leaderboard from '../components/Leaderboard';

export default function Dashboard() {
  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [quantity, setQuantity] = useState(0);

  const fetchStock = async () => {
    try {
      const res = await axios.get(`http://127.0.0.1:5000/stock/${symbol}`);
      setPrice(res.data.price);
    } catch (error) {
      setPrice('Stock not found');
    }
  };

  const handleBuy = () => {
    if (price && quantity > 0) {
      setPortfolio((prev) => [...prev, { symbol, quantity, price }]);
      updatePortfolioValue();
      setSymbol('');
      setQuantity(0);
      setPrice(null);
    }
  };

  const handleSell = (index) => {
    setPortfolio((prev) => prev.filter((_, i) => i !== index));
    updatePortfolioValue();
  };

  const updatePortfolioValue = async () => {
    const totalValue = portfolio.reduce(
      (acc, stock) => acc + stock.quantity * stock.price,
      0
    );
    try {
      await axios.post('http://127.0.0.1:5000/update_portfolio', {
        username: 'testuser',
        portfolio_value: totalValue,
      });
    } catch (error) {
      console.error('Failed to update portfolio:', error);
    }
  };

  return (
    <div className="wrap">
      <h1>📊 Stock Market Dashboard</h1>
      <p className="sub">
        Simulate trades, track your virtual portfolio, and compete with others.
      </p>

      {/* --- Stock Lookup --- */}
      <div className="card">
        <h2>🔎 Stock Lookup</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Enter Stock Symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
          <button onClick={fetchStock}>Get Price</button>
        </div>
        {price !== null && (
          <p className="note">
            {typeof price === 'number'
              ? `Current Price: $${price.toFixed(2)}`
              : price}
          </p>
        )}
      </div>

      {/* --- Trade Section --- */}
      <div className="card">
        <h2>💰 Trade Simulator</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <button onClick={handleBuy}>Buy</button>
        </div>
      </div>

      {/* --- Portfolio --- */}
      <div className="card">
        <h2>📁 Your Portfolio</h2>
        {portfolio.length === 0 ? (
          <p className="note">No holdings yet. Start trading to build your portfolio.</p>
        ) : (
          <ul>
            {portfolio.map((stock, index) => (
              <li key={index}>
                {stock.quantity} shares of <strong>{stock.symbol}</strong> @ $
                {stock.price.toFixed(2)}
                <button onClick={() => handleSell(index)} style={{ marginLeft: '10px' }}>
                  Sell
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Leaderboard --- */}
      <div className="card">
        <h2>🏆 Leaderboard</h2>
        <Leaderboard />
      </div>
    </div>
  );
}
