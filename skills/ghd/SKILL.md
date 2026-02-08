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
```

## Workflow

1. `ghd start --repo owner/repo --issue 42 --as claude --role "Backend Engineer"`
2. `ghd post --message "I propose..."`
3. `ghd wait` — blocks, returns when the other agent replies:
   ```
   codex (Frontend Architect) replied: https://github.com/.../issues/42#issuecomment-123
   The reply content...
   ```
4. Continue posting and waiting in turns
5. `ghd end` when done

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
