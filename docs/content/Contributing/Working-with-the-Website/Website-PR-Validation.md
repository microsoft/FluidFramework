The repo includes a GitHub action that will review PRs that change the /docs folder. This action does the following validation of the changes in the PR:

1. **Builds the site** using the PR changes and the latest API reference docs.

    Source: [/.github/workflows/website-validation.yml#L14-L34](../../../../.github/workflows/website-validation.yml)

2. Checks the built site for **broken internal links**. Internal means links within the site itself. Links to other sites are not checked.

    Source: [.github/workflows/website-validation.yml#L36-L61](../../../../.github/workflows/website-validation.yml)

## GitHub Action workflow design

For [security reasons][pwn-blog], the website validation uses the `pull_request` trigger and runs with a read-only access token. It builds the untrusted code in the PR and loads it in a local web server for link checking. The results of the site build and link check are output as build artifacts.

When it completes, the website validation workflow triggers a separate workflow to handle "reporting" the link check results to the PR. More precisely, the completion causes a `workflow_run` event to be raised, the which is the trigger the reporter workflow is configured to trigger on.

Source: [.github/workflows/linkcheck-reporter.yml](../../../../.github/workflows/linkcheck-reporter.yml)

The reporter workflow runs with a write-access token, so it can post comments to the PR. It takes the report output from the website validation workflow and posts a success/failure comment to the PR. The only input it uses is the report output from the earlier workflow.

**Drawback**: Because the reporter is not triggered by the PR directly, it doesn't show up in the "checks" UI in GitHub. You have to navigate directly to the Actions section to view it manually.

## Extending the validation

Not yet documented. Contact @tylerbutler in the meantime.

[pwn-blog]: https://securitylab.github.com/research/github-actions-preventing-pwn-requests/
