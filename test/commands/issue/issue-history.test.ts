import { historyCommand } from "../../../src/commands/issue/issue-history.ts"
import { snapshotTest } from "@cliffy/testing"
import {
  commonDenoArgs,
  setupMockLinearServer,
} from "../../utils/test-helpers.ts"

// Entries older than a week are rendered with toLocaleDateString(), which
// depends on the machine locale. Pin it so snapshots are portable.
Date.prototype.toLocaleDateString = function (this: Date) {
  return this.toISOString().slice(0, 10)
}

const actor = { name: "gabriel", displayName: "Gabriel" }
const maria = { name: "maria", displayName: "Maria" }

// Baseline node: every optional field present but empty, like the API returns.
function entry(id: string, createdAt: string, overrides: object = {}) {
  return {
    id,
    createdAt,
    actor,
    fromState: null,
    toState: null,
    fromAssignee: null,
    toAssignee: null,
    fromCycle: null,
    toCycle: null,
    fromProject: null,
    toProject: null,
    fromTeam: null,
    toTeam: null,
    fromParent: null,
    toParent: null,
    addedLabels: [],
    removedLabels: [],
    fromTitle: null,
    toTitle: null,
    fromPriority: null,
    toPriority: null,
    fromEstimate: null,
    toEstimate: null,
    fromDueDate: null,
    toDueDate: null,
    updatedDescription: null,
    archived: null,
    trashed: null,
    autoClosed: null,
    autoArchived: null,
    relationChanges: [],
    ...overrides,
  }
}

function historyResponse(
  nodes: object[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null },
) {
  return {
    data: { issue: { identifier: "TEST-123", history: { nodes, pageInfo } } },
  }
}

await snapshotTest({
  name: "Issue History Command - Help Text",
  meta: import.meta,
  colors: false,
  args: ["--help"],
  denoArgs: commonDenoArgs,
  async fn() {
    await historyCommand.parse()
  },
})

