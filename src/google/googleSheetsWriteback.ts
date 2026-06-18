import { loadGoogleApis, loadGoogleIdentityServices } from './googleApiLoader';
import { readScoresFromFirstSheet, writePartialRanksToFirstSheet, writeRanksToFirstSheet, writeScoresToFirstSheet } from './sheetsClient';
import {
    GoogleAuthenticationRequiredError,
    type GoogleIdentityServices,
    type GooglePicker,
    GooglePickerCanceledError,
    type GoogleSheetsAccessConfig,
    type GoogleSheetsWritebackConfig,
    GoogleWritebackError,
    type PickedSpreadsheet,
    type TokenClient,
    type TokenResponse,
} from './types';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const DEFAULT_ACCESS_TOKEN_TTL_MS = 3_600_000;

type StoredAccessToken = {
    accessToken: string;
    expiresAt: number;
    scope: string;
};

let sessionToken: StoredAccessToken | null = null;
let tokenClient: TokenClient | null = null;
let pendingTokenReject: ((error: GoogleWritebackError) => void) | null = null;

window.addEventListener('pagehide', clearGoogleSessionToken);

export function clearGoogleSessionToken(): void {
    sessionToken = null;
}

function clearStoredToken(config: GoogleSheetsAccessConfig): void {
    clearGoogleSessionToken();
    localStorage.removeItem(config.tokenStorageKey);
}

export async function getGoogleSheetsAccessToken(config: GoogleSheetsAccessConfig): Promise<string> {
    if (!config.clientId) {
        throw new GoogleWritebackError('Google integration is not configured.');
    }

    try {
        const google = await loadGoogleIdentityServices();
        return await getToken(google, config);
    } catch (error) {
        if (isAuthError(error)) {
            clearStoredToken(config);
        }

        throw error;
    }
}

export async function writeRanksToGoogleSheet(
    config: GoogleSheetsWritebackConfig,
    ranksBySongId: Map<number, number>,
    spreadsheet: PickedSpreadsheet,
    scoresBySongId?: Map<number, number>,
): Promise<PickedSpreadsheet> {
    if (!config.clientId || !config.appId || !config.apiKey || !config.rankColumnHeader) {
        throw new GoogleWritebackError('Google integration is not configured.');
    }

    try {
        const {google} = await loadGoogleApis();
        const token = await getToken(google, config);

        await writeRanksToFirstSheet({
            spreadsheetId: spreadsheet.id,
            token,
            ranksBySongId,
            idColumnHeader: config.idColumnHeader,
            rankColumnHeader: config.rankColumnHeader,
            scoreColumnHeader: config.scoreColumnHeader,
            scoresBySongId,
        });

        return spreadsheet;
    } catch (error) {
        if (isAuthError(error)) {
            clearStoredToken(config);
        }

        throw error;
    }
}

export async function writePartialRanksToGoogleSheet(
    config: GoogleSheetsWritebackConfig,
    ranksBySongId: Map<number, number>,
    expectedSongIds: number[],
    spreadsheet: PickedSpreadsheet,
    options: { allowAuthPrompt?: boolean } = {},
): Promise<number> {
    if (!config.clientId || !config.appId || !config.apiKey) {
        throw new GoogleWritebackError('Google integration is not configured.');
    }

    if (!config.rankColumnHeader) {
        return 0;
    }

    try {
        const {google} = await loadGoogleApis();
        const token = await getToken(google, config, options);

        return await writePartialRanksToFirstSheet({
            spreadsheetId: spreadsheet.id,
            token,
            ranksBySongId,
            expectedSongIds,
            idColumnHeader: config.idColumnHeader,
            rankColumnHeader: config.rankColumnHeader,
        });
    } catch (error) {
        if (isAuthError(error)) {
            clearStoredToken(config);
        }

        throw error;
    }
}

export async function chooseGoogleSpreadsheet(config: GoogleSheetsWritebackConfig): Promise<PickedSpreadsheet> {
    if (!config.clientId || !config.appId || !config.apiKey) {
        throw new GoogleWritebackError('Google integration is not configured.');
    }

    try {
        const {google, picker} = await loadGoogleApis();
        const token = await getToken(google, config);
        return await pickSpreadsheet(picker, token, config.apiKey, config.appId);
    } catch (error) {
        if (isAuthError(error)) {
            clearStoredToken(config);
        }

        throw error;
    }
}

