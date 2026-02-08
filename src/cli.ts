#!/usr/bin/env bun

import { watch } from "node:fs"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"
import { c, cli } from "argc"

import { findSession, loadSession, saveSession, startSession } from "./session.ts"
import { fetchComments, fetchIssue, parseAgentMeta, postComment, toParsedComment } from "./github.ts"
import { formatComments, formatIssueBody, formatSession, formatWaitResult } from "./formatter.ts"
import { GhdError } from "./types.ts"

const s = toStandardJsonSchema

const schema = {
  start: c
    .meta({
      description: "Create a discussion session for a GitHub issue",
      examples: ["ghd start acme/api 42"],
    })
    .args("repo", "issue")
    .input(s(v.object({
      repo: v.pipe(v.string(), v.regex(/^[^/]+\/[^/]+$/, "Must be owner/repo format")),
      issue: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1)),
      as: v.optional(v.pipe(v.string(), v.minLength(1), v.description("Agent name to register"))),
      role: v.optional(v.pipe(v.string(), v.minLength(1), v.description("Agent role"))),
    }))),

  post: c
    .meta({
      description: "Post a comment (supports stdin: echo 'msg' | ghd post 42 --as name)",
      examples: [
        'ghd post 42 --as claude --role "Architect" --message "Proposal: ..."',
        'echo "msg" | ghd post 42 --as codex',
      ],
    })
    .args("issue")
    .input(s(v.object({
      issue: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1)),
      as: v.pipe(v.string(), v.minLength(1), v.description("Agent name")),
      role: v.optional(v.pipe(v.string(), v.minLength(1), v.description("Agent role, visible in comment header"))),
      message: v.optional(v.string()),
    }))),

  read: c
    .meta({
      description: "Read comments from the discussion",
      examples: ["ghd read 42", "ghd read 42 --last 5", 'ghd read 42 --as claude --new'],
    })
    .args("issue")
    .input(s(v.object({
      issue: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1)),
      as: v.optional(v.string()),
      new: v.optional(v.boolean(), false),
      last: v.optional(v.pipe(v.number(), v.minValue(1))),
    }))),

  wait: c
    .meta({
      description: "Block until another agent replies (instant via file watch)",
      examples: ["ghd wait 42 --as claude", "ghd wait 42 --as claude --timeout 60"],
    })
    .args("issue")
    .input(s(v.object({
      issue: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1)),
      as: v.pipe(v.string(), v.minLength(1), v.description("Your agent name")),
      timeout: v.optional(v.pipe(v.number(), v.minValue(1)), 300),
    }))),

  status: c
    .meta({ description: "Show session status and agent cursors" })
    .args("issue")
    .input(s(v.object({
      issue: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1)),
    }))),

}

const app = cli(schema, {
  name: "ghd",
  version: "0.2.0",
  description: "GitHub Discussion CLI for AI Agents",
})

