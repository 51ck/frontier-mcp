import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/server';

import type { TicketSummary } from './domain.ts';
import { frontierOf } from './frontier.ts';
import { indexNames } from './names.ts';
import { createDriverRegistry } from './driver-registry.ts';
import { createMarkdownDriver } from './storage/markdown/driver.ts';
import type { StorageDriver, TicketWriteResult } from './storage/driver.ts';
import { NoSuchMap, NoSuchTicket, RevisionMismatch } from './storage/driver.ts';
import {
  checkTrackerDescription,
  checkTrackerInputSchema,
  renderCheck,
} from './tools/check-tracker.ts';
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
  renderExcluded,
  renderTickets,
} from './tools/get-tickets.ts';
import {
  listEffortsDescription,
  listEffortsInputSchema,
  renderEfforts,
  renderNoTracker,
} from './tools/list-efforts.ts';
import { renderSpec, specDescription, specInputSchema } from './tools/spec.ts';
import { withWorkspace } from './tools/workspace-line.ts';
import {
  editFor,
  graphEffect,
  renderUpdate,
  updateTicketDescription,
  updateTicketInputSchema,
} from './tools/update-ticket.ts';
import { readTrackerDoc, TRACKER_DOC_URI } from './tracker-doc.ts';
import { locateWorkspace, resolveWorkspace, type WorkspaceContext } from './workspace.ts';

export const SERVER_NAME = 'frontier';

/**
 * The version the handshake reports, read from `package.json` rather than
 * written out here.
 *
 * A release bumps `package.json` and touches nothing in `src`, so a literal is
 * correct only until the next release and then misreports every published
 * build — silently, because nothing compares the two. The handshake is the one
 * place a client learns which build it is talking to, so it has to come from
 * the file that actually gets bumped.
 *
 * Resolved from this module rather than the working directory, for the same
 * reason {@link readTrackerDoc} is: the server runs from the user's repo, not
 * from its own install. `package.json` ships in every npm tarball regardless of
 * the `files` field, and sits one level above both `src/` and `dist/`.
 */
export const SERVER_VERSION: string = readPackageVersion();

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const { version } = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
    version: string;
  };
  return version;
}

export interface CreateServerOptions {
  /** The server process's working directory. */
  readonly cwd?: string;
  readonly env?: Readonly<Partial<Record<string, string>>>;
  /**
   * The storage driver to bind to a workspace. Markdown in v1; the seam is here
   * so a SQLite driver can be swapped in without touching the tool layer.
   */
  readonly createDriver?: (root: string) => StorageDriver;
  /**
   * Debounce filesystem watcher events in the default markdown driver. Tests
   * may shorten it, or push it past the test to pin what a read actually read.
   * Ignored when `createDriver` is supplied — a driver constructs its own.
   */
  readonly watcherDebounceMs?: number;
  /**
   * Watch directory by directory, as on Linux, whatever the platform, so a
   * test on macOS runs the mode Linux runs. Only `true` exists: no value can
   * select the recursive watch where it is not native (T99). Ignored when
   * `createDriver` is supplied.
   *
   * @internal
   */
  readonly watcherPerDirectory?: true;
}

export interface FrontierMCP {
  readonly server: McpServer;
  /**
   * Warm the driver for the session's own workspace. Calls resolve their own
   * workspace anyway, so a failure here is not fatal — it only forfeits the
   * warm start.
   */
  warmUp(): Promise<void>;
  /** Close every open driver and the transport. */
  close(): Promise<void>;
}

/** Injectable so a test can pin the moment a claim was taken. */
/** Every schema key, reserved from `extra` and `drop_keys`: the contract's own list, so a new field is reserved with no change here. */
function reservedKeys(driver: StorageDriver): ReadonlySet<string> {
  return new Set(driver.contract().fields.map(field => field.key));
}

function now(): string {
  return new Date().toISOString();
}

