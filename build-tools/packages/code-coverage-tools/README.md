# @fluidframework/code-coverage-tools

## Overview

This package contains all the utilities required to run code coverage analysis on PRs. The tool uses the coverage reports generated in the PR build to run comparison against a baseline CI build for packages that have been updated on the PR. If the tool finds that the line coverage for a package has been impacted in the PR, it posts a comment on the PR showing the diff of the line coverage between baseline and PR. The tool also identifies if there are packages that have been updated in a PR but do not have associated coverage reports in PR or baseline build and calls that out in the PR comment.

## Generating coverage reports

Currently, the code coverage plugin only generates coverage reports for unit tests and uses that for analysis. You can generate these reports for your package locally by running `yarn test --to packageName --coverage`. Find more instructions [here](../../docs/developer-guide/testing/setup/AutomationCoverage.md).

## Pieces of the code coverage analysis plugin

There are a couple different things that we need to support to make the code coverage plugin work as expected. This section defines those pieces and how the code coverage plugin works overall.

### Cobertura coverage files

The code coverage plugin uses cobertura coverage files for running code coverage comparisons. These files are currently published as artifacts from both our PR and CI build pipeline to ensure we can run comparisons on PRs against a baseline build.

### Identifying the baseline build

Before running coverage comparison, code coverage plugin identifies the baseline build for the PR, much like the bundle-buddy. For example, if a pull request was targeting master, we would consider the baseline to be the master commit that the PR branch was based off of.

### Downloading artifacts from baseline build

Once the baseline build is identified, we download the build artifacts corresponding to the `test-coverage` artifact name for this build. We unzip the files, and extract the coverage metrics out of the coverage reports using the helper `getCoverageMetricsForBaseline`. Currently, we track `lineCoverage` and `branchCoverage` as our metrics for comparison. The final structure of the extracted metrics looks like

```typescript
export type CoverageReport = {
  packageName: string;
  lineCoverage: number;
  branchCoverage: number;
};
```

### Generating the coverage report on PR build

As mentioned earlier, the PR build also uploads coverage reports as artifacts that can be used to run coverage analysis against baseline build. To help with this, we make use of the `getCoverageMetricsForPr` helper to generate an array of objects of the type `CoverageReport` that contains code coverage metrics corresponding to the PR.

### Comparing code coverage reports

Once we have the coverage report for the baseline and pr build, we use the `compareCodeCoverage` utility that returns an array of coverage comparisons for the list of packages passed into it. The array returned contains objects of type `CodeCoverageComparison`.

```typescript
export type CodeCoverageComparison = {
  /** Name of the package */
  packageName: string;
  /** Line coverage in baseline build */
  lineCoverageInBaseline: number;
  /** Line coverage in pr build */
  lineCoverageInPr: number;
  /** difference between line coverage in pr build and baseline build */
  lineCoverageDiff: number;
  /** branch coverage in baseline build */
  branchCoverageInBaseline: number;
  /** branch coverage in pr build */
  branchCoverageInPr: number;
  /** difference between branch coverage in pr build and baseline build */
  branchCoverageDiff: number;
};
```

We run coverage analysis only for packages that have been touched in the PR. To identify packages that have been updated in a PR, we iterate through all commits on the PR and build a list of files that have changed. We then extract the package name from the list of files to get a list of packages that have been updated and pass that into the `compareCodeCoverage` utility. You can find how this is done inside the `getChangedPackages` utility.

### Updating code coverage numbers when baseline CI finishes

If the baseline CI has not finished while the coverage analysis step on the PR build runs, we mark the PR with a tag and a separate pipeline runs to make sure code coverage analysis comments are updated. This is done via the same mechanism as bundle-buddy. Please refer [here](../bundle-buddy/README.md#build-runs-master-ci-completes-to-update-pull-requests-pending-baseline-stats) for more details.

## Code coverage dashboard

Code coverage numbers for all packages are also pushed to an Azure dashboard. You can find the dashboard at [Code Coverage Metrics](https://ms.portal.azure.com/#@microsoft.onmicrosoft.com/dashboard/arm/subscriptions/9bce0b36-d6e6-43af-b290-d8b87e75b0e3/resourcegroups/dashboards/providers/microsoft.portal/dashboards/42a03746-f95c-4e58-a283-9499bebb02ee).

## Add optional reviewer for a package when code coverage falls below threshold

If the code coverage for a particular package drops below minimum threshold, we will be adding an optional reviewer to the PR who will review the PR and make sure the code coverage does not fall below threshold. Code coverage threshold can be configured at a package level. The minimum threshold configuration needs to be defined in codeCoverage.json file at the package root directory. reviewerId, minimumThresholdPercentage and _reviewerEmail needs to be filled in codeCoverage.json file. reviewerId would be the ado Id,_reviewerEmail would be the ado group and minimumThresholdPercentage would be the threshold percentage number below which the reviewer ado group should be added. To get ado Id from ado group, we can have a look at the PR in which that group is added, open inspect element in browser, navigate to network tab, click on the ado group and capture the response of the Identities network call which contains the ado Id of the group.
