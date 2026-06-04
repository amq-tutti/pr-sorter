# Party Ranking Sorter

This project is a single-page application template for ranking songs by comparing them in duels.

## Features

- Autosave to local storage after each duel.
- Resume a saved sort or show final results if a sorter was already completed.
- Sort using mp3, video, or full-song files.
- Region selection for AnimeMusicQuiz CDN links (EU, NA West, NA East).
- Optional Google Sheets import for generating local customize files.
- Optional Google Sheets writeback for completed ranks.
- Optional per-song scores from `0` to `10`, with score-based auto-skip.
- GitHub Pages workflow that publishes each `pr-sorter/*` branch as its own sorter.

## 1. Clone And Install

Fork or clone the repository, then install dependencies with Node `24` or newer:

```bash
nvm use 24
npm ci
```

If you do not use `nvm`, install Node `24` or newer before running the npm commands.

Start the local Vite dev server:

```bash
npm run dev
```

Open `http://localhost:5173/`.

For a normal custom sorter, the files you usually edit are:

- `customize/config.ts`
- `customize/songList.ts`
- `customize/favicon.ico`

## 2. Configure The Sorter

Update `customize/config.ts` with the title, description, and a unique `localStoragePrefix`:

```ts
import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "your-party-rank-sorter",
  title: "Your Custom Party Rank Sorter",
  description: "Party rank sorter for your custom list of songs.",
  // Optional. Each tag adds the sorter under that header on the collection homepage.
  tags: ["Artist"],
  // Optional voting deadline (ISO 8601). Written into the generated sorter-index.json.
  deadline: "2026-06-05T21:59:00.000Z",
} satisfies AppConfig;
```

Optional `tags` group the sorter under one or more headers on the collection homepage (a sorter with two tags appears under both). Optional `deadline` is an ISO 8601 timestamp carried into the generated `sorter-index.json`.

Change `localStoragePrefix` for each hosted sorter. Browser storage is shared by origin, so two sorters hosted under the same GitHub Pages site can collide if they use the same prefix.

Replace `customize/favicon.ico` if you want a custom browser icon.

## 3. Add Songs

Replace `customize/songList.ts` with your song list. Each song needs an `id`, `anime`, `name`, and at least one playable media URL in `video`, `mp3`, or `full`.

For larger lists, the faster option is to import from Google Sheets after completing the optional Google setup in step 6.

Links can be AnimeMusicQuiz CDN links, Catbox links, YouTube links, or another browser-playable `https` media URL.

```ts
import type { Song } from "../src/songs";

export const songList = [
  {
    id: 1,
    anime: "Your Anime Title",
    name: "Your Song Name",
    video: "https://your-video-url.example/song.webm",
    mp3: "https://your-audio-url.example/song.mp3",
    full: "https://your-full-song-url.example/song.mp3",
  },
  {
    id: 2,
    anime: "Another Anime Title",
    name: "Another Song Name",
    video: "https://www.youtube.com/watch?v=example",
    mp3: null,
  },
] satisfies Song[];
```

`anime` may be `null` if you do not want a separate anime/show label. Use positive integer IDs and keep them unique.

## 4. Optional: Set Up Google

Google setup is only needed if you want to import songs from Google Sheets or write completed ranks back to Google Sheets.

