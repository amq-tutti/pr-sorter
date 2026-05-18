import { GoogleWritebackError, type Gapi, type GoogleIdentityServices, type GooglePicker, type GoogleWindow } from "./types";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GAPI_SCRIPT_URL = "https://apis.google.com/js/api.js";

let gisPromise: Promise<GoogleIdentityServices> | null = null;
let pickerPromise: Promise<GooglePicker> | null = null;

function loadScript(src: string): Promise<void> {
  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existingScript?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = existingScript ?? document.createElement("script");

    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new GoogleWritebackError("Google scripts failed to load.")), {
      once: true,
    });

    if (!existingScript) {
      script.src = src;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });
}

export function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  gisPromise ??= loadScript(GIS_SCRIPT_URL).then(() => {
    const google = (window as GoogleWindow).google;
    if (!google?.accounts?.oauth2) {
      throw new GoogleWritebackError("Google scripts failed to load.");
    }

    return google;
  });

  return gisPromise;
}

function loadGapi(): Promise<Gapi> {
  return loadScript(GAPI_SCRIPT_URL).then(() => {
    const gapi = (window as GoogleWindow).gapi;
    if (!gapi) {
      throw new GoogleWritebackError("Google scripts failed to load.");
    }

    return gapi;
  });
}

export function loadGooglePicker(): Promise<GooglePicker> {
  pickerPromise ??= loadGapi().then(
    (gapi) =>
      new Promise<GooglePicker>((resolve, reject) => {
        try {
          gapi.load("picker", () => {
            const picker = (window as GoogleWindow).google?.picker;
            if (!picker) {
              reject(new GoogleWritebackError("Google scripts failed to load."));
              return;
            }

            resolve(picker);
          });
        } catch (error) {
          reject(error);
        }
      }),
  );

  return pickerPromise;
}

export function loadGoogleApis(): Promise<{ google: GoogleIdentityServices; picker: GooglePicker }> {
  return Promise.all([loadGoogleIdentityServices(), loadGooglePicker()]).then(([google, picker]) => ({ google, picker }));
}
