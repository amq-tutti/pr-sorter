import { useRef } from 'react';
import type { LegacySorterSaveInfo } from '../legacySorterMigration';
import type { GoogleSpreadsheetSelection, MediaFormat, Region, Settings, SorterAutoPlayMode } from '../types';

type SettingsModalProps = {
    open: boolean;
    settings: Settings;
    scoreEnabled: boolean;
    googleSheetsConfigured: boolean;
    googleSheetsDisabledReason: string | null;
    googleSpreadsheetSelection: GoogleSpreadsheetSelection | null;
    isConnectingGoogleSheet: boolean;
    legacySorterSaveInfo: LegacySorterSaveInfo | null;
    onClose(): void;
    onChange(settings: Settings): void;
    onChooseGoogleSheet(): void;
    onClearGoogleSheet(): void;
    onExportSorterState(): void;
    onImportSorterState(file: File): void;
    onMigrateLegacySorterSave(): void;
};

const regions: { value: Region; label: string }[] = [
    {value: 'eu', label: 'Europe'},
    {value: 'naw', label: 'NA West'},
    {value: 'nae', label: 'NA East'},
];

const mediaFormats: { value: MediaFormat; label: string }[] = [
    {value: 'video', label: 'Video'},
    {value: 'audio', label: 'Audio'},
    {value: 'full', label: 'Full songs'},
];

const sorterAutoPlayModes: { value: SorterAutoPlayMode; label: string }[] = [
    {value: 'off', label: 'Off'},
    {value: 'left', label: 'Left'},
    {value: 'right', label: 'Right'},
    {value: 'picked', label: 'Picked side'},
    {value: 'higher-score', label: 'Higher score'},
];

export function SettingsModal({
    open,
    settings,
    scoreEnabled,
    googleSheetsConfigured,
    googleSheetsDisabledReason,
    googleSpreadsheetSelection,
    isConnectingGoogleSheet,
    legacySorterSaveInfo,
    onClose,
    onChange,
    onChooseGoogleSheet,
    onClearGoogleSheet,
    onExportSorterState,
    onImportSorterState,
    onMigrateLegacySorterSave,
}: SettingsModalProps) {
    const importInputRef = useRef<HTMLInputElement | null>(null);

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
                            step="0.01"
                            value={settings.autoSkipScoreDifference}
                            onChange={(event) => {
                                const value = event.currentTarget.valueAsNumber;
                                onChange({
                                    ...settings,
                                    autoSkipScoreDifference: Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 10,
                                });
                            }}
                        />
                    </div>
                ) : null}
                <div className="option-group">
                    <p>
                        Sorter autoplay:
                        <span className="help-icon"
                              data-tooltip="Chooses which song starts autoplay for each comparison. After that, autoplay swaps between the two songs until sorting moves to another comparison."
                              aria-label="Sorter autoplay help"
                        >?</span>
                    </p>
                    {sorterAutoPlayModes.map((mode) => (
                        <button
                            key={mode.value}
                            className={`option-button${settings.sorterAutoPlayMode === mode.value ? ' active' : ''}`}
                            type="button"
                            onClick={() => onChange({...settings, sorterAutoPlayMode: mode.value})}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
                {googleSheetsConfigured ? (
                    <div className="option-group">
                        <p>Google Sheet:</p>
                        <div className="setting-value">
                            {googleSpreadsheetSelection ? (
                                <a
                                    className="setting-value-link"
                                    href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(googleSpreadsheetSelection.id)}/edit`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {googleSpreadsheetSelection.name}
                                </a>
                            ) : 'No spreadsheet selected'}
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
                <div className="option-group">
                    <p>Sorter state:</p>
                    <button className="option-button" type="button" onClick={onExportSorterState}>
                        Export
                    </button>
                    <button className="option-button" type="button" onClick={() => importInputRef.current?.click()}>
                        Import
                    </button>
                    {legacySorterSaveInfo ? (
                        <>
                            <div className="setting-value">
                                Legacy save found at {legacySorterSaveInfo.legacyPrefix}*
                                {legacySorterSaveInfo.complete ? ' (complete)' : ' (in progress)'}.
                                {!legacySorterSaveInfo.compatible && legacySorterSaveInfo.reason ? (
                                    <span className="setting-warning"> {legacySorterSaveInfo.reason}</span>
                                ) : null}
                            </div>
                            <button
                                className="option-button"
                                type="button"
                                onClick={onMigrateLegacySorterSave}
                                disabled={!legacySorterSaveInfo.compatible}
                            >
                                Migrate Legacy Save
                            </button>
                        </>
                    ) : null}
                    <input
                        ref={importInputRef}
                        className="state-file-input"
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0] ?? null;
                            event.currentTarget.value = '';
                            if (file) {
                                onImportSorterState(file);
                            }
                        }}
                    />
                </div>
                <button className="close-button" type="button" onClick={onClose}>
                    Close
                </button>
            </div>
        </>
    );
}
