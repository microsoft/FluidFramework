# Client pull request CI experiments

## Status and scope

Experiment branch: `CraigMacomber/FluidFramework:fastCI2`.
Test pull request: [microsoft/FluidFramework#28593](https://github.com/microsoft/FluidFramework/pull/28593).
Started on 2026-10-29.

The goal is to reduce elapsed time from a push to completion of all required continuous integration (CI) checks.
Also record agent time, queueing, and cache behavior: reducing a single step is not sufficient evidence of a faster pull request.
These are proof-of-concept changes, not a production rollout.
Keep release behavior, validation, security scanning, and test coverage intact.
Local CI readiness checks are skipped by request; remote CI is the experiment.

## Method

Use the Azure DevOps public build and timeline REST APIs to record queue/start/finish times, job times, and expensive tasks.
Verify `triggerInfo.pr.sourceSha` and the merge commit recorded in `sourceVersion`.
Use job logs to confirm the new checkout/build commands actually ran.
Prefer to finish a run before pushing its successor: pull request updates automatically cancel older runs.
For a step-level experiment, advancing after the relevant steps finish is acceptable, but record its end-to-end result as incomplete.
Distinguish observations from hypotheses and avoid treating one noisy sample as a stable improvement.

Primary metric: build queue time to final completion, plus the independently reported repository policy check.
Commit time is not a reliable push timestamp.
For each agent job, include setup, post-job cache uploads, artifact scans, and reporting.
Sum agent-job durations separately from elapsed time.

## Experiments

| Experiment | Source commit | Run | Status | Result |
| --- | --- | --- | --- | --- |
| Baseline: existing shared-build pipeline | `55e7036e05fa21e65b9c5dfa9f6c7440c43deb72` | [430658](https://dev.azure.com/fluidframework/public/_build/results?buildId=430658) | Passed | Queue-to-finish 33m 28s |
| Baseline: repository policy | Same | [430657](https://dev.azure.com/fluidframework/public/_build/results?buildId=430657) | Passed | Queue-to-finish 3m 38s |
| E1: shallow, tag-free client checkout | `1eda934faa6816c00eee73cd7eb2295ec2f1eac3` | [430678](https://dev.azure.com/fluidframework/public/_build/results?buildId=430678) | Relevant steps passed; full run incomplete | Build checkout 36.2s to 9.8s; observed test checkouts 9.5-11.9s |
| E2: independent verification builds | Implementation `2f9e0a1cac0`; report update included in triggering commit | Pending | Ready to push | Start verification immediately; preserve the comprehensive build job |

### Baseline observations

The client pipeline is a single pipeline with policy, build, and verification stages.
Verification waits for the entire build stage, including packaging, artifact processing, and security scans.
The separate repository policy pipeline is not the critical path.
Baseline test results: 48,660 total, 45,426 passed, 3,234 not executed, no failures, across 135 result runs.
The baseline source merge commit was `09e38c8fd2850b513e8f3b9b92d9b95eacbc7a0f`.

| Job | Duration |
| --- | ---: |
| Build | 18m 17s |
| Client policy checks | 6m 29s |
| Mocha plus local service | 12m 59s |
| Tinylicious service | 13m 34s |
| Playwright | 6m 04s |
| AreTheTypesWrong | 4m 00s |
| Tinylicious stress | 5m 23s |

Verification starts about 19 minutes after queueing.
Some verification jobs start nearly four minutes later than others, so agent availability must be included in the comparison.
The Mocha test step takes 7m 02s, local service 2m 06s, and Tinylicious service 10m 19s.

Selected build-job task durations:

| Task | Seconds |
| --- | ---: |
| Checkout | 36.2 |
| pnpm cache restore | 30.9 |
| Install dependencies | 14.9 |
| Install repository build tools | 22.3 |
| Update package version | 19.3 |
| `ci:build` | 347.9 |
| webpack | 122.4 |
| Archive build output | 37.8 |
| Pack packages | 142.1 |
| Binary analysis archive expansion | 29.3 |
| Binary analysis / antimalware task | 126.9 |
| Component governance | 22.9 |
| Post-job cache handling | 23.1 |

Test-job checkouts take approximately 36-39 seconds.
The policy jobs already use `fetchDepth: 1` and `fetchTags: false`.
The performance pipeline also uses shallow checkout and compiles tests with `fluid-build --nolint --task build:test:esm --worker`.

### E1: shallow checkout

Set `fetchDepth: 1` and `fetchTags: false` for client build and verification checkouts on pull requests only.
Bound the explicit verification fetch to the build commit with `--depth=1 --no-tags`.
Keep large-file and submodule behavior unchanged.
Release checkout defaults remain unchanged.

Version generation reads tags but only uses them for release collision detection and latest-release classification.
The experiment is restricted to pull requests, which do not publish releases.
Remote CI must still confirm that versioning, packaging, and checks succeed.

The E1 build passed in 16m 07s, compared with 18m 17s at baseline.
Do not attribute the entire 130-second difference to checkout.
The checkout itself improved by 26.4 seconds (73%).
The main binary scan fell from 126.9 seconds to 21.0 seconds, and scan/cache post-processing also changed.
`ci:build` was almost unchanged (347.9 versus 343.9 seconds), as was webpack (122.4 versus 122.9 seconds).
The separate policy run [430677](https://dev.azure.com/fluidframework/public/_build/results?buildId=430677) passed in 4m 01s.

Checkout logs confirm `git fetch --depth=1 --no-tags` on merge commit `295491da91d77e6069862e677bf0042134e57a13`.
Observed verification checkouts were 9.5 seconds (AreTheTypesWrong), 11.9 seconds (Tinylicious), and 10.1 seconds (Playwright).
On user direction, advance to E2 after these relevant steps finish rather than waiting for all tests.
There is no complete E1 end-to-end measurement; the next push may cancel its remaining jobs.
Conclusion: retain shallow, tag-free pull request checkout, but do not claim a measured end-to-end speedup from this run.

### E2: independent verification

Enable `independentTestBuilds` only for pull requests.
Verification checks out the same `Build.SourceVersion` merge commit but no longer waits for the build stage or downloads its archive.
Each verification job compiles through the existing `compile` task graph, with worker reuse.
Playwright also builds browser bundles.
Keep all original test commands and reporting.

This first experiment deliberately compiles more than each individual suite needs.
It isolates the stage dependency and artifact reuse decision before introducing targeted compilation.
The original comprehensive build still validates lint, API reports, type tests, documentation, package generation, bundles, packaging, and scans.
No validation is removed or moved to an optional check.
Test builds use checked-in package versions rather than the build job's generated prerelease versions; packaging and version generation are still exercised in the original build.

## Validation ownership

Initially retain all existing checks.
Any later relocation must name its replacement before removing the old invocation.

| Validation or output | Existing owner | Experiment requirement |
| --- | --- | --- |
| Repository policy, layers, repository formatting | Separate repository policy pipeline | Preserve |
| Client checks, assert tags, package lists, dependency/version consistency | Client policy stage (`checks`) | Preserve |
| Compilation, lint, type checks, exports, release tags, fences | Build (`ci:build`) | Preserve in a required job |
| API reports and API Extractor documentation validation | Build (`ci:build`, `ci:build:docs`) | Preserve CI-mode checks and generated-file detection |
| Type-test generation and compilation | Compilation dependencies | Preserve; generation cannot simply be removed from test compilation |
| webpack, bundle analysis, devtools bundle | Build | Preserve |
| Packing, manifests, readme generation, package metadata | Build | Preserve |
| AreTheTypesWrong | Verification | Preserve |
| Mocha and local-service tests | Coverage job (coverage instrumentation currently disabled upstream) | Preserve both suites |
| Playwright, Tinylicious service, Tinylicious stress | Separate verification jobs | Preserve all three |
| Source scans, binary scans, component governance | Existing pipeline templates | Do not disable |
| Test result publication and service logs | Verification jobs | Preserve failure-path reporting |

## Next experiments and open questions

1. Start verification without waiting for packaging and scans.
   Keep the existing build job as the comprehensive validation/artifact owner, and build test prerequisites independently.
   This first isolates the dependency barrier without simultaneously changing validation ownership.
2. Measure targeted compilation against archive reuse.
   Retain both CommonJS and ECMAScript module coverage where the test scripts require it.
   Playwright and AreTheTypesWrong have different prerequisites from Mocha and service tests.
3. If build validation remains the critical path, split validation into parallel jobs.
   Prefer reusing existing task graphs over copying their dependency lists into pipeline YAML.
4. Investigate duplicate webpack work, cache upload tails, and package/archive processing if measurements justify it.
5. Repeat the best configuration and baseline, recording cache hits and agent queueing.
6. Exercise representative failing validation in an isolated experiment before claiming preservation has been demonstrated.

## Limitations

Checkout time improved; an end-to-end improvement has not yet been measured.
The baseline passed; E1's relevant steps passed and E2 is next.
Pipeline queue contention and caches can dominate small improvements.
The branch-protection API returned HTTP 403, so exact repository-level required-check configuration could not be inspected.
Keep the existing pipeline and job check identities rather than relying on a new pipeline becoming required.
