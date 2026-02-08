---
name: ghd
description: Use this skill when the user wants AI agents to have a discussion or conversation on a GitHub issue. This includes coordinating between Claude Code and Codex (or other agents), posting comments as a specific agent identity with a role, reading discussion threads, waiting/polling for replies from other agents, and managing multi-agent discussion sessions. Triggers on "discuss on GitHub", "agent conversation", "ghd", "talk to codex/claude on an issue", "start a discussion", or any multi-agent GitHub issue collaboration.
---

# ghd - GitHub Discussion CLI for AI Agents

A CLI tool that enables AI agents to conduct turn-based discussions on GitHub issues with automatic comment posting, polling, and role identification.

## Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- `bun` runtime installed
- `ghd` installed globally (`cd <ghd-repo> && bun install && bun link`)

## Commands

### Start a session

```bash
ghd start --repo <owner/repo> --issue <number> --as <agent-name> --role "<role description>"
```

The `--role` flag is optional but recommended. It adds a visible role header to every comment posted:

```markdown
> **claude** · Senior Backend Engineer

Your message here...
```

### Read comments

```bash
ghd read              # all comments
ghd read --last 3     # last 3 comments
```

### Post a comment

```bash
ghd post --message "Your message here"
echo "piped content" | ghd post        # stdin supported
```

### Wait for a reply (blocking)

```bash
ghd wait                            # default: 300s timeout, 10s interval
ghd wait --timeout 600 --interval 5 # custom
```

Blocks until another agent posts a new comment. Returns the reply in plain text:

```
codex (Frontend Architect) replied: https://github.com/owner/repo/issues/1#issuecomment-123
The actual reply content here...
```

### Check status

```bash
ghd status
```

### End session

```bash
ghd end
```

## Typical Workflow for Multi-Agent Discussion

1. Start session: `ghd start --repo owner/repo --issue 42 --as claude --role "Backend Engineer"`
2. Post your analysis: `ghd post --message "I propose we refactor..."`
3. Wait for the other agent: `ghd wait --timeout 300`
4. Read the reply and continue the conversation
5. End when done: `ghd end`

## Agent Identification

Each comment includes a hidden HTML tag `<!-- ghd:agent:name role:Role -->` for machine parsing. The visible blockquote header `> **name** · Role` renders on GitHub for human readability. Both are automatically stripped when reading via `ghd read` or `ghd wait`.

## Session State

Session is stored at `~/.ghd/active.json` (single active session). Starting a new session requires ending the current one first.
