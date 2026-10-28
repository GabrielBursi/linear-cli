import { snapshotTest } from "@cliffy/testing"
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert"
import {
  editCommand,
  selectDescriptionSource,
} from "../../../src/commands/issue/issue-edit.ts"
import { ValidationError } from "../../../src/utils/errors.ts"
import { MockLinearServer } from "../../utils/mock_linear_server.ts"
import { commonDenoArgs } from "../../utils/test-helpers.ts"

const MULTILINE_MARKDOWN =
  "# Heading\n\nFirst paragraph.\n\n\n- item one\n- item two\n\n    indented code\n\nLast paragraph."

function issueDetailsMock(id: string, description: string | null) {
  return {
    queryName: "GetIssueDetails",
    variables: { id },
    response: {
      data: {
        issue: {
          identifier: id,
          title: "Fix authentication bug in login flow",
          description,
          url: `https://linear.app/test-team/issue/${id}/fix-auth`,
          branchName: "fix/auth",
          state: { name: "In Progress", color: "#f87462" },
          assignee: null,
          priority: 2,
          estimate: null,
          project: null,
          projectMilestone: null,
          parent: null,
          children: { nodes: [] },
          attachments: { nodes: [] },
          labels: { nodes: [] },
        },
      },
    },
  }
}

function updateMock(id: string, description: string) {
  return {
    queryName: "UpdateIssueDescription",
    variables: { id, input: { description } },
    response: {
      data: {
        issueUpdate: {
          success: true,
          issue: {
            id: "issue-uuid",
            identifier: id,
            url: `https://linear.app/test-team/issue/${id}/fix-auth`,
            title: "Fix authentication bug in login flow",
          },
        },
      },
    },
  }
}

async function withServer(
  mocks: Array<{
    queryName: string
    variables?: Record<string, unknown>
    response: Record<string, unknown>
  }>,
  run: () => Promise<void>,
) {
  const server = new MockLinearServer(mocks)
  try {
    await server.start()
    Deno.env.set("LINEAR_GRAPHQL_ENDPOINT", server.getEndpoint())
    Deno.env.set("LINEAR_API_KEY", "Bearer test-token")
    await run()
  } finally {
    await server.stop()
    Deno.env.delete("LINEAR_GRAPHQL_ENDPOINT")
    Deno.env.delete("LINEAR_API_KEY")
  }
}

// Installs a fake $EDITOR (a shell script) and isolates from the user's git
// `core.editor`, which getEditor() would otherwise prefer over $EDITOR.
async function useFakeEditor(scriptBody: string) {
  const dir = await Deno.makeTempDir()
  const script = `${dir}/fake-editor.sh`
  await Deno.writeTextFile(script, `#!/bin/sh\n${scriptBody}\n`)
  await Deno.chmod(script, 0o755)
  Deno.env.set("EDITOR", script)
  Deno.env.set("GIT_CONFIG_GLOBAL", "/dev/null")
}

async function writeTempFile(name: string, content: string): Promise<string> {
  const dir = await Deno.makeTempDir()
  const path = `${dir}/${name}`
  await Deno.writeTextFile(path, content)
  return path
}

// --- selectDescriptionSource (pure) ---

Deno.test("selectDescriptionSource - single explicit source", () => {
  assertEquals(selectDescriptionSource({ editor: true }, false), "editor")
  assertEquals(
    selectDescriptionSource({ descriptionFile: "a.md" }, true),
    "file",
  )
  assertEquals(selectDescriptionSource({ stdin: true }, true), "stdin")
})

Deno.test("selectDescriptionSource - defaults to editor on a terminal", () => {
  assertEquals(selectDescriptionSource({}, true), "editor")
})

Deno.test("selectDescriptionSource - no source without terminal errors", () => {
  assertThrows(
    () => selectDescriptionSource({}, false),
    ValidationError,
    "stdin is not a terminal",
  )
})

Deno.test("selectDescriptionSource - combined sources error", () => {
  assertThrows(
    () => selectDescriptionSource({ editor: true, stdin: true }, true),
    ValidationError,
    "Cannot combine",
  )
})

// --- command ---

await snapshotTest({
  name: "Issue Edit Command - Help Text",
  meta: import.meta,
  colors: false,
  args: ["--help"],
  denoArgs: commonDenoArgs,
  async fn() {
    await editCommand.parse()
  },
})

await snapshotTest({
  name: "Issue Edit Command - Description File Replaces",
  meta: import.meta,
  colors: false,
  args: [],
  denoArgs: commonDenoArgs,
  async fn() {
    const file = await writeTempFile("desc.md", "New description\n")
    await withServer([updateMock("TEST-123", "New description")], async () => {
      await editCommand.parse(["TEST-123", "--description-file", file])
    })
  },
})

