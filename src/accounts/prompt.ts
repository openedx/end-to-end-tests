import { existsSync } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import * as readline from 'node:readline/promises';

import { test } from '@playwright/test';

/** Path to the controlling terminal on POSIX systems. */
const TTY_DEVICE = '/dev/tty';

/**
 * Cached terminal handles. We open `/dev/tty` once and read from it on demand
 * rather than holding a persistent readline stream: a flowing stream on the tty
 * keeps Node's event loop alive, so the worker would never exit after the test
 * finishes. An idle open fd does not keep the loop alive, and a read is only
 * pending while we actually wait for input — so the process exits cleanly once
 * prompting is done, yet stays alive while a person is typing.
 */
let ttyInput: FileHandle | undefined;
let ttyOutput: FileHandle | undefined;
let ttyOpened = false;
/** Bytes read past a line terminator, carried over to the next prompt. */
let carryOver = '';

async function ensureTerminal(): Promise<{ input: FileHandle; output: FileHandle } | undefined> {
  if (!ttyOpened) {
    ttyOpened = true;
    // Playwright runs specs in worker subprocesses whose `process.stdin` is not
    // attached to the terminal, so we talk to `/dev/tty` directly (the trick git
    // and sudo use when stdin is redirected).
    if (process.platform !== 'win32' && existsSync(TTY_DEVICE)) {
      try {
        ttyInput = await open(TTY_DEVICE, 'r');
        ttyOutput = await open(TTY_DEVICE, 'w');
        process.once('exit', () => {
          void ttyInput?.close();
          void ttyOutput?.close();
        });
      } catch {
        ttyInput = undefined;
        ttyOutput = undefined;
      }
    }
  }
  return ttyInput && ttyOutput ? { input: ttyInput, output: ttyOutput } : undefined;
}

/** Reads a single line from an open terminal handle, on demand. */
async function readLine(handle: FileHandle): Promise<string> {
  for (;;) {
    const newlineAt = carryOver.indexOf('\n');
    if (newlineAt >= 0) {
      const line = carryOver.slice(0, newlineAt);
      carryOver = carryOver.slice(newlineAt + 1);
      return line.replace(/\r$/, '');
    }
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
    if (bytesRead === 0) {
      const line = carryOver;
      carryOver = '';
      return line.replace(/\r$/, '');
    }
    carryOver += buffer.toString('utf8', 0, bytesRead);
  }
}

/** Fallback prompt (e.g. Windows) using the standard streams. */
async function promptViaStdin(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`\n${question}`)).trim();
  } finally {
    rl.close();
    // Don't let a lingering stdin reference keep the process alive.
    process.stdin.unref();
  }
}

/**
 * Prompts the operator on the terminal and resolves with their trimmed answer.
 *
 * Interactive backends block on a human, so this first removes the running test's
 * timeout — otherwise the default budget would abort the prompt. Runs that use an
 * interactive backend should use `--workers=1` so prompts don't interleave.
 */
export async function promptOperator(question: string): Promise<string> {
  // No time limit while we wait for a person.
  test.info().setTimeout(0);

  const terminal = await ensureTerminal();
  if (!terminal) {
    return promptViaStdin(question);
  }

  await terminal.output.write(`\n${question}`);
  const answer = await readLine(terminal.input);
  return answer.trim();
}