export function createFrontierMCP(options: CreateServerOptions = {}): FrontierMCP {
  const context: WorkspaceContext = {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
  };
  const registry = createDriverRegistry(
    options.createDriver ??
      (root =>
        createMarkdownDriver(root, {
          ...(options.watcherDebounceMs === undefined
            ? {}
            : { watcherDebounceMs: options.watcherDebounceMs }),
          ...(options.watcherPerDirectory === undefined
            ? {}
            : { watcherPerDirectory: options.watcherPerDirectory }),
        })),
  );

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    // `listChanged` is stated on both rather than defaulted: v2 advertises a
    // declared `tools: {}` / `resources: {}` as `listChanged: true` at
    // construction, and this server sends neither notification. The one
    // resource is static packaged configuration and the tool set is fixed at
    // build time, so advertising either would invite a client to wait for an
    // update that never comes.
    { capabilities: { tools: { listChanged: false }, resources: { listChanged: false } } },
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
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ root }) => {
      const { root: workspace, resolvedBy } = locateWorkspace(root, context);
      const driver = registry.forWorkspace(workspace);
      const absent = driver.absentStorage();
      if (absent !== undefined) {
        return {
          content: [
            {
              type: 'text',
              text: renderNoTracker(workspace, SERVER_VERSION, resolvedBy, absent),
            },
          ],
        };
      }
      const [efforts, tickets] = await Promise.all([driver.listEfforts(), driver.listTickets()]);

      return {
        content: [
          {
            type: 'text',
            text: renderEfforts(workspace, SERVER_VERSION, efforts, frontierOf(tickets)),
          },
        ],
      };
    },
  );

  server.registerTool(
    'get_board',
    {
      title: 'Get Board',
      description: getBoardDescription,
      inputSchema: getBoardInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ effort: slug, root }) => {
      const workspace = resolveWorkspace(root, context);
      const driver = registry.forWorkspace(workspace);
      const [efforts, tickets] = await Promise.all([driver.listEfforts(), driver.listTickets()]);

      const effort = efforts.find(candidate => candidate.slug === slug);
      if (effort === undefined) {
        throw new Error(
          `No Effort '${slug}' in ${workspace}. Known: ${efforts.map(e => e.slug).join(', ') || '(none)'}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: renderBoard(boardFor(effort, tickets, driver.workspaceWarnings())),
          },
        ],
      };
    },
  );

  server.registerTool(
    'get_tickets',
    {
      title: 'Get Tickets',
      description: getTicketsDescription,
      inputSchema: getTicketsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ ids, root }) => {
      const workspace = resolveWorkspace(root, context);
      const driver = registry.forWorkspace(workspace);
      const { tickets, diagnostics, all } = await driver.readTickets(ids);
      return { content: [{ type: 'text', text: renderTickets(ids, tickets, diagnostics, all) }] };
    },
  );

  server.registerTool(
    'create_tickets',
    {
      title: 'Create Tickets',
      description: createTicketsDescription,
      inputSchema: createTicketsInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ effort, create, tickets, root }) => {
      const workspace = resolveWorkspace(root, context);
      const driver = registry.forWorkspace(workspace);

      // Every name and reference is settled before anything is written, so a
      // refusal — a taken name, a cycle — leaves the workspace exactly as it
      // was. The driver runs the same rules again on a fresh read.
      const { drafts, settle } = planBatch(
        tickets,
        await driver.listTickets(),
        effort,
        tickets.some(ticket => ticket.extra !== undefined) ? reservedKeys(driver) : new Set(),
      );
      const created = await driver.createTickets(effort, drafts, {
        createEffort: create === true,
        settle,
      });

      // The files have landed: a scan that fails now must not turn a completed
      // creation into a reported failure, so the result goes out without Edges.
      const names = await driver.listTickets().then(indexNames, () => undefined);

      return {
        content: [
          { type: 'text', text: withWorkspace(workspace, renderCreated(effort, created, names)) },
        ],
      };
    },
  );

  server.registerTool(
    'update_ticket',
    {
      title: 'Update Ticket',
      description: updateTicketDescription,
      inputSchema: updateTicketInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      id,
      claim,
      resolve,
      drop,
      reopen,
      release,
      status,
      triage,
      blocked_by,
      tags,
      comment,
      tick,
      drop_keys,
      extra,
      title,
      kind,
      type,
      root,
    }) => {
      const workspace = resolveWorkspace(root, context);
      const driver = registry.forWorkspace(workspace);
      const tickets = await driver.listTickets();
      // A marked file excluded for its faults is never written; say why, not just "no Ticket".
      if (indexNames(tickets).input(id).length === 0) {
        const diagnostics = (await driver.diagnosticsFor([id])).get(id) ?? [];
        if (diagnostics.length > 0) {
          throw new Error(`Nothing was written: ${renderExcluded(id, diagnostics)}`);
        }
      }

      const request = {
        claim,
        resolve,
        drop,
        reopen,
        release,
        status,
        triage,
        blocked_by,
        tags,
        comment,
        tick,
        drop_keys,
        extra,
        title,
        kind,
        type,
      };
      const reserved =
        extra === undefined && drop_keys === undefined ? new Set<string>() : reservedKeys(driver);
      const find = (from: readonly TicketSummary[]): readonly [TicketSummary, number, string] => {
        const names = indexNames(from);
        const claimants = names.input(id);
        const [ticket] = claimants;
        if (ticket === undefined) throw new NoSuchTicket(id, workspace);
        return [ticket, claimants.length, names.addressOf(ticket)];
      };

      const [ticket, claimants, address] = find(tickets);
      // Two claimants: the driver refuses with the files named, which only it
      // knows, so ask it before any rule judges the first claimant. Asking
      // writes nothing, so a duplicate already fixed by hand is never rewritten.
      if (claimants > 1) await driver.assertAddressable(id);

      // Edges are settled against other Tickets, which the revision does not
      // guard, so the driver settles them again on the read it writes from.
      const at = now();
      const settle =
        blocked_by === undefined
          ? undefined
          : (fresh: readonly TicketSummary[]) =>
              editFor(find(fresh)[0], fresh, request, at, reserved);

      let written: TicketWriteResult;
      try {
        written = await driver.updateTicket(
          address,
          editFor(ticket, tickets, request, at, reserved),
          ticket.revision,
          settle,
        );
      } catch (error) {
        if (!(error instanceof RevisionMismatch)) throw error;

        // The Ticket moved under us. Re-read and re-validate, but only to
        // explain why: most often a parallel session claimed it, and "already
        // claimed by agent-3" is the useful message. The write is never
        // retried — a mismatch may equally be somebody's hand edit, and
        // overwriting that is exactly what the check exists to prevent.
        const fresh = await driver.listTickets();
        editFor(find(fresh)[0], fresh, request, now(), reserved);
        throw error;
      }

      return {
        content: [
          {
            type: 'text',
            text: withWorkspace(
              workspace,
              renderUpdate(
                written.ticket,
                written.warnings,
                resolve === undefined && drop === undefined
                  ? undefined
                  : graphEffect(tickets, ticket, written.ticket),
              ),
            ),
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
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
      const driver = registry.forWorkspace(workspace);
      const edit = mapEditFor({ destination, notes, add_fog, graduate_fog, rule_out });
      const mutating = Object.keys(edit).length > 0;

      // create alone is for starting a missing Effort/Map — not a flag to send
      // on every call. With no section fields, an existing Map is a plain read
      // (no expected_revision); only a missing Map takes the write path.
      let document;
      let wrote = mutating;
      if (!mutating) {
        try {
          document = await driver.readMap(effort);
        } catch (error) {
          if (!(create === true && error instanceof NoSuchMap)) throw error;
          document = await driver.editMap(effort, edit, undefined, { createEffort: true });
          wrote = true;
        }
      } else {
        document = await driver.editMap(effort, edit, expected_revision, {
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ effort, create, content, expected_revision, root }) => {
      const workspace = resolveWorkspace(root, context);
      const driver = registry.forWorkspace(workspace);

      const document =
        content === undefined
          ? await driver.readSpec(effort)
          : await driver.putSpec(effort, content, expected_revision, {
              createEffort: create === true,
            });

      const wrote = content !== undefined;

      const rendered = renderSpec(effort, document);
      return {
        content: [{ type: 'text', text: wrote ? withWorkspace(workspace, rendered) : rendered }],
      };
    },
  );

  server.registerTool(
    'check_tracker',
    {
      title: 'Check Tracker',
      description: checkTrackerDescription,
      inputSchema: checkTrackerInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    // A read, so it names no workspace (T11).
    async ({ effort, root }) => {
      const workspace = resolveWorkspace(root, context);
      const driver = registry.forWorkspace(workspace);
      const found = await driver.trackerDiagnostics();
      const efforts = found.filter(entry => entry.effort);
      if (effort !== undefined && !efforts.some(entry => entry.slug === effort)) {
        throw new Error(
          `No Effort '${effort}' in ${workspace}. Known: ${efforts.map(e => e.slug).join(', ') || '(none)'}`,
        );
      }
      const diagnostics = found
        .filter(entry => effort === undefined || (entry.effort && entry.slug === effort))
        .flatMap(entry => entry.diagnostics);
      return {
        content: [{ type: 'text', text: renderCheck(driver.contract(), diagnostics, effort) }],
      };
    },
  );

  return {
    server,
    async warmUp() {
      const workspace = resolveWorkspace(undefined, context);
      await registry.forWorkspace(workspace).listEfforts();
    },
    async close() {
      registry.closeAll();
      await server.close();
    },
  };
}
