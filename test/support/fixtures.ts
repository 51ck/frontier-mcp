import type { FixtureTree } from './harness.ts';

export function ticket(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
kind: build
status: open
triage: ready-for-agent
blocked_by: []
---

# ${id} — ${title}
`;
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
