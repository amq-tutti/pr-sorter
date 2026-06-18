import { useMemo, useState } from 'react';
import { chooseGoogleSpreadsheet, getGoogleSheetsAccessToken } from '../google/googleSheetsWriteback';
import { readFirstSheetGrid, type SheetGridCell } from '../google/sheetsClient';
import { GooglePickerCanceledError, GoogleWritebackError } from '../google/types';
import type { AppConfig } from '../app/types';
import type { SongData } from '../songs';
import { inspectSheetHeaders, type ParsedSheetCustomize, parseSheetGrid, type SheetColumnKey, type SheetColumnMapping, type SheetHeaders } from './sheetParser';

type CustomizeImporterProps = {
    config: AppConfig;
};

type ImportState =
    | { status: 'idle' }
    | { status: 'loading'; message: string }
    | { status: 'mapping'; spreadsheetName: string; rows: SheetGridCell[][]; headers: SheetHeaders; mapping: SheetColumnMapping }
    | { status: 'ready'; spreadsheetName: string; parsed: ParsedSheetCustomize }
    | { status: 'done'; spreadsheetName: string; songCount: number }
    | { status: 'error'; message: string };

type CustomizeWriterResponse = {
    error?: string;
    stage?: string;
    detail?: string;
    code?: string;
};

const IMPORT_SUCCESS_STORAGE_KEY = 'customize-import:last-success';

export function CustomizeImporter({config}: CustomizeImporterProps) {
    const [state, setState] = useState<ImportState>(() => loadImportSuccessState());
    const appHref = useMemo(() => appRouteHref(), []);

    const writebackConfig = useMemo(() => {
        const googleSheets = config.googleSheets;
        const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

        if (!googleSheets || !apiKey) {
            return null;
        }

        return {
            ...googleSheets,
            apiKey,
            tokenStorageKey: `${config.localStoragePrefix}:google-oauth-access-token`,
        };
    }, [config.googleSheets, config.localStoragePrefix]);

    async function selectSheet(): Promise<void> {
        if (!writebackConfig) {
            setState({status: 'error', message: 'Google integration is not configured.'});
            return;
        }

        try {
            setState({status: 'loading', message: 'Opening Google Picker...'});
            const spreadsheet = await chooseGoogleSpreadsheet(writebackConfig);

            setState({status: 'loading', message: 'Reading the first worksheet...'});
            const token = await getGoogleSheetsAccessToken(writebackConfig);
            const grid = await readFirstSheetGrid(spreadsheet.id, token);
            const headers = inspectSheetHeaders(grid.rows);
            const mapping = headers.detected;

            setState({status: 'mapping', spreadsheetName: spreadsheet.name, rows: grid.rows, headers, mapping});
        } catch (error) {
            if (error instanceof GooglePickerCanceledError) {
                setState({status: 'idle'});
                return;
            }

            console.error('Error importing Google Sheet:', error);
            setState({status: 'error', message: errorMessage(error)});
        }
    }

    function updateMapping(key: SheetColumnKey, value: string): void {
        if (state.status !== 'mapping') {
            return;
        }

        setState({
            ...state,
            mapping: {
                ...state.mapping,
                [key]: value || undefined,
            },
        });
    }

    function confirmMapping(): void {
        if (state.status !== 'mapping') {
            return;
        }

        try {
            const parsed = parseSheetGrid(state.rows, state.headers, state.mapping);
            setState({status: 'ready', spreadsheetName: state.spreadsheetName, parsed});
        } catch (error) {
            setState({status: 'error', message: errorMessage(error)});
        }
    }

    async function writeCustomize(parsed: ParsedSheetCustomize, spreadsheetName: string): Promise<void> {
        try {
            setState({status: 'loading', message: 'Writing customize files...'});
            const response = await fetch('/api/customize-from-sheet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: `${spreadsheetName} Sorter`,
                    description: `Party rank sorter for ${spreadsheetName}.`,
                    localStoragePrefix: slugify(spreadsheetName),
                    rankSupported: parsed.rankSupported,
                    googleSheets: {
                        clientId: config.googleSheets?.clientId,
                        appId: config.googleSheets?.appId,
                        idColumnHeader: parsed.idColumnHeader,
                        rankColumnHeader: parsed.rankColumnHeader,
                        scoreColumnHeader: parsed.scoreColumnHeader,
                    },
                    songs: parsed.songs,
                }),
            });

            const responseText = await response.text();
            const result = parseWriterResponse(responseText);
            if (!response.ok) {
                throw new Error(formatWriterError(response.status, response.statusText, responseText, result));
            }

            const doneState = {status: 'done', spreadsheetName, songCount: parsed.songs.length} satisfies ImportState;
            saveImportSuccessState(doneState);
            setState(doneState);
        } catch (error) {
            console.error('Error writing customize files:', error);
            setState({status: 'error', message: errorMessage(error)});
        }
    }

    return (
        <main className="import-page">
            <section className="import-panel">
                <div>
                    <h1>Customize from Google Sheet</h1>
                    <p>
                        Select a sheet formatted like <code>Sheet1.html</code>. This local-only page writes
                        <code> customize/config.ts</code> and <code>customize/songList.ts</code>.
                    </p>
                </div>

                <div className="import-actions">
                    <button className="basic-button" type="button" onClick={() => void selectSheet()} disabled={state.status === 'loading'}>
                        Select Google Sheet
                    </button>
                    <a className="import-link" href={appHref} onClick={clearImportSuccessState}>
                        Back to app
                    </a>
                </div>

                {state.status === 'loading' ? <Status message={state.message}/> : null}
                {state.status === 'error' ? <Status message={state.message} tone="error"/> : null}
                {state.status === 'done' ? (
                    <Status message={`Wrote ${state.songCount} songs from ${state.spreadsheetName}. Restart the dev server if Vite does not pick up the changed customize files.`} tone="success"/>
                ) : null}
                {state.status === 'ready' ? (
                    <Preview
                        spreadsheetName={state.spreadsheetName}
                        songs={state.parsed.songs}
                        onWrite={() => void writeCustomize(state.parsed, state.spreadsheetName)}
                    />
                ) : null}
                {state.status === 'mapping' ? (
                    <ColumnMappingForm
                        headers={state.headers.headers}
                        mapping={state.mapping}
                        fallbackAnimeName={fallbackAnimeName(config)}
                        onChange={updateMapping}
                        onConfirm={confirmMapping}
                    />
                ) : null}
            </section>
        </main>
    );
}

