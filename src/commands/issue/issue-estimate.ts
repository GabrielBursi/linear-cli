import { Command } from "@cliffy/command"
import { fetchIssueDetailsRaw, getIssueIdentifier } from "../../utils/linear.ts"
import { handleError, ValidationError } from "../../utils/errors.ts"

export const estimateCommand = new Command()
  .name("estimate")
  .description(
    "Print the issue estimate (prints an empty line when the issue has no estimate)",
  )
  .arguments("[issueId:string]")
  .option("-j, --json", "Output as JSON")
  .action(async ({ json }, issueId) => {
    try {
      const resolvedId = await getIssueIdentifier(issueId)
      if (!resolvedId) {
        throw new ValidationError(
          "Could not determine issue ID",
          { suggestion: "Please provide an issue ID like 'ENG-123'." },
        )
      }
      const { estimate } = await fetchIssueDetailsRaw(resolvedId, false)
      if (json) {
        console.log(JSON.stringify({ estimate }, null, 2))
        return
      }
      console.log(estimate == null ? "" : String(estimate))
    } catch (error) {
      handleError(error, "Failed to get issue estimate")
    }
  })
