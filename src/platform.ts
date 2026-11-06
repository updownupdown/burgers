/**
 * Where the game is running, and keeping its save (DESIGN §52).
 *
 *   isNative()        true inside the Android app (Capacitor puts window.Capacitor on the page).
 *                     The bundle ships with the app there, so the web's update checks and banner
 *                     are hidden.
 *   keepStorage()     after the first shift: ask the browser to keep the save (storage.persist()),
 *                     once; and if storage looks like it won't last (private browsing), say so once.
 */
import { toast } from "./ui/toast";

export function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap) return false;
  return typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : true;
}

const ASKED_KEY = "bv-persist-asked";
const WARNED_KEY = "bv-storage-warned";

function flag(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return true;
  } catch {
    // ignore
  }
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}
function setFlag(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

/** Can a value be written to localStorage and read back? */
function storageWorks(): boolean {
  try {
    const k = "bv-probe";
    localStorage.setItem(k, "1");
    const ok = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
}

/**
 * A private window usually gives a site a small, throwaway quota (Chrome about 100 MB or less,
 * where a normal profile gets gigabytes). Not proof, but a fair sign the save goes when it closes.
 */
async function looksPrivate(): Promise<boolean> {
  if (!storageWorks()) return true;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.quota < 130 * 1024 * 1024) return true;
  } catch {
    // ignore
  }
  return false;
}

export const STORAGE_WARNING = "This browser may not keep your trip after it closes. Settings has a save code you can copy.";

/**
 * Automated browsers (the playtest bots) run in throwaway profiles that look private; they get no
 * warnings or automatic changes unless a test asks for them with bv-test-auto.
 */
export function botQuiet(): boolean {
  if (!navigator.webdriver) return false;
  try {
    return localStorage.getItem("bv-test-auto") !== "1";
  } catch {
    return true;
  }
}

/** Call after a shift: asks once for lasting storage, and warns once if the save won't last. */
export async function keepStorage(): Promise<void> {
  if (isNative() || botQuiet()) return;
  if (!flag(ASKED_KEY)) {
    setFlag(ASKED_KEY);
    try {
      await navigator.storage?.persist?.();
    } catch {
      // Not offered here: the save still writes as before.
    }
  }
  if (flag(WARNED_KEY)) return;
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    // ignore
  }
  if (persisted) return;
  if (await looksPrivate()) {
    setFlag(WARNED_KEY);
    toast(STORAGE_WARNING, 6);
  }
}
