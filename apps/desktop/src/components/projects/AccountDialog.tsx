import { useEffect, useState } from "react";
import { create } from "zustand";
import { LuLogOut, LuPlus, LuTrash2 } from "react-icons/lu";
import { useAuthStore } from "../../lib/auth";
import { useGithubStore } from "../../lib/github";
import { useChatStore } from "../../lib/store";
import { formatUsd } from "../../lib/utils";
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
  const account = useGithubStore((s) => s.account);
  const loaded = useGithubStore((s) => s.loaded);
  const connecting = useGithubStore((s) => s.connecting);
  const disconnecting = useGithubStore((s) => s.disconnecting);
  const error = useGithubStore((s) => s.error);
  const refresh = useGithubStore((s) => s.refresh);
  const connect = useGithubStore((s) => s.connect);
  const disconnect = useGithubStore((s) => s.disconnect);
  const clearError = useGithubStore((s) => s.clearError);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);

  useEffect(() => {
    if (open) {
      clearError();
      void refresh();
    }
  }, [open, clearError, refresh]);

  const confirmDisconnect = async () => {
    await disconnect();
    setConfirmDisconnectOpen(false);
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
              {budget.resetsOn && <span className="usage-reset">Resets {budget.resetsOn}</span>}
            </div>
          )}

          <div className="section-card">
            <div className="section-head">
              <span className="section-title">GitHub</span>
              {!account && (
                <Button variant="subtle" size="sm" disabled={connecting} onClick={() => void connect()}>
                  {connecting ? <span className="spinner" /> : <LuPlus />}
                  <span>{connecting ? "Waiting…" : "Connect"}</span>
                </Button>
              )}
            </div>
            {error && <div className="alert">{error}</div>}
            {!loaded ? (
              <div className="empty">
                <span className="spinner" />
              </div>
            ) : !account ? (
              <p className="dialog-copy">No GitHub account connected. Connect one to open or create cloud repositories.</p>
            ) : (
              <div className="gh-list">
                <div className="gh-row">
                  <Avatar src={account.avatarUrl} fallback={account.login.slice(0, 1).toUpperCase()} />
                  <div className="gh-row-text">
                    <span className="gh-row-login truncate">@{account.login}</span>
                    {account.email && <span className="gh-row-sub truncate">{account.email}</span>}
                  </div>
                  <IconButton
                    label={`Disconnect @${account.login}`}
                    size="sm"
                    disabled={disconnecting}
                    onClick={() => setConfirmDisconnectOpen(true)}
                  >
                    <LuTrash2 />
                  </IconButton>
                </div>
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
        open={confirmDisconnectOpen}
        onOpenChange={setConfirmDisconnectOpen}
        title="Disconnect GitHub account?"
        description={
          account
            ? `Remove @${account.login} from Orch? Cloud projects will require reconnecting GitHub before opening their sandbox.`
            : ""
        }
        confirmLabel="Disconnect"
        pending={disconnecting}
        onConfirm={confirmDisconnect}
      />
    </>
  );
}