export async function loadScoresFromGoogleSheet(
    config: GoogleSheetsWritebackConfig,
    spreadsheet: PickedSpreadsheet,
    songIds: number[],
): Promise<Map<number, string>> {
    if (!config.clientId || !config.appId || !config.apiKey || !config.scoreColumnHeader) {
        throw new GoogleWritebackError('Google integration is not configured.');
    }

    try {
        const {google} = await loadGoogleApis();
        const token = await getToken(google, config);

        return await readScoresFromFirstSheet({
            spreadsheetId: spreadsheet.id,
            token,
            songIds,
            idColumnHeader: config.idColumnHeader,
            scoreColumnHeader: config.scoreColumnHeader,
        });
    } catch (error) {
        if (isAuthError(error)) {
            clearStoredToken(config);
        }

        throw error;
    }
}

export async function writeScoresToGoogleSheet(
    config: GoogleSheetsWritebackConfig,
    spreadsheet: PickedSpreadsheet,
    scoresBySongId: Map<number, number>,
    options: { allowAuthPrompt?: boolean } = {},
): Promise<number> {
    if (!config.clientId || !config.appId || !config.apiKey || !config.scoreColumnHeader) {
        throw new GoogleWritebackError('Google integration is not configured.');
    }

    try {
        const {google} = await loadGoogleApis();
        const token = await getToken(google, config, options);

        return await writeScoresToFirstSheet({
            spreadsheetId: spreadsheet.id,
            token,
            idColumnHeader: config.idColumnHeader,
            scoreColumnHeader: config.scoreColumnHeader,
            scoresBySongId,
        });
    } catch (error) {
        if (isAuthError(error)) {
            clearStoredToken(config);
        }

        throw error;
    }
}

async function getToken(
    google: GoogleIdentityServices,
    config: GoogleSheetsAccessConfig,
    options: { allowAuthPrompt?: boolean } = {allowAuthPrompt: true},
): Promise<string> {
    if (isUsableStoredAccessToken(sessionToken)) {
        return sessionToken.accessToken;
    }
    sessionToken = null;

    const storedToken = await loadStoredAccessToken(config.tokenStorageKey);
    if (isUsableStoredAccessToken(storedToken)) {
        sessionToken = storedToken;
        saveStoredAccessToken(config.tokenStorageKey, storedToken);
        return storedToken.accessToken;
    }

    tokenClient ??= google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: DRIVE_FILE_SCOPE,
        include_granted_scopes: false,
        callback: () => undefined,
        error_callback: (error) => {
            clearGoogleSessionToken();
            console.error('Google OAuth token request failed:', error);
            pendingTokenReject?.(new GoogleWritebackError('OAuth token request failed.'));
            pendingTokenReject = null;
        },
    });

    if (storedToken) {
        try {
            return await requestToken(tokenClient, config.tokenStorageKey, '');
        } catch (error) {
            if (options.allowAuthPrompt === false) {
                throw new GoogleAuthenticationRequiredError();
            }

            console.info('Silent Google OAuth token refresh failed; requesting user authorization.', error);
        }
    }

    if (options.allowAuthPrompt === false) {
        throw new GoogleAuthenticationRequiredError();
    }

    return requestToken(tokenClient, config.tokenStorageKey, 'consent');
}

async function loadStoredAccessToken(tokenStorageKey: string): Promise<StoredAccessToken | null> {
    const rawToken = localStorage.getItem(tokenStorageKey);
    if (!rawToken) {
        return null;
    }

    const parsedToken = parseStoredAccessToken(rawToken);
    if (parsedToken) {
        return parsedToken;
    }

    const legacyToken = rawToken.trim();
    if (!legacyToken) {
        localStorage.removeItem(tokenStorageKey);
        return null;
    }

    const migratedToken = await tokenInfoForAccessToken(legacyToken);
    if (!migratedToken) {
        return null;
    }

    saveStoredAccessToken(tokenStorageKey, migratedToken);
    return migratedToken;
}

