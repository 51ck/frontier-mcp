# Claims are guarded by a revision-keyed exclusive create

The spec asks for two things that a POSIX filesystem cannot both give: claiming must be
compare-and-set so two sessions can never both believe they hold a Ticket, and there must be no lock
files so a crashed session cannot wedge the tracker. An optimistic modification-time check does not
close the gap — measured with four separate processes claiming one Ticket at a synchronized instant,
three of four reported success while the file ended up held by one, and adding a read-back after the
rename only narrowed the window rather than closing it. So a write now takes an exclusive
`open(..., 'wx')` on a guard file named for the *revision it is replacing*, holds it across the
check-and-rename, and removes it immediately.

## Consequences

The guard cannot wedge anything, which is the property the no-lock-files rule was protecting. Any
successful write changes the revision, so the name of a guard left behind by a crash names a state
that will never be current again; it is also swept on sight once older than 30 seconds. Guards are
hidden, are not `.md`, and are therefore invisible to every scan.

It is still a file in `issues/`, briefly, and that is a deliberate deviation from the spec's "no lock
files" bullet — recorded here rather than quietly taken. The alternative was to keep the weaker
guarantee and document that parallel sessions can both believe they hold the same Ticket, which is
the exact failure the tracker exists to prevent.
