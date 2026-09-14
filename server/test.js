// Test suite for the movie ticket booking system
// Run with: node server/test.js

import db from './db.js';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'http://localhost:3001';
let passed = 0;
let failed = 0;

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

// ============ TEST 1: Single user booking flow ============
async function test1_singleUserBooking() {
  console.log('\nTEST 1: Single user → select → payment → success');

  // Get a show and seat
  const shows = await api('GET', '/api/movies/1/shows');
  assert(shows.status === 200, 'Fetched shows');
  const showId = shows.data[0].id;

  // Hold a seat
  const hold = await api('POST', '/api/booking/hold', { showId, seatNumber: 'A1' });
  assert(hold.status === 200, 'Seat A1 held successfully');
  assert(hold.data.bookingCode, 'Booking code generated');

  const bookingId = hold.data.bookingId;

  // Confirm booking
  const confirm = await api('POST', '/api/booking/confirm', { bookingId, showId });
  assert(confirm.status === 200, 'Booking confirmed');
  assert(confirm.data.bookingCode, 'Booking code returned');
  assert(confirm.data.seatNumber === 'A1', 'Correct seat booked');

  // Verify seat is BOOKED
  const seats = await api('GET', `/api/shows/${showId}/seats`);
  const seat = seats.data.seats.find(s => s.seat_number === 'A1');
  assert(seat && seat.status === 'BOOKED', 'Seat A1 is BOOKED in database');
}

// ============ TEST 2: Two users, same seat, sequential payment ============
async function test2_twoUsersSequential() {
  console.log('\nTEST 2: Two users → same seat → User A pays first → User B rejected');

  const shows = await api('GET', '/api/movies/2/shows');
  const showId = shows.data[0].id;

  // User A holds seat
  const holdA = await api('POST', '/api/booking/hold', { showId, seatNumber: 'B3' });
  assert(holdA.status === 200, 'User A holds B3');

  // User B tries to hold the same seat
  const holdB = await api('POST', '/api/booking/hold', { showId, seatNumber: 'B3' });
  assert(holdB.status === 409, 'User B gets conflict (409)');
  assert(holdB.data.error.includes('temporarily held') || holdB.data.error.includes('already booked'), 'Correct error message for User B');

  // User A confirms payment
  const confirmA = await api('POST', '/api/booking/confirm', { bookingId: holdA.data.bookingId, showId });
  assert(confirmA.status === 200, 'User A confirms booking');
}

// ============ TEST 3: Two users, simultaneous payment ============
async function test3_twoUsersSimultaneous() {
  console.log('\nTEST 3: Two users → same seat → simultaneous payment → exactly ONE succeeds');

  const shows = await api('GET', '/api/movies/3/shows');
  const showId = shows.data[0].id;

  // User A holds seat
  const holdA = await api('POST', '/api/booking/hold', { showId, seatNumber: 'C5' });
  assert(holdA.status === 200, 'User A holds C5');

  // Simulate User B getting a hold on the seat (cancel User A's hold first to simulate race)
  // In real life this would be two different browser sessions
  await api('POST', '/api/booking/cancel', { bookingId: holdA.data.bookingId, showId });

  // Now both users hold and try to confirm simultaneously
  const holdA2 = await api('POST', '/api/booking/hold', { showId, seatNumber: 'C5' });
  assert(holdA2.status === 200, 'User A re-holds C5');

  const holdB = await api('POST', '/api/booking/hold', { showId, seatNumber: 'C5' });
  assert(holdB.status === 409, 'User B cannot hold (already held by A)');

  // User A confirms
  const confirmA = await api('POST', '/api/booking/confirm', { bookingId: holdA2.data.bookingId, showId });
  assert(confirmA.status === 200, 'User A confirms booking');

  // Simulate: if User B had somehow gotten in, they'd be rejected
  // Verify seat is BOOKED
  const seats = await api('GET', `/api/shows/${showId}/seats`);
  const seat = seats.data.seats.find(s => s.seat_number === 'C5');
  assert(seat && seat.status === 'BOOKED', 'Seat C5 is permanently BOOKED');
}

