`flub report`
=============

Report analysis about the codebase, like code coverage and bundle size measurements.

* [`flub report codeCoverage`](#flub-report-codecoverage)
* [`flub report codeCoverageStats`](#flub-report-codecoveragestats)

## `flub report codeCoverage`

Run comparison of code coverage stats

```
USAGE
  $ flub report codeCoverage --ADO_BUILD_ID <value> --ADO_API_TOKEN <value> --GITHUB_API_TOKEN <value>
    --ADO_CI_BUILD_DEFINITION_ID_BASELINE <value> --ADO_CI_BUILD_DEFINITION_ID_PR <value>
    --CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE <value> --CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR <value>
    --GITHUB_PR_NUMBER <value> --GITHUB_REPOSITORY_NAME <value> --GITHUB_REPOSITORY_OWNER <value> [-v | --quiet]

FLAGS
  --ADO_API_TOKEN=<value>                                  (required) Token to get auth for accessing ADO builds.
  --ADO_BUILD_ID=<value>                                   (required) Azure DevOps build ID.
  --ADO_CI_BUILD_DEFINITION_ID_BASELINE=<value>            (required) Build definition/pipeline number/id for the
                                                           baseline build.
  --ADO_CI_BUILD_DEFINITION_ID_PR=<value>                  (required) Build definition/pipeline number/id for the PR
                                                           build.
  --CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_BASELINE=<value>  (required) Code coverage artifact name for the baseline
                                                           build.
  --CODE_COVERAGE_ANALYSIS_ARTIFACT_NAME_PR=<value>        (required) Code coverage artifact name for the PR build.
  --GITHUB_API_TOKEN=<value>                               (required) Token to get auth for accessing Github PR.
  --GITHUB_PR_NUMBER=<value>                               (required) Github PR number.
  --GITHUB_REPOSITORY_NAME=<value>                         (required) Github repository name.
  --GITHUB_REPOSITORY_OWNER=<value>                        (required) Github repository owner.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Run comparison of code coverage stats
```

_See code: [src/commands/report/codeCoverage.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/report/codeCoverage.ts)_

## `flub report codeCoverageStats`

Run comparison of code coverage stats

```
USAGE
  $ flub report codeCoverageStats [-v | --quiet]

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Run comparison of code coverage stats
```

_See code: [src/commands/report/codeCoverageStats.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/report/codeCoverageStats.ts)_
