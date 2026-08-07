import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Ticket } from './domain.ts';
import { frontierOf } from './frontier.ts';
import { createIndexRegistry } from './workspace-index.ts';
import { createMarkdownDriver } from './storage/markdown/driver.ts';
import type { StorageDriver } from './storage/driver.ts';
import { RevisionMismatch } from './storage/driver.ts';
import {
  createTicketsDescription,
  createTicketsInputSchema,
  planBatch,
  renderCreated,
} from './tools/create-tickets.ts';
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
import {
  editFor,
  renderUpdate,
  updateTicketDescription,
  updateTicketInputSchema,
} from './tools/update-ticket.ts';
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

/** Injectable so a test can pin the moment a claim was taken. */
function now(): string {
  return new Date().toISOString();
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

  server.registerTool(
    'create_tickets',
    {
      title: 'Create Tickets',
      description: createTicketsDescription,
      inputSchema: createTicketsInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ effort, create, tickets, root }) => {
      const workspace = resolveWorkspace(root, context);
      const index = registry.forWorkspace(workspace);

      // Every reference resolves before anything is written, so a refusal —
      // an unknown key, a cycle — leaves the workspace exactly as it was. The
      // one rule that needs real ids runs under the driver's reservations,
      // still before any file lands.
      const { drafts, validate } = planBatch(tickets, await index.tickets());
      const created = await index.create(effort, drafts, {
        createEffort: create === true,
        validate,
      });

      return { content: [{ type: 'text', text: renderCreated(effort, created) }] };
    },
  );

  server.registerTool(
    'update_ticket',
    {
      title: 'Update Ticket',
      description: updateTicketDescription,
      inputSchema: updateTicketInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ id, claim, resolve, drop, status, triage, blocked_by, comment, tick, root }) => {
      const workspace = resolveWorkspace(root, context);
      const index = registry.forWorkspace(workspace);
      const tickets = await index.tickets();

      const request = { claim, resolve, drop, status, triage, blocked_by, comment, tick };
      const find = (from: readonly Ticket[]): Ticket => {
        const ticket = from.find(entry => entry.id === id || entry.handle === id);
        if (ticket === undefined) throw new Error(`No Ticket '${id}' in ${workspace}.`);
        return ticket;
      };

      const ticket = find(tickets);

      let written: Ticket;
      try {
        written = await index.update(
          ticket.handle,
          editFor(ticket, tickets, request, now()),
          ticket.revision,
        );
      } catch (error) {
        if (!(error instanceof RevisionMismatch)) throw error;

        // The Ticket moved under us. Re-read and re-validate, but only to
        // explain why: most often a parallel session claimed it, and "already
        // claimed by agent-3" is the useful message. The write is never
        // retried — a mismatch may equally be somebody's hand edit, and
        // overwriting that is exactly what the check exists to prevent.
        const fresh = await index.tickets();
        editFor(find(fresh), fresh, request, now());
        throw error;
      }

      return { content: [{ type: 'text', text: renderUpdate(written) }] };
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
