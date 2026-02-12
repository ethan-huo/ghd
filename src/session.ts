import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SessionState } from "./types.ts"
import { GhdError } from "./types.ts"

const GHD_DIR = join(homedir(), ".ghd")

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function sessionDir(owner: string, repo: string, issue: number): string {
  return join(GHD_DIR, owner, repo, String(issue))
}

export function messagesDir(dir: string): string {
  return join(dir, "messages")
}

export function metaPath(dir: string): string {
  return join(dir, "meta.json")
}

export function createSession(dir: string, meta: SessionState): void {
  ensureDir(dir)
  ensureDir(messagesDir(dir))
  writeFileSync(metaPath(dir), JSON.stringify(meta, null, 2) + "\n")
}

export function loadMeta(dir: string): SessionState {
  return JSON.parse(readFileSync(metaPath(dir), "utf-8"))
}

export function saveMeta(dir: string, meta: SessionState): void {
  writeFileSync(metaPath(dir), JSON.stringify(meta, null, 2) + "\n")
}

export function findSession(owner: string, repo: string, issue: number): { dir: string; meta: SessionState } {
  const dir = sessionDir(owner, repo, issue)
  if (!existsSync(metaPath(dir))) {
    throw new GhdError("NO_SESSION", `No session for ${owner}/${repo}#${issue}. Run \`ghd start\` first.`)
  }
  return { dir, meta: loadMeta(dir) }
}

export function startSession(
  owner: string,
  repo: string,
  issue: number,
  issueMeta: { issueUrl: string; issueTitle: string; issueBody: string },
): { dir: string; meta: SessionState; created: boolean } {
  const dir = sessionDir(owner, repo, issue)
  if (existsSync(metaPath(dir))) {
    const meta = loadMeta(dir)
    // Update issue metadata in case it changed
    meta.issueUrl = issueMeta.issueUrl
    meta.issueTitle = issueMeta.issueTitle
    meta.issueBody = issueMeta.issueBody
    saveMeta(dir, meta)
    return { dir, meta, created: false }
  }
  const meta: SessionState = {
    owner,
    repo,
    issue,
    issueUrl: issueMeta.issueUrl,
    issueTitle: issueMeta.issueTitle,
    issueBody: issueMeta.issueBody,
    agents: {},
    createdAt: new Date().toISOString(),
  }
  createSession(dir, meta)
  return { dir, meta, created: true }
}
