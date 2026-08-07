# Frontmatter round-trips through a YAML document, not a frontmatter library

A write must not reformat the parts of a file it did not touch, because these files are hand-edited
and diffed in git and a write that reflows unrelated frontmatter turns every mutation into a noisy
diff. `gray-matter`, the reflexive choice, cannot do this: it re-serializes the whole block through
js-yaml on write, dropping comments and normalizing quoting and list style. So frontmatter is parsed
with the `yaml` package's `parseDocument`, mutated as nodes, and stringified back — which preserves
comments, key order, and scalar style for every field a write did not touch. Splitting the `---`
fence is a handful of lines we own, and that fence split was all `gray-matter` was contributing.

## Consequences

Writes mutate the parsed document rather than rebuilding a plain object and re-emitting it. Reading
frontmatter into a plain object is still fine — but the object is a projection, and the document is
what gets written back.
