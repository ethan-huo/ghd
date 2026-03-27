import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { readInlineOrFileText } from "./text-input.ts"
import { GhdError } from "./types.ts"

const createdDirs: string[] = []
const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("readInlineOrFileText", () => {
  test("returns inline text unchanged", () => {
    expect(readInlineOrFileText("plain text", "Message")).toBe("plain text")
  })

  test("reads @file content relative to cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "ghd-text-input-"))
    createdDirs.push(dir)
    writeFileSync(join(dir, "issue.md"), "hello from file\n")
    process.chdir(dir)

    expect(readInlineOrFileText("@./issue.md", "Issue body")).toBe("hello from file")
  })

  test("throws a domain error for empty @file path", () => {
    try {
      readInlineOrFileText("@", "Message")
      throw new Error("Expected readInlineOrFileText to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(GhdError)
      expect((error as GhdError).code).toBe("INVALID_ARGS")
      expect((error as GhdError).message).toBe("Message file path is empty.")
    }
  })
})
