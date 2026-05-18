import type { GoogleSpreadsheetSelection, MediaFormat, Region, Settings } from '../types';

type SettingsModalProps = {
    open: boolean;
    settings: Settings;
    scoreEnabled: boolean;
    googleSheetsConfigured: boolean;
    googleSheetsDisabledReason: string | null;
    googleSpreadsheetSelection: GoogleSpreadsheetSelection | null;
    isConnectingGoogleSheet: boolean;
    onClose(): void;
    onChange(settings: Settings): void;
    onChooseGoogleSheet(): void;
    onClearGoogleSheet(): void;
};

const regions: { value: Region; label: string }[] = [
    {value: 'eu', label: 'Europe'},
    {value: 'naw', label: 'NA West'},
    {value: 'nae', label: 'NA East'}
];

const mediaFormats: { value: MediaFormat; label: string }[] = [
    {value: 'video', label: 'Video'},
    {value: 'audio', label: 'Audio'},
    {value: 'full', label: 'Full songs'}
];

export function SettingsModal({
    open,
    settings,
    scoreEnabled,
    googleSheetsConfigured,
    googleSheetsDisabledReason,
    googleSpreadsheetSelection,
    isConnectingGoogleSheet,
    onClose,
    onChange,
    onChooseGoogleSheet,
    onClearGoogleSheet
}: SettingsModalProps) {
    if (!open) {
        return null;
    }

    return (
        <>
            <div className="modal-overlay" onClick={onClose}/>
            <div className="modal">
                <h2>Settings</h2>
                <div className="option-group">
                    <p>Format:</p>
                    {mediaFormats.map((format) => (
                        <button
                            key={format.value}
                            className={`option-button${settings.mediaFormat === format.value ? ' active' : ''}`}
                            type="button"
                            onClick={() => onChange({...settings, mediaFormat: format.value})}
                        >
                            {format.label}
                        </button>
                    ))}
                </div>
                <div className="option-group">
                    <p>Region:</p>
                    {regions.map((region) => (
                        <button
                            key={region.value}
                            className={`option-button${settings.region === region.value ? ' active' : ''}`}
                            type="button"
                            onClick={() => onChange({...settings, region: region.value})}
                        >
                            {region.label}
                        </button>
                    ))}
                </div>
                {scoreEnabled ? (
                    <div className="option-group">
                        <p>
                            Auto-skip score gap:
                            <span className="help-icon" data-tooltip="Skips a comparison when both songs have scores and their score difference is at least this value. Equal scores never skip."
                                  aria-label="Auto-skip score gap help"
                            >?</span>
                        </p>
                        <input
                            className="setting-number-input"
                            type="number"
                            min="0"
                            max="10"
                            value={settings.autoSkipScoreDifference}
                            onChange={(event) => {
                                const value = event.currentTarget.valueAsNumber;
                                onChange({
                                    ...settings,
                                    autoSkipScoreDifference: Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 10
                                });
                            }}
                        />
                    </div>
                ) : null}
                {googleSheetsConfigured ? (
                    <div className="option-group">
                        <p>Google Sheet:</p>
                        <div className="setting-value">
                            {googleSpreadsheetSelection ? googleSpreadsheetSelection.name : 'No spreadsheet selected'}
                        </div>
                        <button
                            className="option-button"
                            type="button"
                            onClick={onChooseGoogleSheet}
                            disabled={isConnectingGoogleSheet || Boolean(googleSheetsDisabledReason)}
                            title={googleSheetsDisabledReason ?? undefined}
                        >
                            {isConnectingGoogleSheet
                                ? 'Connecting...'
                                : googleSheetsDisabledReason
                                    ? 'Google setup missing'
                                    : googleSpreadsheetSelection
                                        ? 'Change Sheet'
                                        : 'Choose Sheet'}
                        </button>
                        {googleSpreadsheetSelection ? (
                            <button className="option-button" type="button" onClick={onClearGoogleSheet}>
                                Forget Sheet
                            </button>
                        ) : null}
                    </div>
                ) : null}
                <button className="close-button" type="button" onClick={onClose}>
                    Close
                </button>
            </div>
        </>
    );
}