function parseStoredAccessToken(rawToken: string): StoredAccessToken | null {
    try {
        const parsed = JSON.parse(rawToken) as Partial<StoredAccessToken>;
        if (
            typeof parsed.accessToken === 'string' &&
            typeof parsed.expiresAt === 'number' &&
            typeof parsed.scope === 'string' &&
            parsed.accessToken.trim() !== '' &&
            parsed.scope.split(/\s+/).includes(DRIVE_FILE_SCOPE)
        ) {
            return {
                accessToken: parsed.accessToken,
                expiresAt: parsed.expiresAt,
                scope: parsed.scope,
            };
        }
    } catch {
        return null;
    }

    return null;
}

async function tokenInfoForAccessToken(token: string): Promise<StoredAccessToken | null> {
    try {
        const response = await fetch(`${TOKENINFO_ENDPOINT}?access_token=${encodeURIComponent(token)}`);
        if (!response.ok) {
            return null;
        }

        const tokenInfo = (await response.json()) as { expires_in?: string | number; scope?: string };
        const scopes = tokenInfo.scope?.split(/\s+/) ?? [];
        if (!tokenInfo.scope || !scopes.includes(DRIVE_FILE_SCOPE)) {
            return null;
        }

        const expiresInSeconds = Number(tokenInfo.expires_in);
        return {
            accessToken: token,
            expiresAt: Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : DEFAULT_ACCESS_TOKEN_TTL_MS),
            scope: tokenInfo.scope,
        };
    } catch {
        return null;
    }
}

function isUsableStoredAccessToken(token: StoredAccessToken | null): token is StoredAccessToken {
    return Boolean(
        token &&
        token.accessToken &&
        token.scope.split(/\s+/).includes(DRIVE_FILE_SCOPE) &&
        token.expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now(),
    );
}

function saveStoredAccessToken(tokenStorageKey: string, token: StoredAccessToken): void {
    localStorage.setItem(tokenStorageKey, JSON.stringify(token));
}

function requestToken(client: TokenClient, tokenStorageKey: string, prompt: '' | 'consent'): Promise<string> {
    return new Promise((resolve, reject) => {
        pendingTokenReject = reject;
        client.callback = (response: TokenResponse) => {
            pendingTokenReject = null;
            if (response.error) {
                clearGoogleSessionToken();
                reject(new GoogleWritebackError('OAuth token request failed.'));
                return;
            }

            if (!response.access_token) {
                clearGoogleSessionToken();
                reject(new GoogleWritebackError('OAuth token request failed.'));
                return;
            }

            const token = accessTokenFromResponse(response);
            sessionToken = token;
            saveStoredAccessToken(tokenStorageKey, token);
            resolve(token.accessToken);
        };

        try {
            client.requestAccessToken({prompt});
        } catch (error) {
            clearGoogleSessionToken();
            pendingTokenReject = null;
            reject(error);
        }
    });
}

function accessTokenFromResponse(response: TokenResponse): StoredAccessToken {
    return {
        accessToken: response.access_token ?? '',
        expiresAt: Date.now() + Math.max(0, response.expires_in ?? DEFAULT_ACCESS_TOKEN_TTL_MS / 1000) * 1000,
        scope: response.scope ?? DRIVE_FILE_SCOPE,
    };
}

function pickSpreadsheet(
    picker: GooglePicker,
    token: string,
    apiKey: string,
    appId: string,
): Promise<PickedSpreadsheet> {
    return new Promise((resolve, reject) => {
        const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST);

        const pickerInstance = new picker.PickerBuilder()
            .addView(view)
            .setDeveloperKey(apiKey)
            .setAppId(appId)
            .setOAuthToken(token)
            .setCallback((response) => {
                if (response.action === picker.Action.CANCEL) {
                    reject(new GooglePickerCanceledError());
                    return;
                }

                if (response.action !== picker.Action.PICKED) {
                    return;
                }

                const document = response.docs?.[0];
                if (!document?.id) {
                    reject(new GoogleWritebackError('No spreadsheet selected.'));
                    return;
                }

                resolve({
                    id: document.id,
                    name: document.name ?? 'selected spreadsheet',
                });
            })
            .build();

        pickerInstance.setVisible(true);
    });
}

function isAuthError(error: unknown): boolean {
    return error instanceof GoogleWritebackError && error.message === 'OAuth token expired or was rejected.';
}
