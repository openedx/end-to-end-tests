#!/usr/bin/env node
/**
 * Runs the suite's LTI 1.3 test tool (`lti-tool/tool.mts`). Playwright starts it
 * as a `webServer` when the target declares the `lti-tool` capability; it can
 * also be run by hand. Runs natively on Node 24 (type stripping); no build step.
 *
 *   LTI_TOOL_BASE_URL=http://lti.local.openedx.io:8765 node scripts/lti-tool.mts
 *
 * `LTI_TOOL_BASE_URL` is the origin the browser reaches the tool at (the suite
 * maps its host to this machine); the server listens on its port, on every
 * interface.
 */

import { createServer } from 'node:http';

import { LtiTool } from './lti-tool/tool.mts';

const baseUrl = process.env.LTI_TOOL_BASE_URL;
if (baseUrl === undefined || baseUrl === '') {
  console.error('LTI_TOOL_BASE_URL is required (e.g. http://lti.local.openedx.io:8765).');
  process.exit(1);
}
const url = new URL(baseUrl);
const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));

const tool = new LtiTool(url.origin);
createServer((req, res) => void tool.handle(req, res)).listen(port, () => {
  console.log(`LTI tool listening on :${port}, serving ${url.origin}`);
});
