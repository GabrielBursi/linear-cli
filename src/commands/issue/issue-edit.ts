import { Command } from "@cliffy/command"
import { gql } from "../../__codegen__/gql.ts"
import { getGraphQLClient } from "../../utils/graphql.ts"
import { openEditorWithContent } from "../../utils/editor.ts"
import { readStdinText } from "../../utils/stdin.ts"
import { fetchIssueDetailsRaw, getIssueIdentifier } from "../../utils/linear.ts"
import {
  CliError,
  handleError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.ts"

export type DescriptionSource = "editor" | "file" | "stdin"

interface SourceOptions {
  editor?: boolean
  descriptionFile?: string
  stdin?: boolean
}

/**
 * Decide where the new description comes from. The three sources are mutually
 * exclusive; with none given, a terminal falls back to the editor and a
 * redirected stdin is rejected (it would otherwise hang or edit blindly).
 */
export function selectDescriptionSource(
  options: SourceOptions,
  stdinIsTerminal: boolean,
): DescriptionSource {
  const selected: DescriptionSource[] = []
  if (options.editor) selected.push("editor")
  if (options.descriptionFile != null) selected.push("file")
  if (options.stdin) selected.push("stdin")

  if (selected.length > 1) {
    throw new ValidationError(
      "Cannot combine --editor, --description-file and --stdin",
      { suggestion: "Choose exactly one source for the new description." },
    )
  }
  if (selected.length === 1) return selected[0]

  if (stdinIsTerminal) return "editor"

  throw new ValidationError(
    "No description source provided and stdin is not a terminal",
    {
      suggestion:
        "Use --stdin to read from stdin, or --description-file <path> to read from a file.",
    },
  )
}

// Drop only the single trailing line break; everything else is preserved.
function stripFinalNewline(text: string): string {
  return text.replace(/\r?\n$/, "")
}

async function readDescriptionFile(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new NotFoundError("File", path)
    }
    throw new CliError(
      `Failed to read description file: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }
}

async function readIncomingDescription(
  source: "file" | "stdin",
  descriptionFile: string | undefined,
): Promise<string> {
  const raw = source === "file"
    ? await readDescriptionFile(descriptionFile ?? "")
    : await readStdinText()
  const content = stripFinalNewline(raw)

  // Never wipe a description by accident: empty input is an error.
  if (content.trim() === "") {
    throw new ValidationError(
      source === "file"
        ? `No content found in file: ${descriptionFile}`
        : "No content received on stdin",
      {
        suggestion: source === "file"
          ? "Provide a non-empty file."
          : "Pipe the new description into the command, e.g. `cat desc.md | linear issue edit ENG-123 --stdin`.",
      },
    )
  }
  return content
}

function appendDescription(current: string, addition: string): string {
  return current.trim() === "" ? addition : `${current}\n\n${addition}`
}

const UpdateIssueDescription = gql(`
  mutation UpdateIssueDescription($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id, identifier, url, title }
    }
  }
`)

export const editCommand = new Command()
  .name("edit")
  .description("Edit the description of an issue")
  .arguments("[issueId:string]")
  .option(
    "--editor",
    "Open the current description in $EDITOR (default when run in a terminal)",
  )
  .option(
    "--description-file <path:string>",
    "Read the description from a file",
  )
  .option("--stdin", "Read the description from stdin")
  .option(
    "--append",
    "Append to the current description (separated by a blank line) instead of replacing it",
  )
  .action(
    async ({ editor, descriptionFile, stdin, append }, issueIdArg) => {
      try {
        const source = selectDescriptionSource(
          { editor, descriptionFile, stdin },
          Deno.stdin.isTerminal(),
        )

        // Read file/stdin up front so bad input fails before any API call.
        const incoming = source === "editor" ? undefined : await (
          readIncomingDescription(source, descriptionFile)
        )

        const issueId = await getIssueIdentifier(issueIdArg)
        if (!issueId) {
          throw new ValidationError("Could not determine issue ID", {
            suggestion:
              "Please provide an issue ID like 'ENG-123' or run from a branch with an issue ID.",
          })
        }

        const needsCurrent = source === "editor" || append
        const current = needsCurrent
          ? (await fetchIssueDetailsRaw(issueId, false)).description ?? ""
          : ""

        let description: string
        if (source === "editor") {
          console.log(`Opening ${issueId} in editor...`)
          // With --append the buffer starts empty and only the new text is added.
          const edited = await openEditorWithContent(append ? "" : current)
          if (edited === undefined || (!append && edited === current.trim())) {
            console.log("No changes detected, update cancelled.")
            return
          }
          description = append ? appendDescription(current, edited) : edited
        } else if (incoming != null) {
          description = append ? appendDescription(current, incoming) : incoming
        } else {
          throw new CliError("No description content to save")
        }

        const data = await getGraphQLClient().request(UpdateIssueDescription, {
          id: issueId,
          input: { description },
        })

        if (!data.issueUpdate.success) {
          throw new CliError("Issue update failed")
        }
        const issue = data.issueUpdate.issue
        if (!issue) {
          throw new CliError("Issue update failed - no issue returned")
        }

        console.log(`✓ Updated issue ${issue.identifier}: ${issue.title}`)
        console.log(issue.url)
      } catch (error) {
        handleError(error, "Failed to edit issue description")
      }
    },
  )
