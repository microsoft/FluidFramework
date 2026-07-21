# Bundle Size Test

For client packages, we run bundle size analysis on PRs to ensure changes don't inadvertently grow the webpack bundle size that developers ship.
When a PR affects the measured client packages, a sticky **"Bundle size comparison"** comment is posted (and kept up to date) on the PR summarizing the change.

![Example message of bundle size comparison in PR](../../_assets/contributing/bundle-size-comparison.png)

Some increase in bundle size can be reasonable depending on the change.
It's up to the PR authors and reviewers to assess and agree on whether the increase is acceptable.

## How it works in PRs

Bundle size reporting is driven by the [pr-bundle-size-comments.yml](../../../../.github/workflows/pr-bundle-size-comments.yml) GitHub Actions workflow, which reacts to the completion of our Azure DevOps build pipelines:

- The **Build - client packages** pipeline produces the bundle-size artifact for the PR's head commit.
- The **Build - Client bundle size artifacts** pipeline produces the baseline artifact for `main` and release branch commits.

When a PR's build is queued, the workflow posts an initial "Pending" comment.
Once the PR (head) and baseline artifacts are both available, it compares them using `flub report comparePipelineBundleArtifacts` and updates the comment with:

- The **base** and **head** commit SHAs used for the comparison (the base is the PR's merge-base with its target branch).
- A **Notable changes** summary listing bundles that were added, removed, or whose parsed size changed by at least 500 bytes.
- A collapsible **Per-bundle deltas** section with the full inventory, showing both parsed and gzipped sizes for each bundle.

Only client packages are measured, so PRs that don't affect them (for example, server-only or docs-only changes) won't receive a comment.

## Run the bundle analysis locally

After [building the client packages](../Client.md#building-client-code) locally, run `npm run bundle-analysis:collect` at the root of the repo.
The bundle size result can be found in `artifacts/bundleAnalysis/@fluid-example/bundle-size-tests` at the repo root.

- `report.html` can be opened in a browser to examine module composition to see what has grown in size.
- `report.json` are the bundle stats, and used to compare the before and after to detect improvement or regressions.

You can either generate your own baseline numbers, or you can look for the bundle analysis artifacts for the baseline commit in the [Build - Client bundle size artifacts](https://dev.azure.com/fluidframework/public/_build?definitionId=48) pipeline.