function ColumnMappingForm({
    headers,
    mapping,
    fallbackAnimeName,
    onChange,
    onConfirm,
}: {
    headers: string[];
    mapping: SheetColumnMapping;
    fallbackAnimeName: string;
    onChange(key: SheetColumnKey, value: string): void;
    onConfirm(): void;
}) {
    const missingRequired = (['id', 'song'] as const).filter((key) => !mapping[key]);
    const hasMediaColumn = Boolean(mapping.video || mapping.mp3 || mapping.full);
    const hasRankOrScoreColumn = Boolean(mapping.rank || mapping.score);

    return (
        <div className="import-mapping">
            <h2>Map Sheet Columns</h2>
            <p>
                Review the detected columns before previewing the import. Leave Anime blank to use <strong>{fallbackAnimeName}</strong>. Leave Rank blank to disable rank writeback. Leave Score blank to disable score support. At least one media column is required, and at least one of Rank or Score is required.
            </p>
            <div className="import-mapping__grid">
                <ColumnSelect label="ID" value={mapping.id ?? ''} headers={headers} required onChange={(value) => onChange('id', value)}/>
                <ColumnSelect label="Song name" value={mapping.song ?? ''} headers={headers} required onChange={(value) => onChange('song', value)}/>
                <ColumnSelect label="Video link" value={mapping.video ?? ''} headers={headers} onChange={(value) => onChange('video', value)}/>
                <ColumnSelect label="MP3 link" value={mapping.mp3 ?? ''} headers={headers} onChange={(value) => onChange('mp3', value)}/>
                <ColumnSelect label="Full link" value={mapping.full ?? ''} headers={headers} onChange={(value) => onChange('full', value)}/>
                <ColumnSelect label="Rank" value={mapping.rank ?? ''} headers={headers} onChange={(value) => onChange('rank', value)}/>
                <ColumnSelect label="Anime" value={mapping.anime ?? ''} headers={headers} onChange={(value) => onChange('anime', value)}/>
                <ColumnSelect label="Score" value={mapping.score ?? ''} headers={headers} onChange={(value) => onChange('score', value)}/>
            </div>
            {missingRequired.length > 0 ? <Status message={`Required columns still missing: ${missingRequired.join(', ')}.`} tone="error"/> : null}
            {!hasMediaColumn ? <Status message="Select at least one of Video link, MP3 link, or Full link." tone="error"/> : null}
            {!hasRankOrScoreColumn ? <Status message="Select at least one of Rank or Score." tone="error"/> : null}
            <button className="basic-button" type="button" onClick={onConfirm} disabled={missingRequired.length > 0 || !hasMediaColumn || !hasRankOrScoreColumn}>
                Preview songs
            </button>
        </div>
    );
}

