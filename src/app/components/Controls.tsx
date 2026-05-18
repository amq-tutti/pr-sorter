import type { SavedProgressKind, Screen } from "../types";

type ControlsProps = {
  screen: Screen;
  savedKind: SavedProgressKind;
  googleSheetsEnabled: boolean;
  googleSheetsDisabledReason: string | null;
  googleSheetsSetupReason: string | null;
  isWritingSheet: boolean;
  onOpenSettings(): void;
  onOpenHistory(): void;
  onStart(): void;
  onLoad(): void;
  onUndo(): void;
  onCopyRanks(): void;
  onWriteRanksToSheet(): void;
  onSetupGoogleSheet(): void;
};

export function Controls({
  screen,
  savedKind,
  googleSheetsEnabled,
  googleSheetsDisabledReason,
  googleSheetsSetupReason,
  isWritingSheet,
  onOpenSettings,
  onOpenHistory,
  onStart,
  onLoad,
  onUndo,
  onCopyRanks,
  onWriteRanksToSheet,
  onSetupGoogleSheet,
}: ControlsProps) {
  return (
    <div className="button-container">
      {screen === "sorting" ? (
        <button className="basic-button" type="button" onClick={onOpenHistory}>
          History
        </button>
      ) : null}
      <button className="basic-button" type="button" onClick={onOpenSettings}>
        Settings
      </button>
      {screen === "landing" ? (
        <button className="basic-button" type="button" onClick={onStart}>
          Start
        </button>
      ) : null}
      {screen === "landing" && savedKind !== "none" ? (
        <button className="basic-button" type="button" onClick={onLoad}>
          {savedKind === "complete" ? "Show Results" : "Continue"}
        </button>
      ) : null}
      {screen === "sorting" ? (
        <button className="basic-button" type="button" onClick={onUndo}>
          Undo
        </button>
      ) : null}
      {screen === "complete" ? (
        <button className="copy-button" type="button" onClick={onCopyRanks}>
          Copy ranks to clipboard
        </button>
      ) : null}
      {screen === "complete" && googleSheetsEnabled ? (
        <button
          className="copy-button"
          type="button"
          onClick={googleSheetsSetupReason ? onSetupGoogleSheet : onWriteRanksToSheet}
          disabled={isWritingSheet || Boolean(googleSheetsDisabledReason)}
          title={googleSheetsDisabledReason ?? googleSheetsSetupReason ?? undefined}
        >
          {isWritingSheet
            ? "Writing to Google Sheet..."
            : googleSheetsDisabledReason
              ? googleSheetsDisabledReason
              : googleSheetsSetupReason
                ? googleSheetsSetupReason
              : "Write ranks to Google Sheet"}
        </button>
      ) : null}
    </div>
  );
}
