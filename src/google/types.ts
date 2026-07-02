export type PickedSpreadsheet = {
    id: string;
    name: string;
};

export type GoogleSheetsWritebackConfig = {
    clientId: string;
    appId: string;
    apiKey: string;
    idColumnHeader?: string;
    rankColumnHeader?: string;
    scoreColumnHeader?: string;
    tokenStorageKey: string;
};

export class GoogleWritebackError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GoogleWritebackError';
    }
}

export const UNSUPPORTED_SPREADSHEET_MESSAGE =
    'This file is a Microsoft Excel (.xlsx) file, not a Google Sheet, so scores and ranks can’t be synced. Open it in Google Sheets → File → Save as Google Sheets, then pick the converted sheet.';

/** Short form of {@link UNSUPPORTED_SPREADSHEET_MESSAGE} for compact button labels/tooltips. */
export const UNSUPPORTED_SPREADSHEET_SHORT = 'Excel file — convert to a Google Sheet to sync.';

/**
 * Thrown when the selected Drive file is an Office file (e.g. an uploaded .xlsx) rather than a
 * native Google Sheet. The Google Sheets API refuses such files for both reads and writes with
 * `FAILED_PRECONDITION: ... The document must not be an Office file.`, so the sheet can never be a
 * working sync target and the app disables Google read/write operations on it.
 */
export class UnsupportedSpreadsheetError extends GoogleWritebackError {
    constructor(message: string = UNSUPPORTED_SPREADSHEET_MESSAGE) {
        super(message);
        this.name = 'UnsupportedSpreadsheetError';
    }
}

export class GooglePickerCanceledError extends Error {
    constructor() {
        super('User canceled Picker.');
        this.name = 'GooglePickerCanceledError';
    }
}

export class GoogleAuthenticationRequiredError extends Error {
    constructor() {
        super('Google authentication is required.');
        this.name = 'GoogleAuthenticationRequiredError';
    }
}

export type TokenResponse = {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
};

export type TokenClient = {
    requestAccessToken(options: { prompt: '' | 'consent' | 'select_account' }): void;
    callback?: (response: TokenResponse) => void;
};

export type TokenClientConfig = {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: unknown) => void;
};

export type GoogleIdentityServices = {
    accounts: {
        oauth2: {
            initTokenClient(config: TokenClientConfig): TokenClient;
        };
    };
};

export type Gapi = {
    load(api: 'picker', callback: () => void): void;
};

export type PickerDocument = {
    id: string;
    name?: string;
};

export type PickerResponse = {
    action?: string;
    docs?: PickerDocument[];
};

export type PickerCallback = (response: PickerResponse) => void;

export type PickerView = {
    setMode(mode: string): PickerView;
};

export type PickerBuilder = {
    addView(view: PickerView): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setDeveloperKey(apiKey: string): PickerBuilder;
    setAppId(appId: string): PickerBuilder;
    setCallback(callback: PickerCallback): PickerBuilder;
    build(): PickerInstance;
};

export type PickerInstance = {
    setVisible(visible: boolean): void;
};

export type GooglePicker = {
    Action: {
        PICKED: string;
        CANCEL: string;
    };
    DocsView: new (viewId: string) => PickerView;
    DocsViewMode: {
        LIST: string;
    };
    PickerBuilder: new () => PickerBuilder;
    ViewId: {
        SPREADSHEETS: string;
    };
};

export type GoogleWindow = Window &
    typeof globalThis & {
    google?: GoogleIdentityServices & { picker?: GooglePicker };
    gapi?: Gapi;
};

export type GoogleSheetsAccessConfig = {
    clientId: string;
    tokenStorageKey: string;
};
