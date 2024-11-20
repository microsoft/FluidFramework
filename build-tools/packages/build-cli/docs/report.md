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
  --adoApiToken=<value>                     (required) Token to get auth for accessing ADO builds.
  --adoBuildId=<value>                      (required) Azure DevOps build ID.
  --adoCIBuildDefinitionIdBaseline=<value>  (required) Build definition/pipeline number/id for the baseline build.
  --adoCIBuildDefinitionIdPR=<value>        (required) Build definition/pipeline number/id for the PR build.
  --githubApiToken=<value>                  (required) Token to get auth for accessing Github PR.
  --githubPRNumber=<value>                  (required) Github PR number.
  --githubRepositoryName=<value>            (required) Github repository name. It should be in this format:
                                            <org_or_owner>/<name>. For example: microsoft/FluidFramework
  --targetBranchName=<value>                (required) Target branch name.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Run comparison of code coverage stats
```

_See code: [src/commands/report/codeCoverage.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/report/codeCoverage.ts)_
