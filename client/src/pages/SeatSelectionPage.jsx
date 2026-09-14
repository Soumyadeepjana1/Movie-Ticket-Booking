import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPost, createWebSocket } from '../hooks/useApi.js';

export default function SeatSelectionPage() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const [showData, setShowData] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [holding, setHolding] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch initial data
  useEffect(() => {
    apiGet(`/shows/${showId}/seats`)
      .then(data => {
        setShowData(data.show);
        setSeats(data.seats);
      })
      .catch(err => showToast(err.message))
      .finally(() => setLoading(false));
  }, [showId]);

  // WebSocket for real-time seat updates
  useEffect(() => {
    const cleanup = createWebSocket(showId, (data) => {
      if (data.type === 'seat_update') {
        setSeats(data.seats);
      }
    });
    return cleanup;
  }, [showId]);

  const handleSeatClick = (seat) => {
    if (seat.status === 'BOOKED' || seat.status === 'HELD' || seat.status === 'PAYMENT_PENDING') {
      if (seat.status === 'BOOKED') {
        showToast('This seat is already booked.');
      } else {
        showToast('This seat is temporarily held by another user.');
      }
      return;
    }

    setSelectedSeats(prev => {
      const exists = prev.find(s => s.seat_number === seat.seat_number);
      if (exists) {
        return prev.filter(s => s.seat_number !== seat.seat_number);
      }
      if (prev.length >= 6) {
        showToast('Maximum 6 seats per booking.');
        return prev;
      }
      return [...prev, seat];
    });
  };

  const handleProceedToPayment = async () => {
    if (selectedSeats.length === 0) {
      showToast('Please select at least one seat.');
      return;
    }

    setHolding(true);

    try {
      // Hold the first selected seat (single seat booking for simplicity)
      const seat = selectedSeats[0];
      const result = await apiPost('/booking/hold', {
        showId: Number(showId),
        seatNumber: seat.seat_number,
      });

      navigate(`/payment/${result.bookingId}`, {
        state: {
          bookingCode: result.bookingCode,
          seatNumber: result.seatNumber,
          expiry: result.expiry,
          show: result.show,
        },
      });
    } catch (err) {
      showToast(err.message);
      // Refresh seats
      const data = await apiGet(`/shows/${showId}/seats`);
      setSeats(data.seats);
    } finally {
      setHolding(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!showData) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎬</div>
        <p>Show not found</p>
        <Link to="/" className="btn btn-outline" style={{ width: 'auto', marginTop: 16 }}>Back to Movies</Link>
      </div>
    );
  }

  // Group seats by row
  const rows = {};
  for (const seat of seats) {
    if (!rows[seat.row_label]) rows[seat.row_label] = [];
    rows[seat.row_label].push(seat);
  }

  const selectedSeatObj = selectedSeats[0];
  const totalPrice = selectedSeats.length * showData.price;

  return (
    <div>
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="seat-page-layout">
        {/* Seat Layout Panel */}
        <div className="seat-selection-panel">
          {/* Show Info */}
          <div className="show-info-bar">
            <div className="show-info-item">
              <span className="show-info-label">Movie</span>
              <span className="show-info-value">{showData.movie_title}</span>
            </div>
            <div className="show-info-item">
              <span className="show-info-label">Theatre</span>
              <span className="show-info-value">{showData.theatre}</span>
            </div>
            <div className="show-info-item">
              <span className="show-info-label">Date</span>
              <span className="show-info-value">
                {new Date(showData.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div className="show-info-item">
              <span className="show-info-label">Time</span>
              <span className="show-info-value">{showData.time}</span>
            </div>
            <div className="show-info-item">
              <span className="show-info-label">Screen</span>
              <span className="show-info-value">{showData.screen}</span>
            </div>
            {showData.format && (
              <div className="show-info-item">
                <span className="show-info-label">Format</span>
                <span className="show-info-value" style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--accent)',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  {showData.format}
                </span>
              </div>
            )}
          </div>

          {/* Screen */}
          <div className="screen-container">
            <div className="screen" />
          </div>

          {/* Seat Grid */}
          <div className="seat-grid">
            {Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)).map(([rowLabel, rowSeats]) => (
              <div key={rowLabel} className="seat-row">
                <span className="row-label">{rowLabel}</span>
                {rowSeats.sort((a, b) => a.seat_index - b.seat_index).map(seat => {
                  const isSelected = selectedSeats.some(s => s.seat_number === seat.seat_number);
                  let statusClass = seat.status.toLowerCase();
                  if (isSelected && seat.status === 'AVAILABLE') statusClass = 'selected';

                  return (
                    <button
                      key={seat.seat_number}
                      className={`seat ${statusClass}`}
                      onClick={() => handleSeatClick(seat)}
                      title={`${seat.seat_number} - ${statusClass}`}
                      disabled={holding}
                    />
                  );
                })}
                <span className="row-label">{rowLabel}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="seat-legend">
            <div className="legend-item">
              <div className="legend-dot available" />
              <span>Available</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot selected" />
              <span>Selected</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot held" />
              <span>Temporarily Held</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot booked" />
              <span>Sold</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="booking-sidebar">
          <div className="booking-summary">
            <div className="summary-title">Booking Summary</div>

            <div className="summary-detail">
              <span className="summary-label">Movie</span>
              <span className="summary-value">{showData.movie_title}</span>
            </div>
            <div className="summary-detail">
              <span className="summary-label">Theatre</span>
              <span className="summary-value">{showData.theatre}</span>
            </div>
            <div className="summary-detail">
              <span className="summary-label">Date</span>
              <span className="summary-value">
                {new Date(showData.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div className="summary-detail">
              <span className="summary-label">Time</span>
              <span className="summary-value">{showData.time}</span>
            </div>
            <div className="summary-detail">
              <span className="summary-label">Screen</span>
              <span className="summary-value">{showData.screen}</span>
            </div>
            <div className="summary-detail">
              <span className="summary-label">Price</span>
              <span className="summary-value">₹{showData.price}</span>
            </div>

            {/* Selected Seats */}
            <div style={{ margin: '16px 0 8px' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                Selected Seats ({selectedSeats.length})
              </span>
              <div className="selected-seats-list">
                {selectedSeats.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Click on seats to select</span>
                ) : (
                  selectedSeats.map(s => (
                    <span key={s.seat_number} className="seat-badge">{s.seat_number}</span>
                  ))
                )}
              </div>
            </div>

            <div className="total-row">
              <span>Total</span>
              <span>₹{totalPrice}</span>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleProceedToPayment}
              disabled={selectedSeats.length === 0 || holding}
              style={{ marginTop: 16 }}
            >
              {holding ? (
                <>
                  <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Holding Seat...
                </>
              ) : (
                `Proceed to Payment (${selectedSeats.length} seat${selectedSeats.length !== 1 ? 's' : ''})`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
