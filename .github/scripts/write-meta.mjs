#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const slug = process.argv[2];
if (!slug) { console.error('Usage: write-meta.mjs <slug>'); process.exit(1); }

const config = readFileSync('customize/config.ts', 'utf8');
const title = config.match(/title:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? slug;
const description = config.match(/description:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? '';
const category = config.match(/category:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null;

const meta = { slug, title, description };
if (category) meta.category = category;

writeFileSync('dist/meta.json', JSON.stringify(meta));
console.log(`meta.json written: ${title}`);
