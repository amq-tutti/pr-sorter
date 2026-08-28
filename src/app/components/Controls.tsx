import type { SavedProgressKind, Screen } from '../types';

type ControlsProps = {
    screen: Screen;
    savedKind: SavedProgressKind;
    rankSupported: boolean;
    googleSheetsEnabled: boolean;
    googleSheetsDisabledReason: string | null;
    googleSheetsSetupReason: string | null;
    isWritingSheet: boolean;
    canUndo: boolean;
    onOpenSettings(): void;
    onOpenSongList(): void;
    onOpenHistory(): void;
    onOpenPlaylist(): void;
    onExitPlaylist(): void;
    onStart(): void;
    onLoad(): void;
    onUndo(): void;
    onCopyRanks(): void;
    onCopyScores(): void;
    onWriteRanksToSheet(): void;
    onSetupGoogleSheet(): void;
    scoreEnabled: boolean;
};

export function Controls({
    screen,
    savedKind,
    rankSupported,
    googleSheetsEnabled,
    googleSheetsDisabledReason,
    googleSheetsSetupReason,
    isWritingSheet,
    canUndo,
    onOpenSettings,
    onOpenSongList,
    onOpenHistory,
    onOpenPlaylist,
    onExitPlaylist,
    onStart,
    onLoad,
    onUndo,
    onCopyRanks,
    onCopyScores,
    onWriteRanksToSheet,
    onSetupGoogleSheet,
    scoreEnabled,
}: ControlsProps) {
    const rankControls = rankSupported ? (
        <>
            {screen === 'landing' ? (
                <button className="basic-button" type="button" onClick={onStart}>
                    Start
                </button>
            ) : null}
            {screen === 'landing' && savedKind !== 'none' ? (
                <button className="basic-button" type="button" onClick={onLoad}>
                    {savedKind === 'complete' ? 'Show Results' : 'Continue'}
                </button>
            ) : null}
            {screen === 'sorting' && canUndo ? (
                <button className="basic-button" type="button" onClick={onUndo}>
                    Undo
                </button>
            ) : null}
            {screen === 'complete' ? (
                <button className="copy-button" type="button" onClick={onCopyRanks}>
                    Copy ranks to clipboard
                </button>
            ) : null}
            {screen === 'complete' && scoreEnabled ? (
                <button className="copy-button" type="button" onClick={onCopyScores}>
                    Copy scores to clipboard
                </button>
            ) : null}
            {screen === 'complete' && googleSheetsEnabled ? (
                <button
                    className="copy-button"
                    type="button"
                    onClick={googleSheetsSetupReason ? onSetupGoogleSheet : onWriteRanksToSheet}
                    disabled={isWritingSheet || Boolean(googleSheetsDisabledReason)}
                    title={googleSheetsDisabledReason ?? googleSheetsSetupReason ?? undefined}
                >
                    {isWritingSheet
                        ? 'Writing to Google Sheet...'
                        : googleSheetsDisabledReason
                            ? googleSheetsDisabledReason
                            : googleSheetsSetupReason
                                ? googleSheetsSetupReason
                                : 'Write ranks to Google Sheet'}
                </button>
            ) : null}
        </>
    ) : null;

    return (
        <div className="button-container">
            {import.meta.env.DEV ? (
                <a className="basic-button" href="../import">
                    Import (Dev build only)
                </a>
            ) : null}
            {rankSupported && screen === 'playlist' ? (
                <button className="basic-button" type="button" onClick={onExitPlaylist}>
                    Sorter
                </button>
            ) : screen !== 'playlist' ? (
                <button className="basic-button" type="button" onClick={onOpenPlaylist}>
                    Playlist
                </button>
            ) : null}
            {screen === 'sorting' || screen === 'playlist' ? (
                <button className="basic-button" type="button" onClick={onOpenSongList}>
                    Songlist
                </button>
            ) : null}
            {screen === 'sorting' ? (
                <button className="basic-button" type="button" onClick={onOpenHistory}>
                    History
                </button>
            ) : null}
            <button className="basic-button" type="button" onClick={onOpenSettings}>
                Settings
            </button>
            {rankControls}
        </div>
    );
}
