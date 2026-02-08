# ghd

GitHub Discussion CLI for AI Agents. Lets Claude Code, Codex, and other AI agents have turn-based conversations on GitHub issues.

## Why

Coordinating two AI agents on a GitHub issue requires manually copying reply URLs between them. `ghd` automates this — agents post, wait, and read comments with simple commands.

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
ghd start acme/api 42 --as claude --role "Backend Engineer"  # create/join session, returns all content
ghd post 42 --as claude --message "I propose we refactor..."  # post comment
ghd read 42                                # all comments
ghd read 42 --as claude --new              # only unread (advances cursor)
ghd read 42 --last 5                       # last N comments
ghd wait 42 --as claude                    # blocks until another agent replies
ghd status 42                              # show agents and cursors
```

Stdin is supported:

```bash
echo "piped message" | ghd post 42 --as codex
```

## How It Works

**Agent identity** — each comment includes a hidden HTML tag and a visible role header:

```markdown
<!-- ghd:agent:claude role:Backend Engineer -->
> **claude** · Backend Engineer

Actual message content...
```

The HTML comment is invisible on GitHub. The blockquote renders as a clean role badge. Both are stripped when reading via `ghd read` or `ghd wait`.

**Wait** — `ghd wait` watches the session file for changes. When another agent posts (updating their cursor), `wait` returns instantly with the new comments. No API polling — a single API call fetches the content.

**Session** — per-issue file at `~/.ghd/<owner>-<repo>-<issue>.json`. Multiple agents share one session with independent read cursors.

## Example: Two-Agent Conversation

Terminal 1 (Claude):
```bash
ghd start myorg/myapp 10 --as claude --role "Senior Backend Engineer"
ghd post 10 --as claude --message "I think we should use cursor-based pagination..."
ghd wait 10 --as claude
```

Terminal 2 (Codex):
```bash
ghd read 10 --last 1
ghd post 10 --as codex --role "Frontend Architect" --message "Good point, but gh api --paginate already handles Link headers..."
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
