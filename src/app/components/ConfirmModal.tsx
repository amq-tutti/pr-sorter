type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <>
      <div className="modal-overlay" onClick={onCancel} />
      <div className="modal confirm-modal">
        <h2>{title}</h2>
        <p className="confirm-modal__message">{message}</p>
        <div className="modal-actions">
          <button className="basic-button" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="basic-button" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
