import { useEffect, useState } from "react";
import { create } from "zustand";
import { LuLogOut, LuPlus, LuTrash2 } from "react-icons/lu";
import { useAuthStore } from "../../lib/auth";
import { useGithubStore } from "../../lib/github";
import { useChatStore } from "../../lib/store";
import { formatUsd } from "../../lib/utils";
import type { GithubAccountDto } from "../../lib/api";
import { Avatar } from "../common/Avatar";
import { Button, IconButton } from "../ui/Button";
import { ConfirmDialog, Dialog } from "../ui/Dialog";

export const useAccountDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function AccountDialog() {
  const open = useAccountDialog((s) => s.open);
  const setOpen = useAccountDialog((s) => s.setOpen);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const budget = useChatStore((s) => s.budget);
  const accounts = useGithubStore((s) => s.accounts);
  const loaded = useGithubStore((s) => s.loaded);
  const connecting = useGithubStore((s) => s.connecting);
  const disconnectingId = useGithubStore((s) => s.disconnectingId);
  const error = useGithubStore((s) => s.error);
  const refresh = useGithubStore((s) => s.refresh);
  const connect = useGithubStore((s) => s.connect);
  const disconnect = useGithubStore((s) => s.disconnect);
  const clearError = useGithubStore((s) => s.clearError);
  const [confirmTarget, setConfirmTarget] = useState<GithubAccountDto | null>(null);

  useEffect(() => {
    if (open) {
      clearError();
      void refresh();
    }
  }, [open, clearError, refresh]);

  const confirmDisconnect = async () => {
    if (!confirmTarget) return;
    await disconnect(confirmTarget.id);
    setConfirmTarget(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen} title="Account">
        <div className="dialog-body">
          <div className="account">
            <Avatar src={user?.avatarUrl} fallback={user?.initial ?? "?"} />
            <span className="account-text">
              <span className="account-name truncate">{user?.displayName ?? "You"}</span>
              <span className="account-mail truncate">{user?.email ?? "Signed in"}</span>
            </span>
          </div>

          {budget && (
            <div className="usage">
              <div className="usage-top">
                <span>Usage this {budget.period}</span>
                <span>
                  {budget.limitUsd > 0
                    ? `${formatUsd(budget.costUsd)} / ${formatUsd(budget.limitUsd)}`
                    : formatUsd(budget.costUsd)}
                </span>
              </div>
              <div className="usage-track">
                <div
                  className="usage-fill"
                  style={{
                    transform: `scaleX(${budget.limitUsd > 0 ? Math.min(1, Math.max(0, budget.costUsd / budget.limitUsd)) : 0})`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="section-card">
            <div className="section-head">
              <span className="section-title">GitHub accounts</span>
              <Button variant="subtle" size="sm" disabled={connecting} onClick={() => void connect()}>
                {connecting ? <span className="spinner" /> : <LuPlus />}
                <span>{connecting ? "Waiting…" : accounts.length > 0 ? "Add account" : "Connect"}</span>
              </Button>
            </div>
            {error && <div className="alert">{error}</div>}
            {!loaded ? (
              <div className="empty">
                <span className="spinner" />
              </div>
            ) : accounts.length === 0 ? (
              <p className="dialog-copy">No GitHub accounts connected. Connect one to open or create cloud repositories.</p>
            ) : (
              <div className="gh-list">
                {accounts.map((acc) => (
                  <div key={acc.id} className="gh-row">
                    <Avatar src={acc.avatarUrl} fallback={acc.login.slice(0, 1).toUpperCase()} />
                    <div className="gh-row-text">
                      <span className="gh-row-login truncate">@{acc.login}</span>
                      {acc.email && <span className="gh-row-sub truncate">{acc.email}</span>}
                    </div>
                    <IconButton
                      label={`Disconnect @${acc.login}`}
                      size="sm"
                      disabled={disconnectingId !== null}
                      onClick={() => setConfirmTarget(acc)}
                    >
                      <LuTrash2 />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="dialog-foot">
          <Button
            variant="subtle"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LuLogOut />
            <span>Sign out</span>
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(next) => !next && setConfirmTarget(null)}
        title="Disconnect GitHub account?"
        description={
          confirmTarget
            ? `Remove @${confirmTarget.login} from Orch? Cloud projects linked to this account will require reconnecting before opening their sandbox.`
            : ""
        }
        confirmLabel="Disconnect"
        pending={disconnectingId !== null}
        onConfirm={confirmDisconnect}
      />
    </>
  );
}
