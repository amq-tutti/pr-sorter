import { loadGoogleApis } from "./googleApiLoader";
import { readScoresFromFirstSheet, writeRanksToFirstSheet } from "./sheetsClient";
import {
  GooglePickerCanceledError,
  GoogleWritebackError,
  type GoogleIdentityServices,
  type GooglePicker,
  type GoogleSheetsWritebackConfig,
  type PickedSpreadsheet,
  type TokenClient,
  type TokenResponse,
} from "./types";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

let sessionToken: string | null = null;
let tokenClient: TokenClient | null = null;
let pendingTokenReject: ((error: GoogleWritebackError) => void) | null = null;

window.addEventListener("pagehide", clearGoogleSessionToken);

export function clearGoogleSessionToken(): void {
  sessionToken = null;
}

function clearStoredToken(config: GoogleSheetsWritebackConfig): void {
  clearGoogleSessionToken();
  localStorage.removeItem(config.tokenStorageKey);
}

export async function writeRanksToGoogleSheet(
  config: GoogleSheetsWritebackConfig,
  ranksBySongId: Map<number, number>,
  spreadsheet: PickedSpreadsheet,
  scoresBySongId?: Map<number, number>,
): Promise<PickedSpreadsheet> {
  if (!config.clientId || !config.appId || !config.apiKey || !config.rankColumnHeader) {
    throw new GoogleWritebackError("Google integration is not configured.");
  }

  try {
    const { google } = await loadGoogleApis();
    const token = await getToken(google, config);

    await writeRanksToFirstSheet({
      spreadsheetId: spreadsheet.id,
      token,
      ranksBySongId,
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

export async function chooseGoogleSpreadsheet(config: GoogleSheetsWritebackConfig): Promise<PickedSpreadsheet> {
  if (!config.clientId || !config.appId || !config.apiKey || !config.rankColumnHeader) {
    throw new GoogleWritebackError("Google integration is not configured.");
  }

  try {
    const { google, picker } = await loadGoogleApis();
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
  if (!config.clientId || !config.appId || !config.apiKey || !config.rankColumnHeader || !config.scoreColumnHeader) {
    throw new GoogleWritebackError("Google integration is not configured.");
  }

  try {
    const { google } = await loadGoogleApis();
    const token = await getToken(google, config);

    return await readScoresFromFirstSheet({
      spreadsheetId: spreadsheet.id,
      token,
      songIds,
      scoreColumnHeader: config.scoreColumnHeader,
    });
  } catch (error) {
    if (isAuthError(error)) {
      clearStoredToken(config);
    }

    throw error;
  }
}

async function getToken(google: GoogleIdentityServices, config: GoogleSheetsWritebackConfig): Promise<string> {
  if (sessionToken && (await isStoredTokenValid(sessionToken))) {
    return sessionToken;
  }
  sessionToken = null;

  const storedToken = localStorage.getItem(config.tokenStorageKey);
  if (storedToken && (await isStoredTokenValid(storedToken))) {
    sessionToken = storedToken;
    return storedToken;
  }
  localStorage.removeItem(config.tokenStorageKey);

  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: config.clientId,
    scope: DRIVE_FILE_SCOPE,
    include_granted_scopes: false,
    callback: () => undefined,
    error_callback: (error) => {
      clearGoogleSessionToken();
      console.error("Google OAuth token request failed:", error);
      pendingTokenReject?.(new GoogleWritebackError("OAuth token request failed."));
      pendingTokenReject = null;
    },
  });

  return requestToken(tokenClient, config.tokenStorageKey);
}

async function isStoredTokenValid(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${TOKENINFO_ENDPOINT}?access_token=${encodeURIComponent(token)}`);
    if (!response.ok) {
      return false;
    }

    const tokenInfo = (await response.json()) as { scope?: string };
    const scopes = tokenInfo.scope?.split(/\s+/) ?? [];
    return scopes.includes(DRIVE_FILE_SCOPE);
  } catch {
    return false;
  }
}

function requestToken(client: TokenClient, tokenStorageKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingTokenReject = reject;
    client.callback = (response: TokenResponse) => {
      pendingTokenReject = null;
      if (response.error) {
        clearGoogleSessionToken();
        reject(new GoogleWritebackError("OAuth token request failed."));
        return;
      }

      if (!response.access_token) {
        clearGoogleSessionToken();
        reject(new GoogleWritebackError("OAuth token request failed."));
        return;
      }

      sessionToken = response.access_token;
      localStorage.setItem(tokenStorageKey, response.access_token);
      resolve(response.access_token);
    };

    try {
      client.requestAccessToken({ prompt: sessionToken ? "" : "consent" });
    } catch (error) {
      clearGoogleSessionToken();
      pendingTokenReject = null;
      reject(error);
    }
  });
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
          reject(new GoogleWritebackError("No spreadsheet selected."));
          return;
        }

        resolve({
          id: document.id,
          name: document.name ?? "selected spreadsheet",
        });
      })
      .build();

    pickerInstance.setVisible(true);
  });
}

function isAuthError(error: unknown): boolean {
  return error instanceof GoogleWritebackError && error.message === "OAuth token expired or was rejected.";
}
