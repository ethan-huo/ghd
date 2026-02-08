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
    return fmt.dim("No comments.")
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

export function formatSession(state: SessionState): string {
  const lines = [
    fmt.bold("Active session"),
    `  Issue:   ${fmt.cyan(`${state.owner}/${state.repo}#${state.issue}`)}`,
    `  Created: ${state.createdAt}`,
    "",
    fmt.bold("Agents"),
  ]

  const agents = Object.entries(state.agents)
  if (agents.length === 0) {
    lines.push(fmt.dim("  (none)"))
  } else {
    for (const [name, agent] of agents) {
      const rolePart = agent.role ? ` ${fmt.dim("·")} ${fmt.yellow(agent.role)}` : ""
      const cursorPart = agent.cursor ? fmt.dim(` cursor:${agent.cursor}`) : fmt.dim(" (no cursor)")
      lines.push(`  ${fmt.magenta(name)}${rolePart}${cursorPart}`)
    }
  }

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
