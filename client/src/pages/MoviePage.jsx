import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet } from '../hooks/useApi.js';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const formatColors = {
  'IMAX': { bg: '#1A237E', color: '#FFFFFF' },
  '4DX': { bg: '#E65100', color: '#FFFFFF' },
  'Dolby Atmos': { bg: '#1B5E20', color: '#FFFFFF' },
  '2D': { bg: '#424242', color: '#FFFFFF' },
};

export default function MoviePage() {
  const { movieId } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet(`/movies/${movieId}`),
      apiGet(`/movies/${movieId}/shows`),
    ])
      .then(([m, s]) => {
        setMovie(m);
        setShows(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [movieId]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎬</div>
        <p>Movie not found</p>
        <Link to="/" className="btn btn-outline" style={{ width: 'auto', marginTop: 16 }}>Back to Movies</Link>
      </div>
    );
  }

  // Group shows by theatre
  const theatreGroups = {};
  for (const show of shows) {
    if (!theatreGroups[show.theatre]) {
      theatreGroups[show.theatre] = {};
    }
    if (!theatreGroups[show.theatre][show.date]) {
      theatreGroups[show.theatre][show.date] = [];
    }
    theatreGroups[show.theatre][show.date].push(show);
  }

  // Unique dates across all theatres
  const allDates = [...new Set(shows.map(s => s.date))].sort();

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/')}>
        ← Back to Movies
      </button>

      {/* Movie Hero with Backdrop */}
      <div className="movie-hero">
        <div
          className="movie-hero-bg"
          style={{ backgroundImage: `url(${movie.backdrop || movie.poster})` }}
        />
        <div className="movie-hero-overlay" />
        <div className="movie-hero-content">
          <div className="movie-hero-poster">
            <img
              src={movie.poster}
              alt={movie.title}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
          <div className="movie-hero-info">
            <h1 className="movie-hero-title">{movie.title}</h1>
            <div className="movie-hero-meta">
              <span>{movie.rating}</span>
              <span>{movie.genre}</span>
              <span>{movie.duration} min</span>
              <span>{movie.language}</span>
              {movie.release_year && <span>{movie.release_year}</span>}
            </div>
            <p className="movie-hero-description">{movie.description}</p>
          </div>
        </div>
      </div>

      {/* Shows */}
      <div className="section-header">
        <div>
          <h2 className="section-title">Select Showtime</h2>
          <p className="section-subtitle">
            {allDates.length > 0
              ? `Shows available on ${allDates.map(d => formatDate(d)).join(', ')}`
              : 'No shows available'}
          </p>
        </div>
      </div>

      {Object.keys(theatreGroups).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎟️</div>
          <p>No shows available for this movie right now.</p>
        </div>
      ) : (
        Object.entries(theatreGroups).map(([theatre, dateGroups]) => (
          <div key={theatre} className="theatre-group">
            <div className="theatre-name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" />
                <rect x="3" y="6" width="12" height="12" rx="2" />
              </svg>
              {theatre}
            </div>

            {Object.entries(dateGroups).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateShows]) => (
              <div key={date} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}>
                  {formatFullDate(date)}
                </div>
                <div className="show-times">
                  {dateShows.map(show => {
                    const formatStyle = formatColors[show.format] || formatColors['2D'];
                    return (
                      <button
                        key={show.id}
                        className="time-chip"
                        onClick={() => navigate(`/show/${show.id}/seats`)}
                      >
                        <span>{show.time}</span>
                        <span className="screen-label">Screen {show.screen}</span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: formatStyle.bg,
                          color: formatStyle.color,
                          marginTop: 4,
                        }}>
                          {show.format}
                        </span>
                        <span className="screen-label">₹{show.price}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
