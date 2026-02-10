import { fmt } from "argc/terminal"
import type { GitHubIssue, LocalMessage, SessionState } from "./types.ts"
import { GhdError } from "./types.ts"

function label(agent: string, role: string | null): string {
  const rolePart = role ? ` ${fmt.dim("·")} ${fmt.yellow(role)}` : ""
  return `${fmt.magenta(fmt.bold(`@${agent}`))}${rolePart}`
}

export function formatIssueBody(issue: GitHubIssue): string {
  const header = `${fmt.cyan(fmt.bold(`@${issue.user.login}`))} ${fmt.blue("[issue]")} ${fmt.dim(issue.created_at)}`
  const url = fmt.dim(issue.html_url)
  const title = issue.title ? `${fmt.bold(issue.title)}\n` : ""
  const body = (issue.body || "").trim()
  return `${header}\n${url}\n${title}${body}\n`
}

export function formatMessage(msg: LocalMessage, isNew: boolean): string {
  const newTag = isNew ? ` ${fmt.green("[NEW]")}` : ""
  const header = `${label(msg.agent, msg.role)}${newTag} ${fmt.dim(msg.time)}`
  return `${header}\n${msg.body}\n`
}

export function formatMessages(msgs: LocalMessage[], isNew: boolean): string {
  if (msgs.length === 0) {
    return fmt.dim("No messages.")
  }
  return msgs.map((m) => formatMessage(m, isNew)).join("\n---\n\n")
}

export function formatSession(meta: SessionState): string {
  const lines = [
    fmt.bold("Active session"),
    `  Issue:   ${fmt.cyan(`${meta.owner}/${meta.repo}#${meta.issue}`)}`,
    `  Title:   ${meta.issueTitle}`,
    `  URL:     ${fmt.dim(meta.issueUrl)}`,
    `  Created: ${meta.createdAt}`,
    "",
    fmt.bold("Agents"),
  ]

  const agents = Object.entries(meta.agents)
  if (agents.length === 0) {
    lines.push(fmt.dim("  (none)"))
  } else {
    for (const [name, agent] of agents) {
      const rolePart = agent.role ? ` ${fmt.dim("·")} ${fmt.yellow(agent.role)}` : ""
      const cursorPart = fmt.dim(` cursor:${agent.cursor}`)
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
