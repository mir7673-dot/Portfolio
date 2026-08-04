// One-time / repeatable bulk sync: cards.csv + works.csv + local Cards/Images folders → Supabase.
//
// Usage:
//   npm install
//   copy .env.example to .env and fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   npm run migrate
//
// Safe to re-run: cards are matched by `n`, works are matched by `slug` (derived from the
// image filename, or the title if there's no image). Existing rows are updated in place;
// new rows are inserted. Layout position (x/y/w/h) is only set on first insert so it won't
// clobber manual drag/resize edits made later from the Admin panel.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function parseCSV(text) {
  const rows = []; let cur = [], val = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (q) {
      if (c === '"' && n === '"') { val += '"'; i++; }
      else if (c === '"') { q = false; }
      else val += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { cur.push(val); val = ''; }
      else if (c === '\n') { cur.push(val); rows.push(cur); cur = []; val = ''; }
      else if (c === '\r') { /* skip */ }
      else val += c;
    }
  }
  if (val !== '' || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter(r => r.length && r.some(c => c.trim() !== ''));
}

function contentTypeFor(ext) {
  ext = ext.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

function findLocalFile(relPath) {
  // Windows filesystems are case-insensitive, but check a couple of common
  // casing variants for the folder name in case this ever runs elsewhere.
  const candidates = [relPath, relPath.replace(/^cards\//i, 'Cards/'), relPath.replace(/^images\//i, 'Images/')];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

async function uploadLocalImage(relPath, bucket) {
  const localPath = findLocalFile(relPath);
  if (!localPath) return null;
  const buf = fs.readFileSync(localPath);
  const ext = path.extname(localPath).slice(1) || 'png';
  const remoteName = path.basename(localPath);
  const { error } = await sb.storage.from(bucket).upload(remoteName, buf, {
    contentType: contentTypeFor(ext), upsert: true,
  });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(remoteName);
  return data.publicUrl;
}

async function syncCards() {
  if (!fs.existsSync('cards.csv')) { console.log('cards.csv not found, skipping cards sync'); return; }
  const rows = parseCSV(fs.readFileSync('cards.csv', 'utf-8'));
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idx = name => headers.indexOf(name);
  let ok = 0, fail = 0;
  for (const r of rows.slice(1)) {
    const n = parseInt(r[idx('n')]);
    if (!n) continue;
    const localImg = (r[idx('img')] || '').trim();
    const payload = {
      n,
      name: (r[idx('name')] || '').trim(),
      category: (r[idx('category')] || '').trim(),
      description: (r[idx('description')] || '').trim(),
      visited: /^(yes|y|true|1)$/i.test((r[idx('visited')] || '').trim()),
    };
    try {
      if (localImg) {
        const url = await uploadLocalImage(localImg, 'cards-images');
        if (url) payload.image_url = url;
      }
      const { error } = await sb.from('cards').upsert(payload, { onConflict: 'n' });
      if (error) throw error;
      ok++;
    } catch (err) {
      fail++;
      console.error(`card ${n} failed:`, err.message);
    }
  }
  console.log(`cards: ${ok} synced, ${fail} failed`);
}

async function syncWorks() {
  if (!fs.existsSync('works.csv')) { console.log('works.csv not found, skipping works sync'); return; }
  const rows = parseCSV(fs.readFileSync('works.csv', 'utf-8'));
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idx = name => headers.indexOf(name);
  const colW = 48, leftX = 1, rightX = 51, gap = 24, capH = 26;
  let colH = [0, 0];
  let ok = 0, fail = 0;
  for (const r of rows.slice(1)) {
    const title = (r[idx('title')] || '').trim();
    if (!title) continue;
    const localImg = (r[idx('img')] || '').trim();
    const slug = localImg
      ? path.basename(localImg, path.extname(localImg)).toLowerCase()
      : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const payload = {
      slug, title,
      type: (r[idx('type')] || '3D').trim(),
      year: (r[idx('year')] || '').trim(),
      medium: (r[idx('medium')] || '').trim(),
      status: (r[idx('status')] || '').trim(),
      short: (r[idx('short')] || '').trim(),
      description: (r[idx('desc')] || '').trim(),
      color: (r[idx('color')] || '#f3f3f1').trim() || '#f3f3f1',
    };
    try {
      if (localImg) {
        const url = await uploadLocalImage(localImg, 'works-images');
        if (url) payload.image_url = url;
      }
      const { data: existing } = await sb.from('works').select('id').eq('slug', slug).maybeSingle();
      if (existing) {
        const { error } = await sb.from('works').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const col = colH[0] <= colH[1] ? 0 : 1;
        payload.x = col === 0 ? leftX : rightX;
        payload.w = colW;
        payload.y = colH[col];
        payload.h = 320;
        colH[col] += payload.h + capH + gap;
        const { error } = await sb.from('works').insert(payload);
        if (error) throw error;
      }
      ok++;
    } catch (err) {
      fail++;
      console.error(`work "${title}" failed:`, err.message);
    }
  }
  console.log(`works: ${ok} synced, ${fail} failed`);
}

async function main() {
  await syncCards();
  await syncWorks();
  console.log('done');
}
main();
