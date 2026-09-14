import React, { useState } from 'react';
import { apiGet } from '../hooks/useApi.js';

export default function BookingLookupPage() {
  const [code, setCode] = useState('');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError('');
    setBooking(null);

    try {
      const data = await apiGet(`/booking/${code.trim().toUpperCase()}`);
      setBooking(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 className="page-title">My Bookings</h1>
      <p className="page-subtitle">Enter your booking code to check the status</p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Enter booking code (e.g., MOV-7X92K4)"
          className="search-input"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !code.trim()}
          style={{ width: 'auto', padding: '14px 28px' }}
        >
          {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Search'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      {booking && (
        <div className="success-card" style={{ textAlign: 'left' }}>
          <div className="booking-code-display" style={{ textAlign: 'center' }}>
            <div className="booking-code-label">Booking Code</div>
            <div className="booking-code">{booking.booking_code}</div>
          </div>

          <div className="booking-details-grid">
            <div className="payment-detail-row">
              <span className="payment-detail-label">Movie</span>
              <span className="payment-detail-value">{booking.movie_title}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Theatre</span>
              <span className="payment-detail-value">{booking.theatre}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Screen</span>
              <span className="payment-detail-value">Screen {booking.screen}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Date</span>
              <span className="payment-detail-value">
                {new Date(booking.date + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                })}
              </span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Time</span>
              <span className="payment-detail-value">{booking.time}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Seat</span>
              <span className="payment-detail-value" style={{ color: 'var(--accent)', fontWeight: 800 }}>
                {booking.seat_number}
              </span>
            </div>
            {booking.show_format && (
              <div className="payment-detail-row">
                <span className="payment-detail-label">Format</span>
                <span className="payment-detail-value" style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--accent)',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  {booking.show_format}
                </span>
              </div>
            )}
            <div className="payment-detail-row">
              <span className="payment-detail-label">Amount</span>
              <span className="payment-detail-value">₹{booking.price}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Status</span>
              <span className="payment-detail-value" style={{
                color: booking.status === 'BOOKED' ? 'var(--success)' :
                       booking.status === 'CANCELLED' || booking.status === 'EXPIRED' ? 'var(--danger)' :
                       '#B8860B',
                fontWeight: 700,
              }}>
                {booking.status === 'BOOKED' ? '✓ ' : ''}
                {booking.status}
              </span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Booked On</span>
              <span className="payment-detail-value">
                {new Date(booking.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          {booking.status === 'BOOKED' && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <a
                href={`/api/booking/${booking.booking_code}/receipt`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ width: 'auto', display: 'inline-flex' }}
              >
                📄 Download Receipt
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
