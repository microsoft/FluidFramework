`flub report`
=============

Report analysis about the codebase, like code coverage and bundle size measurements.

* [`flub report codeCoverage`](#flub-report-codecoverage)

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
