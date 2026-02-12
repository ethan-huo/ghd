#!/usr/bin/env bun

import { watch } from "node:fs"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"
import { c, cli } from "argc"

import { findSession, messagesDir, saveMeta, startSession } from "./session.ts"
import { createIssue, fetchComments, fetchIssue, postComment, toParsedComment } from "./github.ts"
import { formatIssueBody, formatMessages, formatSession } from "./formatter.ts"
import { importFromGitHub, patchGhCommentId, readAllMessages, readMessagesAfter, writeMessage } from "./message.ts"
import { GhdError } from "./types.ts"

const s = toStandardJsonSchema

function parseTarget(target: string): { owner: string; repo: string; issue: number } {
  const hashIdx = target.indexOf("#")
  if (hashIdx === -1) {
    throw new GhdError("INVALID_ARGS", "Target must be owner/repo#issue")
  }
  const repoStr = target.slice(0, hashIdx)
  const issue = Number(target.slice(hashIdx + 1))
  if (!/^[^/]+\/[^/]+$/.test(repoStr)) {
    throw new GhdError("INVALID_ARGS", "Target must be owner/repo#issue")
  }
  if (!Number.isFinite(issue) || issue < 1) {
    throw new GhdError("INVALID_ARGS", "Issue number must be a positive integer")
  }
  const [owner, repo] = repoStr.split("/")
  return { owner, repo, issue }
}

const targetInput = v.pipe(v.string(), v.description("owner/repo#issue"))

const schema = {
  start: c
    .meta({
      description: "Start or join a discussion session",
      examples: [
        "ghd start acme/api#42 --as claude --role Architect",
        'ghd start acme/api --as claude --title "Bug report" --body "Details..."',
      ],
    })
    .args("target")
    .input(s(v.object({
      target: v.pipe(v.string(), v.description("owner/repo#issue (join) or owner/repo (create)")),
      as: v.pipe(v.string(), v.minLength(1), v.description("Agent name")),
      role: v.optional(v.pipe(v.string(), v.minLength(1), v.description("Agent role"))),
      title: v.optional(v.pipe(v.string(), v.minLength(1), v.description("Issue title (create mode)"))),
      body: v.optional(v.pipe(v.string(), v.description("Issue body (create mode)"))),
    }))),

  send: c
    .meta({
      description: "Send a message (local-first, best-effort GitHub sync)",
      examples: [
        'ghd send acme/api#42 --as claude --message "Proposal: ..."',
        "ghd send acme/api#42 --as claude --message 'Done.' --wait",
      ],
    })
    .args("target")
    .input(s(v.object({
      target: targetInput,
      as: v.pipe(v.string(), v.minLength(1), v.description("Agent name")),
      message: v.optional(v.string()),
      wait: v.optional(v.boolean(), false),
      timeout: v.optional(v.pipe(v.number(), v.minValue(1)), 300),
    }))),

  recv: c
    .meta({
      description: "Receive new messages (cursor-based incremental read)",
      examples: ["ghd recv acme/api#42 --as claude"],
    })
    .args("target")
    .input(s(v.object({
      target: targetInput,
      as: v.pipe(v.string(), v.minLength(1), v.description("Agent name")),
    }))),

  wait: c
    .meta({
      description: "Block until another agent sends a message",
      examples: ["ghd wait acme/api#42 --as claude", "ghd wait acme/api#42 --as claude --timeout 60"],
    })
    .args("target")
    .input(s(v.object({
      target: targetInput,
      as: v.pipe(v.string(), v.minLength(1), v.description("Your agent name")),
      timeout: v.optional(v.pipe(v.number(), v.minValue(1)), 300),
    }))),

  log: c
    .meta({
      description: "View all messages (debug/review, no cursor interaction)",
      examples: ["ghd log acme/api#42", "ghd log acme/api#42 --last 5"],
    })
    .args("target")
    .input(s(v.object({
      target: targetInput,
      last: v.optional(v.pipe(v.number(), v.minValue(1))),
    }))),

  status: c
    .meta({ description: "Show session info and agent cursors" })
    .args("target")
    .input(s(v.object({
      target: targetInput,
    }))),
}

const app = cli(schema, {
  name: "ghd",
  version: "0.3.0",
  description: "GitHub Discussion CLI for AI Agents",
})