await snapshotTest({
  name: "Issue Edit Command - Description File Preserves Multiline Markdown",
  meta: import.meta,
  colors: false,
  args: [],
  denoArgs: commonDenoArgs,
  async fn() {
    const file = await writeTempFile("desc.md", MULTILINE_MARKDOWN + "\n")
    await withServer(
      [updateMock("TEST-123", MULTILINE_MARKDOWN)],
      async () => {
        await editCommand.parse(["TEST-123", "--description-file", file])
      },
    )
  },
})

await snapshotTest({
  name: "Issue Edit Command - Description File Not Found",
  meta: import.meta,
  colors: false,
  args: [],
  denoArgs: commonDenoArgs,
  canFail: true,
  async fn() {
    await editCommand.parse([
      "TEST-123",
      "--description-file",
      "/nonexistent/desc.md",
    ])
  },
})

await snapshotTest({
  name: "Issue Edit Command - Append With File",
  meta: import.meta,
  colors: false,
  args: [],
  denoArgs: commonDenoArgs,
  async fn() {
    const file = await writeTempFile("extra.md", "Extra line\n")
    await withServer([
      issueDetailsMock("TEST-123", "Existing description"),
      updateMock("TEST-123", "Existing description\n\nExtra line"),
    ], async () => {
      await editCommand.parse([
        "TEST-123",
        "--description-file",
        file,
        "--append",
      ])
    })
  },
})

await snapshotTest({
  name: "Issue Edit Command - Editor Saves Edited Description",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--editor"],
  denoArgs: commonDenoArgs,
  async fn() {
    // Appends a line to the buffer the command pre-filled with the current text.
    await useFakeEditor(`printf '\\n\\nedited line\\n' >> "$1"`)
    await withServer([
      issueDetailsMock("TEST-123", "Existing description"),
      updateMock("TEST-123", "Existing description\n\nedited line"),
    ], async () => {
      await editCommand.parse()
    })
  },
})

await snapshotTest({
  name:
    "Issue Edit Command - Editor Without Changes Cancels Without API Update",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--editor"],
  denoArgs: commonDenoArgs,
  async fn() {
    await useFakeEditor("true")
    // Only the read is mocked; an update call would surface as an error.
    await withServer([
      issueDetailsMock("TEST-123", "Existing description"),
    ], async () => {
      await editCommand.parse()
    })
  },
})

await snapshotTest({
  name: "Issue Edit Command - Editor Emptied Buffer Cancels",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--editor"],
  denoArgs: commonDenoArgs,
  async fn() {
    await useFakeEditor(`: > "$1"`)
    await withServer([
      issueDetailsMock("TEST-123", "Existing description"),
    ], async () => {
      await editCommand.parse()
    })
  },
})

await snapshotTest({
  name: "Issue Edit Command - Editor Not Configured Errors",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--editor"],
  denoArgs: commonDenoArgs,
  canFail: true,
  async fn() {
    Deno.env.delete("EDITOR")
    Deno.env.set("GIT_CONFIG_GLOBAL", "/dev/null")
    await withServer([
      issueDetailsMock("TEST-123", "Existing description"),
    ], async () => {
      await editCommand.parse()
    })
  },
})

await snapshotTest({
  name: "Issue Edit Command - Editor With Append Starts Empty",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--editor", "--append"],
  denoArgs: commonDenoArgs,
  async fn() {
    // The buffer is empty with --append, so only the written text is appended.
    await useFakeEditor(`printf 'appended from editor\\n' > "$1"`)
    await withServer([
      issueDetailsMock("TEST-123", "Existing description"),
      updateMock(
        "TEST-123",
        "Existing description\n\nappended from editor",
      ),
    ], async () => {
      await editCommand.parse()
    })
  },
})

await snapshotTest({
  name: "Issue Edit Command - Combined Sources Error",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--stdin", "--description-file", "a.md"],
  denoArgs: commonDenoArgs,
  canFail: true,
  async fn() {
    await editCommand.parse()
  },
})

await snapshotTest({
  name: "Issue Edit Command - No Source Without Terminal Errors",
  meta: import.meta,
  colors: false,
  args: ["TEST-123"],
  denoArgs: commonDenoArgs,
  canFail: true,
  async fn() {
    await editCommand.parse()
  },
})

// snapshotTest only closes the child's stdin after the child exits, so any
// command that reads stdin to EOF would hang. Stdin cases therefore spawn the
// CLI directly and close stdin themselves.
const MAIN = new URL("../../../src/main.ts", import.meta.url).pathname
const CONFIG = new URL("../../../deno.json", import.meta.url).pathname

