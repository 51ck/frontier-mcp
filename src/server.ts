import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Ticket } from './domain.ts';
import { frontierOf } from './frontier.ts';
import { createIndexRegistry } from './workspace-index.ts';
import { createMarkdownDriver } from './storage/markdown/driver.ts';
import type { StorageDriver, TicketWriteResult } from './storage/driver.ts';
import { NoSuchMap, RevisionMismatch } from './storage/driver.ts';
import {
  createTicketsDescription,
  createTicketsInputSchema,
  planBatch,
  renderCreated,
} from './tools/create-tickets.ts';
import { editMapDescription, editMapInputSchema, mapEditFor, renderMap } from './tools/edit-map.ts';
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
  migrateEffortDescription,
  migrateEffortInputSchema,
  renderMigration,
} from './tools/migrate-effort.ts';
import { renderSpec, specDescription, specInputSchema } from './tools/spec.ts';
import { withWorkspace } from './tools/workspace-line.ts';
import {
  editFor,
  renderUpdate,
  updateTicketDescription,
  updateTicketInputSchema,
} from './tools/update-ticket.ts';
import { readTrackerDoc, TRACKER_DOC_URI } from './tracker-doc.ts';
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
  /** Debounce filesystem watcher events. Tests may shorten this. */
  readonly watcherDebounceMs?: number;
}

export interface FrontierMCP {
  readonly server: McpServer;
  /**
   * Build the index for the session's own workspace. Calls resolve their own
   * workspace anyway, so a failure here is not fatal — it only forfeits the
   * warm start.
   */
  warmUp(): Promise<void>;
  /** Stop watchers and close the transport. */
  close(): Promise<void>;
}

/** Injectable so a test can pin the moment a claim was taken. */
function now(): string {
  return new Date().toISOString();
}

export function createFrontierMCP(options: CreateServerOptions = {}): FrontierMCP {
  const context: WorkspaceContext = {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
  };
  const registry = createIndexRegistry(
    options.createDriver ?? createMarkdownDriver,
    options.watcherDebounceMs === undefined ? {} : { watcherDebounceMs: options.watcherDebounceMs },
  );

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.registerResource(
    'tracker-doc',
    TRACKER_DOC_URI,
    {
      title: 'Issue tracker configuration',
      description:
        'Tracker conventions and FrontierMCP tool mapping. Read once at setup; file conventions work as fallback without the server.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [{ uri: TRACKER_DOC_URI, mimeType: 'text/markdown', text: readTrackerDoc() }],
    }),
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

      return {
        content: [{ type: 'text', text: withWorkspace(workspace, renderCreated(effort, created)) }],
      };
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

      let written: TicketWriteResult;
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

      return {
        content: [
          {
            type: 'text',
            text: withWorkspace(workspace, renderUpdate(written.ticket, written.warnings)),
          },
        ],
      };
    },
  );

  server.registerTool(
    'edit_map',
    {
      title: 'Edit Map',
      description: editMapDescription,
      inputSchema: editMapInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({
      effort,
      create,
      destination,
      notes,
      add_fog,
      graduate_fog,
      rule_out,
      expected_revision,
      root,
    }) => {
      const workspace = resolveWorkspace(root, context);
      const index = registry.forWorkspace(workspace);
      const edit = mapEditFor({ destination, notes, add_fog, graduate_fog, rule_out });
      const mutating = Object.keys(edit).length > 0;

      // create alone is for starting a missing Effort/Map — not a flag to send
      // on every call. With no section fields, an existing Map is a plain read
      // (no expected_revision); only a missing Map takes the write path.
      let document;
      let wrote = mutating;
      if (!mutating) {
        try {
          document = await index.readMap(effort);
        } catch (error) {
          if (!(create === true && error instanceof NoSuchMap)) throw error;
          document = await index.editMap(effort, edit, undefined, { createEffort: true });
          wrote = true;
        }
      } else {
        document = await index.editMap(effort, edit, expected_revision, {
          createEffort: create === true,
        });
      }

      const rendered = renderMap(effort, document);
      return {
        content: [{ type: 'text', text: wrote ? withWorkspace(workspace, rendered) : rendered }],
      };
    },
  );

  server.registerTool(
    'spec',
    {
      title: 'Spec',
      description: specDescription,
      inputSchema: specInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ effort, create, content, expected_revision, root }) => {
      const workspace = resolveWorkspace(root, context);
      const index = registry.forWorkspace(workspace);

      const document =
        content === undefined
          ? await index.readSpec(effort)
          : await index.putSpec(effort, content, expected_revision, {
              createEffort: create === true,
            });

      const rendered = renderSpec(effort, document);
      return {
        content: [
          {
            type: 'text',
            text: content === undefined ? rendered : withWorkspace(workspace, rendered),
          },
        ],
      };
    },
  );

  server.registerTool(
    'migrate_effort',
    {
      title: 'Migrate Effort',
      description: migrateEffortDescription,
      inputSchema: migrateEffortInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ effort, preview, rename, root }) => {
      const workspace = resolveWorkspace(root, context);
      const index = registry.forWorkspace(workspace);
      const report = await index.migrate(effort, {
        preview: preview === true,
        rename: rename === true,
      });

      const rendered = renderMigration(report);
      return {
        content: [
          {
            type: 'text',
            text: preview === true ? rendered : withWorkspace(workspace, rendered),
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
    async close() {
      registry.closeAll();
      await server.close();
    },
  };
}
