import type { GitHubComment, ParsedComment, SessionState } from "./types.ts"
import { GhdError } from "./types.ts"

// <!-- ghd:agent:claude --> or <!-- ghd:agent:claude role:Senior Engineer -->
const AGENT_TAG_RE = /^<!--\s*ghd:agent:(\S+?)(?:\s+role:(.+?))?\s*-->\n?/
const ROLE_HEADER_RE = /^> \*\*\S+?\*\*(?: · .+?)?\n\n/

type AgentMeta = { name: string; role: string | null }

export function makeAgentTag(agentName: string, role: string | null): string {
  const rolePart = role ? ` role:${role}` : ""
  return `<!-- ghd:agent:${agentName}${rolePart} -->\n`
}

export function makeRoleHeader(agentName: string, role: string | null): string {
  const rolePart = role ? ` · ${role}` : ""
  return `> **${agentName}**${rolePart}\n\n`
}

export function parseAgentMeta(body: string): AgentMeta | null {
  const match = body.match(AGENT_TAG_RE)
  if (!match) return null
  return { name: match[1], role: match[2]?.trim() ?? null }
}

export function stripMetadata(body: string): string {
  return body.replace(AGENT_TAG_RE, "").replace(ROLE_HEADER_RE, "")
}

async function execGh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new GhdError("GH_CLI_ERROR", `gh CLI error (exit ${exitCode}): ${stderr.trim()}`)
  }
  return stdout
}

export async function validateIssue(owner: string, repo: string, issueNumber: number) {
  try {
    await execGh(["api", `repos/${owner}/${repo}/issues/${issueNumber}`, "--jq", ".number"])
  } catch (e) {
    if (e instanceof GhdError && e.code === "GH_CLI_ERROR") {
      throw new GhdError("ISSUE_NOT_FOUND", `Issue ${owner}/${repo}#${issueNumber} not found or not accessible.`)
    }
    throw e
  }
}

export async function fetchComments(session: SessionState, since?: string): Promise<GitHubComment[]> {
  const { owner, repo, issueNumber } = session
  let endpoint = `repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`
  if (since) {
    endpoint += `&since=${since}`
  }
  const raw = await execGh(["api", endpoint, "--paginate"])
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    return JSON.parse(trimmed)
  } catch {
    // --paginate may concatenate JSON arrays
    const fixed = "[" + trimmed.replace(/\]\s*\[/g, ",") + "]"
    return JSON.parse(fixed.replace(/^\[\[/, "[").replace(/\]\]$/, "]"))
  }
}

export async function postComment(session: SessionState, message: string): Promise<GitHubComment> {
  const { owner, repo, issueNumber, agentName, agentRole } = session
  const body = makeAgentTag(agentName, agentRole) + makeRoleHeader(agentName, agentRole) + message
  const raw = await execGh([
    "api",
    `repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    "-f", `body=${body}`,
    "--method", "POST",
  ])
  return JSON.parse(raw) as GitHubComment
}

export function parseComments(comments: GitHubComment[], lastSeenId: number | null): ParsedComment[] {
  let seenLast = lastSeenId === null
  return comments.map((c) => {
    const isNew = seenLast && c.id !== lastSeenId
    if (c.id === lastSeenId) {
      seenLast = true
    }
    const meta = parseAgentMeta(c.body)
    return {
      id: c.id,
      author: c.user.login,
      agentName: meta?.name ?? null,
      agentRole: meta?.role ?? null,
      body: stripMetadata(c.body),
      createdAt: c.created_at,
      url: c.html_url,
      isNew,
    }
  })
}

export async function pollForNewComments(
  session: SessionState,
  timeout: number,
  interval: number,
): Promise<ParsedComment[]> {
  const deadline = Date.now() + timeout * 1000
  const since = session.lastSeenAt ?? session.startedAt

  while (Date.now() < deadline) {
    const comments = await fetchComments(session, since)
    const newComments = comments.filter((c) => {
      if (session.lastSeenCommentId === null) return true
      return c.id > session.lastSeenCommentId
    })
    // Exclude comments posted by this agent
    const otherComments = newComments.filter((c) => {
      const meta = parseAgentMeta(c.body)
      return meta?.name !== session.agentName
    })

    if (otherComments.length > 0) {
      return otherComments.map((c) => {
        const meta = parseAgentMeta(c.body)
        return {
          id: c.id,
          author: c.user.login,
          agentName: meta?.name ?? null,
          agentRole: meta?.role ?? null,
          body: stripMetadata(c.body),
          createdAt: c.created_at,
          url: c.html_url,
          isNew: true,
        }
      })
    }

    await Bun.sleep(interval * 1000)
  }

  throw new GhdError("TIMEOUT", `Timed out after ${timeout}s waiting for new comments.`)
}
