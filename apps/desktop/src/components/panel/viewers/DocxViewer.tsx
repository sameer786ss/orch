import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { errorMessage, readBinaryFile } from "../../../lib/api";
import { ViewerState, ViewerToolbar, useZoom } from "./ViewerToolbar";

export function DocxViewer({ path }: { path: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const zoom = useZoom(0.4, 2, 0.1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    readBinaryFile(path)
      .then(async (buffer) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        const shadow = shadowRef.current ?? host.shadowRoot ?? host.attachShadow({ mode: "open" });
        shadowRef.current = shadow;
        shadow.replaceChildren();
        const styleHost = document.createElement("div");
        const contentHost = document.createElement("div");
        contentHost.style.userSelect = "text";
        shadow.append(styleHost, contentHost);
        await renderAsync(buffer, contentHost, styleHost, {
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          useBase64URL: true,
        });
      })
      .then(
        () => !cancelled && setLoading(false),
        (e) => {
          if (cancelled) return;
          setError(errorMessage(e));
          setLoading(false);
        }
      );
    return () => {
      cancelled = true;
    };
  }, [path]);

  const ready = !loading && !error;

  return (
    <>
      <ViewerToolbar path={path} zoom={ready ? zoom : undefined} />
      <ViewerState loading={loading} error={error} label="Loading document…" />
      <div className="canvas-view" hidden={!ready}>
        <div style={{ transform: `scale(${zoom.zoom})`, transformOrigin: "top center" }}>
          <div ref={hostRef} className="docx-page selectable" />
        </div>
      </div>
    </>
  );
}
