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
    const totalValue = portfolio.reduce((acc, stock) => acc + stock.quantity * stock.price, 0);
    try {
      await axios.post('http://127.0.0.1:5000/update_portfolio', {
        username: 'testuser',
        portfolio_value: totalValue
      });
    } catch (error) {
      console.error('Failed to update portfolio:', error);
    }
  };

  return (
    <div className="container">
      <h1>Dashboard</h1>
      
      <div className="section">
        <input
          type="text"
          placeholder="Stock Symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <button onClick={fetchStock}>Get Price</button>
        {price !== null && <p>Price: ${price.toFixed(2)}</p>}
      </div>

      <div className="section">
        <input
          type="number"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <button onClick={handleBuy}>Buy</button>
      </div>

      <div className="section">
        <h2>Portfolio</h2>
        <ul>
          {portfolio.map((stock, index) => (
            <li key={index}>
              {stock.quantity} shares of {stock.symbol} at ${stock.price.toFixed(2)}
              <button onClick={() => handleSell(index)}>Sell</button>
            </li>
          ))}
        </ul>
      </div>

      <Leaderboard />
    </div>
  );
}
