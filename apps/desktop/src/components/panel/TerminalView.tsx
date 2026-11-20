import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import * as api from "../../lib/api";

const THEME = {
  background: "#0a0a0a",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  cursorAccent: "#0a0a0a",
  selectionBackground: "rgba(74, 158, 255, 0.3)",
  black: "#171717",
  red: "#f2736b",
  green: "#6fc48e",
  yellow: "#e6b45c",
  blue: "#4a9eff",
  magenta: "#c08adf",
  cyan: "#5ec8d8",
  white: "#d4d4d4",
  brightBlack: "#737373",
  brightRed: "#ff8f86",
  brightGreen: "#8bd7a6",
  brightYellow: "#f0c878",
  brightBlue: "#79b8ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#8adbe6",
  brightWhite: "#f5f5f5",
};

export function TerminalView({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const sessionId = `${id}:${api.newId()}`;
    let disposed = false;
    let opened = false;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim(),
      lineHeight: 1.35,
      cursorBlink: false,
      scrollback: 5000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    const safeFit = () => {
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return false;
      fit.fit();
      return true;
    };
    safeFit();

    api
      .terminalOpen(sessionId, term.cols, term.rows, (event) => {
        if (disposed) return;
        if (event.type === "data") term.write(event.data);
        else term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n");
      })
      .then(() => {
        opened = true;
        if (disposed) void api.terminalClose(sessionId).catch(() => undefined);
      })
      .catch((e) => !disposed && term.write(`\r\n\x1b[31m${api.errorMessage(e)}\x1b[0m\r\n`));

    const input = term.onData((data) => {
      if (!disposed) void api.terminalWrite(sessionId, data).catch(() => undefined);
    });

    let cols = term.cols;
    let rows = term.rows;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (disposed || !safeFit()) return;
        if (term.cols === cols && term.rows === rows) return;
        cols = term.cols;
        rows = term.rows;
        void api.terminalResize(sessionId, cols, rows).catch(() => undefined);
      });
    });
    observer.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      input.dispose();
      observer.disconnect();
      if (opened) void api.terminalClose(sessionId).catch(() => undefined);
      term.dispose();
    };
  }, [id]);

  return <div className="term" ref={ref} />;
}
