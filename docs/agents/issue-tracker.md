# Issue tracker

## Where issues live

**GitHub Issues** on `ignaciogarcia-dev/reconbanker`, via the `gh` CLI.

- Create: `gh issue create --title <title> --body-file <file> --label <label>`
- List: `gh issue list --label <label>`
- Read: `gh issue view <number>`

## PRs as a request surface

**Off.** Pull requests are not part of the triage queue — only issues are.

## Triage labels

The five canonical triage roles, each label string equal to its name:

| Role | Label |
|---|---|
| Needs triage | `needs-triage` |
| Needs info | `needs-info` |
| Ready for agent | `ready-for-agent` |
| Ready for human | `ready-for-human` |
| Won't fix | `wontfix` |

Present in the repository so far: `wontfix` (GitHub default) and `ready-for-agent` (created
2026-08-13). The remaining three are created on first use.

## Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repository root. Neither exists yet —
`docs/architecture.md` is currently the de facto domain reference, and its vocabulary (bounded
contexts, ports and adapters, one-shot vs persistent session types, simple vs assisted login modes,
failure categories, monitor stop reasons) should be used until a `CONTEXT.md` is written.
