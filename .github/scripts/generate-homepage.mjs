#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ghPagesDir = process.argv[2] ?? 'gh-pages-content';
const outputFile = process.argv[3] ?? 'homepage-dist/index.html';

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let sorters = [];
if (existsSync(ghPagesDir)) {
  for (const entry of readdirSync(ghPagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(ghPagesDir, entry.name, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try { sorters.push(JSON.parse(readFileSync(metaPath, 'utf8'))); } catch {}
  }
}

sorters.sort((a, b) => a.title.localeCompare(b.title));

const cards = sorters.length === 0
  ? `<p class="empty">No sorters available yet.</p>`
  : sorters.map(s => `
    <a class="card" href="./${esc(s.slug)}/">
      <div class="card-title">${esc(s.title)}</div>
      ${s.description ? `<div class="card-desc">${esc(s.description)}</div>` : ''}
    </a>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sorter Collection</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background: #001a3f;
      color: #f0fff2;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 24px;
    }
    h1 {
      font-size: 2.4rem;
      color: #a0ffac;
      margin: 0 0 8px;
      text-align: center;
    }
    .subtitle {
      color: #cbd5e1;
      margin: 0 0 48px;
      font-size: 1rem;
      text-align: center;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 20px;
      width: 100%;
      max-width: 900px;
    }
    .card {
      display: block;
      padding: 24px;
      background: rgba(0, 26, 63, 0.7);
      border: 1px solid rgba(160, 255, 172, 0.2);
      border-radius: 10px;
      text-decoration: none;
      backdrop-filter: blur(4px);
      transition: border-color 0.2s, background 0.2s, transform 0.15s;
    }
    .card:hover {
      border-color: rgba(160, 255, 172, 0.7);
      background: rgba(0, 40, 90, 0.8);
      transform: translateY(-2px);
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: bold;
      color: #a0ffac;
      margin-bottom: 8px;
    }
    .card-desc {
      font-size: 0.9rem;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .empty {
      color: #cbd5e1;
      font-size: 1.1rem;
      text-align: center;
      margin-top: 48px;
    }
  </style>
</head>
<body>
  <h1>Sorter Collection</h1>
  <p class="subtitle">Pick a sorter to get started.</p>
  <div class="grid">${cards}
  </div>
</body>
</html>`;

writeFileSync(outputFile, html);
console.log(`Homepage generated with ${sorters.length} sorter(s) → ${outputFile}`);
