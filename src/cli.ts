#!/usr/bin/env bun

import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"
import { c, cli, group } from "argc"

import { deleteSession, hasActiveSession, loadSession, saveSession, updateLastSeen } from "./session.ts"
import { fetchComments, parseComments, pollForNewComments, postComment, validateIssue } from "./github.ts"
import { formatComments, formatError, formatSession, formatWaitResult } from "./formatter.ts"
import type { SessionState } from "./types.ts"
import { GhdError } from "./types.ts"

const s = toStandardJsonSchema

const schema = {
  start: c
    .meta({
      description: "Start a discussion session on a GitHub issue",
      examples: [
        "ghd start --repo owner/repo --issue 42 --as claude --role 'Senior Backend Engineer'",
        "ghd start --repo anthropics/claude-code --issue 100 --as codex",
      ],
    })
    .input(s(v.object({
      repo: v.pipe(v.string(), v.regex(/^[^/]+\/[^/]+$/, "Must be owner/repo format")),
      issue: v.pipe(v.number(), v.minValue(1)),
      as: v.pipe(v.string(), v.minLength(1), v.description("Agent name identifier")),
      role: v.optional(v.pipe(v.string(), v.minLength(1), v.description("Agent role, visible in comment header"))),
    }))),

  read: c
    .meta({
      description: "Read comments from the current discussion",
    })
    .input(s(v.object({
      last: v.optional(v.pipe(v.number(), v.minValue(1)), undefined),
    }))),

  post: c
    .meta({
      description: "Post a comment to the current discussion (supports stdin: echo 'msg' | ghd post)",
      examples: [
        'ghd post --message "Hello from claude"',
        'echo "piped message" | ghd post',
      ],
    })
    .input(s(v.object({
      message: v.optional(v.string()),
    }))),

  wait: c
    .meta({
      description: "Block until a new reply appears from another agent",
    })
    .input(s(v.object({
      timeout: v.optional(v.pipe(v.number(), v.minValue(1)), 300),
      interval: v.optional(v.pipe(v.number(), v.minValue(1)), 10),
    }))),

  status: c
    .meta({ description: "Show current session status" })
    .input(s(v.object({}))),

  end: c
    .meta({ description: "End the current session" })
    .input(s(v.object({}))),
}

const app = cli(schema, {
  name: "ghd",
  version: "0.1.0",
  description: "GitHub Discussion CLI for AI Agents",
})

app.run({
  handlers: {
    start: async ({ input }) => {
      if (hasActiveSession()) {
        const existing = loadSession()
        throw new GhdError(
          "SESSION_EXISTS",
          `Session already active: ${existing.owner}/${existing.repo}#${existing.issueNumber}. Run \`ghd end\` first.`,
        )
      }

      const [owner, repo] = input.repo.split("/")
      await validateIssue(owner, repo, input.issue)

      // Fetch existing comments to set lastSeen to the latest
      const tempSession: SessionState = {
        owner,
        repo,
        issueNumber: input.issue,
        agentName: input.as,
        agentRole: input.role ?? null,
        lastSeenCommentId: null,
        lastSeenAt: null,
        startedAt: new Date().toISOString(),
      }

      const comments = await fetchComments(tempSession)
      if (comments.length > 0) {
        const last = comments[comments.length - 1]
        tempSession.lastSeenCommentId = last.id
        tempSession.lastSeenAt = last.created_at
      }

      saveSession(tempSession)
      const rolePart = input.role ? ` (${input.role})` : ""
      console.log(`Session started: ${owner}/${repo}#${input.issue} as @${input.as}${rolePart}`)
      console.log(`Tracking from comment #${tempSession.lastSeenCommentId ?? "beginning"}`)
    },

    read: async ({ input }) => {
      const session = loadSession()
      const comments = await fetchComments(session)
      let parsed = parseComments(comments, session.lastSeenCommentId)

      if (input.last !== undefined) {
        parsed = parsed.slice(-input.last)
      }

      console.log(formatComments(parsed))

      // Update last seen
      if (parsed.length > 0) {
        const last = parsed[parsed.length - 1]
        updateLastSeen(last.id, last.createdAt)
      }
    },

    post: async ({ input }) => {
      const session = loadSession()

      let message = input.message
      // Read from stdin if no message provided
      if (!message) {
        const stdin = await Bun.stdin.text()
        message = stdin.trim()
      }
      if (!message) {
        throw new GhdError("INVALID_ARGS", "No message provided. Pass --message or pipe via stdin.")
      }

      const comment = await postComment(session, message)
      updateLastSeen(comment.id, comment.created_at)
      console.log(`Posted: ${comment.html_url}`)
    },

    wait: async ({ input }) => {
      const session = loadSession()
      console.error(`Waiting for new reply (timeout: ${input.timeout}s, interval: ${input.interval}s)...`)

      const newComments = await pollForNewComments(session, input.timeout, input.interval)

      // Update last seen to the latest new comment
      const last = newComments[newComments.length - 1]
      updateLastSeen(last.id, last.createdAt)

      // Output in agent-friendly format to stdout
      console.log(formatWaitResult(newComments))
    },

    status: () => {
      const session = loadSession()
      console.log(formatSession(session))
    },

    end: () => {
      if (!hasActiveSession()) {
        console.log("No active session.")
        return
      }
      const session = loadSession()
      deleteSession()
      console.log(`Session ended: ${session.owner}/${session.repo}#${session.issueNumber}`)
    },
  },
})