function waitForMessage(
  msgDir: string,
  agentName: string,
  cursor: number,
  timeout: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Check immediately
    const immediate = readMessagesAfter(msgDir, cursor)
    const hasNew = immediate.some((m) => m.agent !== agentName)
    if (hasNew) {
      resolve()
      return
    }

    console.error(`Waiting for reply (timeout: ${timeout}s)...`)

    const timer = setTimeout(() => {
      watcher.close()
      reject(new GhdError("TIMEOUT", `Timed out after ${timeout}s waiting for reply.`))
    }, timeout * 1000)

    const watcher = watch(msgDir, () => {
      const msgs = readMessagesAfter(msgDir, cursor)
      if (msgs.some((m) => m.agent !== agentName)) {
        watcher.close()
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

function resolveSession(target: string) {
  const { owner, repo, issue } = parseTarget(target)
  return findSession(owner, repo, issue)
}

app.run({
  handlers: {
    start: async ({ input }) => {
      const hashIdx = input.target.indexOf("#")
      if (hashIdx === -1) {
        // Create mode
        const repoStr = input.target
        if (!/^[^/]+\/[^/]+$/.test(repoStr)) {
          throw new GhdError("INVALID_ARGS", "Target must be owner/repo or owner/repo#issue")
        }
        if (!input.title) {
          throw new GhdError("INVALID_ARGS", "Create mode requires --title")
        }
        const [owner, repo] = repoStr.split("/")

        const ghIssue = await createIssue(owner, repo, input.title, input.body ?? "")
        const { dir, meta } = startSession(owner, repo, ghIssue.number, {
          issueUrl: ghIssue.html_url,
          issueTitle: ghIssue.title,
          issueBody: ghIssue.body ?? "",
        })

        meta.agents[input.as] = { role: input.role ?? null, cursor: 0 }
        saveMeta(dir, meta)

        console.error(`Created: ${owner}/${repo}#${ghIssue.number}`)
        console.log(`#${ghIssue.number}`)
        return
      }

      // Join mode
      const { owner, repo, issue } = parseTarget(input.target)
      const ghIssue = await fetchIssue(owner, repo, issue)
      const comments = await fetchComments(owner, repo, issue)
      const parsed = comments.map((c) => toParsedComment(c, false))

      const { dir, meta, created } = startSession(owner, repo, issue, {
        issueUrl: ghIssue.html_url,
        issueTitle: ghIssue.title,
        issueBody: ghIssue.body ?? "",
      })

      // Import comments as local message files
      const msgDir = messagesDir(dir)
      const existing = readAllMessages(msgDir)
      const existingGhIds = new Set(existing.map((m) => m.ghCommentId).filter(Boolean))
      const newComments = parsed.filter((c) => !existingGhIds.has(c.id))

      let lastSeq = existing.length > 0 ? existing[existing.length - 1].seq : 0
      if (newComments.length > 0) {
        lastSeq = importFromGitHub(msgDir, newComments)
      }

      // Register agent + set cursor to latest
      meta.agents[input.as] = { role: input.role ?? null, cursor: lastSeq }
      saveMeta(dir, meta)

      console.error(created ? `Session created: ${owner}/${repo}#${issue}` : `Session joined: ${owner}/${repo}#${issue}`)

      // Output issue body + all messages
      const allMsgs = readAllMessages(msgDir)
      const parts = [formatIssueBody(ghIssue)]
      if (allMsgs.length > 0) {
        parts.push(formatMessages(allMsgs, false))
      }
      console.log(parts.join("\n---\n\n"))
    },

    send: async ({ input }) => {
      const { dir, meta } = resolveSession(input.target)

      // Register or update agent
      if (!meta.agents[input.as]) {
        meta.agents[input.as] = { role: null, cursor: 0 }
      }

      let message = input.message
      if (!message) {
        message = (await Bun.stdin.text()).trim()
      }
      if (!message) {
        throw new GhdError("INVALID_ARGS", "No message. Pass --message or pipe via stdin.")
      }

      // Write local first
      const msgDir = messagesDir(dir)
      const seq = writeMessage(msgDir, {
        agent: input.as,
        role: meta.agents[input.as].role,
        body: message,
      })

      meta.agents[input.as].cursor = seq
      saveMeta(dir, meta)

      console.error(`Message #${seq} written locally.`)

      // Best-effort GitHub sync
      try {
        const comment = await postComment(
          meta.owner, meta.repo, meta.issue,
          input.as, meta.agents[input.as].role, message,
        )
        patchGhCommentId(msgDir, seq, input.as, comment.id)
        console.error(`Synced to GitHub: ${comment.html_url}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`Warning: GitHub sync failed — ${msg}`)
      }

      // Optional wait
      if (input.wait) {
        await waitForMessage(msgDir, input.as, seq, input.timeout!)
        const newMsgs = readMessagesAfter(msgDir, seq).filter((m) => m.agent !== input.as)
        if (newMsgs.length > 0) {
          const latest = newMsgs[newMsgs.length - 1]
          meta.agents[input.as].cursor = latest.seq
          saveMeta(dir, meta)
          console.log(formatMessages(newMsgs, true))
        }
      }
    },

    recv: ({ input }) => {
      const { dir, meta } = resolveSession(input.target)

      if (!meta.agents[input.as]) {
        meta.agents[input.as] = { role: null, cursor: 0 }
      }

      const msgDir = messagesDir(dir)
      const cursor = meta.agents[input.as].cursor
      const newMsgs = readMessagesAfter(msgDir, cursor)

      if (newMsgs.length > 0) {
        const latest = newMsgs[newMsgs.length - 1]
        meta.agents[input.as].cursor = latest.seq
        saveMeta(dir, meta)
      }

      console.log(formatMessages(newMsgs, true))
    },

    wait: async ({ input }) => {
      const { dir, meta } = resolveSession(input.target)

      if (!meta.agents[input.as]) {
        meta.agents[input.as] = { role: null, cursor: 0 }
        saveMeta(dir, meta)
      }

      const msgDir = messagesDir(dir)
      const cursor = meta.agents[input.as].cursor

      await waitForMessage(msgDir, input.as, cursor, input.timeout!)

      const newMsgs = readMessagesAfter(msgDir, cursor).filter((m) => m.agent !== input.as)
      if (newMsgs.length > 0) {
        const latest = newMsgs[newMsgs.length - 1]
        meta.agents[input.as].cursor = latest.seq
        saveMeta(dir, meta)
        console.log(formatMessages(newMsgs, true))
      }
    },

    log: ({ input }) => {
      const { dir } = resolveSession(input.target)
      const msgDir = messagesDir(dir)
      let msgs = readAllMessages(msgDir)
      if (input.last !== undefined) {
        msgs = msgs.slice(-input.last)
      }
      console.log(formatMessages(msgs, false))
    },

    status: ({ input }) => {
      const { meta } = resolveSession(input.target)
      console.log(formatSession(meta))
    },
  },
})
