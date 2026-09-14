import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiPost, apiGet } from '../hooks/useApi.js';

export default function PaymentPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [timeLeft, setTimeLeft] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showData, setShowData] = useState(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const expiryRef = useRef(null);

  // Get booking data from navigation state or fetch it
  useEffect(() => {
    if (location.state) {
      const { expiry, show } = location.state;
      expiryRef.current = new Date(expiry).getTime();
      startTimeRef.current = Date.now();
      setShowData(show);
    } else {
      // Fetch booking details
      apiGet(`/booking/id/${bookingId}`)
        .then(data => {
          if (data.status === 'BOOKED') {
            navigate(`/success/${bookingId}`);
            return;
          }
          if (data.status === 'EXPIRED' || data.status === 'CANCELLED') {
            setError('Transaction got cancelled. Try again.');
            setTimeout(() => navigate(-1), 3000);
            return;
          }
          expiryRef.current = new Date(data.transaction_expiry).getTime();
          startTimeRef.current = Date.now();
          setShowData({
            movie_title: data.movie_title,
            movie_poster: data.movie_poster,
            theatre: data.theatre,
            screen: data.screen,
            date: data.date,
            time: data.time,
            price: data.price,
            format: data.show_format,
          });
        })
        .catch(err => {
          setError(err.message);
          setTimeout(() => navigate(-1), 3000);
        });
    }
  }, [bookingId, location.state, navigate]);

  // Countdown timer
  useEffect(() => {
    if (!expiryRef.current) return;

    function updateTimer() {
      const now = Date.now();
      const diff = expiryRef.current - now;

      if (diff <= 0) {
        setTimeLeft(0);
        clearInterval(timerRef.current);
        setError('Transaction expired. Please select your seat again.');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setTimeLeft(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => clearInterval(timerRef.current);
  }, [expiryRef.current, navigate]);

  const handlePayAtCounter = async () => {
    setProcessing(true);
    setError('');

    try {
      const result = await apiPost('/booking/confirm', {
        bookingId: Number(bookingId),
        showId: showData?.showId || location.state?.show?.id,
      });

      clearInterval(timerRef.current);
      navigate(`/success/${bookingId}`, { state: result });
    } catch (err) {
      setError(err.message);

      if (err.message.includes('expired')) {
        setTimeout(() => navigate('/'), 3000);
      } else if (err.message.includes('already booked')) {
        setTimeout(() => navigate('/'), 3000);
      } else {
        // Refresh and go back to seat selection
        setTimeout(() => navigate(-1), 2000);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    try {
      await apiPost('/booking/cancel', {
        bookingId: Number(bookingId),
        showId: location.state?.show?.id || showData?.showId,
      });
    } catch (e) {
      // ignore
    }
    navigate('/');
  };

  const getTimerClass = () => {
    if (!timeLeft) return '';
    const [min] = timeLeft.split(':').map(Number);
    if (min <= 1) return 'danger';
    if (min <= 3) return 'warning';
    return '';
  };

  if (timeLeft === null && !error) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="payment-page">
      {error && (
        <div className={`alert ${error.includes('expired') ? 'alert-warning' : 'alert-error'}`}>
          {error}
        </div>
      )}

      <div className="payment-card">
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Complete Your Booking</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          You have 15 minutes to complete this transaction
        </p>

        {/* Timer */}
        <div className={`timer ${getTimerClass()}`}>
          {timeLeft || '00:00'}
        </div>

        {timeLeft && (
          <p style={{
            color: getTimerClass() === 'danger' ? 'var(--danger)' : getTimerClass() === 'warning' ? '#B8860B' : 'var(--text-muted)',
            fontSize: 13,
            fontWeight: 600,
          }}>
            {getTimerClass() === 'danger' ? '⚠️ About to expire!' : 'Time remaining'}
          </p>
        )}

        {/* Payment Details */}
        {showData && (
          <div className="payment-details">
            <div className="payment-detail-row">
              <span className="payment-detail-label">Movie</span>
              <span className="payment-detail-value">{showData.movie_title}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Theatre</span>
              <span className="payment-detail-value">{showData.theatre}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Date</span>
              <span className="payment-detail-value">
                {new Date(showData.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Time</span>
              <span className="payment-detail-value">{showData.time}</span>
            </div>
            <div className="payment-detail-row">
              <span className="payment-detail-label">Screen</span>
              <span className="payment-detail-value">Screen {showData.screen}</span>
            </div>
            {showData.format && (
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
                  {showData.format}
                </span>
              </div>
            )}
            <div className="payment-detail-row" style={{ borderTop: '2px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <span className="payment-detail-label" style={{ fontWeight: 600 }}>Amount to Pay</span>
              <span className="payment-amount">₹{showData.price}</span>
            </div>
          </div>
        )}

        {/* Pay at Counter Button */}
        <button
          className="btn btn-primary"
          onClick={handlePayAtCounter}
          disabled={processing || timeLeft === '00:00'}
          style={{ fontSize: 16, padding: '16px 32px', marginTop: 8 }}
        >
          {processing ? (
            <>
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              Processing...
            </>
          ) : (
            '💳 Pay at Counter'
          )}
        </button>

        <button
          className="btn btn-outline"
          onClick={handleCancel}
          disabled={processing}
          style={{ marginTop: 12 }}
        >
          Cancel Transaction
        </button>

        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          Click "Pay at Counter" to confirm your booking. Pay at the counter when you arrive.
        </p>
      </div>
    </div>
  );
}
