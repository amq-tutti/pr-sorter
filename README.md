# Party Ranking Sorter

This project is a simple single-page application template that allows users to rank songs from a list by comparing them in duels.

## Customize A Fork

For a normal fork, only edit:

- `customize/config.ts`
- `customize/songList.ts`

## Project Structure

```
party-ranking-sorter-template/
├── index.html
├── style.css
├── public/
│   └── favicon.ico
├── customize/
│   ├── config.ts
│   └── songList.ts
├── src/
│   ├── main.tsx
│   └── ...
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Features

- Autosave to the local storage after each duel.
- Can load saved result or show final result if sorter was previously completed.
- Options for choosing between mp3, video, and full-song files when sorting.
- Region selection for AnimeMusicQuiz CDN links (EU, NA West, NA East).
- Optional Google Sheets writeback for completed ranks.
- Optional per-song scores from `0` to `10`, with score-based auto-skip.

## Setting Up a Custom Sorter

To set up a custom sorter for your specific party ranking, follow these steps:

1. **Update `customize/songList.ts`:**
   - Replace the content of `customize/songList.ts` with your own list of songs. Each song should have an `id`, `anime`, `name`, `video`, `mp3`, and optional `full` field.
   - Links should be either animemusicquiz catbox links or YouTube links.
   - Regex because I'm lazy:
   `(\d+)\t(.+)?\t(.+)\t\t(.+)\n?` to `{"id": $1, "anime": "$2", "name": "$3", "video": "$4", "mp3": null },\n`
   - Example:
     ```typescript
     import type { Song } from "../src/songs";

     export const songList = [
         {
             "id": 1,
             "anime": "Your Anime Title",
             "name": "Your Song Name",
             "video": "https://your-video-url.com",
             "mp3": "https://your-mp3-url.com",
             "full": "https://your-full-song-url.com"
         },
         {
             "id": 2,
             "anime": "Another Anime Title",
             "name": "Another Song Name",
             "video": "https://another-video-url.com",
             "mp3": "https://another-mp3-url.com"
         },
         {
             "id": 3,
             "anime": "Example Anime",
             "name": "Example Song",
             "video": "https://eudist.animemusicquiz.com/example.webm",
             "mp3": "https://eudist.animemusicquiz.com/example.mp3"
         }
     ] satisfies Song[];
     ```

2. **Update the Title and Description in `customize/config.ts`:**
   - Open `customize/config.ts` and change the `title` and `description` values to match your custom sorter.
   - Also you **will** have to change `localStoragePrefix` if you plan on hosting multiple github-pages from a single account (there is an issue of shared `localStorage` if base URL is the same, so need to differentiate `localStorage` for different party rankings)
   - Example:
     ```typescript
     export const config = {
         localStoragePrefix: "your-party-rank-sorter",
         title: "Your Custom Party Rank Sorter",
         description: "Party rank sorter for your custom list of songs.",
         googleSheets: {
             clientId: "575550662002-....apps.googleusercontent.com",
             appId: "575550662002",
             rankColumnHeader: "rank",
             scoreColumnHeader: "Score (optional)"
         }
     };
     ```

## Optional Song Scores

Scores are opt-in. Add `googleSheets.scoreColumnHeader` to `customize/config.ts` to enable score inputs, score persistence, score results, the auto-skip setting, and score writeback:

```ts
googleSheets: {
  clientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  appId: "YOUR_GOOGLE_CLOUD_PROJECT_NUMBER",
  rankColumnHeader: "rank",
  scoreColumnHeader: "Score (optional)",
}
```

If `scoreColumnHeader` is omitted, the sorter remains ranking-only: no score fields render, no scores are saved, no auto-skip setting is shown, and only ranks are written to Google Sheets.

When enabled, each song can have a score from `0` to `10`. Blank scores are allowed. Scores are stored locally per song.

Settings includes `Auto-skip score gap`, defaulting to `10`. During sorting, if both compared songs have valid scores and their absolute score difference is greater than or equal to this setting, the higher-scored song is picked automatically. Equal scores and missing scores never auto-skip. For example, `10` only skips comparisons such as `10` vs `0`, while `7` skips `10` vs `3`.

## Google Sheets Writeback

The sorter can write completed ranks directly into a locally saved Google Spreadsheet selection. This is browser-only and stores the Google OAuth access token in `localStorage` so users can keep writing after refreshes without repeating OAuth until Google rejects or expires the token. The selected spreadsheet ID and display name are also saved locally so users can pick the sheet once in Settings.

To enable it:

1. Add `googleSheets` to `customize/config.ts`:
   ```ts
   googleSheets: {
     clientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
     appId: "YOUR_GOOGLE_CLOUD_PROJECT_NUMBER",
     rankColumnHeader: "rank",
     scoreColumnHeader: "Score (optional)",
   }
   ```
2. Set the Picker API key through Vite, for example in a local `.env.local` file:
   ```bash
   VITE_GOOGLE_API_KEY=your-browser-api-key
   ```
3. Configure Google Cloud:
   - Enable Google Picker API.
   - Enable Google Drive API.
   - Enable Google Sheets API.
   - Add the OAuth scope `https://www.googleapis.com/auth/drive.file` to the consent screen.
   - Restrict the API key by HTTP referrer, for example `https://minigamer42.github.io/*` and optionally `http://localhost:5173/*`.
   - Restrict the API key to Google Picker API and Drive API if required by Picker.

Spreadsheet format:

- The first non-hidden grid worksheet is used.
- Row `1` is the header row.
- Column `A` contains song IDs.
- The rank column is the header that exactly matches `googleSheets.rankColumnHeader` after trimming surrounding whitespace. Matching is case-sensitive.
- If score support is enabled and at least one song has a score, the score column is the header that exactly matches `googleSheets.scoreColumnHeader` after trimming surrounding whitespace. Matching is case-sensitive.
- Data rows may be in any order.

Writeback validation is strict. The write aborts before changing cells if the sheet is empty, the rank header is missing or duplicated, the enabled score header is missing or duplicated, a song ID is duplicated or non-numeric, the sheet contains unknown song IDs, or the sheet is missing sorter song IDs.

Ranks always write. Scores write only when score support is enabled and at least one nonblank score exists. Blank scores are skipped and do not clear existing spreadsheet cells. Rank and score changes are sent together in one Sheets batch update.

User flow:

1. Open Settings.
2. Click `Choose Sheet` and complete Google OAuth/Picker.
3. Finish a sort.
4. Click `Write ranks to Google Sheet`.

Refreshing the page keeps both the selected spreadsheet and the stored OAuth access token. If Google rejects the token, the app removes it and the next write or sheet selection requests authorization again.

## Development

Install dependencies and run the Vite build:

```bash
npm install
npm run build
```

Preview the generated `dist/` output locally:

```bash
npm run preview
```

## Credit

Most of the project was taken from this repo by FlatoLitou: [Winter2025ED](https://github.com/Flatolitou/Winter2025ED).