await snapshotTest({
  name: "Issue History Command - State, Assignee, Priority, Estimate, Title",
  meta: import.meta,
  colors: false,
  args: ["TEST-123"],
  denoArgs: commonDenoArgs,
  async fn() {
    const { cleanup } = await setupMockLinearServer([
      {
        queryName: "GetIssueHistory",
        response: historyResponse([
          entry("h1", "2024-01-15T10:00:00Z", {
            fromState: { name: "Todo" },
            toState: { name: "In Progress" },
          }),
          entry("h2", "2024-01-15T11:00:00Z", {
            toAssignee: actor,
          }),
          entry("h3", "2024-01-15T12:00:00Z", {
            fromAssignee: actor,
            toAssignee: maria,
          }),
          entry("h4", "2024-01-15T13:00:00Z", {
            fromAssignee: maria,
          }),
          entry("h5", "2024-01-15T14:00:00Z", {
            fromPriority: 3,
            toPriority: 2,
          }),
          entry("h6", "2024-01-15T15:00:00Z", {
            fromEstimate: 3,
            toEstimate: 5,
          }),
          entry("h7", "2024-01-15T16:00:00Z", {
            fromTitle: "A",
            toTitle: "B",
          }),
        ]),
      },
    ])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name:
    "Issue History Command - Labels, Cycle, Project, Team, Parent, Due Date",
  meta: import.meta,
  colors: false,
  args: ["TEST-123"],
  denoArgs: commonDenoArgs,
  async fn() {
    const { cleanup } = await setupMockLinearServer([
      {
        queryName: "GetIssueHistory",
        response: historyResponse([
          entry("h1", "2024-01-15T10:00:00Z", {
            addedLabels: [{ name: "bug" }],
            removedLabels: [{ name: "wip" }],
          }),
          entry("h2", "2024-01-15T11:00:00Z", {
            toCycle: { number: 7, name: null },
          }),
          entry("h3", "2024-01-15T12:00:00Z", {
            fromProject: { name: "Alpha" },
            toProject: { name: "Beta" },
          }),
          entry("h4", "2024-01-15T13:00:00Z", {
            fromTeam: { key: "ENG", name: "Engineering" },
            toTeam: { key: "OPS", name: "Operations" },
          }),
          entry("h5", "2024-01-15T14:00:00Z", {
            toParent: { identifier: "TEST-1" },
            fromDueDate: null,
            toDueDate: "2024-02-01",
            relationChanges: [{ identifier: "TEST-9", type: "blocks" }],
          }),
        ]),
      },
    ])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name: "Issue History Command - Multiple Changes In One Entry",
  meta: import.meta,
  colors: false,
  args: ["TEST-123"],
  denoArgs: commonDenoArgs,
  async fn() {
    const { cleanup } = await setupMockLinearServer([
      {
        queryName: "GetIssueHistory",
        response: historyResponse([
          entry("h1", "2024-01-15T10:00:00Z", {
            fromState: { name: "Todo" },
            toState: { name: "Done" },
            toAssignee: maria,
            updatedDescription: true,
            archived: true,
            autoClosed: true,
          }),
          // Creation entry: no "from" values, and no actor (integration)
          entry("h0", "2024-01-14T09:00:00Z", {
            actor: null,
            toState: { name: "Todo" },
            toPriority: 0,
          }),
        ]),
      },
    ])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name: "Issue History Command - No History",
  meta: import.meta,
  colors: false,
  args: ["TEST-123"],
  denoArgs: commonDenoArgs,
  async fn() {
    const { cleanup } = await setupMockLinearServer([
      { queryName: "GetIssueHistory", response: historyResponse([]) },
    ])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name: "Issue History Command - JSON Output",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--json"],
  denoArgs: commonDenoArgs,
  async fn() {
    const { cleanup } = await setupMockLinearServer([
      {
        queryName: "GetIssueHistory",
        response: historyResponse([
          entry("h1", "2024-01-15T10:00:00Z", {
            fromState: { name: "Todo" },
            toState: { name: "In Progress" },
          }),
        ]),
      },
    ])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name: "Issue History Command - Pagination Across Two Pages",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--json"],
  denoArgs: commonDenoArgs,
  async fn() {
    const { cleanup } = await setupMockLinearServer([
      // Second page must come first: the mock server returns the first match.
      {
        queryName: "GetIssueHistory",
        variables: { after: "cursor-1" },
        response: historyResponse([
          entry("h2", "2024-01-15T11:00:00Z", { toEstimate: 5 }),
        ]),
      },
      {
        queryName: "GetIssueHistory",
        response: historyResponse(
          [entry("h1", "2024-01-15T10:00:00Z", { toEstimate: 3 })],
          { hasNextPage: true, endCursor: "cursor-1" },
        ),
      },
    ])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name: "Issue History Command - Issue Not Found",
  meta: import.meta,
  colors: false,
  args: ["TEST-404"],
  denoArgs: commonDenoArgs,
  canFail: true,
  async fn() {
    const { cleanup } = await setupMockLinearServer([
      { queryName: "GetIssueHistory", response: { data: { issue: null } } },
    ])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name: "Issue History Command - Invalid Issue ID",
  meta: import.meta,
  colors: false,
  args: ["not-an-issue"],
  denoArgs: commonDenoArgs,
  canFail: true,
  async fn() {
    const { cleanup } = await setupMockLinearServer([])

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
    }
  },
})

await snapshotTest({
  name: "Issue History Command - Issue ID Inferred From Branch",
  meta: import.meta,
  colors: false,
  args: [],
  denoArgs: commonDenoArgs,
  async fn() {
    const repo = await Deno.makeTempDir()
    const git = (...args: string[]) =>
      new Deno.Command("git", { args, cwd: repo }).outputSync()
    git("init", "-q")
    git("checkout", "-q", "-b", "feat/test-123-from-branch")
    Deno.chdir(repo)

    const { server, cleanup } = await setupMockLinearServer([
      {
        queryName: "GetIssueHistory",
        variables: { id: "TEST-123" },
        response: historyResponse([
          entry("h1", "2024-01-15T10:00:00Z", {
            fromState: { name: "Todo" },
            toState: { name: "In Progress" },
          }),
        ]),
      },
    ])
    void server

    try {
      await historyCommand.parse()
    } finally {
      await cleanup()
      await Deno.remove(repo, { recursive: true })
    }
  },
})
