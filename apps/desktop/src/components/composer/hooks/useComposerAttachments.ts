import { useCallback, useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "../../../lib/api";
import * as utils from "../../../lib/utils";

export function useComposerAttachments({
  modelSupportsImages,
  modelName,
  setNotice,
}: {
  modelSupportsImages: boolean;
  modelName: string | undefined;
  setNotice: (notice: string | null) => void;
}) {
  const [attachments, setAttachments] = useState<api.AttachmentRef[]>([]);

  const addAttachments = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      const unsupportedFormat = paths.filter((path) => !utils.isSupportedAttachment(path));
      const unsupportedImage = paths.filter((path) => utils.isImagePath(path) && !modelSupportsImages);
      const accepted = paths.filter(
        (path) => utils.isSupportedAttachment(path) && !(utils.isImagePath(path) && !modelSupportsImages)
      );
      setAttachments((previous) => {
        const known = new Set(previous.map((a) => a.path));
        const next = [...previous];
        for (const path of accepted) {
          if (known.has(path)) continue;
          known.add(path);
          next.push({
            path,
            name: utils.getBasename(path),
            isImage: utils.isImagePath(path),
          });
        }
        return next;
      });
      if (unsupportedFormat.length > 0) {
        setNotice(
          `Unsupported format: ${unsupportedFormat.map(utils.getBasename).join(", ")}. Supported formats: PNG, JPG, JPEG, WEBP, HEIC, HEIF, and PDF.`
        );
      } else if (unsupportedImage.length > 0) {
        setNotice(
          `${modelName ?? "This model"} cannot read images: ${unsupportedImage.map(utils.getBasename).join(", ")}`
        );
      } else {
        setNotice(null);
      }
    },
    [modelSupportsImages, modelName, setNotice]
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        addAttachments(event.payload.paths ?? []);
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addAttachments]);

  const pickFiles = useCallback(
    async (imagesOnly: boolean) => {
      const selected = await openDialog({
        multiple: true,
        filters: imagesOnly
          ? [{ name: "Images", extensions: [...utils.IMAGE_EXTENSIONS] }]
          : [
              { name: "Documents", extensions: [...utils.DOCUMENT_EXTENSIONS] },
              { name: "Images", extensions: [...utils.IMAGE_EXTENSIONS] },
              { name: "All Supported Files", extensions: [...utils.SUPPORTED_ATTACHMENT_EXTENSIONS] },
            ],
      });
      if (!selected) return;
      addAttachments(Array.isArray(selected) ? selected : [selected]);
    },
    [addAttachments]
  );

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    setAttachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    pickFiles,
  };
}
