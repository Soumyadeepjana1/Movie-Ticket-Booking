import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import MoviePage from './pages/MoviePage.jsx';
import SeatSelectionPage from './pages/SeatSelectionPage.jsx';
import PaymentPage from './pages/PaymentPage.jsx';
import SuccessPage from './pages/SuccessPage.jsx';
import BookingLookupPage from './pages/BookingLookupPage.jsx';

function Navbar() {
  const location = useLocation();
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="3" />
            <path d="M8 2v20M16 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5" />
          </svg>
          CineBook
        </Link>
        <div className="navbar-links">
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
            Movies
          </Link>
          <Link to="/booking-lookup" className={`nav-link ${location.pathname === '/booking-lookup' ? 'active' : ''}`}>
            My Bookings
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/movie/:movieId" element={<MoviePage />} />
            <Route path="/show/:showId/seats" element={<SeatSelectionPage />} />
            <Route path="/payment/:bookingId" element={<PaymentPage />} />
            <Route path="/success/:bookingId" element={<SuccessPage />} />
            <Route path="/booking-lookup" element={<BookingLookupPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
