/**
 * Keeps the web build current. Every deploy writes version.json with its build number;
 * the game polls it and offers (or, outside a shift, performs) a reload when it changes.
 */
export interface VersionInfo {
  build: string;
  commit: string;
  builtAt: string;
}

export const CURRENT: VersionInfo = { build: __BUILD__, commit: __COMMIT__, builtAt: __BUILT_AT__ };

export function buildLabel(v: VersionInfo = CURRENT): string {
  const date = v.builtAt ? new Date(v.builtAt) : null;
  const when = date && !isNaN(date.getTime()) ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return v.build === "dev" ? `Dev build · ${v.commit}` : `Build #${v.build} · ${v.commit}${when ? ` · ${when}` : ""}`;
}

export async function fetchLatest(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as VersionInfo;
  } catch {
    return null;
  }
}

/** Reload onto the new build. The query string sidesteps GitHub Pages' 10-minute HTML cache. */
export function reloadTo(build: string, force = false): void {
  // If a stale cached page keeps coming back, don't bounce forever: one try per build every few minutes.
  try {
    const last = JSON.parse(sessionStorage.getItem("bv-reload") || "null") as { build: string; at: number } | null;
    if (!force && last && last.build === build && Date.now() - last.at < 3 * 60_000) return;
    sessionStorage.setItem("bv-reload", JSON.stringify({ build, at: Date.now() }));
  } catch {
    // No session storage: just reload.
  }
  const url = new URL(location.href);
  url.searchParams.set("v", build);
  url.searchParams.set("r", String(Date.now() % 1e6));
  location.replace(url.toString());
}

export function startUpdateChecks(onNewer: (v: VersionInfo) => void): () => Promise<VersionInfo | null> {
  let notified = "";
  const check = async () => {
    const v = await fetchLatest();
    if (v && v.build !== CURRENT.build && CURRENT.build !== "dev" && v.build !== notified) {
      // Only treat higher numbers as newer, so a stale CDN copy can't bounce us backwards.
      if (Number(v.build) > Number(CURRENT.build)) {
        notified = v.build;
        onNewer(v);
      }
    }
    return v;
  };
  void check();
  setInterval(check, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  return check;
}
