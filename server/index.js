import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import db from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from client build
app.use(express.static(join(__dirname, '../client/dist')));

// ============ WebSocket Setup ============
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients by show_id
const showSubscribers = new Map(); // show_id -> Set<ws>

wss.on('connection', (ws) => {
  ws.showId = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'subscribe' && msg.showId) {
        // Unsubscribe from previous
        if (ws.showId && showSubscribers.has(ws.showId)) {
          showSubscribers.get(ws.showId).delete(ws);
        }
        ws.showId = msg.showId;
        if (!showSubscribers.has(msg.showId)) {
          showSubscribers.set(msg.showId, new Set());
        }
        showSubscribers.get(msg.showId).add(ws);
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('close', () => {
    if (ws.showId && showSubscribers.has(ws.showId)) {
      showSubscribers.get(ws.showId).delete(ws);
    }
  });
});

// Heartbeat to clean up dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function broadcastSeatUpdate(showId, seatData) {
  const subscribers = showSubscribers.get(showId);
  if (!subscribers) return;
  const message = JSON.stringify({ type: 'seat_update', showId, seats: seatData });
  subscribers.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  });
}

function broadcastTransactionUpdate(showId, data) {
  const subscribers = showSubscribers.get(showId);
  if (!subscribers) return;
  const message = JSON.stringify({ type: 'transaction_update', showId, ...data });
  subscribers.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  });
}

// ============ API Routes ============

