import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { frontierOf } from './frontier.ts';
import { createIndexRegistry } from './workspace-index.ts';
import { createMarkdownDriver } from './storage/markdown/driver.ts';
import type { StorageDriver } from './storage/driver.ts';
import {
  boardFor,
  getBoardDescription,
  getBoardInputSchema,
  renderBoard,
} from './tools/get-board.ts';
import {
  getTicketsDescription,
  getTicketsInputSchema,
  renderTickets,
} from './tools/get-tickets.ts';
import {
  listEffortsDescription,
  listEffortsInputSchema,
  renderEfforts,
} from './tools/list-efforts.ts';
import { resolveWorkspace, type WorkspaceContext } from './workspace.ts';

export const SERVER_NAME = 'frontier';
export const SERVER_VERSION = '0.1.0';

export interface CreateServerOptions {
  /** The server process's working directory. */
  readonly cwd?: string;
  readonly env?: Readonly<Partial<Record<string, string>>>;
  /**
   * The storage driver to bind to a workspace. Markdown in v1; the seam is here
   * so a SQLite driver can be swapped in without touching the tool layer.
   */
  readonly createDriver?: (root: string) => StorageDriver;
}

export interface Frontier {
  readonly server: McpServer;
  /**
   * Build the index for the session's own workspace. Calls resolve their own
   * workspace anyway, so a failure here is not fatal — it only forfeits the
   * warm start.
   */
  warmUp(): Promise<void>;
}

export function createFrontier(options: CreateServerOptions = {}): Frontier {
  const context: WorkspaceContext = {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
  };
  const registry = createIndexRegistry(options.createDriver ?? createMarkdownDriver);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'list_efforts',
    {
      title: 'List Efforts',
      description: listEffortsDescription,
      inputSchema: listEffortsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ root }) => {
      const workspace = resolveWorkspace(root, context);
      const index = registry.forWorkspace(workspace);
      const [efforts, tickets] = await Promise.all([index.efforts(), index.tickets()]);

      return {
        content: [{ type: 'text', text: renderEfforts(workspace, efforts, frontierOf(tickets)) }],
      };
    },
  );

  server.registerTool(
    'get_board',
    {
      title: 'Get Board',
      description: getBoardDescription,
      inputSchema: getBoardInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ effort: slug, root }) => {
      const workspace = resolveWorkspace(root, context);
      const index = registry.forWorkspace(workspace);
      const [efforts, tickets] = await Promise.all([index.efforts(), index.tickets()]);

      const effort = efforts.find(candidate => candidate.slug === slug);
      if (effort === undefined) {
        throw new Error(
          `No Effort '${slug}' in ${workspace}. Known: ${efforts.map(e => e.slug).join(', ') || '(none)'}`,
        );
      }

      return { content: [{ type: 'text', text: renderBoard(boardFor(effort, tickets)) }] };
    },
  );

  server.registerTool(
    'get_tickets',
    {
      title: 'Get Tickets',
      description: getTicketsDescription,
      inputSchema: getTicketsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ ids, root }) => {
      const workspace = resolveWorkspace(root, context);
      const tickets = await registry.forWorkspace(workspace).tickets();
      const wanted = new Set(ids);

      return {
        content: [
          {
            type: 'text',
            text: renderTickets(
              ids,
              tickets.filter(
                ticket =>
                  wanted.has(ticket.handle) || (ticket.id !== undefined && wanted.has(ticket.id)),
              ),
            ),
          },
        ],
      };
    },
  );

  return {
    server,
    async warmUp() {
      const workspace = resolveWorkspace(undefined, context);
      await registry.forWorkspace(workspace).efforts();
    },
  };
}
