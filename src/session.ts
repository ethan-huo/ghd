import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SessionState } from "./types.ts"
import { GhdError } from "./types.ts"

const GHD_DIR = join(homedir(), ".ghd")

function ensureDir() {
  if (!existsSync(GHD_DIR)) {
    mkdirSync(GHD_DIR, { recursive: true })
  }
}

function sessionFileName(owner: string, repo: string, issue: number): string {
  return `${owner}-${repo}-${issue}.json`
}

export function startSession(owner: string, repo: string, issue: number): { path: string; state: SessionState; created: boolean } {
  ensureDir()
  const path = join(GHD_DIR, sessionFileName(owner, repo, issue))
  if (existsSync(path)) {
    return { path, state: JSON.parse(readFileSync(path, "utf-8")), created: false }
  }
  const state: SessionState = {
    owner,
    repo,
    issue,
    agents: {},
    createdAt: new Date().toISOString(),
  }
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n")
  return { path, state, created: true }
}

export function findSession(): { path: string; state: SessionState } {
  ensureDir()
  const files = readdirSync(GHD_DIR).filter((f) => f.endsWith(".json"))
  if (files.length === 0) {
    throw new GhdError("NO_SESSION", "No active session. Run `ghd start` first.")
  }
  const path = join(GHD_DIR, files[0])
  return { path, state: JSON.parse(readFileSync(path, "utf-8")) }
}

export function loadSession(path: string): SessionState {
  return JSON.parse(readFileSync(path, "utf-8"))
}

export function saveSession(path: string, state: SessionState) {
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n")
}

export function deleteSession(path: string) {
  if (existsSync(path)) unlinkSync(path)
}
