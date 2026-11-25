import { useId, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LuX } from "react-icons/lu";
import { Button, IconButton } from "./Button";
import { OverlayPresence } from "./overlay";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  size?: "sm" | "md";
  className?: string;
  showHeader?: boolean;
  showClose?: boolean;
  preventDismiss?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
  children: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  className,
  showHeader = true,
  showClose = true,
  preventDismiss = false,
  onOpenAutoFocus,
  children,
}: DialogProps) {
  const descId = useId();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scrim" />
        <DialogPrimitive.Content
          className={className ? `dialog ${className}` : "dialog"}
          data-size={size}
          aria-describedby={description ? descId : undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          onPointerDownOutside={preventDismiss ? (e) => e.preventDefault() : undefined}
          onInteractOutside={preventDismiss ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={preventDismiss ? (e) => e.preventDefault() : undefined}
        >
          <OverlayPresence />
          {showHeader && (title || showClose) && (
            <div className="dialog-head">
              <div className="dialog-titles">
                {title && <DialogPrimitive.Title>{title}</DialogPrimitive.Title>}
                {description && (
                  <DialogPrimitive.Description id={descId} className="dialog-sub">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              {showClose && (
                <DialogPrimitive.Close asChild>
                  <IconButton label="Close" size="sm">
                    <LuX />
                  </IconButton>
                </DialogPrimitive.Close>
              )}
            </div>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={title}
      size="sm"
      showClose={!pending}
      preventDismiss
    >
      <div className="dialog-body">
        <p className="dialog-copy">{description}</p>
      </div>
      <div className="dialog-foot">
        <Button variant="subtle" disabled={pending} onClick={() => onOpenChange(false)}>
          {cancelLabel}
        </Button>
        <Button variant={variant} disabled={pending} onClick={() => void onConfirm()}>
          {pending && <span className="spinner" />}
          <span>{confirmLabel}</span>
        </Button>
      </div>
    </Dialog>
  );
}
