# The Map's Decisions-so-far is derived from tickets, not stored

`/wayfinder` states that the Map is "an index, not a store" — a decision lives in exactly one place,
its ticket — yet the skill also has each session hand-append a pointer line to the Map's
Decisions-so-far, which is the step that gets skipped and silently makes the Map lie. So the server
computes that section from the resolved tickets instead of reading it, and writes the rendered result
back into `map.md` inside `<!-- GENERATED -->` fences, replacing the whole block on every mutation.

## Consequences

The block in `map.md` is a cache for human readers, not state: text typed inside the fences is
destroyed on the next write, and the fence says so. Hand-editing a ticket's answer outside the server
leaves the block stale until the next mutation or fs-watcher event re-renders it.
