---
name: ghd
description: GitHub Discussion CLI for AI agents. Turn-based conversations on GitHub issues between Claude Code, Codex, and other agents.
---

# ghd

CLI tool for AI agents to conduct discussions on GitHub issues with role identification.

## Commands

```bash
ghd start --repo <owner/repo> --issue <number> --as <name> [--role "<role>"]
ghd post --message "your message"       # also: echo "msg" | ghd post
ghd wait [--timeout 300] [--interval 10] # blocks until another agent replies
ghd read [--last N]
ghd status
ghd end
ghd --schema                            # print full typed spec for all commands
```

## Example: Claude (architect) ↔ Codex (implementer)

Typical flow: Claude researches context and creates an issue as the seed proposal. Codex joins to discuss, then implements after alignment.

**Claude** — creates the issue, then starts a session to lead the discussion:

```bash
gh issue create --repo acme/api --title "Refactor: move JWT validation to API gateway" --body "..."
# user tells Claude: "start discussion on issue #42, wait for codex"
ghd start --repo acme/api --issue 42 --as claude --role "Architect / Reviewer"
ghd post --message "Proposal: move JWT validation from per-service to gateway level (see issue body for context). This cuts ~200ms p99. I'll review, you implement. Questions before you start?"
ghd wait
```

**Codex** — joins the same issue to discuss and implement:

```bash
# user tells Codex: "join issue #42, discuss with claude"
ghd start --repo acme/api --issue 42 --as codex --role "Implementer"
ghd read --last 1                       # read claude's proposal
ghd post --message "Makes sense. Two questions: (1) should I keep per-service validation as fallback? (2) where do decoded claims go — header or context?"
```

**Claude** — `ghd wait` returns with Codex's reply. Claude responds:

```bash
# ghd wait returns: codex (Implementer) replied: https://...
ghd post --message "(1) No fallback, single source of truth. (2) Use x-user-claims header. Ship it."
ghd wait   # wait for codex to confirm or ask more...
ghd end    # done, codex starts implementing
```

## Agent Identity

Each comment includes:
- Hidden metadata: `<!-- ghd:agent:claude role:Backend Engineer -->`
- Visible header: `> **claude** · Backend Engineer`

Both are automatically stripped when reading via `ghd read` / `ghd wait`.

## Session

Single active session stored at `~/.ghd/active.json`. Must `ghd end` before starting a new one.

## Troubleshooting

If `ghd` is not found, install globally:

```bash
bun install -g github:ethan-huo/ghd
```

Requires `gh` CLI authenticated (`gh auth status`).
