import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../hooks/useApi.js';

const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad'];

export default function HomePage() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState('Mumbai');
  const [selectedLanguage, setSelectedLanguage] = useState('All');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  useEffect(() => {
    apiGet('/movies')
      .then(setMovies)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Get unique languages from movies
  const languages = ['All', ...new Set(movies.map(m => m.language || 'English'))];

  // Filter movies by language
  const filteredMovies = selectedLanguage === 'All'
    ? movies
    : movies.filter(m => m.language === selectedLanguage);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      {/* Hero Banner */}
      <div className="hero-banner">
        <div className="hero-content">
          <h1 className="hero-title">Welcome to CineBook</h1>
          <p className="hero-subtitle">Book your favourite movie tickets online</p>
          <div className="hero-tags">
            <span className="hero-tag">🎬 Latest Movies</span>
            <span className="hero-tag">🎭 Multiple Languages</span>
            <span className="hero-tag">💺 Easy Seat Selection</span>
          </div>
        </div>
      </div>

      {/* City Selector */}
      <div style={{ marginBottom: 24, position: 'relative' }}>
        <div
          className="city-selector"
          onClick={() => setShowCityDropdown(!showCityDropdown)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {selectedCity}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {showCityDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            minWidth: 200,
          }}>
            {cities.map(city => (
              <div
                key={city}
                onClick={() => {
                  setSelectedCity(city);
                  setShowCityDropdown(false);
                }}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: selectedCity === city ? 600 : 400,
                  color: selectedCity === city ? 'var(--accent)' : 'var(--text-primary)',
                  background: selectedCity === city ? 'rgba(220, 53, 69, 0.05)' : 'transparent',
                }}
              >
                {city}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Language Filter */}
      <div className="filter-bar">
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginRight: 8 }}>
          Languages:
        </span>
        {languages.map(lang => (
          <button
            key={lang}
            className={`filter-chip ${selectedLanguage === lang ? 'active' : ''}`}
            onClick={() => setSelectedLanguage(lang)}
          >
            {lang}
          </button>
        ))}
      </div>

      {/* Recommended Movies */}
      <div className="section-header">
        <div>
          <h2 className="section-title">Recommended Movies</h2>
          <p className="section-subtitle">Curated picks for you in {selectedCity}</p>
        </div>
      </div>

      <div className="movie-grid">
        {filteredMovies.map((movie) => (
          <Link to={`/movie/${movie.id}`} key={movie.id}>
            <div className="movie-card">
              <div className="movie-poster">
                <img
                  src={movie.poster}
                  alt={movie.title}
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.style.background = 'linear-gradient(135deg, #1a2035, #111827)';
                  }}
                />
                <span className="movie-rating-badge">{movie.rating}</span>
              </div>
              <div className="movie-info">
                <div className="movie-title">{movie.title}</div>
                <div className="movie-meta">
                  <span className="movie-meta-badge">{movie.genre}</span>
                  <span>{movie.duration}m</span>
                  <span>{movie.language}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredMovies.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎬</div>
          <p>No movies found for {selectedLanguage} language</p>
        </div>
      )}
    </div>
  );
}
