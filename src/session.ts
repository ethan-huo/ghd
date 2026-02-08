import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SessionState } from "./types.ts"
import { GhdError } from "./types.ts"

const GHD_DIR = join(homedir(), ".ghd")
const SESSION_FILE = join(GHD_DIR, "active.json")

function ensureDir() {
  if (!existsSync(GHD_DIR)) {
    mkdirSync(GHD_DIR, { recursive: true })
  }
}

export function hasActiveSession(): boolean {
  return existsSync(SESSION_FILE)
}

export function loadSession(): SessionState {
  if (!existsSync(SESSION_FILE)) {
    throw new GhdError("NO_SESSION", "No active session. Run `ghd start` first.")
  }
  return JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as SessionState
}

export function saveSession(session: SessionState) {
  ensureDir()
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2) + "\n")
}

export function deleteSession() {
  if (existsSync(SESSION_FILE)) {
    unlinkSync(SESSION_FILE)
  }
}

export function updateLastSeen(commentId: number, createdAt: string) {
  const session = loadSession()
  session.lastSeenCommentId = commentId
  session.lastSeenAt = createdAt
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2) + "\n")
}
