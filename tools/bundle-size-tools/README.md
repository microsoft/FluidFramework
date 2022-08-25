# @fluidframework/bundle-size-tools

This package contains utility for analyzing bundle sizes to help catch code size regressions at pull request time. This library is meant to be fully extensible to meet the unique needs of any repository, but is currently only being used in a few repositories, so additional work may be necessary in order to make the library more useful for others.

## Features of bundle-size-tools

- Accurate comparisons that enables you to see exactly how many bytes a PR adds to relevant bundles
- APIs for integrating with Azure devops workflows
- The ability to write comments on pull requests that call out bundle size regressions
- Extension points so that teams can write their own custom bundle reports
- Support for monorepos that build many packages with multiple interesting bundles
- The ability to define custom bundle metrics in a bundle's webpack config

## Limitations

- Bundle-size-tools currently only has APIs for working with Azure DevOps.  Additional work will have to be done to support other source control providers like GitHub.  Other tools can be used in conjunction with bundle-size-tools to support hybrid environments.
- Bundle-size-tools was designed to work with webpack; other bundlers are not supported.

# How Bundle-size-tools works

This section highlights some of the assumptions that bundle-size-tools makes and defines the pieces required to onboard a new repository.

## Webpack stats files

Bundle-size-tools uses [webpack stats files](https://webpack.js.org/configuration/stats/) as the foundation for bundle comparisons. To use bundle-size-tools, your build pipeline is expected to produce webpack stats files. Since webpack stats files tend to be very large, we recommend using the [@mixer/webpack-bundle-compare](https://github.com/mixer/webpack-bundle-compare) webpack plugin to generate the plugins in gzipped mspack format to reduce the size of the stats files on disk.

Our recommended approach is to add this to the plugin section of your webpack configs that produce application bundles:

```javascript
new BundleComparisonPlugin({
  // File to create, relative to the webpack build output path:
  file: resolve(process.cwd(), 'bundleAnalysis/bundleStats.msp.gz')
});
```

## Baseline builds

In order to provide accurate metrics for bundle size regressions, Bundle-size-tools must have a baseline to compare against. For example, when submitting a pull request, bundle-size-tools should only report changes to bundle sizes that are directly related to the current pull request. If the pull request was targeting the main branch of the repository, we would consider the baseline to be the main commit the PR branch was based off. To use bundle-size-tools, you'll need a mechanism to get the webpack stats files for the baseline builds, such as generating webpack stats file for every commit to main using an automated build or providing a way to find a matching stats file from a different commit.

## Bundle Comparisons

Bundle-size-tool's comparisons are implemented using `WebpackStatsProcessors`, which are functions with the following signature:

```typescript
export type WebpackStatsProcessor = (
  stats: Webpack.StatsCompilation,
  config: BundleBuddyConfig | undefined
) => BundleMetricSet | undefined;
```

A `WebpackStatsProcessor` takes a webpack stats object in as input and outputs a `BundleMetricSet`. In essence, `WebpackStatsProcessors` take in the complex stats object and outputs a simple list of metrics. There is also support for passing in a bundle-specific `BundleBuddyConfig` object that enables analysis on specific chunks in the bundle. The `BundleBuddyConfig` is provided in the bundle's webpack config using the `BundleBuddyConfigWebpackPlugin`.

```typescript
export type BundleMetricSet = Map<string, BundleMetric>;

export interface BundleMetric {
  parsedSize: number;
}
```

Consumers of bundle-size-tools must configure one or more `WebpackStatsProcessors` for their projects. It is also possible to write and use custom `WebpackStatsProcessors`.

Bundle-size-tools runs the same set of `WebpackStatsProcessors` on both the baseline commit and pull request commit. It then compares the metrics produces by the baseline commit and pull request commit and reports these differences in a comment in the pull request.

### Default Stats Processors

Bundle-size-tools provides the following basic set of `WebpackStatsProcessors`:

- `entryStatsProcessor` - reports the size of the chunks generated for each of the webpack [entry points](https://webpack.js.org/concepts/entry-points/) specified in the webpack config
- `totalSizeProcessor` - reports the total size of all chunks in the webpack bundle.
- `bundleBuddyConfigProcessor` - enables analysis of a specific set of chunks for a given bundle. It is expected that a `BundleBuddyConfig` would be specified via the `BundleBuddyConfigWebpackPlugin` in the bundles webpack config

# Sample Workflow

This is the workflow the `fluidframework` repository uses for Bundle buddy.

Assumptions

- Monorepo that produces one or more packages.
- Packages in the repository only produce one bundle that is going to be analyzed by bundle-size-tools.
- CI builds run and store artifacts in Azure DevOps.

## Bundles all generate compressed stats files

Every single bundle in the repository is configured with the [@mixer/webpack-bundle-compare](https://github.com/mixer/webpack-bundle-compare) webpack plugin to generate a compressed stats file named `bundleStats.msp.gz` in a `bundleAnalysis` folder at the root of each package. As an example, say our repository has packages `package1`, `package2`, and `package3` all under a `packages` folder, our build process will generate
the following files:

- `packages/package1/bundleAnalysis/bundle1/bundleStats.msp.gz`
- `packages/package1/bundleAnalysis/bundle2/bundleStats.msp.gz`
- `packages/package2/bundleAnalysis/bundleStats.msp.gz`
- `packages/package3/bundleAnalysis/bundleStats.msp.gz`

## Main CI Generates Baseline stats files

There is a continuous integration build that runs on every commit to main and generates the bundle stats files. It is important that this CI definition does not have the [batch](https://docs.microsoft.com/en-us/azure/devops/pipelines/yaml-schema?view=azure-devops&tabs=schema%2Cparameter-schema) option set, it should run for every single commit to main to ensure we have accurate baselines for every commit to main. It is also important to ensure the stats files used as baselines are generated from running webpack with the [mode](https://webpack.js.org/configuration/mode/) set to `production` and not `development` to get the best representation of what our users will download.

The build process then runs a script that copies all the bundle stats files in the repository and copies them into a single `bundleAnalysis` folder in a temporary directory.

- `/bundleAnalysis/package1/bundle1/bundleStats.msp.gz`
- `/bundleAnalysis/package1/bundle2/bundleStats.msp.gz`
- `/bundleAnalysis/package2/bundleStats.msp.gz`
- `/bundleAnalysis/package3/bundleStats.msp.gz`

The build process then uploads this folder as an Azure DevOps build artifact names `bundle-analysis-reports`.

## Pull Request Buddy Builds generate comparison stats files

The buddy build that runs for every pull request runs the same process as the main build to generate the `bundleAnalysis` folder and `bundle-analysis-reports` build artifact.

The buddy build will then determine the main commit that this PR was branched off of, using that commit as the "baseline" commit. If the main CI build has already created the `bundle-analysis-reports` artifact, the pull request buddy build will run bundle buddy and report the result as a comment in the pull request.

If the artifacts are not available for the baseline commit, the buddy build adds an Azure Devops build tag with the format `bundle-size-tools-pending-<commitHash>` so that a later process can add the bundle analysis comment to this PR when the baseline artifacts are ready.

## Build runs main CI completes to update pull requests pending baseline stats

There is a separate build pipeline that runs after each successful main build and looks for all buddy builds with the `bundle-size-tools-pending-<commitHash>` corresponding to the `<commitHash>` of the main build. This build process will then run bundle-size-tools on all these PRs and post a comment.

## Bundle metrics considered

The repository is configured to run the `entryStatsProcessor` and `totalSizeProcessor` for all bundles, meaning that bundle buddy will report changes to total bundle size (sum of all chunks) and the size of each entry chunk.

The repository also has a few bundles that we wish to analyze the size of some critical scenarios that are behind a dynamic import, meaning they are not entry chunks. This leverages the `bundleBuddyConfigProcessor`, which uses a config file to specify the names of chunks to analyze. These config files are specified using the `BundleBuddyConfigWebpackPlugin` and these config files are uploaded alongside the `bundleStats.msp.gz` file in the `bundle-analysis-reports` artifact.
