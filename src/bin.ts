#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createFrontierMCP } from './server.ts';

const frontier = createFrontierMCP();

// The index is built by a full scan before the transport connects, so the first
// call is served warm. A workspace that cannot be scanned yet is not fatal:
// every call resolves its own workspace regardless.
await frontier.warmUp().catch(() => {});

await frontier.server.connect(new StdioServerTransport());
