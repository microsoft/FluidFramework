# @fluidframework/code-coverage-tools

## Overview

This package contains all the utilities required to run code coverage analysis on PRs. The tool uses the coverage reports generated in the PR build to run comparison against a baseline CI build for packages that have been updated on the PR. If the tool finds that the line or branch coverage for a package has been impacted in the PR, it posts a comment on the PR showing the diff of the line coverage between baseline and PR.

## Generating coverage reports

Currently, the code coverage plugin only generates coverage reports for tests and uses that for analysis. You can generate these reports for your package locally by running `npm run test:coverage` for the individual package or by running `npm run ci:test:mocha:coverage` from the root.

## Pieces of the code coverage analysis plugin

There are a couple different things that we need to support to make the code coverage plugin work as expected. This section defines those pieces and how the code coverage plugin works overall.

### Cobertura coverage files

The code coverage plugin uses cobertura coverage files for running code coverage comparisons. These files are currently published as artifacts from both our PR and CI build pipeline to ensure we can run comparisons on PRs against a baseline build.

### Identifying the baseline build

Before running coverage comparison, code coverage plugin identifies the baseline build for the PR. For example, if a pull request was targeting main, we would consider the baseline to be the main commit that the PR branch was based off of.

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

If the code coverage diff (line or branch coverage) is more than a percentage point change, then we fail the build for the PR. We also fail the build in case the code coverage for the newly added package is less than 50%.
