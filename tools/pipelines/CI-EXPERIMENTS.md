# Client pull request CI experiments

## Status and scope

Experiment branch: `CraigMacomber/FluidFramework:fastCI2`.
Test pull request: [microsoft/FluidFramework#28593](https://github.com/microsoft/FluidFramework/pull/28593).
Started on 2026-10-29.

**First-phase result:** the configuration passed twice, in **17m 20s** and **19m 09s**, compared with the original **33m 28s** baseline.
That is 43-48% less observed elapsed time, with substantial agent-queue variation.
The best individual experimental run was E3 at 15m 30s; the final configuration was retained because its targeted task timings are reproducibly lower and validation ownership is explicit.
The deliberate type-check failure was rejected, removed, and followed by a successful clean run.
Only pipeline files and this report remain changed relative to the user's original test commit.

The goal is to reduce elapsed time from a push to completion of all required continuous integration (CI) checks.
Also record agent time, queueing, and cache behavior: reducing a single step is not sufficient evidence of a faster pull request.
These are proof-of-concept changes, not a production rollout.
Keep release behavior, validation, security scanning, and test coverage intact.
Local CI readiness checks are skipped by request; remote CI is the experiment.

## Retained changes with measured evidence

| Change currently on this branch | Evidence | Qualification |
| --- | --- | --- |
| Shallow, tag-free PR checkout | E1 build checkout 36.2s to 9.8s | Direct step measurement; E1 full run was not completed |
| Independent verification builds | E2 33m 28s to 17m 44s versus baseline | Largest structural improvement; extra compilation overlaps the artifact job |
| Emit-only TypeScript in isolated test jobs | E3 test compilation 166-180s to 117-125s | Full checking remains elsewhere; negative probe proved enforcement |
| Full validation in existing client policy stage | E4 shortened the artifact job; policy job passed and rejected the probe | Functionally confirmed; standalone elapsed-time improvement is not established |
| Script-selected test prerequisites | E5 and repeat: service compilation about 53s, stress about 39s | All original test scripts retained; repeat test totals matched |
| Lockfile-installed build tools | E6 passed; tool setup 0.78-0.79s instead of roughly 21s source builds | Uses pinned `flub` 0.68.0; removes global linking and source-tool dependency |
| No unused PR build/release archives | E7 build job 755.1s to 568.1s; replacement validation 24.3s | Non-PR artifacts preserved; PR artifact-specific scan scope reduced with the removed payloads |

## Active experiments

| Candidate | Status | What must be established |
| --- | --- | --- |
| E8: split the serial Mocha/local-service job | Prepared locally | Same suites and counts, lower critical path without excessive queue/setup overhead |

The installed `@fluid-tools/build-cli` is 0.68.0 and already aggregates `bundleAnalyzerJson`; the pipeline comment claiming otherwise was stale.
E6 uses that lockfile dependency explicitly through the workspace bin path rather than relying on a global installation.
Non-PR tool-selection behavior is unchanged.

E7 keeps archive production for non-PR real-service consumers (`test-real-service.yml` is triggered from main/release builds, not PRs).
The PR bundle-size workflow consumes `bundleAnalyzerJson`, which is retained.
The expensive release packing step is replaced by bounded parallel `pnpm pack --dry-run` validation for every non-private client package.
Custom `pack:tests` scripts are still exercised, but their results go to the agent's temporary directory rather than published artifacts.
No release tarballs, test-file artifacts, publish-order metadata, or shared build-output archive are produced on this PR path.
Existing security-task configuration remains enabled; scans/SBOMs specific to the removed release tarballs are no longer produced on PRs.
Main/release artifact generation and associated scanning are unchanged.
This intentionally removes release-artifact production from PR validation, not the package-content checks.

E8 moves `ci:test:realsvc:local` into its own PR verification job, using the existing targeted-build and result-publication machinery.
The coverage job retains the unchanged `ci:test:mocha` command.
Non-PR coverage/test layout is unchanged.
This tests the simpler partition change before introducing package/file shards and additional runner modes.

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
These are raw agent-minutes, not normalized CPU time or billing cost: the validation stage moved from a small to a large pool.

For a run ID, the public data sources are:

```text
https://dev.azure.com/fluidframework/public/_apis/build/builds/{id}?api-version=7.1
https://dev.azure.com/fluidframework/public/_apis/build/builds/{id}/timeline?api-version=7.1
https://dev.azure.com/fluidframework/public/_apis/test/resultsummarybybuild?buildId={id}&api-version=7.1-preview.1
```

In the timeline, use `Job` records for agent-time totals and `Task` records for individual steps.
Exclude agentless jobs without a start time; do not sum overlapping stages into elapsed time.
Test totals come from `aggregatedResultsAnalysis`, not log-line counts.
The main-build pnpm cache logs confirm cache hits for the baseline and E2-E5/final repeat.
E2-E5 and the final repeat used the same main-build dependency cache key; the original baseline used a different key.
This was not a cold-cache benchmark.

## Completed experiments

| Experiment | Source commit | Run | Status | Result |
| --- | --- | --- | --- | --- |
| Baseline: existing shared-build pipeline | `55e7036e05fa21e65b9c5dfa9f6c7440c43deb72` | [430658](https://dev.azure.com/fluidframework/public/_build/results?buildId=430658) | Passed | Queue-to-finish 33m 28s |
| Baseline: repository policy | Same | [430657](https://dev.azure.com/fluidframework/public/_build/results?buildId=430657) | Passed | Queue-to-finish 3m 38s |
| E1: shallow, tag-free client checkout | `1eda934faa6816c00eee73cd7eb2295ec2f1eac3` | [430678](https://dev.azure.com/fluidframework/public/_build/results?buildId=430678) | Relevant steps passed; full run incomplete | Build checkout 36.2s to 9.8s; observed test checkouts 9.5-11.9s |
| E2: independent verification builds | `fe357b0da754b16c296cdcd6032efe3a47943998` | [430699](https://dev.azure.com/fluidframework/public/_build/results?buildId=430699) | Passed | Queue-to-finish 17m 44s, versus baseline 33m 28s |
| E3: emit-only TypeScript in test jobs | `957e5d8f8b8097242adb0d132a9d743f39639308` | [430707](https://dev.azure.com/fluidframework/public/_build/results?buildId=430707) | Passed | Queue-to-finish 15m 30s; test compilation 117-125s |
| E4: parallel full validation | `ea8bd9e75fee46c13231845db0bc744a31730f7d` | [430731](https://dev.azure.com/fluidframework/public/_build/results?buildId=430731) | Passed, slower elapsed time | 22m 13s; roughly four-minute agent delays and slower tests |
| E5: targeted test prerequisites | `38918a5574a902cabfc3adc29ecfdfeae3cb2ad3` | [430766](https://dev.azure.com/fluidframework/public/_build/results?buildId=430766) | Passed | 17m 20s including two-minute initial queue; substantially smaller targeted builds |
| Type-check enforcement probe | `9b80e124e3bd6c0fbff43529ce226fc979254c46` | [430786](https://dev.azure.com/fluidframework/public/_build/results?buildId=430786) | Expected rejection observed | Policy `ci:build` failed with TS2322; emit-only compilation succeeded |
| Final configuration repeat | `b7b436cff14b6b515c8e4890fe93f22f425ec805` | [430803](https://dev.azure.com/fluidframework/public/_build/results?buildId=430803) | Passed | 19m 09s; same test totals and similar targeted build timings as E5 |
| E6: lockfile-installed tools | `be1b1c90d8baf9bdedc877cfaeeecdc47c8185c9` | [430848](https://dev.azure.com/fluidframework/public/_build/results?buildId=430848) | Passed | 18m 16s including 2m 27s initial queue; no repo-tool installation |
| E7: validation-only PR packaging | `99dd98b1dc151530569354a22bbc7cfdad61cff0` | [430866](https://dev.azure.com/fluidframework/public/_build/results?buildId=430866) | Passed | Build job 9m 28s; total 17m 53s, still test-limited |
| TypeScript 7 local microbenchmark | No repository dependency changes | Local only | Both compilers passed | Three checked ESM emits: TS6 median 9.228s, TS7 median 1.379s |
| Merge-tree four-worker Mocha probe | No repository changes | Local only | Not adopted: process exited 13 | JSON reported 1,568 passes, two pending, no assertion failures, in 184.1s |

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
Total timed agent jobs: approximately 67m 44s, excluding the separate repository policy pipeline.

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

E2 passed in 1,063.7 seconds, compared with 2,008.4 seconds at baseline: 15m 45s less elapsed time (47%).
Timed agent jobs increased from 4,064.1 to 4,379.5 seconds, approximately 7.8% more agent time.
This supports independent compilation as a latency optimization, not a compute saving.
Independent compilation took 166-180 seconds per verification job.
Mocha took 420.4 seconds versus 422.0 at baseline; the improvement comes primarily from overlapping work, not faster tests.
The main build still took 16m 15s, so it is now close to the critical path.
The separate policy run [430698](https://dev.azure.com/fluidframework/public/_build/results?buildId=430698) also passed.

E2 reported 48,653 tests: 45,419 passed, 3,234 not executed, no failures.
The seven-test difference is explained by upstream merge drift, not an omitted suite.
Comparing exact merge commits `09e38c8fd2850b513e8f3b9b92d9b95eacbc7a0f` and `35fe7b1874e48ff700f3426fcca4803d7de7225d` shows replacement of SharedTree branch-history tests and addition of an ODSP summary-upload test.
Published test logs show nine fewer SharedTree cases and two added ODSP cases (one per module format).
Other suite summary counts match.
The changing target branch and scan/cache differences mean this is a promising single-run observation, not a controlled statistical estimate.

### E3: emit-only TypeScript

The client uses TypeScript 6.0.3, which supports `noCheck`.
The shared `common/build/build-common/tsconfig.base.json` reaches 477 of 480 tracked client TypeScript configurations.
The three remaining configurations retain normal checking.
For this proof of concept, set `noCheck: true` in that base file only in each disposable independent-test checkout.
Do not commit the changed base configuration or share those jobs' emitted files or `.tsbuildinfo` with the full validation build.
The existing comprehensive build continues to type-check production code, test code, type tests, exports, and API reports normally.

The initial local clean-emit comparison for SharedTree production code took 8.79 seconds with checks and 5.72 seconds without checks.
This is a local microbenchmark, not a measured CI speedup.
Both produced 1,576 output files.
All JavaScript and source maps matched byte-for-byte; two declaration files differed only in inferred property ordering.
Do not use emit-only declarations as the source for canonical API reports or release artifacts.
Declaration inference still takes work under `noCheck`: compiler-reported emit time increased from 1.99 to 4.24 seconds even though check time fell from 5.32 to zero.

The build-tool incremental option comparison does not include `noCheck`.
Consequently, do not toggle modes within a shared build-output/cache directory and assume a subsequent checked build will revalidate.
Separate fresh jobs are an important correctness boundary for this experiment.
A local invalid-assignment sentinel produced no diagnostics with `noCheck`, and error TS2322 in a separate fully checked program.
This confirms the compiler-mode behavior, not end-to-end remote validation coverage; the unchanged comprehensive CI build remains responsible for that coverage.

E3 passed in 930.1 seconds (15m 30s), 2m 14s faster than E2 and 54% faster than the original baseline.
The test totals exactly match E2: 45,419 passed, 3,234 not executed, no failures.
Its merge commit was `49a219a8ab8ad733c61a9e697cfe6da18f1c5a6a`.
The separate policy run [430706](https://dev.azure.com/fluidframework/public/_build/results?buildId=430706) passed.
Independent compilation fell from 166-180 seconds to 117-125 seconds, approximately a 30% reduction.
Total timed agent jobs fell to 3,950.3 seconds (65m 50s).
The main build finished last, at 21:34:13 UTC; the last test job finished at 21:33:17 UTC.
The main build also ran faster than E2 despite no intentional change to its work, so not all elapsed-time improvement is attributable to `noCheck`.

### E4: parallel full validation

The E2 build job still takes 16m 15s even when tests start independently.
Move its complete `ci:build` invocation to the existing client policy stage, after `checks` and before the existing generated-file check.
Use the same large agent pool as the original build rather than overloading the small policy pool.
The artifact build uses `build:compile`, retaining full type checking for artifact emission, and keeps webpack, packing, documentation output, devtools, bundle analysis, and security scans.
This intentionally retains some duplicate compilation and documentation work to preserve artifact and validation behavior.

The policy stage becomes the comprehensive validation owner for lint, type tests, API reports, export/release-tag checks, documentation validation, readme/package-list generation, and all other dependencies of `ci:build`.
Reuse the existing build task graph rather than maintaining a second list of validations.
Non-pull-request builds keep their original commands and pool assignments.
Do not roll this out if the new validation stage becomes a longer critical path.

E4 passed in 1,333.2 seconds (22m 13s), worse than E3.
Most jobs started 226-278 seconds after queueing, versus 25-51 seconds for comparable E3 jobs.
Tinylicious service tests took 779.8 seconds versus 572.9 seconds, and Mocha took 478.6 versus 423.0 seconds.
The artifact job itself shortened from 893.5 to 794.7 seconds (14m 54s to 13m 15s).
The expanded policy job completed in 471.1 seconds (7m 51s), including the full `ci:build` graph, and was not the final job.
Total timed agent jobs were 4,467.7 seconds.

All checks passed, including companion policy run [430727](https://dev.azure.com/fluidframework/public/_build/results?buildId=430727).
Tests reported 45,424 passed and 3,234 not executed, with no failures.
Exact merge comparison from E3 to E4 (`49a219a8ab8ad733c61a9e697cfe6da18f1c5a6a` to `f71f58cd4385ec17115da4028f7aabf09c3b3e70`) shows additional upstream runtime/test changes, including compatibility-test utilities.
Conclusion: validation relocation works and shortens the artifact job, but this run does not demonstrate an end-to-end benefit.
Retain it provisionally for E5, then repeat before deciding whether its extra complexity is justified.

### E5: targeted test prerequisites

Instead of compiling all 167 client workspace packages in every test job, select package roots by the script the unchanged test runner will execute.
Ask pnpm for the workspace package list, read each manifest, then pass the matching directories to the existing `compile` task graph.
Fluid build still builds their task dependencies.
Keep both module formats wherever the package's existing `compile` task requires them.
For Playwright, also limit webpack to the same selected package roots.

| Job | Selected package roots |
| --- | ---: |
| Mocha plus local service | 89 |
| Playwright | 34 |
| Tinylicious service | 5 |
| Tinylicious stress | 1 |
| AreTheTypesWrong | 99 |

These are roots, not total transitive build counts.
Selection is based on scripts, not a hard-coded package list, so adding a package with the same test script includes it automatically.
Missing or empty selections fail explicitly rather than passing without tests.
The actual inline selection script was exercised locally with compiler invocations intercepted: all five selections matched these counts, Playwright requested both compile and webpack, and an unknown script failed.
The successful remote run below demonstrates that the selected task dependencies cover the runtime prerequisites exercised by these suites.

E5 passed in 1,040.4 seconds (17m 20s), including 120.3 seconds before the pipeline started.
Timed agent jobs totaled 3,885.8 seconds (64m 46s).
The main build took 823.1 seconds and the final coverage job took 876.5 seconds.
The companion policy run [430762](https://dev.azure.com/fluidframework/public/_build/results?buildId=430762) passed.
Tests reported 45,432 passed, 3,235 not executed, no failures, on merge commit `16a70c549503626fc484c1d782998b57541dfccf`.
The original test scripts are unchanged; test counts continue to vary as the target branch advances.

| Prerequisite step | E4 seconds | E5 seconds |
| --- | ---: | ---: |
| Mocha plus local service | 127.8 | 113.4 |
| Tinylicious service | 133.6 | 52.4 |
| Tinylicious stress | 137.2 | 38.1 |
| AreTheTypesWrong | 125.6 | 79.0 |
| Playwright compile plus webpack | 236.6 | 163.6 |

Targeting is productive, especially for service and stress jobs, and all runtime prerequisites resolved successfully.
The helper still uses the normal `compile` dependency graph, rather than a manually maintained subset of compiler commands.

### Remote type-check enforcement probe

Temporarily add an unexported `number` variable initialized with a string in SharedTree's source entrypoint.
The expected outcome is TS2322 in the fully checked policy/build jobs.
The emit-only test builds are allowed to compile it, but cannot make the aggregate pipeline green.
This is a deliberate negative test, not a performance sample.
Remove the probe immediately after collecting evidence, then repeat the successful configuration.

Run 430786 rejected the probe in the existing client policy job.
Its `ci:build` log reported `src/index.ts:10:7 - error TS2322: Type 'string' is not assignable to type 'number'` at 22:26:40 and 22:26:50 UTC.
The policy job completed with result `failed`.
All five emit-only prerequisite steps succeeded, including the coverage job's 110.7-second compile.
This demonstrates that unchecked test emission cannot bypass the separate checked validation job.
The artifact job was still compiling when evidence was collected; no claim is made about its final result.
The remaining run is not needed as a performance sample and may be auto-canceled by the restoring push.
The source entrypoint has been restored byte-for-byte to the user's original dummy-change version.

### Final repeat

The clean configuration passed in 1,149.1 seconds (19m 09s), with 45,432 passed tests and 3,235 not executed, exactly matching E5.
The companion policy run [430799](https://dev.azure.com/fluidframework/public/_build/results?buildId=430799) passed.
The merge commit was `71db44300a68a6964e7d5acf94b2b9dd4f7905c3`.
Most jobs started 253-266 seconds after queueing, making this run slower than E5 despite comparable work durations.

| Metric | Baseline | E5 | Final repeat |
| --- | ---: | ---: | ---: |
| Queue-to-finish | 33m 28s | 17m 20s | 19m 09s |
| Artifact build job | 18m 17s | 13m 43s | 13m 01s |
| Mocha plus local-service job | 12m 59s after build | 14m 36s independent | 14m 34s independent |
| Tinylicious prerequisite compile | Archive reuse | 52.4s | 53.6s |
| Stress prerequisite compile | Archive reuse | 38.1s | 39.4s |
| AreTheTypesWrong prerequisite compile | Archive reuse | 79.0s | 76.1s |
| Browser prerequisite compile plus webpack | Archive reuse | 163.6s | 165.4s |
| Sum of timed agent jobs | 67m 44s | 64m 46s | 65m 28s |

The repeat supports the targeted-build improvements without relying on the fastest end-to-end sample.
The remaining critical path is primarily the combined Mocha/local-service job and agent availability, not API validation.
This repeat completed the first phase.
Follow-up requests for installed tools, artifact removal, and different test partitioning are tracked separately above.

### E6: installed build tools

Run 430848 passed in 1,096.3 seconds (18m 16s), with 45,438 passed tests and 3,235 not executed.
Companion policy run [430844](https://dev.azure.com/fluidframework/public/_build/results?buildId=430844) passed.
Both main-build and coverage-job logs identify `@fluid-tools/build-cli/0.68.0`, the workspace dependency.
Their tool-selection steps took 0.78 and 0.79 seconds respectively, replacing source installation/build/linking steps of roughly 21 seconds.
Version generation, package version updates, bundle-analyzer aggregation, and the complete validation/test flow succeeded.
This confirms the old comment requiring a repo build for bundle aggregation was stale.
The improvement is modest in elapsed time but removes a second dependency mechanism and improves reproducibility.

### E7: remove unused PR artifacts

Run 430866 passed in 1,072.6 seconds (17m 53s), with 45,438 passed and 3,235 not executed, exactly matching E6.
The companion policy run [430862](https://dev.azure.com/fluidframework/public/_build/results?buildId=430862) passed.
The main build shortened from 755.1 to 568.1 seconds: about 3m 07s less work.
Parallel package dry-runs and custom test-archive validation completed in 24.3 seconds, replacing the 135-second release-packing step.
The roughly 36-second shared-build archive and its staging/publication work are also gone.
Elapsed pipeline improvement was only 24 seconds because verification, not the artifact job, determines completion.

The published artifact list now contains only `devtools-extension-bundle_attempt-1`, `bundleAnalyzerJson`, and `_api-extractor-temp`.
There is no `build_output_archive`, `pack`, or `test-files` artifact.
Remaining inline/output binary checks, antimalware checks, and component-governance tasks succeeded.
Some artifact-scoped tasks are skipped by the existing templates when their former payload is absent; security configuration was not explicitly disabled.
This confirms the intended removal of PR release artifacts while retaining package validation and the remaining bundle/docs outputs.

## Validation ownership

Initially retain all existing checks.
Any later relocation must name its replacement before removing the old invocation.

| Validation or output | Existing owner | Experiment requirement |
| --- | --- | --- |
| Repository policy, layers, repository formatting | Separate repository policy pipeline | Preserve |
| Client checks, assert tags, package lists, dependency/version consistency | Client policy stage (`checks`) | Preserve |
| Compilation, lint, type checks, exports, release tags, fences | Build (`ci:build`) | E1-E3: unchanged; E4: complete `ci:build` in existing policy stage |
| API reports and API Extractor documentation validation | Build (`ci:build`, `ci:build:docs`) | E4: CI-mode checks and generated-file detection in policy; documentation artifact generation also retained in build |
| Type-test generation and compilation | Compilation dependencies | Preserve; generation cannot simply be removed from test compilation |
| webpack, bundle analysis, devtools bundle | Build | Preserve |
| Packing, manifests, readme generation, package metadata | Build | E7: parallel package dry-runs and custom archive validation; PR publish artifacts/metadata omitted; non-PR production unchanged |
| AreTheTypesWrong | Verification | Preserve |
| Mocha and local-service tests | Coverage job (coverage instrumentation currently disabled upstream) | Preserve both suites |
| Playwright, Tinylicious service, Tinylicious stress | Separate verification jobs | Preserve all three |
| Source scans, binary scans, component governance | Existing pipeline templates | Configuration retained; E7 omits removed PR artifact payloads and their artifact-specific processing |
| Test result publication and service logs | Verification jobs | Preserve failure-path reporting |

## Completed local TypeScript 7 experiment

Installed TypeScript 7.0.2 only in the session's benchmark directory, leaving repository manifests and lockfiles unchanged.
Compared fully checked SharedTree production ESM emits with TypeScript 6.0.3 and 7.0.2.
Each run used a fresh output directory and `.tsbuildinfo`; compiler order alternated across three trials.
TS6 wall times were 9.228, 9.480, and 9.017 seconds; TS7 times were 1.379, 1.406, and 1.374 seconds.
The median improvement is approximately 6.7x for this local project, not for the whole CI pipeline.

Both compilers passed and emitted 1,576 files.
There were 263 source-map differences, 24 declaration differences, and four JavaScript differences.
All four JavaScript differences were inspected: line wrapping and removal of redundant parentheses around an identifier.
A strict token-equality check rejected that parentheses difference, so byte-for-byte or token-identical output is not claimed.
Declaration samples changed inferred property/union ordering; full API-report compatibility has not been validated.
This confirms substantial compiler potential, but not an integrated native build or test pass.

## Completed local test-runner experiment

Per-package logs from run 430803 show merge-tree occupying 463.8 seconds of the 465-second Mocha step.
SharedTree took 182.8 seconds; the local-service suite then added another 133.8 seconds serially.
An isolated merge-tree run with `mocha --parallel --jobs 4` and JSON reporting completed all 1,570 cases in 184.1 seconds: 1,568 passed, two pending.
However, the process exited with status 13 despite reporting zero test failures.
The captured text log was empty; the exact shutdown cause has not been established.
Do not treat this as a passing optimization or suppress its exit code.
Mocha worker-mode adoption is deferred; E8 instead separates the existing serial suites into independent CI jobs without changing runner behavior.

## Findings from completed experiments

Independent verification removes the largest structural delay.
Shallow checkout, emit-only test compilation, and script-based package selection all reduced their targeted steps.
Validation relocation shortened the artifact job and passed its negative type-check test, but its standalone elapsed-time result was noisy.
Existing functional suites and pipeline identities are retained.
Security configuration remains enabled, with E7's PR artifact-scope reduction documented separately.

## Future ideas not yet evaluated

1. Repeat baseline and candidate runs against the same target revision, with comparable agents and cache state.
   The target branch advanced during this session, and queueing varied substantially.
2. Investigate duplicate webpack work and cache upload tails.
   These can become the bottleneck after tests start independently.
3. For production, replace the disposable shared-tsconfig edit with an explicit supported build-tool mode, including correct incremental-cache invalidation.
   Preserve the strict separation between unchecked test outputs and checked validation/release outputs.
4. Review version-sensitive runtime testing before rollout.
   Independent tests use source package versions, while packaging/version-generation validation still uses generated prerelease versions.
5. TypeScript 7: assess a native-compiler integration rather than simply changing the catalog version.
   The npm registry reports TypeScript 7.0.2 as stable, and the [official native-port repository](https://github.com/microsoft/typescript-go) reports the port complete.
   This repository's `fluid-build` and `fluid-tsc` use the JavaScript compiler API (`parseCommandLine`, `createProgram`, `createIncrementalProgram`) and a virtual package-type override for CommonJS.
   The new native CLI does not supply that API.
   The isolated CLI benchmark above succeeded.
   The untested next step is a native compilation task integrated with the dependency graph, while retaining TypeScript 6 for API Extractor, ESLint, and existing build-tool APIs.
   Full workspace/native CI migration has not been attempted.
6. Investigate merge-tree file-level sharding or the worker-mode shutdown failure.
   The measured slow files include `client.replay.spec.js`, `client.obliterateFarm.spec.js`, and `client.conflictFarm.spec.js`.
   Any partition must cover the original file/test set exactly, preserve reporting and failure semantics, and justify the extra agent demand.

## Limitations

Checkout time improved; E2 completed approximately 47% faster and E3 approximately 54% faster than the original baseline.
The baseline, E2, and E3 passed; E1's full run was intentionally not measured.
E4 and E5 passed; E5 reduced targeted build work.
The deliberate type-check probe was rejected as intended, removed, and the clean final repeat passed.
Pipeline queue contention and caches can dominate small improvements.
There was one original baseline and two final-configuration samples, with a moving target branch; this is not a controlled statistical estimate.
Release/non-pull-request pipelines were not executed as part of this experiment; their existing configuration is preserved by pull-request-only gating and parameter defaults.
The tsconfig mutation is deliberately confined to disposable test jobs and remains proof-of-concept machinery, not a recommended public build interface.
The branch-protection API returned HTTP 403, so exact repository-level required-check configuration could not be inspected.
Keep the existing pipeline and job check identities rather than relying on a new pipeline becoming required.
