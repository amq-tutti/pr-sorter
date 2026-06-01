import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';

type CustomizePayload = {
    localStoragePrefix?: unknown;
    title?: unknown;
    description?: unknown;
    googleSheets?: {
        clientId?: unknown;
        appId?: unknown;
        rankColumnHeader?: unknown;
        scoreColumnHeader?: unknown;
    };
    songs?: unknown;
};

export function localCustomizeWriter(): Plugin {
    return {
        name: 'local-customize-writer',
        configureServer(server) {
            server.middlewares.use('/api/customize-from-sheet', (request, response) => {
                if (request.method !== 'POST') {
                    sendJson(response, 405, {
                        error: 'Method not allowed.',
                        detail: `Expected POST but received ${request.method ?? 'an unknown method'}.`,
                    });
                    return;
                }

                readRequestBody(request)
                    .then((body) => {
                        if (!body.trim()) {
                            throw new CustomizeWriterError('Request body is empty.', 'request');
                        }

                        let payload: CustomizePayload;
                        try {
                            payload = JSON.parse(body) as CustomizePayload;
                        } catch (error) {
                            throw new CustomizeWriterError(`Request body is not valid JSON: ${errorMessage(error)}`, 'request');
                        }

                        return writeCustomizeFiles(parseCustomizePayload(payload));
                    })
                    .then((result) => {
                        sendJson(response, 200, result);
                    })
                    .catch((error: unknown) => {
                        server.config.logger.error(`[local-customize-writer] ${errorMessage(error)}`);
                        sendJson(response, statusCodeForError(error), errorResponse(error));
                    });
            });
        },
    };
}

class CustomizeWriterError extends Error {
    constructor(
        message: string,
        readonly stage: 'request' | 'validation' | 'write',
        readonly detail?: string,
    ) {
        super(message);
        this.name = 'CustomizeWriterError';
    }
}

function sendJson(response: import('node:http').ServerResponse, statusCode: number, payload: unknown): void {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload, null, 2));
}

function statusCodeForError(error: unknown): number {
    if (error instanceof CustomizeWriterError && error.stage === 'request') {
        return 400;
    }

    if (error instanceof CustomizeWriterError && error.stage === 'validation') {
        return 422;
    }

    return 500;
}

function errorResponse(error: unknown): { error: string; stage: string; detail?: string; code?: string } {
    if (error instanceof CustomizeWriterError) {
        return {
            error: error.message,
            stage: error.stage,
            detail: error.detail,
        };
    }

    if (isNodeError(error)) {
        return {
            error: `File write failed: ${error.message}`,
            stage: 'write',
            code: error.code,
            detail: `Tried to write ${path.resolve(process.cwd(), 'customize', 'config.ts')} and ${path.resolve(process.cwd(), 'customize', 'songList.ts')}.`,
        };
    }

    return {
        error: errorMessage(error),
        stage: 'unknown',
    };
}

function readRequestBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';

        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
            body += chunk;
            if (body.length > 5_000_000) {
                reject(new Error('Request body is too large.'));
                request.destroy();
            }
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

function parseCustomizePayload(payload: CustomizePayload) {
    const localStoragePrefix = requireString(payload.localStoragePrefix, 'localStoragePrefix');
    const title = requireString(payload.title, 'title');
    const description = requireString(payload.description, 'description');
    const songs = parseSongs(payload.songs);
    const googleSheets = payload.googleSheets;

    if (!googleSheets || typeof googleSheets !== 'object') {
        throw new CustomizeWriterError('Missing googleSheets configuration.', 'validation', `Received ${describeValue(googleSheets)}.`);
    }

    return {
        localStoragePrefix,
        title,
        description,
        googleSheets: {
            clientId: requireString(googleSheets.clientId, 'googleSheets.clientId'),
            appId: requireString(googleSheets.appId, 'googleSheets.appId'),
            rankColumnHeader: requireString(googleSheets.rankColumnHeader, 'googleSheets.rankColumnHeader'),
            scoreColumnHeader: optionalString(googleSheets.scoreColumnHeader),
        },
        songs: [...songs].sort((left, right) => left.id - right.id),
    };
}

