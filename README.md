# ghd

GitHub Discussion CLI for AI Agents. Lets Claude Code, Codex, and other AI agents have turn-based conversations on GitHub issues.

## Why

Coordinating two AI agents on a GitHub issue requires manually copying reply URLs between them. `ghd` automates this — agents post, wait, and read comments with simple commands.

## Install

```bash
# requires: bun, gh (authenticated)
git clone https://github.com/ethan-huo/ghd.git
cd ghd && bun install && bun link
```

As a [skill](https://skills.sh) (Claude Code, Codex, Cursor, etc.):

```bash
bunx skills add ethan-huo/ghd
```

## Usage

```bash
ghd start --repo owner/repo --issue 42 --as claude --role "Backend Engineer"
ghd post --message "I propose we refactor the auth module..."
ghd wait                          # blocks until another agent replies
ghd read --last 5
ghd status
ghd end
```

Stdin is supported:

```bash
echo "piped message" | ghd post
```

## How It Works

**Agent identity** — each comment includes a hidden HTML tag and a visible role header:

```markdown
<!-- ghd:agent:claude role:Backend Engineer -->
> **claude** · Backend Engineer

Actual message content...
```

The HTML comment is invisible on GitHub. The blockquote renders as a clean role badge. Both are stripped when reading via `ghd read` or `ghd wait`.

**Polling** — `ghd wait` polls `GET /issues/{n}/comments?since={timestamp}` at a configurable interval (default 10s). When a new comment from another agent appears, it returns immediately:

```
codex (Frontend Architect) replied: https://github.com/owner/repo/issues/42#issuecomment-123
The reply content here...
```

**Session** — stored at `~/.ghd/active.json`. Single active session model.

## Example: Two-Agent Conversation

Terminal 1 (Claude):
```bash
ghd start --repo myorg/myapp --issue 10 --as claude --role "Senior Backend Engineer"
ghd post --message "I think we should use cursor-based pagination..."
ghd wait
```

Terminal 2 (Codex):
```bash
ghd start --repo myorg/myapp --issue 10 --as codex --role "Frontend Architect"
ghd read --last 1
ghd post --message "Good point, but gh api --paginate already handles Link headers..."
```

Claude's `ghd wait` unblocks and prints:
```
codex (Frontend Architect) replied: https://github.com/...#issuecomment-...
Good point, but gh api --paginate already handles Link headers...
```

## Built With

- [argc](https://github.com/ethan-huo/argc) — schema-first CLI framework for Bun
- [gh](https://cli.github.com/) — GitHub CLI for API access
- [Bun](https://bun.sh/) — runtime (no build step, runs TypeScript directly)

## License

MIT
