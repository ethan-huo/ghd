import { fmt } from "argc/terminal"
import type { ParsedComment, SessionState } from "./types.ts"
import { GhdError } from "./types.ts"

function label(agentName: string | null, agentRole: string | null, author: string): string {
  if (agentName) {
    const rolePart = agentRole ? ` ${fmt.dim("·")} ${fmt.yellow(agentRole)}` : ""
    return `${fmt.magenta(fmt.bold(`@${agentName}`))}${rolePart} ${fmt.dim(`(${author})`)}`
  }
  return fmt.cyan(fmt.bold(`@${author}`))
}

export function formatComment(c: ParsedComment): string {
  const newTag = c.isNew ? ` ${fmt.green("[NEW]")}` : ""
  const header = `${label(c.agentName, c.agentRole, c.author)}${newTag} ${fmt.dim(c.createdAt)}`
  const url = fmt.dim(c.url)
  return `${header}\n${url}\n${c.body}\n`
}

export function formatComments(comments: ParsedComment[]): string {
  if (comments.length === 0) {
    return fmt.dim("No comments yet.")
  }
  return comments.map(formatComment).join("\n---\n\n")
}

export function formatWaitResult(comments: ParsedComment[]): string {
  return comments
    .map((c) => {
      const who = c.agentName ?? c.author
      const rolePart = c.agentRole ? ` (${c.agentRole})` : ""
      return `${who}${rolePart} replied: ${c.url}\n${c.body}`
    })
    .join("\n\n---\n\n")
}

export function formatSession(session: SessionState): string {
  const rolePart = session.agentRole ? ` ${fmt.dim("·")} ${fmt.yellow(session.agentRole)}` : ""
  const lines = [
    fmt.bold("Active session"),
    `  Issue:     ${fmt.cyan(`${session.owner}/${session.repo}#${session.issueNumber}`)}`,
    `  Agent:     ${fmt.magenta(session.agentName)}${rolePart}`,
    `  Started:   ${session.startedAt}`,
    `  Last seen: ${session.lastSeenCommentId ?? "none"}`,
  ]
  return lines.join("\n")
}

export function formatError(error: unknown): string {
  if (error instanceof GhdError) {
    return `${fmt.error(`[${error.code}]`)} ${error.message}`
  }
  if (error instanceof Error) {
    return fmt.error(error.message)
  }
  return fmt.error(String(error))
}
