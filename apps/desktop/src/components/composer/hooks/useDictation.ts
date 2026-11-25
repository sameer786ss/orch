import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import * as api from "../../../lib/api";
import { extractPromptFromDoc } from "../MentionNode";

const STOP_WAIT_TIMEOUT_MS = 15_000;

export function useDictation({
  editorRef,
  setNotice,
}: {
  editorRef: React.RefObject<Editor | null>;
  setNotice: (notice: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const pendingStopRef = useRef<{ resolve: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);

  const resolvePendingStop = useCallback(() => {
    const pending = pendingStopRef.current;
    if (!pending) return;
    pendingStopRef.current = null;
    clearTimeout(pending.timer);
    pending.resolve();
  }, []);

  useEffect(() => resolvePendingStop, [resolvePendingStop]);

  const stopDictation = useCallback(async () => {
    if (!recordingRef.current) return;
    const waitForTranscript = new Promise<void>((resolve) => {
      resolvePendingStop();
      const timer = setTimeout(() => {
        if (pendingStopRef.current?.resolve === resolve) {
          pendingStopRef.current = null;
          setRecording(false);
          resolve();
        }
      }, STOP_WAIT_TIMEOUT_MS);
      pendingStopRef.current = { resolve, timer };
    });

    try {
      await api.stopDictation();
      await waitForTranscript;
    } catch (e) {
      resolvePendingStop();
      setRecording(false);
      setNotice(api.errorMessage(e));
    }
  }, [resolvePendingStop, setNotice]);

  const toggleDictation = useCallback(async () => {
    if (recordingRef.current) {
      await stopDictation();
      return;
    }
    setRecording(true);
    setNotice(null);
    try {
      await api.startDictation((event) => {
        setRecording(false);
        if (event.type === "final") {
          const editor = editorRef.current;
          if (event.text && editor) {
            const currentText = extractPromptFromDoc(editor.state.doc);
            const needsSpace = currentText.length > 0 && !/\s$/.test(currentText);
            editor
              .chain()
              .focus()
              .insertContent(needsSpace ? ` ${event.text}` : event.text)
              .run();
          }
        } else {
          setNotice(event.message);
        }
        resolvePendingStop();
      });
    } catch (e) {
      setRecording(false);
      resolvePendingStop();
      setNotice(api.errorMessage(e));
    }
  }, [editorRef, resolvePendingStop, setNotice, stopDictation]);

  return { recording, toggleDictation, stopDictation };
}
