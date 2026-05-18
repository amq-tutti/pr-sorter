#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const slug = process.argv[2];
if (!slug) { console.error('Usage: write-meta.mjs <slug>'); process.exit(1); }

const config = readFileSync('customize/config.ts', 'utf8');
const title = config.match(/title:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? slug;
const description = config.match(/description:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? '';

writeFileSync('dist/meta.json', JSON.stringify({ slug, title, description }));
console.log(`meta.json written: ${title}`);
