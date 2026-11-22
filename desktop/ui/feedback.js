// Toast (thông báo) và hộp thoại xác nhận, thay cho alert()/confirm() của trình duyệt.
// Giao diện lấy từ design tokens trong style.css (.toast, .dialog).

const TOAST_ICON = { success: "circle-check", error: "circle-x", warning: "triangle-alert", info: "info" };
const TOAST_MS = { success: 3500, info: 3500, warning: 7000, error: 9000 };
const MAX_TOASTS = 4;

/** SVG icon Lucide từ sprite inline trong index.html. */
export function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** Hiện toast. kind: "success" | "info" | "warning" | "error". Lỗi dùng role=alert để đọc ngay. */
export function toast(kind, message, { duration = TOAST_MS[kind] ?? 3500 } = {}) {
  const root = document.querySelector("#toast-root");
  const element = document.createElement("div");
  element.className = `toast is-${kind}`;
  element.setAttribute("role", kind === "error" ? "alert" : "status");
  element.innerHTML = `${icon(TOAST_ICON[kind] || "info")}<p></p><button type="button" class="toast-close" aria-label="Đóng thông báo">${icon("x")}</button>`;
  element.querySelector("p").textContent = message;

  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    element.classList.add("is-leaving");
    setTimeout(() => element.remove(), 180);
  };
  element.querySelector(".toast-close").addEventListener("click", dismiss);
  // Rê chuột vào thì giữ lại để đọc kịp, rời ra thì đếm lại.
  element.addEventListener("pointerenter", () => clearTimeout(timer));
  element.addEventListener("pointerleave", () => { timer = setTimeout(dismiss, 2000); });
  timer = setTimeout(dismiss, duration);

  root.append(element);
  while (root.children.length > MAX_TOASTS) root.firstElementChild.remove();
  return element;
}

let pending = null;

/**
 * Hộp thoại xác nhận (thẻ <dialog>, có sẵn bẫy focus và phím Esc).
 * Trả về Promise<boolean>: true nếu bấm nút xác nhận, false nếu Huỷ hoặc Esc.
 * Đang mở một hộp thoại thì lần gọi sau dùng chung kết quả của hộp thoại đó.
 */
export function confirmDialog({ title, message, confirmText = "Đồng ý", cancelText = "Huỷ", danger = false }) {
  if (pending) return pending;
  const dialog = document.querySelector("#confirm-dialog");
  dialog.querySelector("#dialog-title").textContent = title;
  dialog.querySelector("#dialog-message").textContent = message;
  dialog.querySelector("#dialog-ok").textContent = confirmText;
  dialog.querySelector("#dialog-cancel").textContent = cancelText;
  dialog.classList.toggle("is-danger", danger);

  pending = new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      pending = null;
      resolve(dialog.returnValue === "ok");
    }, { once: true });
  });
  dialog.returnValue = "";
  dialog.showModal();
  dialog.querySelector("#dialog-cancel").focus(); // mặc định chọn Huỷ để không mất nháp vì lỡ bấm Enter
  return pending;
}

export const isDialogOpen = () => document.querySelector("#confirm-dialog")?.open === true;
