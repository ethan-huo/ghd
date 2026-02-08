export type SessionState = {
  owner: string
  repo: string
  issueNumber: number
  agentName: string
  agentRole: string | null
  lastSeenCommentId: number | null
  lastSeenAt: string | null
  startedAt: string
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

export type GhdErrorCode =
  | "NO_SESSION"
  | "SESSION_EXISTS"
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
