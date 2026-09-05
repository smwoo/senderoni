"use client";

import { AlertDialog, Button } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";

type ConfirmDeleteDialogProps = {
  state: UseOverlayStateReturn;
  /** What is being deleted, as the noun the heading names ("area", "climb",
   * "send"). */
  noun: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isPending: boolean;
  /** Failure message from the last delete attempt, if any — shown inline so
   * the viewer can retry or cancel. */
  error?: string | null;
  /** Set instead of closing the dialog when a non-admin's delete was queued
   * for admin review rather than applied — swaps the confirm/cancel footer
   * for a single acknowledgement, since nothing was actually deleted yet. */
  pendingNotice?: string | null;
};

/** The one delete confirmation: a centered alert dialog, not a bottom sheet
 * — a yes/no is a question the page asks, and a form-sized drawer holding
 * one sentence and two buttons read as a page takeover. Every destructive
 * action in the app confirms through this so the wording, the button order,
 * and the danger styling never drift between entities. */
export function ConfirmDeleteDialog({
  state,
  noun,
  title,
  description = "This can't be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  isPending,
  error,
  pendingNotice,
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog.Backdrop
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (!isPending) state.setOpen(open);
      }}
    >
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>
              {pendingNotice ? "Submitted for review" : (title ?? `Delete this ${noun}?`)}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            {pendingNotice ? (
              <p className="text-sm text-muted">{pendingNotice}</p>
            ) : (
              <>
                <p className="text-sm text-muted">{description}</p>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
              </>
            )}
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex justify-end gap-2">
            {pendingNotice ? (
              <Button variant="ghost" onPress={state.close}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="ghost" onPress={state.close} isDisabled={isPending}>
                  {cancelLabel}
                </Button>
                <Button variant="danger" onPress={onConfirm} isDisabled={isPending}>
                  {isPending ? "Saving…" : confirmLabel}
                </Button>
              </>
            )}
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
