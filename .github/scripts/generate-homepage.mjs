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

function cardHtml(s) {
  return `
      <a class="card" href="./${esc(s.slug)}/">
        <div class="card-header">
          <img class="card-favicon" src="./${esc(s.slug)}/favicon.ico" alt="" width="20" height="20">
          <div class="card-title">${esc(s.title)}</div>
        </div>
        ${s.description ? `<div class="card-desc">${esc(s.description)}</div>` : ''}
      </a>`;
}

const categories = [...new Set(sorters.filter(s => s.category).map(s => s.category))].sort((a, b) => a.localeCompare(b));
const hasCategories = categories.length > 0;

let mainContent;
let filterScript = '';

if (sorters.length === 0) {
  mainContent = `<p class="empty">No sorters available yet.</p>`;
} else if (!hasCategories) {
  mainContent = `<div class="grid">${sorters.map(cardHtml).join('')}
    </div>`;
} else {
  const categorized = sorters.filter(s => s.category);
  const uncategorized = sorters.filter(s => !s.category);

  const chips = [
    `<button class="chip active" data-filter="__all__">All</button>`,
    ...categories.map(cat => `<button class="chip" data-filter="${esc(cat)}">${esc(cat)}</button>`),
  ].join('\n      ');

  const categorySections = categories.map(cat => {
    const cards = categorized.filter(s => s.category === cat).map(cardHtml).join('');
    return `
      <div class="section" data-section="${esc(cat)}">
        <h2 class="section-heading">${esc(cat)}</h2>
        <div class="grid">${cards}
        </div>
      </div>`;
  }).join('');

  const uncategorizedSection = uncategorized.length > 0 ? `
      <div class="section" data-section="__uncategorized__">
        <h2 class="section-heading">Uncategorized</h2>
        <div class="grid">${uncategorized.map(cardHtml).join('')}
        </div>
      </div>` : '';

  mainContent = `<div class="chips-bar">
      ${chips}
    </div>
    <div id="sections">${categorySections}${uncategorizedSection}
    </div>`;

  filterScript = `
  <script>
    const chips = document.querySelectorAll('.chip');
    const sections = document.querySelectorAll('.section');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.dataset.filter;
        sections.forEach(section => {
          if (filter === '__all__') {
            section.hidden = false;
            const h = section.querySelector('.section-heading');
            if (h) h.hidden = false;
          } else {
            const match = section.dataset.section === filter;
            section.hidden = !match;
            if (match) {
              const h = section.querySelector('.section-heading');
              if (h) h.hidden = true;
            }
          }
        });
      });
    });
  </script>`;
}

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
    .chips-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 28px;
    }
    .chip {
      padding: 6px 16px;
      border-radius: 999px;
      border: 1px solid rgba(160, 255, 172, 0.35);
      background: rgba(0, 26, 63, 0.5);
      color: #cbd5e1;
      font-size: 0.875rem;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s, color 0.2s;
    }
    .chip:hover {
      border-color: rgba(160, 255, 172, 0.7);
      background: rgba(0, 40, 90, 0.7);
      color: #a0ffac;
    }
    .chip.active {
      border-color: #a0ffac;
      background: rgba(160, 255, 172, 0.15);
      color: #a0ffac;
    }
    .section-heading {
      font-size: 1.2rem;
      color: #a0ffac;
      margin: 0 0 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(160, 255, 172, 0.2);
    }
    .section {
      margin-bottom: 32px;
    }
    .section:last-child {
      margin-bottom: 0;
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
    ${mainContent}
  </div>${filterScript}
</body>
</html>`;

writeFileSync(outputFile, html);
console.log(`Homepage generated with ${sorters.length} sorter(s) → ${outputFile}`);
