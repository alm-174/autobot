// Kết nối WebSocket với desktop và tự kết nối lại khi bị mất mạng.

const RECONNECT_DELAY_MS = 2000;

function createStatusBadge() {
  let badge = document.querySelector("#socket-status");

  if (!badge) {
    badge = document.createElement("div");
    badge.id = "socket-status";
    badge.className = "socket-status is-connecting";
    badge.textContent = "WebSocket: đang kết nối";
    document.body.appendChild(badge);
  }

  return badge;
}

export function createSocketClient({ onMessage = () => {} } = {}) {
  const statusBadge = createStatusBadge();
  let socket = null;
  let reconnectTimer = null;
  let stopped = false;

  function setStatus(state, text) {
    statusBadge.className = `socket-status is-${state}`;
    statusBadge.textContent = text;
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    setStatus("offline", "WebSocket: mất kết nối — đang thử lại");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const role = new URLSearchParams(window.location.search).get("role") === "master"
      ? "master"
      : "viewer";
    const url = `${protocol}//${window.location.host}/?role=${role}`;

    setStatus("connecting", "WebSocket: đang kết nối");
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      setStatus("online", `WebSocket: đã kết nối (${role})`);
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        // Hub báo vai thật: master thứ hai bị hạ thành viewer nên nhãn phải đổi theo.
        if (message.type === "client:role") setStatus("online", `WebSocket: đã kết nối (${message.data.role})`);
        onMessage(message);
      } catch (error) {
        console.warn("Bỏ qua message WebSocket không hợp lệ:", error);
      }
    });

    socket.addEventListener("close", scheduleReconnect);
    socket.addEventListener("error", () => socket.close());
  }

  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function close() {
    stopped = true;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    socket?.close();
  }

  connect();

  return { send, close };
}

