import { memo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LuX } from "react-icons/lu";
import { useImageDataUrl } from "../../lib/images";
import { FileIcon } from "./FileIcon";

interface AttachmentProps {
  name: string;
  isImage: boolean;
  path?: string;
  dataUrl?: string;
  onOpen?: () => void;
  onRemove?: () => void;
}

function isLocalAbsolutePath(path?: string): path is string {
  return Boolean(path && !path.startsWith("cloud://") && /^([a-zA-Z]:[\\/]|\/)/.test(path));
}

export const Attachment = memo(function Attachment({ name, isImage, path, dataUrl, onOpen, onRemove }: AttachmentProps) {
  const localAssetSrc = isImage && !dataUrl && isLocalAbsolutePath(path) ? convertFileSrc(path) : null;
  const fetched = useImageDataUrl(isImage && !dataUrl && !localAssetSrc ? path : null);
  const src = dataUrl ?? localAssetSrc ?? fetched.src;

  return (
    <div
      className="attach"
      title={path ?? name}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen || event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="attach-thumb">{isImage && src ? <img src={src} alt={name} /> : <FileIcon name={name} />}</span>
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          className="attach-remove"
          aria-label={`Remove ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <LuX />
        </button>
      )}
    </div>
  );
});
