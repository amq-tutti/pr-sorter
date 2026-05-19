import { useEffect, useState } from "react";

type ScoreColumnModalProps = {
  open: boolean;
  initialHeader: string | null;
  isPicking?: boolean;
  onConfirm(header: string | null): void;
  onCancel(): void;
};

export function ScoreColumnModal({ open, initialHeader, isPicking, onConfirm, onCancel }: ScoreColumnModalProps) {
  const [hasColumn, setHasColumn] = useState(initialHeader !== null);
  const [columnName, setColumnName] = useState(initialHeader ?? "");

  useEffect(() => {
    if (open) {
      setHasColumn(initialHeader !== null);
      setColumnName(initialHeader ?? "");
    }
  }, [open, initialHeader]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="modal-overlay" onClick={onCancel} />
      <div className="modal score-column-modal">
        <h2>Score Column</h2>
        <div className="option-group">
          <p>Does your sheet have a score column?</p>
          <label className="radio-option">
            <input
              type="radio"
              name="hasColumn"
              checked={!hasColumn}
              onChange={() => setHasColumn(false)}
            />
            No score column
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="hasColumn"
              checked={hasColumn}
              onChange={() => setHasColumn(true)}
            />
            I have added a score column
          </label>
        </div>
        {hasColumn ? (
          <div className="option-group">
            <p>
              Column name
              <span
                className="help-icon"
                data-tooltip="Must match the header in your sheet exactly, including capitalization."
                aria-label="Column name help"
              >?</span>
            </p>
            <input
              className="setting-text-input"
              type="text"
              value={columnName}
              onChange={(e) => setColumnName(e.currentTarget.value)}
              placeholder="e.g. My Score"
              autoFocus
            />
          </div>
        ) : null}
        <div className="modal-actions">
          <button
            className="option-button modal-actions__button"
            type="button"
            onClick={() => onConfirm(hasColumn ? (columnName.trim() || null) : null)}
            disabled={hasColumn && !columnName.trim()}
          >
            {isPicking ? "Select Sheet" : "Confirm"}
          </button>
          <button
            className="option-button modal-actions__button modal-actions__button--cancel"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
