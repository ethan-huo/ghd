import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"

import { GhdError } from "./types.ts"

export function readInlineOrFileText(value: string, fieldName: string): string {
  if (!value.startsWith("@")) {
    return value
  }

  const raw = value.slice(1)
  if (!raw) {
    throw new GhdError("INVALID_ARGS", `${fieldName} file path is empty.`)
  }

  const filePath = raw.startsWith("~/")
    ? resolve(homedir(), raw.slice(2))
    : resolve(raw)

  try {
    // Keep @file semantics consistent between issue creation and message sending.
    return readFileSync(filePath, "utf-8").trim()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new GhdError("INVALID_ARGS", `Failed to read ${fieldName} from ${filePath}: ${msg}`)
  }
}
