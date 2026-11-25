import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LuArrowLeft, LuArrowRight, LuExternalLink, LuRotateCw } from "react-icons/lu";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as api from "../../lib/api";
import { DEFAULT_BROWSER_URL } from "../../lib/artifacts";
import { IconButton } from "../ui/Button";
import { useOverlayStore } from "../ui/overlay";

const OFFSCREEN = -100000;

function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return DEFAULT_BROWSER_URL;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function BrowserView({ initialUrl, active }: { initialUrl?: string; active: boolean }) {
  const startUrl = normalizeUrl(initialUrl ?? DEFAULT_BROWSER_URL);
  const [label, setLabel] = useState("");
  const [input, setInput] = useState(startUrl);
  const [committed, setCommitted] = useState(startUrl);
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayOpen = useOverlayStore((s) => s.count > 0);
  const overlayRef = useRef(overlayOpen);
  const activeRef = useRef(active);
  activeRef.current = active;
  const syncRef = useRef<() => void>(() => {});
  const firstUrl = useRef(startUrl);
  const initialLoaded = useRef(false);
  const lastPropUrl = useRef(startUrl);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const webviewLabel = `browser-${api.newId()}`;
    setLabel(webviewLabel);
    let disposed = false;
    let visible = true;

    const webview = new Webview(getCurrentWindow(), webviewLabel, {
      url: firstUrl.current,
      x: OFFSCREEN,
      y: OFFSCREEN,
      width: 1,
      height: 1,
    });
    const close = () => void webview.close().catch(() => api.webviewClose(webviewLabel).catch(() => {}));

    const sync = () => {
      if (disposed) return;
      const b = host.getBoundingClientRect();
      const show =
        activeRef.current && visible && !overlayRef.current && b.width > 20 && b.height > 20 && b.top >= 0 && b.left >= 0;
      const position = show ? new LogicalPosition(Math.round(b.left), Math.round(b.top)) : new LogicalPosition(OFFSCREEN, OFFSCREEN);
      const size = show ? new LogicalSize(Math.round(b.width), Math.round(b.height)) : new LogicalSize(0, 0);
      void webview.setPosition(position).catch(() => {});
      void webview.setSize(size).catch(() => {});
    };

    void webview.once("tauri://created", () => {
      if (disposed) return close();
      setReady(true);
      sync();
    });
    void webview.once("tauri://error", (event) => !disposed && setError(String(event.payload)));

    let raf = 0;
    const schedule = () => {
      if (disposed || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };

    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].intersectionRatio > 0;
      sync();
    });
    intersection.observe(host);
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    if (host.parentElement) resize.observe(host.parentElement);
    window.addEventListener("resize", schedule);
    syncRef.current = sync;
    sync();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      setReady(false);
      intersection.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      close();
    };
  }, []);

  useEffect(() => syncRef.current(), [active]);

  useEffect(() => {
    overlayRef.current = overlayOpen;
    syncRef.current();
  }, [overlayOpen]);

  const navigate = useCallback((next: string) => {
    setInput(next);
    setCommitted(next);
    setError(null);
  }, []);

  useEffect(() => {
    const next = normalizeUrl(initialUrl ?? DEFAULT_BROWSER_URL);
    if (next === lastPropUrl.current) return;
    lastPropUrl.current = next;
    navigate(next);
  }, [initialUrl, navigate]);

  useEffect(() => {
    if (!ready || !label) return;
    if (!initialLoaded.current) {
      initialLoaded.current = true;
      return;
    }
    api.webviewNavigate(label, committed).catch((e) => {
      setError(api.errorMessage(e));
    });
  }, [committed, ready, label]);

  const history = (action: api.HistoryAction) => {
    if (!ready) return;
    setError(null);
    api.webviewHistory(label, action).catch((e) => {
      setError(api.errorMessage(e));
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      navigate(normalizeUrl(input));
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setInput(committed);
      inputRef.current?.blur();
    }
  };

  return (
    <>
      <div className="toolbar">
        <IconButton label="Back" size="sm" disabled={!ready} onClick={() => history("back")}>
          <LuArrowLeft />
        </IconButton>
        <IconButton label="Forward" size="sm" disabled={!ready} onClick={() => history("forward")}>
          <LuArrowRight />
        </IconButton>
        <IconButton label="Reload" size="sm" disabled={!ready} onClick={() => history("reload")}>
          <LuRotateCw />
        </IconButton>
        <div className="address">
          {!focused && <img src="/chrome.svg" alt="" />}
          <input
            ref={inputRef}
            className="field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => {
              setFocused(true);
              setTimeout(() => inputRef.current?.select(), 0);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder="Search or enter address"
            aria-label="Address"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
        <IconButton label="Open in system browser" size="sm" onClick={() => void openUrl(normalizeUrl(input))}>
          <LuExternalLink />
        </IconButton>
      </div>
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="browser-host" ref={hostRef} />
    </>
  );
}