// Get all movies
app.get('/api/movies', (req, res) => {
  try {
    const movies = db.prepare('SELECT * FROM movies').all();
    res.json(movies);
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

// Get a single movie
app.get('/api/movies/:id', (req, res) => {
  try {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json(movie);
  } catch (err) {
    console.error('Error fetching movie:', err);
    res.status(500).json({ error: 'Failed to fetch movie' });
  }
});

// Get shows for a movie
app.get('/api/movies/:id/shows', (req, res) => {
  try {
    const shows = db.prepare(`
      SELECT s.*, m.title as movie_title, m.poster as movie_poster, m.backdrop as movie_backdrop
      FROM shows s
      JOIN movies m ON s.movie_id = m.id
      WHERE s.movie_id = ?
      ORDER BY s.date, s.time
    `).all(req.params.id);
    res.json(shows);
  } catch (err) {
    console.error('Error fetching shows:', err);
    res.status(500).json({ error: 'Failed to fetch shows' });
  }
});

// Get seats for a show
app.get('/api/shows/:id/seats', (req, res) => {
  try {
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });

    const seats = db.prepare(`
      SELECT seat_number, row_label, seat_index, status
      FROM seats
      WHERE show_id = ?
      ORDER BY row_label, seat_index
    `).all(req.params.id);

    // Also check for active held seats that may have expired
    cleanupExpiredHolds(req.params.id);

    // Re-fetch after cleanup
    const cleanedSeats = db.prepare(`
      SELECT seat_number, row_label, seat_index, status
      FROM seats
      WHERE show_id = ?
      ORDER BY row_label, seat_index
    `).all(req.params.id);

    res.json({ show, seats: cleanedSeats });
  } catch (err) {
    console.error('Error fetching seats:', err);
    res.status(500).json({ error: 'Failed to fetch seats' });
  }
});

// ============ Booking Flow ============

// Step 1: Select/Hold a seat (creates a booking in HELD status with 15-min window)
app.post('/api/booking/hold', (req, res) => {
  try {
    const { showId, seatNumber } = req.body;

    if (!showId || !seatNumber) {
      return res.status(400).json({ error: 'showId and seatNumber are required' });
    }

    const result = db.transaction(() => {
      // Clean up expired holds first
      cleanupExpiredHolds(showId);

      // Find the seat
      const seat = db.prepare('SELECT * FROM seats WHERE show_id = ? AND seat_number = ?').get(showId, seatNumber);
      if (!seat) return { error: 'Seat not found' };

      if (seat.status === 'BOOKED') {
        return { error: 'The seat is already booked. Please select any other seat.' };
      }

      if (seat.status === 'HELD' || seat.status === 'PAYMENT_PENDING') {
        // Check if the hold has expired
        const activeBooking = db.prepare(`
          SELECT * FROM bookings
          WHERE seat_id = ? AND status IN ('HELD', 'PAYMENT_PENDING')
          AND transaction_expiry > datetime('now')
          ORDER BY id DESC LIMIT 1
        `).get(seat.id);

        if (activeBooking) {
          return { error: 'The seat is temporarily held by another user. Please try again shortly.' };
        }
      }

      // Create booking code
      const bookingCode = generateBookingCode();

      // 15 minute expiry from now
      const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      // Update seat status to HELD
      db.prepare('UPDATE seats SET status = ? WHERE id = ?').run('HELD', seat.id);

      // Create booking
      const bookingResult = db.prepare(`
        INSERT INTO bookings (show_id, seat_id, booking_code, status, created_at, transaction_expiry)
        VALUES (?, ?, ?, 'HELD', ?, ?)
      `).run(showId, seat.id, bookingCode, now, expiry);

      const bookingId = bookingResult.lastInsertRowid;

      // Create transaction
      db.prepare(`
        INSERT INTO transactions (booking_id, status, started_at, expires_at)
        VALUES (?, 'PENDING', ?, ?)
      `).run(bookingId, now, expiry);

      // Get show details for the response
      const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(showId);
      const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(show.movie_id);

      return {
        success: true,
        bookingId,
        bookingCode,
        seatNumber: seat.seat_number,
        expiry,
        show: { ...show, movie_title: movie.title, movie_poster: movie.poster, movie_backdrop: movie.backdrop },
      };
    })();

    if (result.error) {
      return res.status(409).json({ error: result.error });
    }

    // Broadcast seat update to all subscribers
    const updatedSeats = db.prepare(`
      SELECT seat_number, row_label, seat_index, status
      FROM seats WHERE show_id = ?
    `).all(showId);
    broadcastSeatUpdate(showId, updatedSeats);

    res.json(result);
  } catch (err) {
    console.error('Error holding seat:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Step 2: Confirm payment (atomic booking with concurrency protection)
app.post('/api/booking/confirm', (req, res) => {
  try {
    const { bookingId, showId } = req.body;

    if (!bookingId || !showId) {
      return res.status(400).json({ error: 'bookingId and showId are required' });
    }

    const result = db.transaction(() => {
      // Atomic check: Get booking with seat lock
      const booking = db.prepare(`
        SELECT b.*, s.seat_number, s.status as seat_status
        FROM bookings b
        JOIN seats s ON b.seat_id = s.id
        WHERE b.id = ?
      `).get(bookingId);

      if (!booking) return { error: 'Booking not found' };

      // If this booking is already BOOKED (idempotent confirm), return success
      if (booking.status === 'BOOKED') {
        const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(booking.show_id);
        const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(show.movie_id);
        return {
          success: true,
          bookingCode: booking.booking_code,
          seatNumber: booking.seat_number,
          movie: { title: movie.title, poster: movie.poster, backdrop: movie.backdrop },
          show: {
            theatre: show.theatre,
            screen: show.screen,
            date: show.date,
            time: show.time,
            price: show.price,
            format: show.format,
          },
        };
      }

      // Check if transaction has expired
      if (new Date(booking.transaction_expiry) < new Date()) {
        // Expire the booking
        db.prepare("UPDATE bookings SET status = 'EXPIRED' WHERE id = ?").run(bookingId);
        db.prepare("UPDATE transactions SET status = 'EXPIRED' WHERE booking_id = ?").run(bookingId);

        // Release the seat if not permanently booked
        if (booking.seat_status !== 'BOOKED') {
          db.prepare("UPDATE seats SET status = 'AVAILABLE' WHERE id = ?").run(booking.seat_id);
        }
        return { error: 'Transaction expired. Please select your seat again.' };
      }

      // Check if seat is already permanently booked by another booking
      if (booking.seat_status === 'BOOKED') {
        // Release this booking
        db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(bookingId);
        db.prepare("UPDATE transactions SET status = 'FAILED' WHERE booking_id = ?").run(bookingId);
        return { error: 'The seat is already booked. Please select any other seat.' };
      }

      // CRITICAL: Atomic booking - use a sub-transaction with locked seat row
      // This is the concurrency guard: SELECT FOR UPDATE equivalent
      const seatRow = db.prepare("SELECT * FROM seats WHERE id = ?").get(booking.seat_id);

      if (seatRow.status === 'BOOKED') {
        db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(bookingId);
        db.prepare("UPDATE transactions SET status = 'FAILED' WHERE booking_id = ?").run(bookingId);
        return { error: 'The seat is already booked. Please select any other seat.' };
      }

      if (seatRow.status !== 'HELD' && seatRow.status !== 'PAYMENT_PENDING') {
        db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(bookingId);
        db.prepare("UPDATE transactions SET status = 'FAILED' WHERE booking_id = ?").run(bookingId);
        return { error: 'The seat is no longer available. Please select another seat.' };
      }

      // Check that no other active booking exists for this seat
      const otherActiveBooking = db.prepare(`
        SELECT id FROM bookings
        WHERE seat_id = ? AND id != ? AND status IN ('HELD', 'PAYMENT_PENDING')
        AND transaction_expiry > datetime('now')
      `).get(booking.seat_id, bookingId);

      // Atomically mark the seat as BOOKED
      const updateResult = db.prepare(`
        UPDATE seats SET status = 'BOOKED' WHERE id = ? AND status IN ('HELD', 'PAYMENT_PENDING')
      `).run(booking.seat_id);

      if (updateResult.changes === 0) {
        // Someone else booked it first!
        db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(bookingId);
        db.prepare("UPDATE transactions SET status = 'FAILED' WHERE booking_id = ?").run(bookingId);
        return { error: 'The seat is already booked. Please select any other seat.' };
      }

      // Cancel any other active bookings for this seat
      db.prepare(`
        UPDATE bookings SET status = 'CANCELLED'
        WHERE seat_id = ? AND id != ? AND status IN ('HELD', 'PAYMENT_PENDING')
      `).run(booking.seat_id, bookingId);

      // Mark our booking as BOOKED
      db.prepare("UPDATE bookings SET status = 'BOOKED' WHERE id = ?").run(bookingId);

      // Mark transaction as completed
      db.prepare("UPDATE transactions SET status = 'COMPLETED' WHERE booking_id = ?").run(bookingId);

      // Get full details
      const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(booking.show_id);
      const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(show.movie_id);

      return {
        success: true,
        bookingCode: booking.booking_code,
        seatNumber: booking.seat_number,
        movie: { title: movie.title, poster: movie.poster, backdrop: movie.backdrop },
        show: {
          theatre: show.theatre,
          screen: show.screen,
          date: show.date,
          time: show.time,
          price: show.price,
          format: show.format,
        },
      };
    })();

    if (result.error) {
      // Broadcast update even on failure
      const updatedSeats = db.prepare(`
        SELECT seat_number, row_label, seat_index, status
        FROM seats WHERE show_id = ?
      `).all(showId);
      broadcastSeatUpdate(showId, updatedSeats);

      return res.status(409).json({ error: result.error });
    }

    // Broadcast seat update
    const updatedSeats = db.prepare(`
      SELECT seat_number, row_label, seat_index, status
      FROM seats WHERE show_id = ?
    `).all(showId);
    broadcastSeatUpdate(showId, updatedSeats);

    res.json(result);
  } catch (err) {
    console.error('Error confirming booking:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Cancel a booking
app.post('/api/booking/cancel', (req, res) => {
  try {
    const { bookingId, showId } = req.body;

    const result = db.transaction(() => {
      const booking = db.prepare(`
        SELECT b.*, s.status as seat_status
        FROM bookings b
        JOIN seats s ON b.seat_id = s.id
        WHERE b.id = ?
      `).get(bookingId);

      if (!booking) return { error: 'Booking not found' };

      if (booking.status === 'BOOKED') {
        return { error: 'Cannot cancel a confirmed booking' };
      }

      // Release the seat if it's still held by this booking
      if (booking.seat_status === 'HELD' || booking.seat_status === 'PAYMENT_PENDING') {
        // Check no other active booking holds this seat
        const otherBooking = db.prepare(`
          SELECT id FROM bookings
          WHERE seat_id = ? AND id != ? AND status IN ('HELD', 'PAYMENT_PENDING')
          AND transaction_expiry > datetime('now')
        `).get(booking.seat_id, bookingId);

        if (!otherBooking) {
          db.prepare("UPDATE seats SET status = 'AVAILABLE' WHERE id = ?").run(booking.seat_id);
        }
      }

      db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(bookingId);
      db.prepare("UPDATE transactions SET status = 'FAILED' WHERE booking_id = ?").run(bookingId);

      return { success: true };
    })();

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    // Broadcast update
    const updatedSeats = db.prepare(`
      SELECT seat_number, row_label, seat_index, status
      FROM seats WHERE show_id = ?
    `).all(showId);
    broadcastSeatUpdate(showId, updatedSeats);

    res.json(result);
  } catch (err) {
    console.error('Error cancelling booking:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Get booking details by code
app.get('/api/booking/:code', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, s.seat_number, s.row_label,
             sh.theatre, sh.screen, sh.date, sh.time, sh.price, sh.format as show_format,
             m.title as movie_title, m.poster as movie_poster, m.backdrop as movie_backdrop, m.genre, m.rating, m.language
      FROM bookings b
      JOIN seats s ON b.seat_id = s.id
      JOIN shows sh ON b.show_id = sh.id
      JOIN movies m ON sh.movie_id = m.id
      WHERE b.booking_code = ?
    `).get(req.params.code.toUpperCase());

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    res.json(booking);
  } catch (err) {
    console.error('Error fetching booking:', err);
    res.status(500).json({ error: 'Failed to fetch booking details' });
  }
});

// Get booking by ID
app.get('/api/booking/id/:id', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, s.seat_number, s.row_label,
             sh.theatre, sh.screen, sh.date, sh.time, sh.price, sh.format as show_format,
             m.title as movie_title, m.poster as movie_poster, m.backdrop as movie_backdrop, m.genre, m.rating, m.language
      FROM bookings b
      JOIN seats s ON b.seat_id = s.id
      JOIN shows sh ON b.show_id = sh.id
      JOIN movies m ON sh.movie_id = m.id
      WHERE b.id = ?
    `).get(req.params.id);

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    res.json(booking);
  } catch (err) {
    console.error('Error fetching booking:', err);
    res.status(500).json({ error: 'Failed to fetch booking details' });
  }
});

// ============ PDF Receipt Generation ============

app.get('/api/booking/:code/receipt', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, s.seat_number, s.row_label,
             sh.theatre, sh.screen, sh.date, sh.time, sh.price, sh.format as show_format,
             m.title as movie_title, m.poster as movie_poster, m.backdrop as movie_backdrop, m.genre, m.rating, m.language
      FROM bookings b
      JOIN seats s ON b.seat_id = s.id
      JOIN shows sh ON b.show_id = sh.id
      JOIN movies m ON sh.movie_id = m.id
      WHERE b.booking_code = ?
    `).get(req.params.code.toUpperCase());

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=booking-${booking.booking_code}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(28).font('Helvetica-Bold').text('CINEMA BOOKING', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text('Your movie ticket booking confirmation', { align: 'center' });
    doc.moveDown(1);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
    doc.moveDown(1);

    // Booking Code
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('BOOKING CODE', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#2563eb').text(booking.booking_code, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text('Present this code at the counter to pay and collect your ticket', { align: 'center' });
    doc.moveDown(1);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
    doc.moveDown(1);

    // Movie Details
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#111').text('MOVIE DETAILS');
    doc.moveDown(0.5);

    const details = [
      ['Movie', booking.movie_title],
      ['Genre', booking.genre || 'N/A'],
      ['Rating', booking.rating || 'N/A'],
      ['Language', booking.language || 'English'],
      ['Theatre', booking.theatre],
      ['Screen', `Screen ${booking.screen}`],
      ['Date', formatDate(booking.date)],
      ['Time', booking.time],
      [`Price`, `₹${booking.price}`],
    ];

    for (const [label, value] of details) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#555').text(label, 70, doc.y, { continued: true, width: 130 });
      doc.font('Helvetica').fillColor('#111').text(`  ${value}`);
      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);

    // Seat Details
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#111').text('SEAT DETAILS');
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#333').text(`Seat Number: ${booking.seat_number}`, 70);
    doc.moveDown(0.5);

    // Booking Status
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#111').text('BOOKING STATUS');
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#16a34a').text(`✓ ${booking.status}`, 70);
    doc.moveDown(1);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
    doc.moveDown(1);

    // Instructions
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#dc2626').text('IMPORTANT INSTRUCTIONS', 50, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text('• Please show/provide the above booking code at the counter to pay and get your ticket.', 70);
    doc.moveDown(0.3);
    doc.text('• Carry a valid ID proof for verification.', 70);
    doc.moveDown(0.3);
    doc.text('• Please arrive at least 15 minutes before the show time.', 70);
    doc.moveDown(0.3);
    doc.text('• This receipt is generated for counter payment only.', 70);
    doc.moveDown(2);

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor('#999').text('This is a computer-generated receipt. No signature required.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Error generating receipt:', err);
    res.status(500).json({ error: 'Failed to generate receipt' });
  }
});

// ============ Cleanup Functions ============

function cleanupExpiredHolds(showId) {
  const now = new Date().toISOString();

  // Find expired bookings
  const expiredBookings = db.prepare(`
    SELECT b.id, b.seat_id, b.show_id
    FROM bookings b
    JOIN seats s ON b.seat_id = s.id
    WHERE b.show_id = ?
    AND b.status IN ('HELD', 'PAYMENT_PENDING')
    AND b.transaction_expiry <= ?
  `).all(showId, now);

  for (const booking of expiredBookings) {
    // Check if another active booking exists for this seat
    const otherBooking = db.prepare(`
      SELECT id FROM bookings
      WHERE seat_id = ? AND id != ? AND status IN ('HELD', 'PAYMENT_PENDING')
      AND transaction_expiry > ?
    `).get(booking.seat_id, booking.id, now);

    if (!otherBooking) {
      db.prepare("UPDATE seats SET status = 'AVAILABLE' WHERE id = ? AND status != 'BOOKED'").run(booking.seat_id);
    }

    db.prepare("UPDATE bookings SET status = 'EXPIRED' WHERE id = ?").run(booking.id);
    db.prepare("UPDATE transactions SET status = 'EXPIRED' WHERE booking_id = ?").run(booking.id);
  }
}

// Run cleanup every 30 seconds
setInterval(() => {
  try {
    const showIds = db.prepare('SELECT DISTINCT show_id FROM bookings WHERE status IN ("HELD", "PAYMENT_PENDING")').all();
    for (const { show_id } of showIds) {
      const changed = cleanupExpiredHolds(show_id);
      // Broadcast updates for affected shows
      const updatedSeats = db.prepare(`
        SELECT seat_number, row_label, seat_index, status
        FROM seats WHERE show_id = ?
      `).all(show_id);
      broadcastSeatUpdate(show_id, updatedSeats);
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 30000);

// ============ Utilities ============

function generateBookingCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'MOV-';
  for (let i = 0; i < 7; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = join(__dirname, '../client/dist/index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Build the client first: cd client && npx vite build' });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});

export { db, broadcastSeatUpdate, broadcastTransactionUpdate };
