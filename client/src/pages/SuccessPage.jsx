import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet } from '../hooks/useApi.js';

export default function SuccessPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet(`/booking/id/${bookingId}`)
      .then(data => {
        if (data.status !== 'BOOKED') {
          navigate('/');
          return;
        }
        setBooking(data);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [bookingId, navigate]);

  const handleDownloadReceipt = () => {
    if (!booking) return;
    window.open(`/api/booking/${booking.booking_code}/receipt`, '_blank');
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <p>{error || 'Booking not found'}</p>
        <Link to="/" className="btn btn-outline" style={{ width: 'auto', marginTop: 16 }}>Back to Movies</Link>
      </div>
    );
  }

  return (
    <div className="success-page">
      <div className="success-card">
        {/* Success Icon */}
        <div className="success-icon">
          ✅
        </div>

        <h1 className="success-title">Transaction Completed Successfully!</h1>
        <p className="success-message">
          The seat is booked. Please show/provide the below code at the counter to pay and get your ticket.
        </p>

        {/* Booking Code */}
        <div className="booking-code-display">
          <div className="booking-code-label">Booking Code</div>
          <div className="booking-code">{booking.booking_code}</div>
        </div>

        {/* Booking Details */}
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
            <span className="payment-detail-value" style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 800 }}>
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
            <span className="payment-detail-value" style={{ color: 'var(--success)' }}>₹{booking.price}</span>
          </div>
          <div className="payment-detail-row">
            <span className="payment-detail-label">Status</span>
            <span className="payment-detail-value" style={{ color: 'var(--success)' }}>
              ✓ BOOKED
            </span>
          </div>
        </div>

        {/* Receipt Actions */}
        <div className="receipt-actions">
          <button className="btn btn-primary" onClick={handleDownloadReceipt}>
            📄 Download PDF Receipt
          </button>
          <Link to="/" className="btn btn-outline">
            🎬 Browse More Movies
          </Link>
        </div>
      </div>
    </div>
  );
}
