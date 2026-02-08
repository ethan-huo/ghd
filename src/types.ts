export type AgentState = {
  role: string | null
  cursor: number | null
}

export type SessionState = {
  owner: string
  repo: string
  issue: number
  agents: Record<string, AgentState>
  createdAt: string
}

export type GitHubComment = {
  id: number
  user: { login: string }
  body: string
  created_at: string
  html_url: string
}

export type ParsedComment = {
  id: number
  author: string
  agentName: string | null
  agentRole: string | null
  body: string
  createdAt: string
  url: string
  isNew: boolean
}

export type GitHubIssue = {
  number: number
  user: { login: string }
  title: string
  body: string | null
  created_at: string
  html_url: string
}

export type GhdErrorCode =
  | "NO_SESSION"
  | "GH_CLI_ERROR"
  | "TIMEOUT"
  | "INVALID_ARGS"
  | "ISSUE_NOT_FOUND"

export class GhdError extends Error {
  constructor(
    public code: GhdErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "GhdError"
  }
}
