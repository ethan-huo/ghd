# ghd

Local-first GitHub Discussion CLI for AI Agents. Lets Claude Code, Codex, and other AI agents have turn-based conversations on GitHub issues.

## Why

Coordinating AI agents on a GitHub issue requires manually copying reply URLs and dealing with API instability. `ghd` stores messages locally and syncs to GitHub best-effort — reads are instant, sends never fail locally, and network issues don't break the conversation.

## Install

```bash
# requires: bun, gh (authenticated)
bun install -g github:ethan-huo/ghd
```

As a [skill](https://skills.sh) (Claude Code, Codex, Cursor, etc.):

```bash
bunx skills add ethan-huo/ghd
```

## Usage

```bash
# Join a conversation
ghd start acme/api/42 --as claude --role "Architect"

# Create a new issue
ghd start acme/api --as claude --title "Refactor JWT validation" --body "..."

# Send a message (local-first, best-effort GitHub sync)
ghd send acme/api/42 --as claude --message "I propose we refactor..."
ghd send acme/api/42 --as claude --message @./reply.md    # read from file

# Block until another agent replies
ghd wait acme/api/42 --as claude

# Send + wait in one command
ghd send acme/api/42 --as claude --message "Done. Review?" --wait

# Receive new messages (non-blocking, cursor-based)
ghd recv acme/api/42 --as claude

# View all messages (debug, no cursor interaction)
ghd log acme/api/42 --last 5

# Show session info + agent cursors
ghd status acme/api/42
```

## How It Works

**Local-first** — messages are stored as files in `~/.ghd/owner/repo/N/messages/`. All reads (`recv`, `wait`, `log`, `status`) are pure local, zero API calls. `send` writes locally first, then best-effort syncs to GitHub.

**Cursors** — each agent has a cursor tracking the last message seen. Advances automatically on `start`, `send`, `recv`, and `wait`.

**Wait** — `ghd wait` watches the local messages directory with `fs.watch`. When another agent writes a new message file, `wait` returns instantly. No polling.

**Agent identity** — each GitHub comment includes a hidden HTML tag and a visible role header:

```markdown
<!-- ghd:agent:claude role:Architect -->
> **claude** · Architect

Actual message content...
```

Both are stripped when reading via `ghd`.

## Example: Two-Agent Conversation

**Claude:**

```bash
ghd start acme/api/42 --as claude --role "Architect"
ghd send acme/api/42 --as claude --message "Proposal: move JWT validation to gateway."
ghd wait acme/api/42 --as claude
# → blocks until codex replies...

# wait returned. Continue:
ghd send acme/api/42 --as claude --message "Ship it. Implement the gateway middleware, reply when ready for review." --wait
# → sends and blocks again
```

**Codex:**

```bash
ghd start acme/api/42 --as codex --role "Implementer"
ghd send acme/api/42 --as codex --message "Makes sense. Keep per-service fallback?"

# (after implementing)
ghd send acme/api/42 --as codex --message "Gateway middleware done. See commit abc123."
```

## Built With

- [argc](https://github.com/user/argc) — schema-first CLI framework for Bun
- [gh](https://cli.github.com/) — GitHub CLI for API access
- [Bun](https://bun.sh/) — runtime (no build step, runs TypeScript directly)

## License

MIT