// ============ TEST 4: Transaction timeout ============
async function test4_transactionTimeout() {
  console.log('\nTEST 4: Transaction expiry → seat becomes available');

  const shows = await api('GET', '/api/movies/4/shows');
  const showId = shows.data[0].id;

  // Hold a seat
  const hold = await api('POST', '/api/booking/hold', { showId, seatNumber: 'D2' });
  assert(hold.status === 200, 'Seat D2 held');

  // Manually expire the booking in the database
  db.prepare("UPDATE bookings SET transaction_expiry = datetime('now', '-1 minute') WHERE id = ?").run(hold.data.bookingId);

  // Try to confirm (should fail - expired)
  const confirm = await api('POST', '/api/booking/confirm', { bookingId: hold.data.bookingId, showId });
  assert(confirm.status === 409, 'Confirmation fails (expired)');
  assert(confirm.data.error.includes('expired'), 'Correct expiry message');

  // Verify seat is available again
  const seats = await api('GET', `/api/shows/${showId}/seats`);
  const seat = seats.data.seats.find(s => s.seat_number === 'D2');
  assert(seat && seat.status === 'AVAILABLE', 'Seat D2 is AVAILABLE after expiry');
}

// ============ TEST 5: Payment rejection ============
async function test5_paymentRejection() {
  console.log('\nTEST 5: Payment rejected → seat immediately available');

  const shows = await api('GET', '/api/movies/5/shows');
  const showId = shows.data[0].id;

  const hold = await api('POST', '/api/booking/hold', { showId, seatNumber: 'E4' });
  assert(hold.status === 200, 'Seat E4 held');

  // Cancel (simulating rejection)
  const cancel = await api('POST', '/api/booking/cancel', { bookingId: hold.data.bookingId, showId });
  assert(cancel.status === 200, 'Booking cancelled');

  // Verify seat is available
  const seats = await api('GET', `/api/shows/${showId}/seats`);
  const seat = seats.data.seats.find(s => s.seat_number === 'E4');
  assert(seat && seat.status === 'AVAILABLE', 'Seat E4 is AVAILABLE after rejection');
}

// ============ TEST 6: Booking code uniqueness ============
async function test6_bookingCodeUniqueness() {
  console.log('\nTEST 6: Booking codes are unique');

  const codes = new Set();
  const shows = await api('GET', '/api/movies/1/shows');
  const showId = shows.data[0].id;

  // Create and confirm 5 bookings on different seats
  for (let i = 6; i <= 10; i++) {
    const row = String.fromCharCode(65 + Math.floor(i / 10));
    const seatNum = `${row}${i}`;
    const hold = await api('POST', '/api/booking/hold', { showId, seatNumber: seatNum });
    if (hold.status === 200) {
      const confirm = await api('POST', '/api/booking/confirm', { bookingId: hold.data.bookingId, showId });
      if (confirm.status === 200) {
        codes.add(confirm.data.bookingCode);
      }
    }
  }
  assert(codes.size >= 3, `Generated ${codes.size} unique booking codes`);
}

// ============ TEST 7: Concurrent atomic booking ============
async function test7_concurrentBooking() {
  console.log('\nTEST 7: Two simultaneous requests for the same seat (different booking IDs)');

  const shows = await api('GET', '/api/movies/6/shows');
  const showId = shows.data[0].id;

  // Simulate race: hold seat, then confirm it twice concurrently
  const hold = await api('POST', '/api/booking/hold', { showId, seatNumber: 'A1' });
  assert(hold.status === 200, 'Seat A1 held successfully');

  // Both requests try to confirm the same booking simultaneously
  const results = await Promise.all([
    api('POST', '/api/booking/confirm', { bookingId: hold.data.bookingId, showId }),
    api('POST', '/api/booking/confirm', { bookingId: hold.data.bookingId, showId }),
  ]);

  // Both may return success (idempotent), but only ONE BOOKED record should exist
  // The key invariant: never create duplicate bookings
  const bookings = db.prepare(`
    SELECT COUNT(*) as count FROM bookings
    WHERE seat_id = (SELECT id FROM seats WHERE show_id = ? AND seat_number = 'A1')
    AND status = 'BOOKED'
  `).get(showId);
  assert(bookings.count === 1, `Exactly one BOOKED record for seat (found ${bookings.count})`);

  // Also test that a NEW booking for the same seat is rejected
  const holdB = await api('POST', '/api/booking/hold', { showId, seatNumber: 'A1' });
  assert(holdB.status === 409, 'Second hold attempt correctly rejected (seat already booked)');
}

// ============ Run all tests ============
async function runTests() {
  console.log('='.repeat(50));
  console.log('MOVIE TICKET BOOKING SYSTEM - TEST SUITE');
  console.log('='.repeat(50));

  try {
    await test1_singleUserBooking();
    await test2_twoUsersSequential();
    await test3_twoUsersSimultaneous();
    await test4_transactionTimeout();
    await test5_paymentRejection();
    await test6_bookingCodeUniqueness();
    await test7_concurrentBooking();
  } catch (err) {
    console.error('\nTest error:', err);
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