In [Google Cloud Console](https://console.cloud.google.com/):

1. [Create or select a Google Cloud project](https://console.cloud.google.com/projectselector2/home/dashboard).
2. [Enable Google Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com).
3. [Enable Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
4. [Enable Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com).
5. [Configure an OAuth consent screen](https://console.cloud.google.com/auth/overview).
6. Add the OAuth scope [`https://www.googleapis.com/auth/drive.file`](https://developers.google.com/identity/protocols/oauth2/scopes#drive).
7. [Create an OAuth web client ID](https://console.cloud.google.com/auth/clients/create).
8. [Create a browser API key](https://console.cloud.google.com/apis/credentials) for Picker.

For local development, add `http://localhost:5173` to the OAuth client's authorized JavaScript origins.

For GitHub Pages, add your Pages origin, for example `https://YOUR_USERNAME.github.io`, to the OAuth client's authorized JavaScript origins. Restrict the API key by HTTP referrer, for example:

```text
http://localhost:5173/*
https://YOUR_USERNAME.github.io/*
```

Use the minimum Google permissions needed by this app:

- OAuth consent screen scope: `https://www.googleapis.com/auth/drive.file`
- Enabled APIs: Google Picker API, Google Drive API, and Google Sheets API
- API key application restriction: HTTP referrers for your local and deployed origins
- API key API restriction: Google Picker API and Google Drive API

If you use GitHub Pages deployment, also add the browser API key to your GitHub repository as a repository variable:

1. Open your GitHub repository.
2. Go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Open the `Variables` tab.
4. Click `New repository variable`.
5. Set `Name` to `VITE_GOOGLE_API_KEY`.
6. Set `Value` to your Google browser API key.
7. Save the variable.

GitHub repository variables do not have OAuth scopes. The minimum Google OAuth scope is the `drive.file` scope listed above, and the browser API key should be limited with the HTTP referrer and API restrictions listed above.

## 5. Optional: Configure Google In The App

Add `googleSheets` to `customize/config.ts`:

```ts
import type { AppConfig } from "../src/app/types";

export const config = {
  localStoragePrefix: "your-party-rank-sorter",
  title: "Your Custom Party Rank Sorter",
  description: "Party rank sorter for your custom list of songs.",
  googleSheets: {
    clientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
    appId: "YOUR_GOOGLE_CLOUD_PROJECT_NUMBER",
    rankColumnHeader: "Rank",
    scoreColumnHeader: "Score (optional)",
  },
} satisfies AppConfig;
```

Then create `.env.local` in the repository root:

```bash
VITE_GOOGLE_API_KEY=your-browser-api-key
```

`.env.local` is intentionally ignored by git, so each local clone needs its own copy.

Omit `googleSheets` if you do not need Google features. Omit only `scoreColumnHeader` if you want Google rank writeback but do not want score support.

## 6. Optional: Import Songs From Google Sheets

After Google is configured, start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173/import`, select a Google Sheet, preview the parsed rows, and click `Write customize files`.

The import page writes:

- `customize/config.ts`
- `customize/songList.ts`

The importer reads the first non-hidden grid worksheet. It looks for the first row containing an `ID` header, then auto-detects common column names and lets you map missing columns manually.

Required columns:

- `ID`
- song name, such as `Song`, `Song Name`, `Title`, or `Song Info`
- rank column, such as `Rank`
- at least one media column, such as `Video`, `Video Link`, `mp3 Links`, `MP3`, `Full`, or `Full Link`

Optional columns:

- anime/show name, such as `Anime Name`, `Anime`, `Series`, or `Show`
- score, such as `Score (optional)` or `Score`

Media URLs can be stored as cell hyperlinks or as plain `http`/`https` cell text.

## 7. Optional: Use Song Scores

Scores are enabled by `googleSheets.scoreColumnHeader` in `customize/config.ts`.

If `scoreColumnHeader` is omitted, the sorter remains ranking-only: no score fields render, no scores are saved, no auto-skip setting is shown, and only ranks are written to Google Sheets.

When enabled, each song can have a score from `0` to `10`. Blank scores are allowed. Scores are stored locally per song.

Settings includes `Auto-skip score gap`, defaulting to `10`. During sorting, if both compared songs have valid scores and their absolute score difference is greater than or equal to this setting, the higher-scored song is picked automatically. Equal scores and missing scores never auto-skip. For example, `10` only skips comparisons such as `10` vs `0`, while `7` skips `10` vs `3`.

## 8. Optional: Write Ranks To Google Sheets

The sorter can write completed ranks directly into a selected Google Spreadsheet. This is browser-only and stores the Google OAuth access token in `localStorage` until Google rejects or expires it. The selected spreadsheet ID and display name are also saved locally.

Spreadsheet format:

- The first non-hidden grid worksheet is used.
- Row `1` is the header row.
- Column `A` contains song IDs.
- The rank column header must exactly match `googleSheets.rankColumnHeader` after trimming surrounding whitespace. Matching is case-sensitive.
- If score support is enabled and at least one song has a score, the score column header must exactly match `googleSheets.scoreColumnHeader` after trimming surrounding whitespace. Matching is case-sensitive.
- Data rows may be in any order.

Writeback validation is strict. The write aborts before changing cells if the sheet is empty, the rank header is missing or duplicated, the enabled score header is missing or duplicated, a song ID is duplicated or non-numeric, the sheet contains unknown song IDs, or the sheet is missing sorter song IDs.

Ranks always write. Scores write only when score support is enabled and at least one nonblank score exists. Blank scores are skipped and do not clear existing spreadsheet cells. Rank and score changes are sent together in one Sheets batch update.

User flow:

1. Open Settings.
2. Click `Choose Sheet` and complete Google OAuth/Picker.
3. Finish a sort.
4. Click `Write ranks to Google Sheet`.

Refreshing the page keeps both the selected spreadsheet and the stored OAuth access token. If Google rejects the token, the app removes it and the next write or sheet selection requests authorization again.

## 9. Build And Preview

Run the production build:

```bash
npm run build
```

Build and preview the local Pages-style output:

```bash
npm run preview
```

This serves the sorter index at `/` and the local sorter at `/test/`.

## 10. Deploy To GitHub Pages

The included workflow deploys to the `gh-pages` branch and treats `main` as the shared app template.

Each sorter lives in its own branch named `pr-sorter/*`. For example, a branch named `pr-sorter/bang-dream` creates a sorter at the `bang-dream` slug on the Pages site.

The workflow combines:

- app code, styles, workflow files, and build tooling from `main`
- `customize/` from each `pr-sorter/*` branch

That means sorter branches only need to change their `customize/` files. When you push a branch named `pr-sorter/YOUR_SORTER_NAME`, GitHub Actions checks out `main`, copies that branch's `customize/` directory into the app, builds the sorter, and publishes it under a slug generated from `YOUR_SORTER_NAME`.

Slug generation lowercases the branch suffix, turns `/` into `-`, and keeps only letters, numbers, `.`, `_`, and `-`. For example:

```text
pr-sorter/Bang Dream -> bang-dream
pr-sorter/group/my-sorter -> group-my-sorter
```

Pushing to `main` rebuilds the sorter index page and all remote `pr-sorter/*` branches. Pushing to a single `pr-sorter/*` branch rebuilds that sorter and refreshes the index while keeping the other published sorter files.

The Pages index also publishes a machine-readable catalog at:

```text
https://YOUR_USERNAME.github.io/pr-sorter/sorter-index.json
```

That catalog contains both the sorters hosted by that repository and the external sorter collections it links to:

```json
{
  "sorters": [],
  "externalSources": []
}
```

To include another repository that uses the same template, add its Pages index to `src/sorterIndex/externalSorterSources.json`. When the index page loads, it reads `sorter-index.json` from each configured source. This lets collections discover other collections through each other without rebuilding every site. Already visited collections and already found sorter URLs are ignored, and if this repository's own GitHub Pages URL is listed, the page skips it so the collection is not duplicated.

In repository settings:

1. Enable GitHub Pages.
2. Set the Pages source to deploy from the `gh-pages` branch.
3. If Google features are enabled, add the `VITE_GOOGLE_API_KEY` repository variable described in step 4.
4. Optionally, add a `VITE_COLLECTION_NAME` repository variable to display your collection's name on the index page. For example, setting it to `Tutti` shows `Tutti Sorter Collection` as the page heading. To preview this locally, add it to `.env.local`:

```bash
VITE_COLLECTION_NAME=Tutti
```

## Credit

Most of the project was taken from this repo by FlatoLitou: [Winter2025ED](https://github.com/Flatolitou/Winter2025ED).

Major rewrite and sorter template work by [Minigamer42](https://github.com/Minigamer42/pr-sorter).