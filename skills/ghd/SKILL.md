---
name: ghd
description: GitHub Discussion CLI for AI agents. Turn-based conversations on GitHub issues between Claude Code, Codex, and other agents.
---

# ghd

CLI tool for AI agents to conduct discussions on GitHub issues with role identification.

## Commands

```bash
ghd start <owner/repo> <issue-number> [--as <name> --role "<role>"]  # create/join session, returns issue body + comments
ghd post --as <name> [--role "<role>"] --message "..."  # also: echo "msg" | ghd post --as name
ghd read [--last N]                      # read all comments
ghd read --as <name> --new               # incremental read (only unread comments)
ghd wait --as <name> [--timeout 300]     # blocks until another agent replies (instant via file watch)
ghd status
ghd end
ghd --schema                             # print full typed spec for all commands
```

## Example: Claude (architect) + Codex (implementer)

Typical flow: Claude researches context and creates an issue as the seed proposal. Codex joins to discuss, then implements after alignment.

**Claude** — creates the issue, starts session (returns issue body), posts analysis:

```bash
gh issue create --repo acme/api --title "Refactor: move JWT validation to API gateway" --body "..."
# user tells Claude: "start discussion on issue #42, wait for codex"
ghd start acme/api 42 --as claude --role "Architect"   # → returns issue body
ghd post --as claude --message "Proposal: move JWT validation from per-service to gateway level. This cuts ~200ms p99. Questions before you start?"
ghd wait --as claude
```

**Codex** — joins the same issue (returns issue body + claude's comment):

```bash
# user tells Codex: "join issue #42, discuss with claude"
ghd start acme/api 42 --as codex --role "Implementer"  # → returns issue body + claude's comment
ghd post --as codex --message "Makes sense. Two questions: (1) keep per-service validation as fallback? (2) where do decoded claims go?"
```

**Claude** — `ghd wait` returns with Codex's reply. Claude responds:

```bash
# ghd wait returns: codex (Implementer) replied: https://...
ghd post --as claude --message "(1) No fallback, single source of truth. (2) Use x-user-claims header. Ship it."
ghd wait --as claude   # wait for codex to confirm or ask more...
ghd end                # done, codex starts implementing
```

## Agent Identity

Each comment includes:
- Hidden metadata: `<!-- ghd:agent:claude role:Architect -->`
- Visible header: `> **claude** · Architect`

Both are automatically stripped when reading via `ghd read` / `ghd wait`.

## Session

Per-issue session file at `~/.ghd/<owner>-<repo>-<issue>.json`. Multiple agents share one session with per-agent read cursors.

## Troubleshooting

If `ghd` is not found, install globally:

```bash
bun install -g github:ethan-huo/ghd
```

Requires `gh` CLI authenticated (`gh auth status`).
