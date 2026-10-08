import { snapshotTest } from "@cliffy/testing"
import { estimateCommand } from "../../../src/commands/issue/issue-estimate.ts"
import { MockLinearServer } from "../../utils/mock_linear_server.ts"

const denoArgs = ["--allow-all", "--quiet"]

await snapshotTest({
  name: "Issue Estimate Command - Help Text",
  meta: import.meta,
  colors: false,
  args: ["--help"],
  denoArgs,
  async fn() {
    await estimateCommand.parse()
  },
})

await snapshotTest({
  name: "Issue Estimate Command - Prints Estimate",
  meta: import.meta,
  colors: false,
  args: ["TEST-123"],
  denoArgs,
  async fn() {
    const server = new MockLinearServer([
      {
        queryName: "GetIssueDetails",
        variables: { id: "TEST-123" },
        response: {
          data: {
            issue: {
              identifier: "TEST-123",
              title: "Fix authentication bug in login flow",
              description: null,
              url:
                "https://linear.app/test-team/issue/TEST-123/fix-authentication-bug-in-login-flow",
              branchName: "fix/test-123-auth-bug",
              state: {
                name: "In Progress",
                color: "#f87462",
              },
              assignee: null,
              priority: 2,
              estimate: 3,
              project: null,
              projectMilestone: null,
              parent: null,
              children: {
                nodes: [],
              },
              attachments: {
                nodes: [],
              },
              labels: {
                nodes: [],
              },
            },
          },
        },
      },
    ])

    try {
      await server.start()
      Deno.env.set("LINEAR_GRAPHQL_ENDPOINT", server.getEndpoint())
      Deno.env.set("LINEAR_API_KEY", "Bearer test-token")

      await estimateCommand.parse()
    } finally {
      await server.stop()
      Deno.env.delete("LINEAR_GRAPHQL_ENDPOINT")
      Deno.env.delete("LINEAR_API_KEY")
    }
  },
})

await snapshotTest({
  name: "Issue Estimate Command - No Estimate Prints Empty Line",
  meta: import.meta,
  colors: false,
  args: ["TEST-123"],
  denoArgs,
  async fn() {
    const server = new MockLinearServer([
      {
        queryName: "GetIssueDetails",
        variables: { id: "TEST-123" },
        response: {
          data: {
            issue: {
              identifier: "TEST-123",
              title: "Fix authentication bug in login flow",
              description: null,
              url:
                "https://linear.app/test-team/issue/TEST-123/fix-authentication-bug-in-login-flow",
              branchName: "fix/test-123-auth-bug",
              state: {
                name: "In Progress",
                color: "#f87462",
              },
              assignee: null,
              priority: 2,
              estimate: null,
              project: null,
              projectMilestone: null,
              parent: null,
              children: {
                nodes: [],
              },
              attachments: {
                nodes: [],
              },
              labels: {
                nodes: [],
              },
            },
          },
        },
      },
    ])

    try {
      await server.start()
      Deno.env.set("LINEAR_GRAPHQL_ENDPOINT", server.getEndpoint())
      Deno.env.set("LINEAR_API_KEY", "Bearer test-token")

      await estimateCommand.parse()
    } finally {
      await server.stop()
      Deno.env.delete("LINEAR_GRAPHQL_ENDPOINT")
      Deno.env.delete("LINEAR_API_KEY")
    }
  },
})

await snapshotTest({
  name: "Issue Estimate Command - Prints JSON",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--json"],
  denoArgs,
  async fn() {
    const server = new MockLinearServer([
      {
        queryName: "GetIssueDetails",
        variables: { id: "TEST-123" },
        response: {
          data: {
            issue: {
              identifier: "TEST-123",
              title: "Fix authentication bug in login flow",
              description: null,
              url:
                "https://linear.app/test-team/issue/TEST-123/fix-authentication-bug-in-login-flow",
              branchName: "fix/test-123-auth-bug",
              state: {
                name: "In Progress",
                color: "#f87462",
              },
              assignee: null,
              priority: 2,
              estimate: 5,
              project: null,
              projectMilestone: null,
              parent: null,
              children: {
                nodes: [],
              },
              attachments: {
                nodes: [],
              },
              labels: {
                nodes: [],
              },
            },
          },
        },
      },
    ])

    try {
      await server.start()
      Deno.env.set("LINEAR_GRAPHQL_ENDPOINT", server.getEndpoint())
      Deno.env.set("LINEAR_API_KEY", "Bearer test-token")

      await estimateCommand.parse()
    } finally {
      await server.stop()
      Deno.env.delete("LINEAR_GRAPHQL_ENDPOINT")
      Deno.env.delete("LINEAR_API_KEY")
    }
  },
})

await snapshotTest({
  name: "Issue Estimate Command - Prints JSON Null",
  meta: import.meta,
  colors: false,
  args: ["TEST-123", "--json"],
  denoArgs,
  async fn() {
    const server = new MockLinearServer([
      {
        queryName: "GetIssueDetails",
        variables: { id: "TEST-123" },
        response: {
          data: {
            issue: {
              identifier: "TEST-123",
              title: "Fix authentication bug in login flow",
              description: null,
              url:
                "https://linear.app/test-team/issue/TEST-123/fix-authentication-bug-in-login-flow",
              branchName: "fix/test-123-auth-bug",
              state: {
                name: "In Progress",
                color: "#f87462",
              },
              assignee: null,
              priority: 2,
              estimate: null,
              project: null,
              projectMilestone: null,
              parent: null,
              children: {
                nodes: [],
              },
              attachments: {
                nodes: [],
              },
              labels: {
                nodes: [],
              },
            },
          },
        },
      },
    ])

    try {
      await server.start()
      Deno.env.set("LINEAR_GRAPHQL_ENDPOINT", server.getEndpoint())
      Deno.env.set("LINEAR_API_KEY", "Bearer test-token")

      await estimateCommand.parse()
    } finally {
      await server.stop()
      Deno.env.delete("LINEAR_GRAPHQL_ENDPOINT")
      Deno.env.delete("LINEAR_API_KEY")
    }
  },
})

await snapshotTest({
  name: "Issue Estimate Command - Issue Not Found",
  meta: import.meta,
  colors: false,
  canFail: true,
  args: ["TEST-999"],
  denoArgs,
  async fn() {
    const server = new MockLinearServer([
      {
        queryName: "GetIssueDetails",
        variables: { id: "TEST-999" },
        response: {
          errors: [{
            message: "Issue not found: TEST-999",
            extensions: { code: "NOT_FOUND" },
          }],
        },
      },
    ])

    try {
      await server.start()
      Deno.env.set("LINEAR_GRAPHQL_ENDPOINT", server.getEndpoint())
      Deno.env.set("LINEAR_API_KEY", "Bearer test-token")

      await estimateCommand.parse()
    } finally {
      await server.stop()
      Deno.env.delete("LINEAR_GRAPHQL_ENDPOINT")
      Deno.env.delete("LINEAR_API_KEY")
    }
  },
})
