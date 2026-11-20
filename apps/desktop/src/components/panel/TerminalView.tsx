import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import * as api from "../../lib/api";

const THEME = {
  background: "#191a1b",
  foreground: "#bfbfbf",
  cursor: "#bfbfbf",
  cursorAccent: "#191a1b",
  selectionBackground: "rgba(57, 148, 188, 0.3)",
  black: "#242526",
  red: "#f48771",
  green: "#73c991",
  yellow: "#e5ba7d",
  blue: "#57a3f8",
  magenta: "#ad80d7",
  cyan: "#48a0c7",
  white: "#bfbfbf",
  brightBlack: "#7b7e80",
  brightRed: "#ff9d8a",
  brightGreen: "#86cf86",
  brightYellow: "#f0c987",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#7dc4e0",
  brightWhite: "#e6e6e6",
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
