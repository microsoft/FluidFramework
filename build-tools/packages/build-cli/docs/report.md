`flub report`
=============

Report analysis about the codebase, like code coverage and bundle size measurements.

* [`flub report codeCoverage`](#flub-report-codecoverage)
* [`flub report comparePipelineBundleArtifacts`](#flub-report-comparepipelinebundleartifacts)

## `flub report codeCoverage`

Run comparison of code coverage stats

```
USAGE
  $ flub report codeCoverage --adoBuildId <value> --adoApiToken <value> --githubApiToken <value>
    --adoCIBuildDefinitionIdBaseline <value> --adoCIBuildDefinitionIdPR <value> --githubPRNumber <value>
    --githubRepositoryName <value> --targetBranchName <value> [-v | --quiet]

FLAGS
  --adoApiToken=<value>                     (required) [env: ADO_API_TOKEN] Token to get auth for accessing ADO builds.
  --adoBuildId=<value>                      (required) [env: ADO_BUILD_ID] Azure DevOps build ID.
  --adoCIBuildDefinitionIdBaseline=<value>  (required) [env: ADO_CI_BUILD_DEFINITION_ID_BASELINE] Build
                                            definition/pipeline number/id for the baseline build.
  --adoCIBuildDefinitionIdPR=<value>        (required) [env: ADO_CI_BUILD_DEFINITION_ID_PR] Build definition/pipeline
                                            number/id for the PR build.
  --githubApiToken=<value>                  (required) [env: GITHUB_API_TOKEN] Token to get auth for accessing Github
                                            PR.
  --githubPRNumber=<value>                  (required) [env: GITHUB_PR_NUMBER] Github PR number.
  --githubRepositoryName=<value>            (required) [env: GITHUB_REPOSITORY_NAME] Github repository name. It should
                                            be in this format: <org_or_owner>/<name>. For example:
                                            microsoft/FluidFramework
  --targetBranchName=<value>                (required) [env: TARGET_BRANCH_NAME] Target branch name.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Run comparison of code coverage stats
```

_See code: [src/commands/report/codeCoverage.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/report/codeCoverage.ts)_

## `flub report comparePipelineBundleArtifacts`

Download ADO bundle-size artifacts for a PR's CI build and its baseline and emit their per-package, per-bundle differences as JSON. Head-side artifacts come from the `Build - client packages` pipeline (runs on PR commits); base-side artifacts come from the `Build - Client bundle size artifacts` pipeline (runs on main/release pushes). The base commit is the target-branch commit the PR build actually built against — a PR build builds `refs/pull/<n>/merge`, i.e. the PR HEAD merged into the target branch tip at queue time, so that tip (not the merge-base) is the only baseline that isolates the PR's own delta. Intended for the PR-comment CI workflow; for local inner-dev-loop comparisons use `check bundleSize` instead.

```
USAGE
  $ flub report comparePipelineBundleArtifacts --githubToken <value> --head <value> [--json] [-v | --quiet]

FLAGS
  --githubToken=<value>  (required) [env: GITHUB_TOKEN] GitHub access token used to resolve the PR build's test-merge
                         commit.
  --head=<value>         (required) Head commit SHA — the PR's latest commit. The compare side of the comparison.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Download ADO bundle-size artifacts for a PR's CI build and its baseline and emit their per-package, per-bundle
  differences as JSON. Head-side artifacts come from the `Build - client packages` pipeline (runs on PR commits);
  base-side artifacts come from the `Build - Client bundle size artifacts` pipeline (runs on main/release pushes). The
  base commit is the target-branch commit the PR build actually built against — a PR build builds `refs/pull/<n>/merge`,
  i.e. the PR HEAD merged into the target branch tip at queue time, so that tip (not the merge-base) is the only
  baseline that isolates the PR's own delta. Intended for the PR-comment CI workflow; for local inner-dev-loop
  comparisons use `check bundleSize` instead.
```

_See code: [src/commands/report/comparePipelineBundleArtifacts.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/report/comparePipelineBundleArtifacts.ts)_