async function runEdit(
  args: string[],
  options: { stdin?: string; cwd?: string; endpoint: string },
) {
  const child = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-all",
      "--quiet",
      "--config",
      CONFIG,
      MAIN,
      "issue",
      "edit",
      ...args,
    ],
    cwd: options.cwd,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    env: {
      NO_COLOR: "1",
      LINEAR_GRAPHQL_ENDPOINT: options.endpoint,
      LINEAR_API_KEY: "Bearer test-token",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  }).spawn()
  const writer = child.stdin.getWriter()
  if (options.stdin != null) {
    await writer.write(new TextEncoder().encode(options.stdin))
  }
  await writer.close()
  const out = await child.output()
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  }
}

async function withMock<TResult>(
  mocks: Parameters<typeof withServer>[0],
  run: (endpoint: string) => Promise<TResult>,
): Promise<TResult> {
  const server = new MockLinearServer(mocks)
  try {
    await server.start()
    return await run(server.getEndpoint())
  } finally {
    await server.stop()
  }
}

const UPDATED_URL = (id: string) =>
  `https://linear.app/test-team/issue/${id}/fix-auth`

Deno.test("issue edit --stdin replaces and preserves blank lines", async () => {
  const result = await withMock(
    [updateMock("TEST-123", MULTILINE_MARKDOWN)],
    (endpoint) =>
      runEdit(["TEST-123", "--stdin"], {
        stdin: MULTILINE_MARKDOWN + "\n",
        endpoint,
      }),
  )
  assertEquals(result.code, 0, result.stderr)
  assertStringIncludes(result.stdout, "✓ Updated issue TEST-123")
  assertStringIncludes(result.stdout, UPDATED_URL("TEST-123"))
})

Deno.test("issue edit --stdin with empty stdin errors without updating", async () => {
  const result = await withMock(
    [],
    (endpoint) => runEdit(["TEST-123", "--stdin"], { stdin: "", endpoint }),
  )
  assertEquals(result.code, 1)
  assertStringIncludes(result.stderr, "No content received on stdin")
})

Deno.test("issue edit --stdin --append adds a blank-line separator", async () => {
  const result = await withMock([
    issueDetailsMock("TEST-123", "Existing description"),
    updateMock("TEST-123", "Existing description\n\nlinha extra"),
  ], (endpoint) =>
    runEdit(["TEST-123", "--stdin", "--append"], {
      stdin: "linha extra",
      endpoint,
    }))
  assertEquals(result.code, 0, result.stderr)
  assertStringIncludes(result.stdout, "✓ Updated issue TEST-123")
})

Deno.test("issue edit --stdin --append on empty description adds no separator", async () => {
  const result = await withMock([
    issueDetailsMock("TEST-123", null),
    updateMock("TEST-123", "only content"),
  ], (endpoint) =>
    runEdit(["TEST-123", "--stdin", "--append"], {
      stdin: "only content",
      endpoint,
    }))
  assertEquals(result.code, 0, result.stderr)
})

Deno.test("issue edit reports an issue that does not exist", async () => {
  const result = await withMock(
    [{
      queryName: "GetIssueDetails",
      variables: { id: "TEST-999" },
      response: {
        errors: [{
          message: "Entity not found: Issue",
          extensions: { code: "INVALID_INPUT" },
        }],
      },
    }],
    (endpoint) =>
      runEdit(["TEST-999", "--stdin", "--append"], { stdin: "text", endpoint }),
  )
  assertEquals(result.code, 1)
  assertStringIncludes(result.stderr, "Failed to edit issue description")
})

Deno.test("issue edit rejects an invalid issue id", async () => {
  const result = await withMock(
    [],
    (endpoint) =>
      runEdit(["not-an-id!", "--stdin"], { stdin: "text", endpoint }),
  )
  assertEquals(result.code, 1)
  assertStringIncludes(result.stderr, "Failed to edit issue description")
})

Deno.test("issue edit infers the issue id from the git branch", async () => {
  const repo = await Deno.makeTempDir()
  const init = await new Deno.Command("git", {
    args: ["init", "-q", "-b", "test-123-fix-auth"],
    cwd: repo,
    env: { GIT_CONFIG_GLOBAL: "/dev/null" },
  }).output()
  assertEquals(init.success, true)
  const result = await withMock(
    [updateMock("TEST-123", "from branch")],
    (endpoint) =>
      runEdit(["--stdin"], { stdin: "from branch", cwd: repo, endpoint }),
  )
  assertEquals(result.code, 0, result.stderr)
  assertStringIncludes(result.stdout, "✓ Updated issue TEST-123")
})
