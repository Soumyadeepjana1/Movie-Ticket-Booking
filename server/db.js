import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'bookings.db'));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    poster TEXT,
    backdrop TEXT,
    duration INTEGER NOT NULL DEFAULT 120,
    genre TEXT,
    rating TEXT,
    description TEXT,
    language TEXT DEFAULT 'English',
    release_year INTEGER
  );

  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    theatre TEXT NOT NULL,
    screen INTEGER NOT NULL DEFAULT 1,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 150.00,
    format TEXT DEFAULT '2D',
    FOREIGN KEY (movie_id) REFERENCES movies(id)
  );

  CREATE TABLE IF NOT EXISTS seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id INTEGER NOT NULL,
    seat_number TEXT NOT NULL,
    row_label TEXT NOT NULL,
    seat_index INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','HELD','PAYMENT_PENDING','BOOKED','CANCELLED','EXPIRED')),
    FOREIGN KEY (show_id) REFERENCES shows(id),
    UNIQUE(show_id, seat_number)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,
    booking_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING' CHECK(status IN ('HELD','PAYMENT_PENDING','BOOKED','CANCELLED','EXPIRED')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    transaction_expiry TEXT NOT NULL,
    FOREIGN KEY (show_id) REFERENCES shows(id),
    FOREIGN KEY (seat_id) REFERENCES seats(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','FAILED','EXPIRED')),
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );

  -- Index for fast seat lookups
  CREATE INDEX IF NOT EXISTS idx_seats_show_status ON seats(show_id, status);
  CREATE INDEX IF NOT EXISTS idx_bookings_seat ON bookings(seat_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_bookings_expiry ON bookings(transaction_expiry);
`);

// Seed movies if empty
const movieCount = db.prepare('SELECT COUNT(*) as count FROM movies').get().count;
if (movieCount === 0) {
  const insertMovie = db.prepare(`
    INSERT INTO movies (title, poster, backdrop, duration, genre, rating, description, language, release_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // All poster and backdrop URLs verified working via curl HEAD requests
  const movies = [
    [
      'Interstellar',
      'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
      'https://image.tmdb.org/t/p/w1280/lqoMzCcZYEFK729d6qzt349fB4o.jpg',
      169, 'Sci-Fi', 'U/A',
      'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.',
      'English', 2014
    ],
    [
      'The Dark Knight',
      'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
      'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
      152, 'Action', 'U/A',
      'Batman raises the stakes in his war on crime, confronting the Joker, a criminal mastermind who wants to plunge Gotham into anarchy.',
      'English', 2008
    ],
    [
      'Inception',
      'https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg',
      'https://image.tmdb.org/t/p/w1280/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
      148, 'Sci-Fi', 'U/A',
      'A thief who steals corporate secrets through dream-sharing technology is given the task of planting an idea into a CEO\'s mind.',
      'English', 2010
    ],
    [
      'Avengers: Endgame',
      'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg',
      'https://image.tmdb.org/t/p/w1280/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
      181, 'Action', 'U/A',
      'After devastating events, the remaining Avengers assemble to reverse Thanos\' actions and restore balance to the universe.',
      'English', 2019
    ],
    [
      'Parasite',
      'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
      'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
      132, 'Thriller', 'A',
      'Greed and class discrimination threaten the relationship between a wealthy family and the poor Kim clan.',
      'Korean', 2019
    ],
    [
      'Dune: Part Two',
      'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
      'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
      166, 'Sci-Fi', 'U/A',
      'Paul Atreides unites with the Fremen while on a warpath of revenge against the conspirators who destroyed his family.',
      'English', 2024
    ],
    [
      'Oppenheimer',
      'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
      'https://image.tmdb.org/t/p/w1280/nb3xI8XI3w4pMVZ38VijbsyBqP4.jpg',
      180, 'Drama', 'U/A',
      'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.',
      'English', 2023
    ],
    [
      'Spider-Man: No Way Home',
      'https://image.tmdb.org/t/p/w500/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg',
      'https://image.tmdb.org/t/p/w1280/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg',
      148, 'Action', 'U/A',
      'Peter Parker is unmasked and no longer able to separate his normal life from the high-stakes of being a super-hero.',
      'English', 2021
    ],
    [
      'The Batman',
      'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg',
      'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg',
      176, 'Action', 'U/A',
      'In his second year of fighting crime, Batman uncovers corruption in Gotham City that connects to his own family while facing a serial killer known as the Riddler.',
      'English', 2022
    ]
  ];

  const insertMany = db.transaction((items) => {
    for (const movie of items) {
      insertMovie.run(...movie);
    }
  });
  insertMany(movies);

  // Seed shows
  const insertShow = db.prepare(`
    INSERT INTO shows (movie_id, theatre, screen, date, time, price, format)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

  const shows = [
    [1, 'PVR Phoenix Marketcity', 1, today, '10:00 AM', 200, 'IMAX'],
    [1, 'PVR Phoenix Marketcity', 3, today, '01:30 PM', 250, '4DX'],
    [1, 'PVR Phoenix Marketcity', 5, tomorrow, '06:00 PM', 300, 'IMAX'],
    [2, 'INOX Megaplex', 2, today, '04:00 PM', 220, 'Dolby Atmos'],
    [2, 'INOX Megaplex', 4, tomorrow, '11:00 AM', 180, '2D'],
    [2, 'PVR Phoenix Marketcity', 1, dayAfter, '07:30 PM', 260, 'IMAX'],
    [3, 'Cinepolis Viviana Mall', 3, today, '07:30 PM', 280, 'Dolby Atmos'],
    [3, 'PVR Phoenix Marketcity', 5, tomorrow, '03:00 PM', 260, '2D'],
    [4, 'Cinepolis Viviana Mall', 1, today, '12:00 PM', 350, '4DX'],
    [4, 'PVR Phoenix Marketcity', 2, tomorrow, '09:00 PM', 320, 'IMAX'],
    [5, 'INOX Megaplex', 3, dayAfter, '05:00 PM', 200, '2D'],
    [5, 'PVR Phoenix Marketcity', 4, today, '08:00 PM', 240, 'Dolby Atmos'],
    [6, 'Cinepolis Viviana Mall', 2, tomorrow, '02:00 PM', 300, 'IMAX'],
    [6, 'INOX Megaplex', 1, dayAfter, '07:00 PM', 350, 'Dolby Atmos'],
    [7, 'PVR Phoenix Marketcity', 3, today, '06:30 PM', 280, 'IMAX'],
    [7, 'INOX Megaplex', 2, tomorrow, '10:00 AM', 220, '2D'],
    [8, 'Cinepolis Viviana Mall', 4, tomorrow, '01:00 PM', 300, '4DX'],
    [8, 'PVR Phoenix Marketcity', 1, dayAfter, '04:30 PM', 260, 'Dolby Atmos'],
    // The Batman shows
    [9, 'INOX Megaplex', 5, today, '09:30 PM', 280, 'Dolby Atmos'],
    [9, 'PVR Phoenix Marketcity', 2, tomorrow, '06:00 PM', 300, 'IMAX'],
    [9, 'Cinepolis Viviana Mall', 3, dayAfter, '10:00 PM', 250, '2D'],
    [9, 'INOX Megaplex', 1, today, '03:00 PM', 220, '4DX'],
  ];

  const insertShows = db.transaction((items) => {
    for (const show of items) {
      insertShow.run(...show);
    }
  });
  insertShows(shows);

  // Seed seats for all shows
  const insertSeat = db.prepare(`
    INSERT INTO seats (show_id, seat_number, row_label, seat_index, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const seatsPerRow = 10;

  // Get all show IDs
  const allShows = db.prepare('SELECT id FROM shows').all();

  const insertSeats = db.transaction((shows) => {
    for (const show of shows) {
      for (const row of rows) {
        for (let i = 1; i <= seatsPerRow; i++) {
          insertSeat.run(show.id, `${row}${i}`, row, i, 'AVAILABLE');
        }
      }
    }
  });
  insertSeats(allShows);

  console.log('Database seeded with movies, shows, and seats.');
}

export default db;
