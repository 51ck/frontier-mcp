import type { FixtureTree } from './harness.ts';

export interface TicketFields {
  kind?: string;
  type?: string;
  status?: string;
  triage?: string;
  blocked_by?: string[];
  claimed_by?: string;
  claimed_at?: string;
  answer_gist?: string;
  dropped_reason?: string;
  body?: string;
}

/** A schema-conformant Ticket. Fields left out are simply absent from the frontmatter. */
export function ticket(id: string, title: string, fields: TicketFields = {}): string {
  const { body, blocked_by, ...scalars } = fields;
  const lines = [`id: ${id}`, `title: ${title}`, `kind: ${scalars.kind ?? 'build'}`];

  for (const key of [
    'type',
    'status',
    'triage',
    'claimed_by',
    'claimed_at',
    'answer_gist',
    'dropped_reason',
  ] as const) {
    const value = scalars[key];
    if (value !== undefined) lines.push(`${key}: ${value}`);
  }
  if (scalars.status === undefined) lines.push('status: open');
  lines.push(`blocked_by: [${(blocked_by ?? []).join(', ')}]`);

  return `---\n${lines.join('\n')}\n---\n\n# ${id} — ${title}\n\n${body ?? 'Body prose.'}\n`;
}

export function map(destination: string): string {
  return `---
header: map
---

# Map

## Destination

${destination}
`;
}

export function spec(title: string): string {
  return `---
header: spec
---

# ${title}
`;
}

/**
 * A workspace holding three Efforts that differ in which Header docs they carry
 * — a Spec, a Map, and both — plus a directory of loose scratch output that is
 * not an Effort at all.
 */
export const MIXED_WORKSPACE: FixtureTree = {
  '.git/HEAD': 'ref: refs/heads/main\n',

  '.scratch/alpha/spec.md': spec('Alpha'),
  '.scratch/alpha/issues/01-T1-first.md': ticket('T1', 'First'),
  '.scratch/alpha/issues/02-T2-second.md': ticket('T2', 'Second'),

  '.scratch/beta/map.md': map('Ship beta.'),
  '.scratch/beta/issues/01-T3-third.md': ticket('T3', 'Third'),

  '.scratch/gamma/map.md': map('Chart gamma, then spec it.'),
  '.scratch/gamma/spec.md': spec('Gamma'),

  '.scratch/notes/thinking.md': '# Loose scratch output, not an Effort\n',
};
