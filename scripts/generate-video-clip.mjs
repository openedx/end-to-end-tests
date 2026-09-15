#!/usr/bin/env node
/**
 * Regenerates `src/fixtures/assets/short-clip.webm`, the clip served in place of
 * a course's HTML5 video sources (see `src/fixtures/video-sources.ts`).
 *
 * Produced by Chromium itself — a canvas captured through `MediaRecorder` — so
 * no media toolchain is needed. Two seconds of a slowly shifting colour at 64×36,
 * VP8, a few kilobytes. Run from the repo root after `npm ci`:
 *
 *     node scripts/generate-video-clip.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const DURATION_MS = 2000;
const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'fixtures',
  'assets',
  'short-clip.webm',
);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
const base64 = await page.evaluate(async (durationMs) => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  document.body.appendChild(canvas);
  const context = canvas.getContext('2d');
  const recorder = new MediaRecorder(canvas.captureStream(15), {
    mimeType: 'video/webm;codecs=vp8',
    videoBitsPerSecond: 20_000,
  });
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });
  recorder.start();
  const started = performance.now();
  await new Promise((resolve) => {
    const paint = () => {
      const elapsed = performance.now() - started;
      context.fillStyle = `hsl(${(elapsed / 8) % 360}, 80%, 50%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (elapsed < durationMs) requestAnimationFrame(paint);
      else resolve();
    };
    paint();
  });
  recorder.stop();
  await stopped;
  const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
  return btoa(String.fromCharCode(...bytes));
}, DURATION_MS);
await browser.close();

const clip = Buffer.from(base64, 'base64');
writeFileSync(OUTPUT, clip);
console.log(`wrote ${clip.length} bytes to ${path.relative(process.cwd(), OUTPUT)}`);