function ColumnSelect({
    label,
    value,
    headers,
    required = false,
    onChange,
}: {
    label: string;
    value: string;
    headers: string[];
    required?: boolean;
    onChange(value: string): void;
}) {
    return (
        <label className="import-field">
      <span>
        {label}
          {required ? ' *' : ''}
      </span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="">None</option>
                {headers
                    .filter(Boolean)
                    .map((header) => (
                        <option key={header} value={header}>
                            {header}
                        </option>
                    ))}
            </select>
        </label>
    );
}

function Preview({
    spreadsheetName,
    songs,
    onWrite,
}: {
    spreadsheetName: string;
    songs: SongData[];
    onWrite(): void;
}) {
    return (
        <div className="import-preview">
            <div className="import-preview__header">
                <div>
                    <strong>{spreadsheetName}</strong>
                    <span>{songs.length} songs parsed</span>
                </div>
                <button className="basic-button" type="button" onClick={onWrite}>
                    Write customize files
                </button>
            </div>
            <div className="import-table-wrap">
                <table>
                    <thead>
                    <tr>
                        <th>ID</th>
                        <th>Anime</th>
                        <th>Song</th>
                        <th>Video</th>
                        <th>Full</th>
                        <th>MP3</th>
                    </tr>
                    </thead>
                    <tbody>
                    {songs.slice(0, 25).map((song) => (
                        <tr key={song.id}>
                            <td>{song.id}</td>
                            <td>{song.anime ?? ''}</td>
                            <td>{song.name}</td>
                            <td>{song.video ? 'yes' : 'no'}</td>
                            <td>{song.full ? 'yes' : 'no'}</td>
                            <td>{song.mp3 ? 'yes' : 'no'}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Status({message, tone = 'info'}: { message: string; tone?: 'info' | 'error' | 'success' }) {
    return <div className={`import-status import-status--${tone}`}>{message}</div>;
}

function slugify(value: string): string {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return slug || 'custom-sorter';
}

function appRouteHref(): string {
    return `${window.location.pathname.replace(/\/import\/?$/, '/')}${window.location.search}${window.location.hash}`;
}

function fallbackAnimeName(config: AppConfig): string {
    return config.title.replace(/\s+Sorter$/i, '').trim() || config.title;
}

function errorMessage(error: unknown): string {
    if (error instanceof GoogleWritebackError || error instanceof Error) {
        return error.message;
    }

    return 'Import failed.';
}

function parseWriterResponse(responseText: string): CustomizeWriterResponse | null {
    if (!responseText.trim()) {
        return null;
    }

    try {
        return JSON.parse(responseText) as CustomizeWriterResponse;
    } catch {
        return null;
    }
}

function formatWriterError(
    status: number,
    statusText: string,
    responseText: string,
    result: CustomizeWriterResponse | null,
): string {
    const prefix = `Could not write customize files (HTTP ${status}${statusText ? ` ${statusText}` : ''}).`;
    if (result?.error) {
        const parts = [prefix, result.error];
        if (result.stage) {
            parts.push(`Stage: ${result.stage}.`);
        }
        if (result.code) {
            parts.push(`Code: ${result.code}.`);
        }
        if (result.detail) {
            parts.push(result.detail);
        }
        return parts.join(' ');
    }

    const trimmedText = responseText.trim();
    if (trimmedText) {
        return `${prefix} Server response: ${trimmedText.slice(0, 500)}`;
    }

    return `${prefix} The server returned an empty response.`;
}

function loadImportSuccessState(): ImportState {
    const saved = sessionStorage.getItem(IMPORT_SUCCESS_STORAGE_KEY);
    if (!saved) {
        return {status: 'idle'};
    }

    try {
        const parsed = JSON.parse(saved) as Partial<Extract<ImportState, { status: 'done' }>>;
        if (parsed.status === 'done' && typeof parsed.spreadsheetName === 'string' && typeof parsed.songCount === 'number') {
            return {
                status: 'done',
                spreadsheetName: parsed.spreadsheetName,
                songCount: parsed.songCount,
            };
        }
    } catch {
        sessionStorage.removeItem(IMPORT_SUCCESS_STORAGE_KEY);
    }

    return {status: 'idle'};
}

function saveImportSuccessState(state: Extract<ImportState, { status: 'done' }>): void {
    sessionStorage.setItem(IMPORT_SUCCESS_STORAGE_KEY, JSON.stringify(state));
}

function clearImportSuccessState(): void {
    sessionStorage.removeItem(IMPORT_SUCCESS_STORAGE_KEY);
}
