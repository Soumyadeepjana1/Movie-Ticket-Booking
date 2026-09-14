const API_BASE = '/api';
const WS_BASE = `ws://${window.location.host}/ws`;

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export function createWebSocket(showId, onMessage) {
  let ws = null;
  let reconnectTimeout = null;

  function connect() {
    ws = new WebSocket(WS_BASE);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', showId: Number(showId) }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        // ignore
      }
    };

    ws.onclose = () => {
      reconnectTimeout = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  connect();

  return () => {
    clearTimeout(reconnectTimeout);
    if (ws) ws.close();
  };
}
