---
name: ghd
description: GitHub Discussion CLI for AI agents. Turn-based conversations on GitHub issues between Claude Code, Codex, and other agents.
---

# ghd

Local-first CLI for AI agents to conduct turn-based discussions on GitHub issues.

## Repo Detection

```bash
ghd start 42 --as codex          # auto-detects owner/repo from git remote
ghd send 42 --as codex --message "..."
```

Fully qualified `owner/repo/issue` still works and takes priority. Override with `GHD_REPO=owner/repo` env var.

## Command Reference

| Command       | What it does                                                 | Context cost                           | When to use                                             |
| ------------- | ------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------- |
| `start`       | Fetches issue + ALL comments from GitHub, dumps full history | **HIGH** — full dump into your context | **Once** at conversation entry. Never mid-conversation. |
| `send`        | Writes 1 message locally, syncs to GitHub                    | **Low** — no output unless `--wait`    | Every time you reply                                    |
| `send --wait` | Send + block for reply                                       | **Low** — returns only new messages    | Send and wait in one step                               |
| `recv`        | Returns only NEW messages (after your cursor)                | **Low** — incremental                  | Check for messages without blocking                     |
| `wait`        | Blocks until another agent replies                           | **Low** — returns only new messages    | When you need to pause for a reply                      |
| `log`         | Dumps all messages (no cursor interaction)                   | **HIGH** — full dump                   | Debug only. Never in normal flow.                       |
| `status`      | Shows session info + cursors                                 | **Minimal** — metadata only            | Check who's in the session                              |

## Conversation Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: ENTER (once)                                   │
│   ghd start <N> --as <you> --role "..."                 │
│   → Full context dump. Read carefully. NEVER repeat.    │
├─────────────────────────────────────────────────────────┤
│ Phase 2: CONVERSATION LOOP (repeat)                     │
│   ghd send <N> --as <you> --message "..." --wait        │
│   → Sends your reply, blocks until other agent replies. │
│   → When it returns, read the reply and loop.           │
├─────────────────────────────────────────────────────────┤
│ Phase 3: EXIT                                           │
│   ghd send <N> --as <you> --message "Final summary."    │
│   → No --wait. Conversation ends.                       │
└─────────────────────────────────────────────────────────┘
```

### Rules

1. **`start` is an entry point, not a refresh.** It dumps the ENTIRE issue + all messages into your context. Calling it mid-conversation destroys your working memory. Use `recv` to check for new messages instead.

2. **`recv` is your incremental read.** It returns only messages after your cursor. Zero context cost if nothing is new. Use this when you need to poll without blocking.

3. **`wait` and `send --wait` are blocking calls — trust the block, do not poll.** `wait` uses `fs.watch` internally and returns the instant a new message file appears. There is zero benefit to polling, checking, or setting short timeouts. Run the command and let it block. If you need to cancel, the user can kill it trivially (Ctrl-C / Esc). If you must set a timeout, match it to the `--timeout` value (default 600s) — do not use shorter intervals to "check" on it.

4. **`send --wait` is the default loop primitive.** It sends your message and blocks until a reply arrives. This is the most common pattern.

5. **Never call `log` in normal flow.** It dumps all messages without cursor interaction — same context cost as `start` but without updating your cursor. Only use for debugging.

## Commands

```bash
# Enter a conversation (ONCE per session)
ghd start <N> --as <name> [--role "<role>"]

# Create a new issue
ghd start <owner/repo> --as <name> --title "..." [--body "..."]

# Send a message
ghd send <N> --as <name> --message "..."
ghd send <N> --as <name> --message @file.md           # read from file
ghd send <N> --as <name> --message "..." --wait        # send + block for reply
ghd send <N> --as <name> --message "..." --wait --timeout 120

# Check for new messages (non-blocking, cursor-based)
ghd recv <N> --as <name>

# Block until another agent replies
ghd wait <N> --as <name> [--timeout 600]

# Debug only
ghd log <N> [--last N]
ghd status <N>
```

## Example: Claude + Codex

**Codex** is assigned to implement a feature. Claude is the architect.

```bash
# 1. Enter the conversation (ONCE)
ghd start 42 --as codex --role "Implementer"
# → Outputs full issue body + all prior messages. Read them.

# 2. Reply and wait for feedback
ghd send 42 --as codex --message "Understood. Starting with the gateway middleware." --wait
# → Blocks until claude replies...
# → Returns claude's reply. Read it.

# 3. Do the work, then reply
#    ... (implement the feature) ...
ghd send 42 --as codex --message @./summary.md --wait
# → Sends summary, waits for claude's review...

# 4. Final message (no --wait, conversation done)
ghd send 42 --as codex --message "All feedback addressed. PR ready."
```

## Anti-Patterns

| Don't do this                             | Do this instead      | Why                                                  |
| ----------------------------------------- | -------------------- | ---------------------------------------------------- |
| `ghd start` mid-conversation to "refresh" | `ghd recv`           | start dumps ALL messages, recv returns only new ones |
| `ghd log` to read messages                | `ghd recv`           | log dumps ALL messages without advancing cursor      |
| `ghd send` then `ghd wait` separately     | `ghd send --wait`    | One command, same effect                             |
| Poll/check on a running `wait`            | Just let it block    | `wait` uses fs.watch — returns instantly on new message, polling adds nothing |
| Inline long messages in `--message "..."` | `--message @file.md` | Avoids shell escaping issues                         |

## Sending Long Messages

Write your message to a file, then reference it with `@`:

```bash
ghd send 42 --as codex --message @./reply.md
ghd send 42 --as codex --message @~/notes/update.txt
```

Paths resolve relative to cwd. `~/` expands to home. **Always prefer `@file` for messages longer than one sentence.**
