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
      <div class="card-header">
        <img class="card-favicon" src="./${esc(s.slug)}/favicon.ico" alt="" width="20" height="20">
        <div class="card-title">${esc(s.title)}</div>
      </div>
      ${s.description ? `<div class="card-desc">${esc(s.description)}</div>` : ''}
    </a>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sorter Collection</title>
  <link rel="icon" href="./favicon.ico">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background-image: url("https://images3.alphacoders.com/132/1322308.jpeg");
      background-color: #001a3f;
      background-size: cover;
      background-repeat: no-repeat;
      background-attachment: fixed;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
    }
    .surface {
      background: rgba(20, 30, 60, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-radius: 15px;
      padding: 40px;
      width: 100%;
      max-width: 900px;
      box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
    }
    h1 {
      font-size: 2.4rem;
      color: #a0ffac;
      margin: 0 0 8px;
      text-align: center;
    }
    .subtitle {
      color: #cbd5e1;
      margin: 0 0 36px;
      font-size: 1rem;
      text-align: center;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 16px;
    }
    .card {
      display: block;
      padding: 20px;
      background: rgba(0, 26, 63, 0.6);
      border: 1px solid rgba(160, 255, 172, 0.2);
      border-radius: 8px;
      text-decoration: none;
      backdrop-filter: blur(3px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      transition: border-color 0.2s, background 0.2s, transform 0.15s;
    }
    .card:hover {
      border-color: rgba(160, 255, 172, 0.7);
      background: rgba(0, 40, 90, 0.8);
      transform: translateY(-2px);
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .card-favicon {
      flex-shrink: 0;
      border-radius: 3px;
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: bold;
      color: #a0ffac;
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
      padding: 32px 0 8px;
    }
  </style>
</head>
<body>
  <div class="surface">
    <h1>Sorter Collection</h1>
    <p class="subtitle">Pick a sorter to get started.</p>
    <div class="grid">${cards}
    </div>
  </div>
</body>
</html>`;

writeFileSync(outputFile, html);
console.log(`Homepage generated with ${sorters.length} sorter(s) → ${outputFile}`);
