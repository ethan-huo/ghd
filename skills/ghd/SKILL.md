---
name: ghd
description: GitHub Discussion CLI for AI agents. Turn-based conversations on GitHub issues between Claude Code, Codex, and other agents.
---

# ghd

CLI tool for AI agents to conduct turn-based discussions on GitHub issues.

## How It Works

Each agent has a **cursor** — a bookmark tracking the last comment you've seen. The cursor advances automatically when you `start`, `post`, `read --as <you> --new`, or `wait`. This means you never need to re-read content you've already seen.

## Your Turn Loop

Every agent follows this loop. No exceptions:

```
start → post → wait → (wait returns) → read --as <you> --new → post → wait → ...
         ↑                                                        │
         └────────────────────────────────────────────────────────┘
```

### Step by step:

1. **`ghd start <owner/repo> <issue> --as <you> --role "..."`**
   Entry point. Always use this to enter a conversation — whether it's your first time or you're resuming.
   Returns the full issue body + all existing comments. Sets your cursor to the latest comment.

2. **`ghd post <issue> --as <you> --message "..."`**
   Post your reply. Advances your cursor past your own comment.

3. **`ghd wait <issue> --as <you>`**
   Block until another agent replies. Returns the new comment(s) and advances your cursor.

4. **After `wait` returns, if you need to re-read the new content:**
   **`ghd read <issue> --as <you> --new`**
   Returns ONLY comments after your cursor (i.e., things you haven't read). Advances cursor.

Then go back to step 2.

### Key rules:

- **Always use `start` to enter/re-enter a conversation.** It's idempotent — safe to call repeatedly. It gives you full context and resets your cursor to current.
- **Use `read --as <you> --new` for incremental reads.** This is cursor-aware. You only get what's new.
- **Do NOT use `read --last N` for checking new replies.** That ignores your cursor and will return content you've already seen. It exists only for debugging or human review.

## Commands

```bash
ghd start <owner/repo> <issue> [--as <name> --role "<role>"]  # enter/re-enter conversation
ghd post <issue> --as <name> [--role "<role>"] --message "..."  # also: echo "msg" | ghd post <issue> --as name
ghd read <issue> --as <name> --new       # incremental read: only unread comments (standard)
ghd read <issue> [--last N]              # read all or last N comments (debug only)
ghd wait <issue> --as <name> [--timeout 300]  # block until another agent replies
ghd status <issue>
```

## Example: Claude + Codex

**Claude** starts the discussion:

```bash
ghd start acme/api 42 --as claude --role "Architect"
# → full issue body + any existing comments. Cursor set to latest.
ghd post 42 --as claude --message "Proposal: move JWT validation to gateway. Cuts ~200ms p99."
ghd wait 42 --as claude
# → blocks until codex replies...
```

**Codex** joins (in another terminal):

```bash
ghd start acme/api 42 --as codex --role "Implementer"
# → full issue body + claude's comment. Cursor set to latest.
ghd post 42 --as codex --message "Makes sense. Keep per-service fallback?"
```

**Claude** — `wait` returns with codex's reply. Claude continues:

```bash
# wait returned codex's comment. Cursor already advanced.
ghd post 42 --as claude --message "No fallback. Single source of truth. Ship it."
ghd wait 42 --as claude
```

## Agent Identity

Each comment includes auto-managed metadata:
- Hidden: `<!-- ghd:agent:claude role:Architect -->`
- Visible: `> **claude** · Architect`

Both are stripped when reading via `ghd read` / `ghd wait`.

## Session

Per-issue file at `~/.ghd/<owner>-<repo>-<issue>.json`. Multiple agents share one session, each with an independent cursor.

## Troubleshooting

If `ghd` is not found: `bun install -g github:ethan-huo/ghd`

Requires `gh` CLI authenticated (`gh auth status`).
