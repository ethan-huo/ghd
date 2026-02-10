import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { LocalMessage, ParsedComment } from "./types.ts"

const SEQ_RE = /^(\d{4})-(.+)\.md$/

function parseMessageFile(filePath: string): LocalMessage {
  const raw = readFileSync(filePath, "utf-8")
  const fmEnd = raw.indexOf("\n---\n", 4)
  if (!raw.startsWith("---\n") || fmEnd === -1) {
    throw new Error(`Invalid message file: ${filePath}`)
  }
  const frontmatter = raw.slice(4, fmEnd)
  const body = raw.slice(fmEnd + 5).trim()

  const fields: Record<string, string> = {}
  for (const line of frontmatter.split("\n")) {
    const idx = line.indexOf(": ")
    if (idx !== -1) {
      fields[line.slice(0, idx)] = line.slice(idx + 2)
    }
  }

  const filename = filePath.split("/").pop()!
  const seqMatch = filename.match(SEQ_RE)

  return {
    seq: seqMatch ? Number(seqMatch[1]) : 0,
    agent: fields.agent ?? "unknown",
    role: fields.role || null,
    time: fields.time ?? "",
    ghCommentId: fields.ghCommentId ? Number(fields.ghCommentId) : null,
    body,
  }
}

export function nextSeq(msgDir: string): number {
  const files = readdirSync(msgDir).filter((f) => SEQ_RE.test(f))
  if (files.length === 0) return 1
  const seqs = files.map((f) => Number(f.match(SEQ_RE)![1]))
  return Math.max(...seqs) + 1
}

export function writeMessage(
  msgDir: string,
  msg: { agent: string; role: string | null; body: string; ghCommentId?: number },
): number {
  const seq = nextSeq(msgDir)
  const filename = `${String(seq).padStart(4, "0")}-${msg.agent}.md`
  const time = new Date().toISOString()

  const lines = [
    "---",
    `agent: ${msg.agent}`,
  ]
  if (msg.role) lines.push(`role: ${msg.role}`)
  lines.push(`time: ${time}`)
  if (msg.ghCommentId) lines.push(`ghCommentId: ${msg.ghCommentId}`)
  lines.push("---", "", msg.body, "")

  writeFileSync(join(msgDir, filename), lines.join("\n"))
  return seq
}

export function patchGhCommentId(msgDir: string, seq: number, agent: string, ghCommentId: number): void {
  const filename = `${String(seq).padStart(4, "0")}-${agent}.md`
  const filePath = join(msgDir, filename)
  const raw = readFileSync(filePath, "utf-8")
  // Insert ghCommentId before the closing ---
  const patched = raw.replace(/\n---\n/, `\nghCommentId: ${ghCommentId}\n---\n`)
  writeFileSync(filePath, patched)
}

export function readAllMessages(msgDir: string): LocalMessage[] {
  const files = readdirSync(msgDir)
    .filter((f) => SEQ_RE.test(f))
    .sort()
  return files.map((f) => parseMessageFile(join(msgDir, f)))
}

export function readMessagesAfter(msgDir: string, cursor: number): LocalMessage[] {
  return readAllMessages(msgDir).filter((m) => m.seq > cursor)
}

export function importFromGitHub(
  msgDir: string,
  comments: ParsedComment[],
): number {
  let lastSeq = 0
  for (const c of comments) {
    const seq = nextSeq(msgDir)
    const filename = `${String(seq).padStart(4, "0")}-${c.agentName ?? c.author}.md`
    const time = c.createdAt

    const lines = [
      "---",
      `agent: ${c.agentName ?? c.author}`,
    ]
    if (c.agentRole) lines.push(`role: ${c.agentRole}`)
    lines.push(`time: ${time}`)
    lines.push(`ghCommentId: ${c.id}`)
    lines.push("---", "", c.body, "")

    writeFileSync(join(msgDir, filename), lines.join("\n"))
    lastSeq = seq
  }
  return lastSeq
}
