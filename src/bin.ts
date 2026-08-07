#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createFrontier } from './server.ts';

const frontier = createFrontier();

// The index is built by a full scan before the transport connects, so the first
// call is served warm. A workspace that cannot be scanned yet is not fatal:
// every call resolves its own workspace regardless.
await frontier.warmUp().catch(() => {});

await frontier.server.connect(new StdioServerTransport());