function parseSongs(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new CustomizeWriterError('Expected at least one song.', 'validation', `Received ${describeValue(value)}.`);
    }

    return value.map((song, index) => {
        if (!song || typeof song !== 'object') {
            throw new CustomizeWriterError(`Song ${index + 1} is invalid.`, 'validation', `Received ${describeValue(song)}.`);
        }

        const candidate = song as Record<string, unknown>;
        return {
            id: requireNumber(candidate.id, `songs[${index}].id`),
            anime: optionalString(candidate.anime),
            name: requireString(candidate.name, `songs[${index}].name`),
            video: optionalString(candidate.video),
            mp3: optionalString(candidate.mp3),
            full: optionalString(candidate.full),
        };
    });
}

async function writeCustomizeFiles(payload: ReturnType<typeof parseCustomizePayload>) {
    const customizeDir = path.resolve(process.cwd(), 'customize');
    try {
        await mkdir(customizeDir, { recursive: true });

        await Promise.all([
            writeFile(path.join(customizeDir, 'songList.ts'), songListSource(payload.songs), 'utf8'),
            writeFile(path.join(customizeDir, 'config.ts'), configSource(payload), 'utf8'),
        ]);
    } catch (error) {
        if (isNodeError(error)) {
            throw error;
        }

        throw new CustomizeWriterError(`Could not write customize files: ${errorMessage(error)}`, 'write');
    }

    return { ok: true, songCount: payload.songs.length };
}

function songListSource(songs: ReturnType<typeof parseSongs>): string {
    return `// noinspection SpellCheckingInspection

import type { Song } from '../src/songs';

export const songList = ${formatSongList(songs)} satisfies Song[];
`;
}

function configSource(payload: ReturnType<typeof parseCustomizePayload>): string {
    const scoreColumnHeader = payload.googleSheets.scoreColumnHeader;

    return `import type { AppConfig } from '../src/app/types';

export const config = {
    localStoragePrefix: ${formatTsString(payload.localStoragePrefix)},
    title: ${formatTsString(payload.title)},
    description: ${formatTsString(payload.description)},
    googleSheets: {
        clientId: ${formatTsString(payload.googleSheets.clientId)},
        appId: ${formatTsString(payload.googleSheets.appId)},
        rankColumnHeader: ${formatTsString(payload.googleSheets.rankColumnHeader)}${scoreColumnHeader ? `,
        scoreColumnHeader: ${formatTsString(scoreColumnHeader)}` : ''}
    }
} satisfies AppConfig;
`;
}

function formatSongList(songs: ReturnType<typeof parseSongs>): string {
    const entries = songs.map((song) => {
        const lines = [
            `        'id': ${song.id}`,
            `        'anime': ${formatNullableTsString(song.anime)}`,
            `        'name': ${formatTsString(song.name)}`,
            `        'video': ${formatNullableTsString(song.video)}`,
            `        'mp3': ${formatNullableTsString(song.mp3)}`,
            `        'full': ${formatNullableTsString(song.full)}`,
        ];

        return `    {\n${lines.join(',\n')}\n    }`;
    });

    return `[\n${entries.join(',\n')}\n]`;
}

function formatNullableTsString(value: string | null): string {
    return value === null ? 'null' : formatTsString(value);
}

function formatTsString(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new CustomizeWriterError(`Expected ${name} to be a non-empty string.`, 'validation', `Received ${describeValue(value)}.`);
    }

    return value.trim();
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function requireNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new CustomizeWriterError(`Expected ${name} to be a positive integer.`, 'validation', `Received ${describeValue(value)}.`);
    }

    return value;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function describeValue(value: unknown): string {
    if (value === undefined) {
        return 'undefined';
    }

    return JSON.stringify(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}
