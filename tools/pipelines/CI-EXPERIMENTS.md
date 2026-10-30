# Client pull request CI experiments

## Status and scope

Experiment branch: `CraigMacomber/FluidFramework:fastCI2`.
Test pull request: [microsoft/FluidFramework#28593](https://github.com/microsoft/FluidFramework/pull/28593).
Started on 2026-10-29.

**Latest fully passing configuration:** patched Node 26 run [431074](https://dev.azure.com/fluidframework/public/_build/results?buildId=431074) passed 45,649 tests with 3,235 skipped and no failures.
It took **20m 12s** because critical jobs started about eight minutes after queueing and then spent 91 seconds selecting Node.
The preceding Node 22 Tinylicious control [431064](https://dev.azure.com/fluidframework/public/_build/results?buildId=431064) took **16m 36s**, with eight of nine timed jobs under nine minutes.
The earlier mixed-runtime run [431044](https://dev.azure.com/fluidframework/public/_build/results?buildId=431044) passed in **14m 43s**, versus the original **33m 28s** baseline, but its unpatched Node 26 Tinylicious configuration was not reliably green.
Node 26 client policy and artifact jobs subsequently passed in E16 with faster compilation.
After reproducing the Tinylicious storage failure, the scoped dependency patch passed both local regression and real service CI on Node 26.
The next trial changes runtime selection to avoid global copies; it does not change the runtime versions in the matrix.
The partial TypeScript 7 adapter was demonstrated but is not retained: the worker comparison did not justify its extra compatibility machinery.
Node 26.13.0 passed isolated benchmarks but the first CI attempt was blocked by `opossum@8.5.0`.
The scoped opossum 10.0.0 override fixed installation, but E14 then exposed 12 Node 26 unit-test incompatibilities.
The current branch therefore intentionally uses the following mixed runtime configuration:

| Job | Current Node.js version | Reason |
| --- | --- | --- |
| Mocha unit suite (`Coverage tests`), including merge-tree | 22.22.2 | Restored after Node 26 failures involving recursive `fs.rmdirSync` and browser-storage assumptions |
| Tinylicious service and stress verification | 26.13.0 with patched Git dependency | E18 service suites and storage regression gates passed; patch remains limited to same-process concurrency |
| Local-service verification | 26.13.0 | Passed; this does not use Tinylicious's filesystem Git storage path |
| Playwright and AreTheTypesWrong verification | 26.13.0 | Passed in the mixed-runtime confirmation 431044 |
| Client policy/type/API validation and artifact build | 26.13.0 | E16 both jobs passed: 6m 51s and 6m 44s; unchanged by the storage patch |
| Separate repository policy pipeline and all non-PR jobs | 22.22.2 | Outside the newer-runtime trial |

The measured 7.5% merge-tree and approximately 11% compilation improvements are local workload results, not demonstrated end-to-end CI savings.
The Mocha job still does not receive those potential Node 26 gains because it remains on Node 22.
The policy/artifact trial demonstrated faster checked compilation without migrating the incompatible unit tests.

**First-phase result:** the configuration passed twice, in **17m 20s** and **19m 09s**, compared with the original **33m 28s** baseline.
That is 43-48% less observed elapsed time, with substantial agent-queue variation.
The best individual experimental run was E3 at 15m 30s; the first-phase configuration was retained because its targeted task timings are reproducibly lower and validation ownership is explicit.
The deliberate type-check failure was rejected, removed, and followed by a successful clean run.
The branch includes pipeline experiments, test-only merge-tree improvements, the report, client dependency configuration/patches, and a storage regression script; the user's dummy source change is preserved.

The goal is to reduce elapsed time from a push to completion of all required continuous integration (CI) checks.
Also record agent time, queueing, and cache behavior: reducing a single step is not sufficient evidence of a faster pull request.
These are proof-of-concept changes, not a production rollout.
Keep release behavior, validation, security scanning, and test coverage intact.
Local CI readiness checks are skipped by request; remote CI is the experiment.

### Current performance target

Aim for every job to finish within nine minutes on most runs, including setup, dependency installation, compilation, tests, reporting, and post-job work.
Track agent waiting separately and continue reporting total queue-to-green time.
Do not meet the budget by dropping validation or hiding intermittent failures.
Run 431044 had seven of nine timed agent jobs under nine minutes; artifact build and Tinylicious were above it.
One successful run does not establish a reliable percentile.

## Job-start delays and CI image recommendations

Job start latency is now a substantial part of queue-to-green time.
Do not conflate it with checkout or compiler time: a job without an agent has not reached those steps.
The optimized policy, build, and verification stages have no dependencies on each other, so their staggered starts are no longer explained by the old shared-build barrier.
The public timeline does not identify whether each delay is pool exhaustion, an organization parallel-job limit, VM provisioning, agent registration, or template/service prechecks.
Pool owners should inspect queue/assignment/agent-start events to distinguish these causes before buying capacity or changing images.

| Run | Observed job-start behavior after pipeline queue time |
| --- | --- |
| 430707 | Main client jobs started within 25-51s |
| 430803 | Main client jobs started around 253-266s |
| 431044 | Policy/build started at 21/33s; Mocha at 228s; service jobs around 258-273s |
| 431054 | First jobs started at 22-25s; the last verification jobs started at 454-460s |
| 431064 | First client jobs started at 74-86s; final jobs at 455s |
| 431074 | Initial jobs started at 19-74s; artifact/Tinylicious/local/stress jobs started at 482-486s |

These are start offsets, not pure agent-queue durations.
For example, the critical Tinylicious job in green run 431064 started 267s after queueing and then ran for 714s.
Starting it promptly could materially reduce the 996-second total without changing its test code.
The previous all-green run 431044 took 883s despite its longest individual job being 659s; start/finish overhead therefore still matters after jobs meet their own execution budgets.
Do not sum all parallel jobs' waiting times to estimate end-to-end savings.

### Branch-side change being tested: cached runtime selection

Node 26.13.0 is already preinstalled in the inspected CI image: `n ls` lists it alongside 22.22.2.
The current `sudo n <version>` step copies a cached distribution into the active global installation; it is not downloading Node on every job.
Measured selection steps range from about 10-14s to 38-92s, for both runtime versions.
Simply adding Node 26 to the cache again will not remove that copy.

E19 selects `n which <version>` by prepending its bin directory to the job PATH instead of calling `sudo n`.
It verifies the exact version, fails explicitly if the cached executable is unavailable, and preserves npm's previous writable global prefix for the existing pinned pnpm installation.
The selection is job-scoped, not a machine-wide runtime replacement.
It is gated to these independent PR client jobs; other pipelines and non-PR jobs retain the original behavior by default.
Local fixture checks passed for actual Node 26 execution, global-prefix preservation, boolean serialization, and missing-runtime failure.
Remote image permissions, task PATH propagation, and install behavior still require verification.

### Recommendations for image and pool owners (not yet implemented)

| Recommendation | Why it may help | Required checks / owner action |
| --- | --- | --- |
| Keep enough warm agents for a PR's initial burst | The current client graph can request eight large agents at once, plus separate policy/source-analysis capacity | Check pool maximum and warm/standby settings, scale-out delay, and organization/project parallel-job limits; size for concurrent PRs, not just one |
| Compare queued, assigned, and agent-ready timestamps | Four-to-eight-minute waves may come from cold provisioning or capacity limits rather than image setup | Export scheduling telemetry; correlate with other workloads using the pool and VM startup/registration |
| Provide immutable, side-by-side Node 22.22.2 and 26.13.0 paths | Avoid repeated global copies and let mixed-runtime jobs select a version cheaply | Ensure paths are readable/executable for the agent, document them, and preserve a separate writable npm/pnpm installation location |
| Pre-cache the exact repository-pinned pnpm version | Avoid repeated global installs if installation time is significant | Gate reuse on exact version equality; retain normal installation for changed pins and preserve registry/auth configuration |
| Preinstall matching Playwright browser binaries and OS libraries | May avoid browser download/system-package work inside browser-test steps | Match the lockfile's Playwright/browser revisions, expose a shared read-only browser cache, and validate both package variants; savings have not been isolated here |
| Measure pnpm cache restore/save against a seeded immutable store | Restore/pack/upload can cost more than a small incremental install | Compare bytes, hit type, and restore/save durations; never reuse writable `node_modules` across jobs or bypass frozen-lockfile/integrity checks |
| Examine slow initialization, network-isolation, and governance tails | Individual injected/setup tasks have varied considerably between runs | Work with the pipeline-template/security owners; optimize provisioning or caching, not removal of required checks |
| Favor cancellation/coalescing of obsolete PR work | Superseded jobs consume capacity needed by current revisions | Existing PR auto-cancel was observed; check whether cancellation promptly releases agents and whether expensive post-job work delays reuse |

These are recommendations, not changes to external pool/image settings.
More agents and larger standby pools cost money; compare queue-time reduction against sustained utilization and expected PR concurrency.
If capacity cannot be increased, consider prioritizing long jobs or combining short verification work, but measure the tradeoff against larger individual job times and the nine-minute target.
The two-dimensional goal remains: reliable jobs below nine minutes on most runs, and little avoidable delay before those jobs start.

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
| Separate PR local-service test job | E8 passed with identical test totals; Mocha job 823.3s to 726.1s | One extra agent job; local-service work now overlaps Mocha |
| No type-only generation in runtime jobs | Combined retry logs show zero `typetests` commands in all six test jobs, versus 58 in checked policy validation | Declaration entrypoints retained for Mocha import tests and ATTW |
| Development validation for private examples | Combined retry: main webpack 120.3s to 33.5s, browser prerequisites 171.2s to 58.6s | Production size producer unchanged; reduced production-only coverage for private examples |
| Correct parallel merge-tree selection and lower-allocation diagnostics | E15 Mocha step passed in 187.4s versus E12's 448.5s | All original merge-tree cases preserved; aggregate E15 failed in the separate Tinylicious job |
| Node 26 client policy/artifact execution | E16 checked compilation 207.2s to 173.6s; policy `ci:build` 339.7s to 290.6s | Both jobs passed; Tinylicious runtime compatibility is a separate issue |
| Same-process Git storage patch for Tinylicious | E18 passed; service test step 394.3s versus 551.4s in the Node 22 control | Patch plus Node 26 is a combined change; cross-process/crash-safe publication is not addressed |

## Experiment status

The patched Node 26 configuration passed E18.
E19's cached-runtime selection is running, using the same dependency and runtime versions.
E20's ESM-only service prerequisites are prepared separately so they do not change the in-flight E19 comparison.

### Prepared E20: ESM-only service and stress prerequisites

The Tinylicious prerequisite log from run 431074 contains 109 `fluid-tsc commonjs` commands, although those service scripts execute ESM tests.
The five service packages select `lib/test` directly or inherit the ESM default from the shared Mocha configuration.
The stress package explicitly selects `lib/test`; local-service tests use the same end-to-end ESM configuration.
The `azure-local-service` wrapper is checked-in JavaScript and starts the installed Tinylicious dependency, not a workspace-generated CommonJS build.

Use the existing `compile:esm` task for local-service, Tinylicious-service, and Tinylicious-stress jobs.
It preserves ESM package/test compilation, required copies, and dependency traversal.
Do not globally disable CommonJS tasks: a necessary dependency may still request one through its existing task graph.
Installed third-party/CommonJS dependencies and compatibility packages remain unchanged.

Mocha keeps full `compile` because some package scripts execute CJS suites and import-format compatibility tests.
AreTheTypesWrong keeps full compilation for package/type validation.
Browser jobs are not changed in this trial; further narrowing would require a separate prerequisite audit.
Policy and artifact validation remain full builds, including CommonJS buildability checks.
Non-PR test setup continues to use its original artifact path.

Local checks exercised the actual selection logic for all job types, mixed groups, and invalid targets.
Missing metadata defaults to full compilation, mixed groups retain full compilation, and unknown targets fail explicitly.
Fresh remote CI must still confirm that no runtime prerequisite was omitted, that suite counts match, and that CommonJS compiler commands disappear or are limited to genuinely required transitive tasks.

### E18: fix same-process Git-object publication races

A plain upgrade is not an established solution: the latest tested isomorphic-git 1.44.8 still failed 17 of 2,000 concurrent operations.
Patch the already-locked isomorphic-git 1.27.2 using pnpm's existing `patchedDependencies` mechanism instead of changing unrelated dependency versions.
Both its CommonJS and bundler-module files use the library's existing `async-lock` dependency to serialize the existence check and write for each object path.
Different object paths retain independent locks.
This prevents a concurrent writer from observing the newly created filename and returning before its contents are complete.

`scripts/test-tinylicious-storage.cjs` resolves the actual dependency used by the installed Tinylicious package.
It holds a non-empty tree's compressed object write after creating an empty file, then starts another write/read of the same tree.
The test failed against the original package on Node 22 and passes against the patched package on Node 22 and Node 26.
A second test verifies that write errors propagate and release the lock so a later valid write can succeed.
The unmodified real-filesystem stress reproducer now completes all 2,000 operations with zero failures on each runtime, compared with 208 failures on Node 26 before the patch.
The frozen Node 26 workspace install also passes with the patch hash recorded in the lockfile.

The regression runs before Tinylicious service/stress tests in PR CI.
This is a narrowly scoped same-process fix for the single Tinylicious instance; it is not cross-process locking, crash-safe atomic publication, or repair of already-corrupt objects.
The CommonJS entrypoint actually used by Tinylicious was exercised.
The corresponding bundler module receives the same source change; importing that module directly in Node hits a pre-existing path-browserify interop limitation, so browser-bundled behavior is not claimed as tested.
The client workspace patch does not change the separately locked server release group or publish a repaired Tinylicious release.
For long-term rollout, upstream the fix or adopt an upstream atomic-publication solution, update the server dependency and its regression coverage, then retire this client-side patch.
No upstream issue, pull request, or package publication has been performed automatically.

Remote run 431074 passed all service/stress tests and both storage regression cases in each Tinylicious job.
The companion policy run [431070](https://dev.azure.com/fluidframework/public/_build/results?buildId=431070) passed.
Suite totals matched the control: 45,649 passed, 3,235 skipped.
Tinylicious's test step dropped from 551.4 to 394.3 seconds (28.5%), but its full job still took 691.3 seconds due to setup overhead, including 91 seconds copying Node.
The artifact job took 587.3 seconds with a similar 91.6-second Node selection.
The four late jobs started 482-486 seconds after queueing, making queue-to-finish 1,212.3 seconds despite successful faster test execution.
This run demonstrates compatibility of the patched path; repeated runs are still needed to characterize reliability and scheduling variability.
Selected changes with evidence are listed above; unsuccessful or non-beneficial trials remain in the history, not in the selected runtime/compiler configuration.
Further ideas that have not been implemented are listed separately at the end.

### E14 outcome and current mixed-runtime confirmation

Pin `@fluidframework/server-lambdas@7.0.1>opossum` to `10.0.0` in the client workspace overrides and regenerate the lockfile with pnpm.
This changes only the three existing server-lambdas lockfile snapshots and the opossum package record; the server release group's separate manifests/lockfile are untouched.
The override applies to client workspace installations on both Node 22 and 26, not just the PR test jobs.
It raises this transitive dependency's declared minimum to Node 22, matching the client workspace's existing minimum.

The [upstream changelog](https://github.com/nodeshift/opossum/blob/main/CHANGELOG.md) identifies removal of older Node support as the breaking changes in v9/v10.
The upstream v8.5.0-to-v10.0.0 comparison contains no changes under `lib/`.
Version 10 explicitly supports `^26 || ^24 || ^22`.
No engine checks or package metadata are overridden; this uses an actual supported upstream release.

Local `pnpm install --frozen-lockfile` completed successfully under Node 26.13.0, including the compatibility-workspace postinstall.
Actual server-lambdas dependency resolution selects opossum 10.0.0.
Circuit-breaker success, rejection, open-state, and fallback checks passed on local Node 22.22.3 and 26.13.0.
Run 431023 passed dependency installation, confirming the override removes the engine blocker.
It subsequently found 12 unit-test failures on Node 26: obsolete recursive `fs.rmdirSync` calls in fluid-runner tests and browser-storage assumptions in example/devtools tests.
These are not opossum installation or circuit-breaker failures.
Rather than broaden this experiment into unrelated test migrations, keep the full Mocha unit-suite job on Node 22.
The other verification jobs retained Node 26, and the complete mixed-runtime configuration subsequently passed in run 431044.
This is a user-authorized follow-up to the original install blocker, not evidence that the earlier Node 26 run passed.

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

E9 applies only to disposable independent-test builds, not the multi-step artifact/validation jobs.
It replaces the runtime job's global `typetests:gen` task with an empty non-script task.
Those generated tests contain only types and are already checked in; regenerating them in an unchecked runtime build adds no validation.
The separate policy job retains the original generation and full type checking.
This corrects the earlier conservative assumption that generation had to remain in the runtime task graph.
`flub generate entrypoints` emits declaration files, not JavaScript.
E9 disables its standard ESM/CJS generation tasks for pure runtime jobs while keeping the underlying JavaScript compile dependencies.
Mocha retains them because `@fluid-example/import-testing` executes compiler-based compatibility tests.
AreTheTypesWrong retains them because it validates package type entrypoints.
These exceptions are explicit `requiresTypeEntrypoints` metadata; the full policy and artifact builds are unchanged.
`fluid-build --force --dep` bypasses both initial and pre-execution up-to-date checks for selected packages and dependencies.
Compile and browser webpack tasks are requested together so the graph runs each shared task once.
The existing JavaScript worker mode is retained for this first measurement.
The flag does not disable task-graph construction, config parsing, TypeScript build-info emission, or done-file generation.
Whether bypassing checks helps remains an experiment: checks can also avoid duplicate work within an otherwise fresh build.

E10 installs pinned TypeScript 7.0.2 in the agent temporary directory and replaces only each workspace's local `.bin/tsc` entry.
It uses atomic replacement, not writes through symlinks/hard links into the compiler package or pnpm store.
TypeScript 6's JavaScript API remains available to `fluid-build`, `fluid-tsc`, ts-morph, API Extractor, and loaders.
Direct compiler aliases used by import-compatibility tests still resolve to their original compiler packages.
`fluid-tsc` CommonJS builds remain TypeScript 6; this is a partial native adapter, not a full toolchain upgrade.
The retry also explicitly retains TypeScript 6 for `@fluid-experimental/property-properties`, whose JavaScript declaration emit fails under TypeScript 7.
JavaScript worker execution is disabled so plain `tsc` tasks actually invoke the native CLI.
No checked validation or artifact job is changed.

A local fixture started with a bin hard-linked to an original compiler wrapper.
After running the actual setup script, the local bin reported TypeScript 7.0.2, the original hard-linked file was unchanged, and the direct compatibility CLI still reported 6.0.3.
This validates the adapter's filesystem/API isolation, not the complete native runtime build.

E11's bundle-size producer is `@fluid-example/bundle-size-tests`: its ordinary `webpack` command also produces the analysis data, and `webpack:profile` delegates to it.
It must remain production-mode.
Other private examples expose `webpack:dev` scripts; switching their validation bundling retains resolution/loader checks but no longer tests production-only optimization behavior.
The devtools extension's existing configuration is already development-mode and is not changed.
The setup selects 40 private examples with the exact production/development webpack script pair and no `webpack:profile` script.
A read-only execution of the actual selection logic confirmed that the bundle-size producer and devtools extension are excluded.
Only the disposable PR build/test checkouts are changed; non-PR bundling and the policy validation checkout remain unchanged.

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
| First-phase configuration repeat | `b7b436cff14b6b515c8e4890fe93f22f425ec805` | [430803](https://dev.azure.com/fluidframework/public/_build/results?buildId=430803) | Passed | 19m 09s; same test totals and similar targeted build timings as E5 |
| E6: lockfile-installed tools | `be1b1c90d8baf9bdedc877cfaeeecdc47c8185c9` | [430848](https://dev.azure.com/fluidframework/public/_build/results?buildId=430848) | Passed | 18m 16s including 2m 27s initial queue; no repo-tool installation |
| E7: validation-only PR packaging | `99dd98b1dc151530569354a22bbc7cfdad61cff0` | [430866](https://dev.azure.com/fluidframework/public/_build/results?buildId=430866) | Passed | Build job 9m 28s; total 17m 53s, still test-limited |
| E8: independent local-service job | `a5d0f9e18b8c11276079d52e06ed39abfe09ff00` | [430896](https://dev.azure.com/fluidframework/public/_build/results?buildId=430896) | Passed | 16m 35s including 3m 17s initial queue; all suite counts unchanged |
| E9: lean runtime task graph | `a0671df680eb5c7550b55c18a455b9d68db7a61c` | [430921](https://dev.azure.com/fluidframework/public/_build/results?buildId=430921) | Failed; not promoted | Strict boolean guard failed to preserve declaration generation in ATTW/Mocha |
| E10: native CLI adapter | `4ef16eadd6dcde2bd81ce12c7d36c79de0b39bae` | [430936](https://dev.azure.com/fluidframework/public/_build/results?buildId=430936) | Failed; retry prepared | TS2883 while emitting legacy JavaScript declarations in `property-properties` |
| Native retry plus E11 development bundles | `4b3f2a5d4195ccea4721a2ef1ca95cb1d195adfd` | [430954](https://dev.azure.com/fluidframework/public/_build/results?buildId=430954) | Passed | 16m 35s; native adapter works with legacy exception; webpack 33.5s |
| E12: TypeScript 6 worker comparison | `4d89e87ff040fb33193235c323539967a53f90aa` | [430969](https://dev.azure.com/fluidframework/public/_build/results?buildId=430969) | Passed; selected | 16m 40s; prerequisite builds as fast or faster than the partial native adapter |
| Node 26 local serial benchmarks | No repository runtime/dependency changes | Local only | Passed | Compilation about 11% faster, merge-tree 7.5% faster, identical emitted files/test counts |
| Node 26 parallel-Mocha probe | No repository changes | Local only | Initially rejected: process exited 13 | 1,568 passes/two pending in 168.2s; later traced to 13 helper files triggering fail-zero |
| E13: Node 26 PR test jobs | `3eff90cec5069d9990c71115b07bcba9c30e5797` | [430990](https://dev.azure.com/fluidframework/public/_build/results?buildId=430990) | Blocked before tests; reverted | Frozen install rejects `opossum@8.5.0` on Node 26 |
| E14: Node 26 with supported opossum | `bc34fb6ba8522cfb1fedfdaae9780c17cca86ff7` | [431023](https://dev.azure.com/fluidframework/public/_build/results?buildId=431023) | Installation fixed; unit suite failed | 12 Node-compatibility failures unrelated to opossum; keep full Mocha job on Node 22 |
| E15: spec-only parallel merge-tree plus lower-allocation diagnostics | `6d1de054676de5ec446b80a42a49c1fe5135c472` | [431033](https://dev.azure.com/fluidframework/public/_build/results?buildId=431033) | Mocha passed; separate Tinylicious step failed | Full Mocha step 187.4s; summary-upload setup network error prevents an overall green result |
| E15 unchanged repeat | `4f8679fa6a5f902cab8c1e5e438ddc035beb5bce` | [431044](https://dev.azure.com/fluidframework/public/_build/results?buildId=431044) | Passed | 14m 43s; Mocha 194.7s; all mixed-runtime jobs green |
| E16: Node 26 client policy/artifact builds | `0a4f0518e7a1d3c8558390425b7927b2392ac3a3` | [431054](https://dev.azure.com/fluidframework/public/_build/results?buildId=431054) | Both targeted jobs passed; Tinylicious failed again | Policy 6m 51s, artifact 6m 44s; same summary-upload HTTP 400 |
| E17: Tinylicious Node 22 control | `57ebbb69f0c783a45e0671075816aa8be30ebf05` | [431064](https://dev.azure.com/fluidframework/public/_build/results?buildId=431064) | Passed | 16m 36s; eight of nine timed jobs under nine minutes; Tinylicious 11m 54s |
| E18: patched Git storage on Node 26 | `73860819672a2b8464e1bee2782c8c811f852d9d` | [431074](https://dev.azure.com/fluidframework/public/_build/results?buildId=431074) | Passed | 20m 12s with eight-minute job-start delays; Tinylicious test step 394.3s |
| E19: cached runtime selection | Implementation `5fba6328c88`; report update included in triggering commit | Pending | Ready to push | Avoid global Node copying in PR jobs; preserve npm prefix and validate exact runtime |
| E20: ESM-only service prerequisites | Pending | Pending | Prepared locally | Existing `compile:esm` task for service/stress jobs; full compile remains for Mocha/type validation |
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

### First-phase repeat

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

### E8: separate local-service verification

Run 430896 passed in 994.6 seconds (16m 35s), including 196.8 seconds before pipeline start.
The companion policy run [430892](https://dev.azure.com/fluidframework/public/_build/results?buildId=430892) passed.
All 45,438 passed tests and 3,235 not-executed tests match E7 exactly.
The Mocha job shortened from 823.3 to 726.1 seconds; its unchanged test command took 438.8 seconds.
Local-service tests took 130.7 seconds in a separate 302.8-second job, including a 43.7-second targeted build.
The main build was 534.9 seconds and no longer controls completion.
Mocha and Tinylicious service tests are now the long jobs; the extra local-service agent did not become the critical path in this run.

### E9: declaration guard failure

The generation/forced-build changes compiled, but AreTheTypesWrong reported conditional-export fallback errors across packages.
Setup logs show that declaration entrypoint generation was incorrectly disabled in the ATTW and Mocha jobs, despite their preservation metadata.
The strict `=== true` check did not tolerate Azure's string-valued boolean metadata.
The correction accepts boolean or case-insensitive string `true`/`false`, rejects other values, and logs the received type.
Do not count the shorter E9 compilation times as a validated optimization: required declaration work was missing.
The next native-adapter run includes this correction; it is not a controlled native-only comparison with E9.

### E10: native declaration incompatibility

The native adapter installed and executed successfully, and several targeted prerequisite builds completed.
The Mocha prerequisite build failed in `@fluid-experimental/property-properties` with TS2883: the inferred `PropertyFactory` type could not name an `EventEmitter` reference portably.
This is native JavaScript declaration-emission incompatibility, not a missing runtime dependency or a reason to ignore compiler errors.
The retry explicitly leaves that package's original TypeScript 6 bin intact and verifies its version.
It does not change library source, add unsafe type casts, or disable the checked validation job.
The pending development-bundle experiment is included in that retry, so its results will describe a combined configuration rather than a native-only comparison.

### Successful native/development retry

Run 430954 passed in 995.0 seconds (16m 35s), with 45,447 passed tests and 3,235 not executed.
The companion policy run [430950](https://dev.azure.com/fluidframework/public/_build/results?buildId=430950) passed.
The original validation build remained fully checked.
Its log contains 58 type-test generation commands and 134 declaration-entrypoint commands.
All six independent test-build logs contain zero type-test generation commands.
Pure runtime jobs contain zero declaration-entrypoint commands; Mocha and ATTW retain 120 and 132 respectively.

The native CLI adapter is therefore viable without changes to `fluid-build`, provided TypeScript 6 APIs/CJS support and the explicit legacy declaration exception remain.
However, native performance is not established in isolation.
The Mocha prerequisite build took 116.5 seconds, compared with 111.4 seconds in E8; its test command also ran longer (571.8 versus 438.8 seconds).
The large bundling improvement is clearer: the main webpack step fell from 120.3 to 33.5 seconds and browser prerequisites from 171.2 to 58.6 seconds.
Production analyzer artifacts remained present alongside docs and devtools output.

E12 retains all lean-graph/development changes but restores TypeScript 6 workers and removes the native setup invocation.
This comparison will determine whether the extra adapter complexity earns a place in the final configuration.

### E12: select TypeScript 6 workers

Run 430969 passed in 1,000.5 seconds (16m 40s), including 215.9 seconds before pipeline start.
It reported 45,648 passed tests and 3,235 not executed.
The 201 additional tests relative to the native run are explained by upstream SharedTree changes: exact merge comparison shows the extrinsic-range feature and tests were added between the runs.
Mocha log summaries show 197 additional regular Tree cases and four additional production-mode cases.

| Prerequisite build | Partial native adapter | TypeScript 6 workers |
| --- | ---: | ---: |
| Mocha | 116.5s | 110.7s |
| AreTheTypesWrong | 78.5s | 68.2s |
| Tinylicious service | 38.9s | 35.1s |
| Local service | 35.0s | 34.6s |
| Stress | 31.9s | 32.0s |
| Browser compile/bundles | 58.6s | 58.6s |

Keep the simpler TypeScript 6 worker path and remove the unused adapter.
The native proof of concept remains reproducible from its experiment commits, but is not a confirmed improvement in this pipeline.
Its local compiler speedup did not translate into a demonstrated CI gain when CJS compilation, JavaScript APIs, process startup, and other build tasks remained in the old toolchain.
This is not evidence that a properly integrated native build cannot help; it is evidence against retaining this particular adapter without a benefit.

### Node runtime benchmark setup

Run 430969 lists Node 26.13.0 alongside the current 22.22.2 in its agent image.
Both exact versions were downloaded from nodejs.org into session-only storage and verified against the published SHA-256 sums.
The global/default local Node installation is unchanged.
The benchmark alternates compiler order over three fresh checked and unchecked emits, then runs the unchanged serial merge-tree suite on each runtime.
No CI runtime change is made before correctness and timing are assessed.

The local serial benchmark passed on both versions.

| Workload | Node 22.22.2 | Node 26.13.0 | Observation |
| --- | ---: | ---: | --- |
| Checked Tree emit, median of three fresh runs | 8.836s | 7.851s | 11.1% faster |
| Emit-only Tree build, median of three fresh runs | 5.671s | 5.033s | 11.3% faster |
| Serial merge-tree suite, one run per version | 462.3s | 427.6s | 7.5% faster |

Both merge-tree runs exited zero with 1,568 passes and two skipped cases.
Checked and unchecked compiler output comparisons found zero differing emitted files between Node versions.
The merge-tree result is one local sample per runtime, not a CI performance guarantee.
The existing local test report was preserved, and the default local Node was not changed.
The four-worker JSON-reporter probe was also repeated on Node 26.
It reported all 1,568 tests passing and two pending in 168.2 seconds, but still exited 13 with an empty text log.
The newer runtime did not change this result.
Later investigation below identified test-file selection, not Node shutdown, as the cause.

E13 originally selected 26.13.0 for all PR verification jobs, while policy, artifact builds, and non-PR jobs kept 22.22.2.
Dependencies were installed after selecting the runtime in each fresh job.
This describes the historical E13/E14 trial, not the current configuration: the full Mocha unit suite was subsequently restored to Node 22 as shown in the matrix above.

The CI trial failed during dependency installation, before any Node 26 test result could be collected.
pnpm reported `ERR_PNPM_UNSUPPORTED_ENGINE` for `opossum@8.5.0`, whose declared range is `^24 || ^22 || ^21 || ^20 || ^18 || ^16`.
The failure persisted across the existing automatic retries.
This is a declared-support/installability blocker, not proof that the locally tested code fails at runtime on Node 26.
Do not disable engine checks or silently alter dependency metadata to force adoption.
After E13, Node 22.22.2 was restored for all jobs without dependency changes.
The later user-authorized E14 upgrade is tracked separately above.
Node selection itself also took 38-43 seconds in the observed Node 26 jobs, so startup overhead must be included in any future CI comparison.

## Validation ownership

Initially retain all existing checks.
Any later relocation must name its replacement before removing the old invocation.

| Validation or output | Existing owner | Experiment requirement |
| --- | --- | --- |
| Repository policy, layers, repository formatting | Separate repository policy pipeline | Preserve |
| Client checks, assert tags, package lists, dependency/version consistency | Client policy stage (`checks`) | Preserve |
| Compilation, lint, type checks, exports, release tags, fences | Build (`ci:build`) | E1-E3: unchanged; E4: complete `ci:build` in existing policy stage |
| API reports and API Extractor documentation validation | Build (`ci:build`, `ci:build:docs`) | E4: CI-mode checks and generated-file detection in policy; documentation artifact generation also retained in build |
| Type-test generation and compilation | Compilation dependencies | Checked policy validation retains generation and type checking; E9 removes generation from unchecked runtime-test builds |
| webpack, bundle analysis, devtools bundle | Build | Preserve |
| Packing, manifests, readme generation, package metadata | Build | E7: parallel package dry-runs and custom archive validation; PR publish artifacts/metadata omitted; non-PR production unchanged |
| AreTheTypesWrong | Verification | Preserve |
| Mocha and local-service tests | Coverage job (coverage instrumentation currently disabled upstream) | Preserve both suites; E8 splits local service; E20 changes only that job's build target |
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
At the time, the empty text log left the cause unresolved; the run was correctly not treated as passing.
Subsequent debug tracing established that this was not a shutdown failure.
Mocha's parallel runner counted one `fail-zero` failure for each of 13 helper/type-only modules selected by the recursive `lib/test` default.
They emit no test-failure event, so the JSON reporter shows zero assertion failures while Mocha returns a failure count of 13.
All worker processes terminated normally.

The opt-in correction selects `lib/test/**/*.spec.js` before enabling four-worker mode.
It preserves the existing reporter, root hooks, all real tests, and `fail-zero`.
An explicitly selected helper-only file still exits 1, and an intentionally failing test still reports the assertion and exits 1.
The default serial configuration and explicit `MOCHA_SPEC` selections remain available.
The corrected four-worker run with the normal CI reporter completed all 1,568 original passes and two pending cases with exit zero.
With the lower-allocation diagnostic queue described below, the full run completed in 151.952 seconds: 1,569 passes and two skipped cases, including one new diagnostic regression test.
Comparing every reported full test name against the original run found no missing cases and exactly that one added regression case.
This is approximately 67% less local elapsed time than the earlier 462.3-second serial baseline, without shrinking operation matrices.
The PR-only opt-in is `FLUID_MERGE_TREE_PARALLEL=1`; serial/non-PR and benchmark invocations retain their defaults.
Remote CI will measure contention with the other packages running concurrently.

Run 431033 confirmed the improvement in CI with the real reporter and concurrent workspace tests.
The full Mocha step passed in 187.4 seconds, versus 448.5 seconds in E12 (58% less elapsed time).
The merge-tree output reported 1,569 passes and two pending cases, including the diagnostic regression.
The complete Mocha job took 430.2 seconds including setup, compilation, and result publication.
Policy/type validation, artifact build, browser tests, local-service tests, stress tests, and AreTheTypesWrong also passed.
Companion repository policy run [431029](https://dev.azure.com/fluidframework/public/_build/results?buildId=431029) passed.

The separate Node 26 Tinylicious job failed one summary-upload setup with `R11s fetch error: {}` after reporting 4,048 passed and 1,928 pending cases in its end-to-end package.
At this stage the cause was unresolved; later E16/E18 investigation reproduced and patched a matching Git-object publication failure.
No end-to-end green timing is claimed for E15.
A report-only push repeats the unchanged implementation to collect another result without skipping or weakening this check.

The unchanged repeat 431044 passed with 45,649 passed tests and 3,235 skipped.
Companion policy run [431040](https://dev.azure.com/fluidframework/public/_build/results?buildId=431040) passed.
The Tinylicious error did not reproduce; its cause remains unresolved, rather than declared fixed.
The monitor itself encountered an Azure API HTTP 503; querying the completed run confirmed CI success.
The monitoring helper now retries selected transient HTTP errors with bounded backoff.

| Timed job in 431044 | Duration | Under nine minutes? |
| --- | ---: | --- |
| Client policy/type validation | 7m 30s | Yes |
| Source analysis | 45s | Yes |
| Artifact build | 10m 59s | No |
| Mocha | 7m 27s | Yes |
| Tinylicious service | 9m 36s | No |
| Playwright | 5m 24s | Yes |
| Local service | 4m 55s | Yes |
| AreTheTypesWrong | 3m 50s | Yes |
| Stress | 3m 17s | Yes |

The artifact job included an 80-second Node-selection step and 76-second component-governance step, well above many previous runs.
Its checked compile itself stayed near 207 seconds.
Tinylicious's test step was 420 seconds; setup/compilation/reporting brought its total just over the target.
These distinguish work that could benefit from faster execution from variable agent/template overhead.

### E16: checked builds on Node 26, and the Tinylicious storage blocker

The client policy and artifact jobs passed on Node 26.13.0 in 411.2 and 404.3 seconds respectively, both below nine minutes.
Policy `ci:build` shortened from 339.7 to 290.6 seconds (14.5%); checked artifact compilation from 207.2 to 173.6 seconds (16.2%).
The main webpack step shortened from 33.4 to 27.7 seconds.
Mocha stayed on Node 22 and again passed in 186.8 seconds.
These are actual CI step measurements, unlike the earlier isolated Node microbenchmarks.
Whole-run success is not claimed: Tinylicious again failed the same summary-upload setup.

The uploaded Tinylicious server log contains HTTP 400 responses with `{}` bodies for concurrent `POST /repos/tinylicious/git/trees` requests.
The route calls `isomorphic-git.writeTree` followed by `readTree`; its error handler serializes rejected errors to HTTP 400, losing non-enumerable Error details.
A local reproduction using the installed `isomorphic-git@1.27.2` and Node's real filesystem ran 20 fresh repositories with 100 concurrent identical tree-write/read operations each:

| Runtime/library | Failed operations / 2,000 | Error |
| --- | ---: | --- |
| Node 22.22.3, isomorphic-git 1.27.2 | 0 | None |
| Node 26.13.0, isomorphic-git 1.27.2 | 208 | `Cannot create property 'caller' on string 'buffer error'` |
| Node 26.13.0, isomorphic-git 1.44.8 (isolated trial) | 17 | `DecompressionError: Invalid compressed buffer: buffer error` |

This identifies a reproducible Node-sensitive concurrent Git-storage failure consistent with the server symptom; it is not proof of the precise exception in the remote request, whose error handler discarded the details.
The installed implementation checks whether an object exists and then writes it, without atomic publication protecting concurrent readers/writers.
The latest upstream library still failed this workload, so a blanket library upgrade is not an established fix.
No server implementation, error handling, or library version was patched to hide the failure.
Tinylicious service/stress jobs explicitly select Node 22; Node 26 remains enabled for policy, artifact, browser, local-service, and package-type jobs.
The authorized opossum 10 override remains in place and has passed installation and functional circuit-breaker checks.

The Node 22 Tinylicious control (431064) then passed all 45,649 tests, with 3,235 skipped.
Its policy, artifact, and Mocha jobs took 389.5, 449.5, and 460.9 seconds respectively.
Tinylicious service took 714.2 seconds, including a 551.4-second test step, and was the only timed job above nine minutes.
That gives a passing reliability/performance baseline for the patched Node 26 attempt.

### Why merge-tree is slow

The existing suite repeatedly simulates and compares multiple collaborating clients over large operation matrices.
The earlier four-worker profile attributed approximately 155s of test-body time to replay, 120s to the obliterate farm, and 93s to the conflict farm.
Those are concurrent-run durations, not additive serial estimates.
A CPU profile of one expensive replay case found approximately 35% of samples in garbage collection and substantial time building diagnostic strings in `TestClientLogger.getSegString` and `addNewLogLine`.
Every operation records client-state snapshots, including breadth-first traversals that allocate a linked-list node per tree node.
That diagnostic work runs even for successful tests; it is not evidence that production merge-tree operations alone account for the suite duration.
Replace the linked list with an array queue, preserving breadth-first order and complete diagnostic history.
An 18-state comparison across tree splits, pending insertions, removals, annotations, and obliteration produced byte-identical current-state/history strings.
A committed regression case checks multi-level traversal order and pending-edit markers.
Three alternating runs of the expensive replay case measured median wall times of 11.568 seconds for the original linked queue and 8.804 seconds for the final array queue (24% less).
This microbenchmark isolates diagnostic rendering, while the full parallel run measures the combined runtime improvement.
No production merge-tree algorithm, fuzz seed/count, replay corpus, assertion, or logger history was removed.

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
   The partial CLI adapter passed CI, but a full native toolchain including CJS/API consumers has not been attempted.
6. Further balance merge-tree work after the spec-only parallel-runner experiment.
   The measured slow files include `client.replay.spec.js`, `client.obliterateFarm.spec.js`, and `client.conflictFarm.spec.js`.
   Any partition must cover the original test set exactly, preserve reporting and failure semantics, and justify the extra agent demand.
   The original exit-13 cause is now known; it was helper-file selection with per-file `fail-zero`, not a Node shutdown bug.
7. Add a supported disposable-CI mode to `fluid-build` if E9 shows useful potential.
   Such a mode could avoid cache read/write bookkeeping while retaining graph deduplication and necessary dependency/config analysis.
   A blanket forced rebuild in each successive artifact-job invocation would lose useful within-job reuse and is not proposed.
8. Revisit newer Node after resolving dependency support ranges, or benchmark a supported Node 24 version.
   Node 24 satisfies the observed `opossum` range, but it was not among the `n ls` versions in the inspected image and has not been benchmarked here.
   Preserve minimum-supported-runtime coverage when deciding on a production test matrix.
9. Measure whether the Node-selection step can avoid copying an already-active matching runtime.
   Instrument the initial version first; no such change was made in this experiment.
10. Migrate the unit tests' removed filesystem API usage and browser-storage assumptions before moving the full Mocha job back to Node 26.
    This remains separate from the active policy/artifact runtime trial.
11. Investigate atomic Git-object writes/reads in Tinylicious's storage implementation before moving its service jobs back to Node 26.
    E18's same-process serialization patch passed local and remote tests; cross-process/crash-safe publication remains future work.
    Preserve the concurrent-tree reproducer as regression coverage for an upstream fix.
    Upgrading to isomorphic-git 1.44.8 alone did not eliminate the reproduced failure.

## Limitations

Checkout time improved; E2 completed approximately 47% faster and E3 approximately 54% faster than the original baseline.
The baseline, E2, and E3 passed; E1's full run was intentionally not measured.
E4 and E5 passed; E5 reduced targeted build work.
The deliberate type-check probe was rejected as intended, removed, and the clean final repeat passed.
Pipeline queue contention and caches can dominate small improvements.
There was one original baseline and two final-configuration samples, with a moving target branch; this is not a controlled statistical estimate.
Release/non-pull-request pipelines were not executed as part of this experiment; their existing configuration is preserved by pull-request-only gating and parameter defaults.
The tsconfig mutation is deliberately confined to disposable test jobs and remains proof-of-concept machinery, not a recommended public build interface.
The partial native TypeScript adapter is not enabled.
E14's dependency installation succeeded, but its Node 26 unit suite failed.
The mixed-runtime configuration retaining Mocha on Node 22 passed in 431044.
The Node 26 policy/artifact jobs and patched Tinylicious service jobs passed remotely.
The unpatched storage failure remains documented; the patch's same-process scope and the small number of full confirmation runs limit reliability claims.
No engine-policy bypass is used, and earlier unsuccessful trials remain recorded as failures.
The branch-protection API returned HTTP 403, so exact repository-level required-check configuration could not be inspected.
Keep the existing pipeline and job check identities rather than relying on a new pipeline becoming required.
