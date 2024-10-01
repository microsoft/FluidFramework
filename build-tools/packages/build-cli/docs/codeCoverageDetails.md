# Code coverage

## Overview

This module contains all the utilities required to collect and analyze code coverage data from PRs. The coverage reports generated in the PR build are compared against a baseline CI build for packages that have been updated in the PR. If the line or branch coverage for a package has been impacted in the PR, a comment is posted to the PR showing the diff of the code coverage between baseline and PR.

## Generating coverage reports

Code coverage reports are only generated when tests run. You can generate these reports for a package locally by running `npm run test:coverage` for the individual package or by running `npm run ci:test:mocha:coverage` from the root.

## Pieces of the code coverage analysis plugin

Code coverage has several steps involving different commands. This section defines those pieces and how they fit together to enable overall code coverage tracking and reporting.

### Cobertura coverage files

Code coverage data is included in the cobertura-format coverage files we collect during CI builds. These files are currently published as artifacts from both our PR and internal build pipelines to ensure we can run comparisons on PRs against a baseline build.

### Identifying the baseline build

Before running coverage comparison, a baseline build needs to be determined for the PR. This is typically based on the target branch for the PR. For example, if a pull request was targeting main, we would consider the baseline to be the main commit that the PR branch was based off of.

### Downloading artifacts from baseline build

Once the baseline build is identified, we download the build artifacts corresponding to the `codeCoverageAnalysis` artifact name for this build. We unzip the files, and extract the coverage metrics out of the coverage reports using the helper `getCoverageMetricsForBaseline`. Currently, we track `lineCoverage` and `branchCoverage` as our metrics for comparison. The final structure of the extracted metrics looks like

```typescript
export type CoverageReport = {
  packageName: string;
  lineCoverage: number;
  branchCoverage: number;
};
```

### Generating the coverage report on PR build

As mentioned earlier, the PR build also uploads coverage reports as artifacts that can be used to run coverage analysis against a baseline build. To help with this, we use the `getCoverageMetricsForPr` helper function to generate an array of objects of the type `CoverageReport` that contains code coverage metrics corresponding to the PR.

### Comparing code coverage reports

Once we have the coverage report for the baseline and PR build, we use the `compareCodeCoverage` utility function that returns an array of coverage comparisons for the list of packages passed into it. The array returned contains objects of type `CodeCoverageComparison`.

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

If the code coverage (either line or branch) decreased by more than one percentage point, then we fail the build for the PR. We also fail the build in case the code coverage for a newly added package is less than 50%.
