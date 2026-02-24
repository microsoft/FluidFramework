`flub build-perf`
=================

Build performance observability commands for collecting, processing, and analyzing build metrics.

* [`flub build-perf check`](#flub-build-perf-check)
* [`flub build-perf collect`](#flub-build-perf-collect)
* [`flub build-perf deploy`](#flub-build-perf-deploy)
* [`flub build-perf generate`](#flub-build-perf-generate)

## `flub build-perf check`

Check build performance thresholds and fail if exceeded.

```
USAGE
  $ flub build-perf check --mode public|internal --inputDir <value> --avgDurationThreshold <value>
    --changePeriodThreshold <value> [-v | --quiet] [--forceFailure]

FLAGS
  --avgDurationThreshold=<value>   (required) [env: AVG_DURATION_THRESHOLD] Maximum acceptable average build duration in
                                   minutes.
  --changePeriodThreshold=<value>  (required) [env: CHANGE_PERIOD_THRESHOLD] Maximum acceptable percentage change
                                   (0-100) over the relevant period (3 days for public, 7 days for internal). E.g. 15
                                   means ±15%.
  --forceFailure                   [env: FORCE_FAILURE] Force a failure (for testing notifications).
  --inputDir=<value>               (required) [env: DATA_DIR] Directory containing the data JSON files (generated from
                                   the collect command).
  --mode=<option>                  (required) [env: MODE] Pipeline mode: "public" (PR builds) or "internal".
                                   <options: public|internal>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Check build performance thresholds and fail if exceeded.

EXAMPLES
  Check thresholds for public (PR) builds.

    $ flub build-perf check --mode public --inputDir ./data --avgDurationThreshold 90 --changePeriodThreshold 15
```

_See code: [src/commands/build-perf/check.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/build-perf/check.ts)_

## `flub build-perf collect`

Collect build performance data from Azure DevOps and generate processed metrics.

```
USAGE
  $ flub build-perf collect --adoApiToken <value> --project <value> --mode public|internal --outputDir <value> [-v |
    --quiet] [--org <value>] [--buildCount <value>] [--prBuildDefId <value>] [--internalBuildDefId <value>]
    [--parallelJobs <value>]

FLAGS
  --adoApiToken=<value>         (required) [env: ADO_API_TOKEN] Azure DevOps API token for authentication.
  --buildCount=<value>          [default: 500, env: BUILD_COUNT] Number of builds to fetch. Note: This will be limited
                                by the number of builds held by the ADO project's retention policy.
  --internalBuildDefId=<value>  [env: INTERNAL_BUILD_DEF_ID] Build definition ID for internal builds (required for
                                internal mode).
  --mode=<option>               (required) [env: MODE] Pipeline mode: "public" (PR builds) or "internal".
                                <options: public|internal>
  --org=<value>                 [default: fluidframework, env: ORG] Azure DevOps organization name.
  --outputDir=<value>           (required) [env: OUTPUT_DIR] Directory to write output files to.
  --parallelJobs=<value>        [default: 20, env: PARALLEL_JOBS] Number of concurrent API requests for timeline
                                fetching.
  --prBuildDefId=<value>        [env: PR_BUILD_DEF_ID] Build definition ID for PR builds (required for public mode).
  --project=<value>             (required) [env: PROJECT] Azure DevOps project name.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Collect build performance data from Azure DevOps and generate processed metrics.

EXAMPLES
  Collect public (PR) build data.

    $ flub build-perf collect --mode public --project public --prBuildDefId 11 --outputDir ./output --adoApiToken \
      $ADO_TOKEN
```

_See code: [src/commands/build-perf/collect.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/build-perf/collect.ts)_

## `flub build-perf deploy`

Manually deploy the build performance dashboard to Azure Static Web Apps.

```
USAGE
  $ flub build-perf deploy --mode public|internal --aswaHostname <value> --deploymentToken <value> --dataDir <value>
    [-v | --quiet]

FLAGS
  --aswaHostname=<value>     (required) [env: ASWA_HOSTNAME] Hostname of the Azure Static Web App.
  --dataDir=<value>          (required) [env: DATA_DIR] Directory containing generated data files (public-data.json /
                             internal-data.json).
  --deploymentToken=<value>  (required) [env: SWA_DEPLOYMENT_TOKEN] Azure Static Web Apps deployment token.
  --mode=<option>            (required) [env: MODE] Pipeline mode: "public" or "internal".
                             <options: public|internal>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Manually deploy the build performance dashboard to Azure Static Web Apps.

EXAMPLES
  Deploy dashboard for public mode.

    $ flub build-perf deploy --mode public --aswaHostname myapp.azurestaticapps.net --dataDir ./data \
      --deploymentToken $SWA_TOKEN
```

_See code: [src/commands/build-perf/deploy.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/build-perf/deploy.ts)_

## `flub build-perf generate`

Generate a standalone HTML dashboard artifact from processed metrics.

```
USAGE
  $ flub build-perf generate --mode public|internal --inputDir <value> --outputDir <value> [-v | --quiet] [--format
  html]

FLAGS
  --format=<option>    [default: html] Output format for the generated report.
                       <options: html>
  --inputDir=<value>   (required) [env: DATA_DIR] Directory containing the data JSON files (public-data.json /
                       internal-data.json).
  --mode=<option>      (required) [env: MODE] Pipeline mode: "public" or "internal".
                       <options: public|internal>
  --outputDir=<value>  (required) [env: OUTPUT_DIR] Directory where the dashboard.html will be written.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Generate a standalone HTML dashboard artifact from processed metrics.

EXAMPLES
  Generate standalone HTML dashboard for public mode.

    $ flub build-perf generate --mode public --inputDir ./data --outputDir ./output
```

_See code: [src/commands/build-perf/generate.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/build-perf/generate.ts)_
