import type { GitHubComment, GitHubIssue, ParsedComment } from "./types.ts"
import { GhdError } from "./types.ts"

// <!-- ghd:agent:claude --> or <!-- ghd:agent:claude role:Architect -->
const AGENT_TAG_RE = /^<!--\s*ghd:agent:(\S+?)(?:\s+role:(.+?))?\s*-->\n?/
const ROLE_HEADER_RE = /^> \*\*\S+?\*\*(?: · .+?)?\n\n/

export type AgentMeta = { name: string; role: string | null }

export function makeAgentTag(name: string, role: string | null): string {
  const rolePart = role ? ` role:${role}` : ""
  return `<!-- ghd:agent:${name}${rolePart} -->\n`
}

export function makeRoleHeader(name: string, role: string | null): string {
  const rolePart = role ? ` · ${role}` : ""
  return `> **${name}**${rolePart}\n\n`
}

export function parseAgentMeta(body: string): AgentMeta | null {
  const match = body.match(AGENT_TAG_RE)
  if (!match) return null
  return { name: match[1], role: match[2]?.trim() ?? null }
}

export function stripMetadata(body: string): string {
  return body.replace(AGENT_TAG_RE, "").replace(ROLE_HEADER_RE, "")
}

export function toParsedComment(c: GitHubComment, isNew: boolean): ParsedComment {
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

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
): Promise<GitHubIssue> {
  try {
    const raw = await execGh([
      "api",
      `repos/${owner}/${repo}/issues`,
      "--method", "POST",
      "-f", `title=${title}`,
      "-f", `body=${body}`,
    ])
    return JSON.parse(raw)
  } catch (e) {
    if (e instanceof GhdError && e.code === "GH_CLI_ERROR") {
      throw new GhdError("ISSUE_CREATE_FAILED", `Failed to create issue on ${owner}/${repo}: ${e.message}`)
    }
    throw e
  }
}

export async function fetchIssue(owner: string, repo: string, issue: number): Promise<GitHubIssue> {
  try {
    const raw = await execGh(["api", `repos/${owner}/${repo}/issues/${issue}`])
    return JSON.parse(raw)
  } catch (e) {
    if (e instanceof GhdError && e.code === "GH_CLI_ERROR") {
      throw new GhdError("ISSUE_NOT_FOUND", `Issue ${owner}/${repo}#${issue} not found or not accessible.`)
    }
    throw e
  }
}

export async function fetchComments(owner: string, repo: string, issue: number): Promise<GitHubComment[]> {
  const endpoint = `repos/${owner}/${repo}/issues/${issue}/comments?per_page=100`
  const raw = await execGh(["api", endpoint, "--paginate"])
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    return JSON.parse(trimmed)
  } catch {
    const fixed = "[" + trimmed.replace(/\]\s*\[/g, ",") + "]"
    return JSON.parse(fixed.replace(/^\[\[/, "[").replace(/\]\]$/, "]"))
  }
}

export async function postComment(
  owner: string,
  repo: string,
  issue: number,
  agentName: string,
  agentRole: string | null,
  message: string,
): Promise<GitHubComment> {
  const body = makeAgentTag(agentName, agentRole) + makeRoleHeader(agentName, agentRole) + message
  const raw = await execGh([
    "api",
    `repos/${owner}/${repo}/issues/${issue}/comments`,
    "-f", `body=${body}`,
    "--method", "POST",
  ])
  return JSON.parse(raw) as GitHubComment
}
