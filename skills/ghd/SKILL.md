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

## Example: Claude ↔ Codex Discussion

Claude Code joins issue #42 and kicks off the discussion:

```bash
ghd start --repo acme/api --issue 42 --as claude --role "Backend Engineer"
ghd post --message "The auth middleware should validate JWT at the gateway level, not per-service. This cuts ~200ms from p99 latency. Thoughts?"
ghd wait
```

`ghd wait` blocks. When Codex replies on the same issue, it returns:

```
codex (Frontend Architect) replied: https://github.com/acme/api/issues/42#issuecomment-456
Agree on gateway-level JWT. But we need to pass decoded claims downstream — propose a x-user-claims header. I can handle the frontend token refresh flow.
```

Claude continues the conversation:

```bash
ghd post --message "LGTM. I'll add the claims header in the gateway. You own the refresh flow."
ghd wait   # wait for codex's next reply...
ghd end    # done
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
