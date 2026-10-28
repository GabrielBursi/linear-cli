import { Command } from "@cliffy/command"
import { bold, dim } from "@std/fmt/colors"
import { gql } from "../../__codegen__/gql.ts"
import type { GetIssueHistoryQuery } from "../../__codegen__/graphql.ts"
import { formatRelativeTime, getPriorityLabel } from "../../utils/display.ts"
import {
  handleError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.ts"
import { getGraphQLClient } from "../../utils/graphql.ts"
import { getIssueIdentifier } from "../../utils/linear.ts"

const NONE = "(none)"

const query = gql(`
  query GetIssueHistory($id: String!, $after: String) {
    issue(id: $id) {
      identifier
      history(first: 50, after: $after) {
        nodes {
          id
          createdAt
          actor {
            name
            displayName
          }
          fromState {
            name
          }
          toState {
            name
          }
          fromAssignee {
            name
            displayName
          }
          toAssignee {
            name
            displayName
          }
          fromCycle {
            number
            name
          }
          toCycle {
            number
            name
          }
          fromProject {
            name
          }
          toProject {
            name
          }
          fromTeam {
            key
            name
          }
          toTeam {
            key
            name
          }
          fromParent {
            identifier
          }
          toParent {
            identifier
          }
          addedLabels {
            name
          }
          removedLabels {
            name
          }
          fromTitle
          toTitle
          fromPriority
          toPriority
          fromEstimate
          toEstimate
          fromDueDate
          toDueDate
          updatedDescription
          archived
          trashed
          autoClosed
          autoArchived
          relationChanges {
            identifier
            type
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

type HistoryNode = NonNullable<
  GetIssueHistoryQuery["issue"]
>["history"]["nodes"][number]

interface Named {
  name: string
  displayName?: string
}

const userName = (user?: Named | null): string =>
  user?.displayName || user?.name || NONE

const transition = (
  label: string,
  from: string | null | undefined,
  to: string | null | undefined,
): string => `${label}: ${from ?? NONE} → ${to ?? NONE}`

const cycleName = (
  cycle?: { number: number; name?: string | null } | null,
): string | undefined =>
  cycle == null ? undefined : cycle.name || `Cycle ${cycle.number}`

const teamName = (
  team?: { key: string; name: string } | null,
): string | undefined => team == null ? undefined : `${team.name} (${team.key})`

const hasChange = (from: unknown, to: unknown): boolean =>
  from != null || to != null

function describeChanges(node: HistoryNode): string[] {
  const lines: string[] = []

  if (hasChange(node.fromState, node.toState)) {
    lines.push(transition("Status", node.fromState?.name, node.toState?.name))
  }
  if (hasChange(node.fromAssignee, node.toAssignee)) {
    lines.push(transition(
      "Assignee",
      node.fromAssignee ? userName(node.fromAssignee) : undefined,
      node.toAssignee ? userName(node.toAssignee) : undefined,
    ))
  }
  if (hasChange(node.fromPriority, node.toPriority)) {
    lines.push(transition(
      "Priority",
      node.fromPriority == null
        ? undefined
        : getPriorityLabel(node.fromPriority),
      node.toPriority == null ? undefined : getPriorityLabel(node.toPriority),
    ))
  }
  if (hasChange(node.fromEstimate, node.toEstimate)) {
    lines.push(transition(
      "Estimate",
      node.fromEstimate?.toString(),
      node.toEstimate?.toString(),
    ))
  }
  if (hasChange(node.fromTitle, node.toTitle)) {
    const quote = (value?: string | null) =>
      value == null ? NONE : JSON.stringify(value)
    lines.push(
      `Title changed: ${quote(node.fromTitle)} → ${quote(node.toTitle)}`,
    )
  }

  const labelChanges = [
    ...(node.addedLabels ?? []).map((label) => `+${label.name}`),
    ...(node.removedLabels ?? []).map((label) => `-${label.name}`),
  ]
  if (labelChanges.length > 0) {
    lines.push(`Labels: ${labelChanges.join(", ")}`)
  }

  if (hasChange(node.fromCycle, node.toCycle)) {
    lines.push(
      transition("Cycle", cycleName(node.fromCycle), cycleName(node.toCycle)),
    )
  }
  if (hasChange(node.fromProject, node.toProject)) {
    lines.push(
      transition("Project", node.fromProject?.name, node.toProject?.name),
    )
  }
  if (hasChange(node.fromTeam, node.toTeam)) {
    lines.push(
      transition("Team", teamName(node.fromTeam), teamName(node.toTeam)),
    )
  }
  if (hasChange(node.fromParent, node.toParent)) {
    lines.push(
      transition(
        "Parent",
        node.fromParent?.identifier,
        node.toParent?.identifier,
      ),
    )
  }
  if (hasChange(node.fromDueDate, node.toDueDate)) {
    lines.push(transition("Due date", node.fromDueDate, node.toDueDate))
  }
  for (const relation of node.relationChanges ?? []) {
    lines.push(`Relation: ${relation.type} ${relation.identifier}`)
  }
  if (node.updatedDescription) lines.push("Description updated")
  if (node.archived != null) {
    lines.push(node.archived ? "Archived" : "Unarchived")
  }
  if (node.trashed != null) lines.push(node.trashed ? "Trashed" : "Untrashed")
  if (node.autoClosed) lines.push("Auto-closed")
  if (node.autoArchived) lines.push("Auto-archived")

  return lines
}

export const historyCommand = new Command()
  .name("history")
  .description("Show the activity history of an issue")
  .arguments("[issueId:string]")
  .option("-j, --json", "Output as JSON")
  .option(
    "--limit <limit:number>",
    "Maximum number of history entries to fetch (default: all, 0 for unlimited)",
    { default: 0 },
  )
  .action(async ({ json, limit }, issueId) => {
    try {
      if (limit < 0) {
        throw new ValidationError("--limit must be 0 or greater", {
          suggestion: "Use 0 to fetch the entire history.",
        })
      }

      const resolvedIdentifier = await getIssueIdentifier(issueId)
      if (!resolvedIdentifier) {
        throw new ValidationError(
          "Could not determine issue ID",
          { suggestion: "Please provide an issue ID like 'ENG-123'." },
        )
      }

      const client = getGraphQLClient()
      const nodes: HistoryNode[] = []
      let after: string | null | undefined
      let hasNextPage = true

      while (hasNextPage && (limit === 0 || nodes.length < limit)) {
        const data = await client.request(query, {
          id: resolvedIdentifier,
          after,
        })
        if (data.issue == null) {
          throw new NotFoundError("Issue", resolvedIdentifier)
        }
        nodes.push(...data.issue.history.nodes)
        hasNextPage = data.issue.history.pageInfo.hasNextPage
        after = data.issue.history.pageInfo.endCursor
      }

      const entries = limit === 0 ? nodes : nodes.slice(0, limit)
      const truncated = entries.length < nodes.length

      if (json) {
        console.log(JSON.stringify(
          {
            nodes: entries,
            pageInfo: {
              hasNextPage: hasNextPage || truncated,
              endCursor: truncated ? null : after ?? null,
            },
          },
          null,
          2,
        ))
        return
      }

      const chronological = entries.slice().sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )

      let printed = 0
      for (const node of chronological) {
        const when = formatRelativeTime(node.createdAt)
        const actor = node.actor ? userName(node.actor) : "Linear"
        for (const change of describeChanges(node)) {
          console.log(`${dim(when)}  ${bold(actor)}  ${change}`)
          printed++
        }
      }

      if (printed === 0) {
        console.log("No history found for this issue")
      }
    } catch (error) {
      handleError(error, "Failed to show issue history")
    }
  })