app.run({
  handlers: {
    start: async ({ input }) => {
      const [owner, repo] = input.repo.split("/")
      const issue = await fetchIssue(owner, repo, input.issue)
      const { path, state, created } = startSession(owner, repo, input.issue)

      // Register agent if --as provided
      if (input.as) {
        if (!state.agents[input.as]) {
          state.agents[input.as] = { role: input.role ?? null, cursor: null }
        } else if (input.role) {
          state.agents[input.as].role = input.role
        }
      }

      // Fetch all comments and set cursor
      const comments = await fetchComments(owner, repo, input.issue)
      const parsed = comments.map((c) => toParsedComment(c, false))

      if (input.as && parsed.length > 0) {
        state.agents[input.as].cursor = parsed[parsed.length - 1].id
      }
      saveSession(path, state)

      console.error(created ? `Session created: ${owner}/${repo}#${input.issue}` : `Session joined: ${owner}/${repo}#${input.issue}`)

      // Output issue body + all comments
      const parts = [formatIssueBody(issue)]
      if (parsed.length > 0) {
        parts.push(formatComments(parsed))
      }
      console.log(parts.join("\n---\n\n"))
    },

    post: async ({ input }) => {
      const { path, state } = findSession(input.issue)

      // Register or update agent
      if (!state.agents[input.as]) {
        state.agents[input.as] = { role: input.role ?? null, cursor: null }
      } else if (input.role) {
        state.agents[input.as].role = input.role
      }

      let message = input.message
      if (!message) {
        message = (await Bun.stdin.text()).trim()
      }
      if (!message) {
        throw new GhdError("INVALID_ARGS", "No message. Pass --message or pipe via stdin.")
      }

      const comment = await postComment(
        state.owner, state.repo, state.issue,
        input.as, state.agents[input.as].role, message,
      )

      state.agents[input.as].cursor = comment.id
      saveSession(path, state)

      console.log(`Posted: ${comment.html_url}`)
    },

    read: async ({ input }) => {
      const { path, state } = findSession(input.issue)

      if (input["new"] && !input.as) {
        throw new GhdError("INVALID_ARGS", "--new requires --as <agent-name>")
      }

      const comments = await fetchComments(state.owner, state.repo, state.issue)

      if (input["new"] && input.as) {
        // Auto-register agent
        if (!state.agents[input.as]) {
          state.agents[input.as] = { role: null, cursor: null }
        }
        const cursor = state.agents[input.as].cursor
        const parsed = comments
          .filter((c) => c.id > (cursor ?? 0))
          .map((c) => toParsedComment(c, true))

        console.log(formatComments(parsed))

        // Advance cursor
        if (parsed.length > 0) {
          state.agents[input.as].cursor = parsed[parsed.length - 1].id
          saveSession(path, state)
        }
      } else {
        let parsed = comments.map((c) => toParsedComment(c, false))
        if (input.last !== undefined) {
          parsed = parsed.slice(-input.last)
        }
        console.log(formatComments(parsed))
      }
    },

    wait: async ({ input }) => {
      const { path: sessionPath, state } = findSession(input.issue)
      const agentName = input.as

      // Auto-register agent
      if (!state.agents[agentName]) {
        state.agents[agentName] = { role: null, cursor: null }
        saveSession(sessionPath, state)
      }

      const myCursor = state.agents[agentName].cursor
      // Snapshot other agents' cursors for comparison
      const snapshot = Object.fromEntries(
        Object.entries(state.agents).map(([k, v]) => [k, v.cursor]),
      )

      function hasOtherCursorChanged(current: typeof state): boolean {
        return Object.entries(current.agents).some(([name, a]) => {
          if (name === agentName) return false
          return a.cursor !== (snapshot[name] ?? null)
        })
      }

      // Start watcher first, then check immediately (no race condition)
      const fresh = loadSession(sessionPath)
      if (!hasOtherCursorChanged(fresh)) {
        console.error(`Waiting for reply (timeout: ${input.timeout}s)...`)

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            watcher.close()
            reject(new GhdError("TIMEOUT", `Timed out after ${input.timeout}s waiting for reply.`))
          }, input.timeout * 1000)

          let checking = false
          const watcher = watch(sessionPath, () => {
            if (checking) return
            checking = true
            try {
              const current = loadSession(sessionPath)
              if (hasOtherCursorChanged(current)) {
                watcher.close()
                clearTimeout(timer)
                resolve()
              }
            } catch { /* file mid-write, ignore */ }
            finally { checking = false }
          })

          // Re-check immediately after watcher setup
          try {
            const recheck = loadSession(sessionPath)
            if (hasOtherCursorChanged(recheck)) {
              watcher.close()
              clearTimeout(timer)
              resolve()
            }
          } catch { /* ignore */ }
        })
      }

      // Fetch new comments from API (one call)
      const comments = await fetchComments(state.owner, state.repo, state.issue)
      const newComments = comments
        .filter((c) => c.id > (myCursor ?? 0))
        .filter((c) => parseAgentMeta(c.body)?.name !== agentName)
        .map((c) => toParsedComment(c, true))

      if (newComments.length > 0) {
        // Update cursor
        const latest = loadSession(sessionPath)
        latest.agents[agentName].cursor = newComments[newComments.length - 1].id
        saveSession(sessionPath, latest)

        console.log(formatWaitResult(newComments))
      }
    },

    status: ({ input }) => {
      const { state } = findSession(input.issue)
      console.log(formatSession(state))
    },

  },
})
