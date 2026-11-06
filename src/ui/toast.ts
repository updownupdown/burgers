/**
 * A small note that slides up near the bottom of the screen and goes by itself (DESIGN §52): the
 * graphics step-down, a storage warning, a copied save code. One at a time; a new one replaces the
 * last. It never takes a tap: taps go through to whatever is under it.
 */
import "./toast.css";

let el: HTMLElement | null = null;
let timer = 0;

export function toast(text: string, seconds = 4): void {
  if (!el) {
    el = document.createElement("div");
    el.className = "bv bv-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(timer);
  timer = window.setTimeout(hideToast, seconds * 1000);
}

export function hideToast(): void {
  el?.classList.remove("on");
}
