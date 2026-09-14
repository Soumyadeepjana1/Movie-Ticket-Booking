# 🎬 Movie Ticket Booking

A full-stack movie ticket booking application with real-time seat updates via WebSocket, featuring a React frontend and an Express/SQLite backend.

## Features

- **Movie browsing** — View available movies with details (genre, rating, language)
- **Show scheduling** — Browse showtimes by date and theatre
- **Real-time seat selection** — Live seat availability updates via WebSocket
- **Seat hold system** — 15-minute expiry window to prevent race conditions
- **Booking confirmation** — Atomic booking with concurrency protection
- **Booking lookup** — Retrieve booking details using a booking code
- **PDF receipts** — Downloadable booking confirmation as PDF
- **Responsive design** — Works on desktop and mobile

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | React 18, React Router, Vite        |
| Backend  | Express.js, WebSocket (`ws`)        |
| Database | SQLite (via `better-sqlite3`)       |
| PDF      | PDFKit                              |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
cd client && npm install
```

### Development

```bash
npm run dev
```

This starts both the server (port 3001) and the client dev server (port 5173) concurrently.

### Production Build

```bash
npm run build
npm start
```

The server serves the built client files and runs on `http://localhost:3001`.

## API Endpoints

| Method | Endpoint                     | Description                     |
| ------ | ---------------------------- | ------------------------------- |
| GET    | `/api/movies`                | List all movies                 |
| GET    | `/api/movies/:id`            | Get a movie by ID               |
| GET    | `/api/movies/:id/shows`      | Get shows for a movie           |
| GET    | `/api/shows/:id/seats`       | Get seats for a show            |
| POST   | `/api/booking/hold`          | Hold a seat (15-min window)     |
| POST   | `/api/booking/confirm`       | Confirm booking after payment   |
| POST   | `/api/booking/cancel`        | Cancel a booking                |
| GET    | `/api/booking/:code`         | Get booking by code             |
| GET    | `/api/booking/:code/receipt` | Download PDF receipt            |

## WebSocket

Connect to `ws://localhost:3001/ws` and send:

```json
{ "type": "subscribe", "showId": "<show_id>" }
```

Receive real-time updates:

- `seat_update` — Live seat status changes
- `transaction_update` — Booking status changes

## Project Structure

```
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom hooks
│   │   └── App.jsx       # Router setup
│   └── vite.config.js
├── server/
│   ├── index.js          # Express server + WebSocket + API routes
│   ├── db.js             # SQLite setup and schema
│   └── test.js           # API tests
└── package.json
```
