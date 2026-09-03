# Testing

> Part of the [Fluid Framework documentation tree](./CONCEPTS.md#testing). This is the cross‑cutting
> overview of how the framework is tested. It spans the **whole repo** — tests are not confined to
> any single directory.

Fluid has to stay correct across **many services**, **many versions**, and **a lot of elapsed
time**. No single kind of test covers all of that, so the repo layers several complementary
styles. Crucially, **tests live in two places**:

- **In each package** — every package has its own unit tests (and, where it makes sense, fuzz
  tests) alongside the code they exercise.
- **In [`packages/test`](./packages/test/README.md)** — the cross‑cutting suites and shared
  infrastructure that don't belong to any one package (end‑to‑end, cross‑version/compat, drivers,
  snapshots, load).

## Test styles at a glance

| Style | What it covers | Where it lives |
| ----- | -------------- | -------------- |
| **Unit tests** | Logic inside a single package, in isolation. | `src/test` in **every** package |
| **Fuzz / stochastic** | Randomized op sequences against a DDS to find convergence/edge‑case bugs. | `src/test` of the relevant package, built on [`stochastic-test-utils`](./packages/test/stochastic-test-utils/README.md) |
| **End‑to‑end (e2e)** | A real container loop (create → change → summarize → load) run against each driver. | [`packages/test/test-end-to-end-tests`](./packages/test/test-end-to-end-tests/README.md) |
| **Cross‑version / compat** | The same e2e scenarios with mixed‑version layers, to validate [compatibility](./CONCEPTS.md#compatibility). | [`packages/test/test-version-utils`](./packages/test/test-version-utils/README.md) |
| **Snapshot compatibility** | New code can still load summaries/snapshots written by old code. | [`packages/test/snapshots`](./packages/test/snapshots/README.md) |
| **Load / stress** | Behavior under many clients and high op rates. | [`packages/test/test-service-load`](./packages/test/test-service-load/README.md), [`local-server-stress-tests`](./packages/test/local-server-stress-tests/) |

## Tests that live in each package

The majority of tests are **unit tests** in the package they cover, under `src/test`. They are
fast, run in isolation, and are the first line of defense. Run them with `pnpm test` from inside
the package (see [Running tests](#running-tests)).

Many packages — especially those that implement a **DDS** — also have **fuzz (stochastic) tests**
in their own `src/test`. These drive randomized, interleaved op sequences through a model and
reducer to verify that clients **converge** (any two clients that have seen the same ops end in the
same state) and to surface edge cases hand‑written tests miss. The shared machinery
(`describeFuzz`, `performFuzzActions`, the `FUZZ_TEST_COUNT` / `FUZZ_STRESS_RUN` controls) lives in
[`stochastic-test-utils`](./packages/test/stochastic-test-utils/README.md), but the tests
themselves live next to each DDS.

## Cross‑cutting tests in `packages/test`

Some tests can't belong to a single package because they exercise the whole stack or many versions
at once. These live in [`packages/test`](./packages/test/README.md):

- **End‑to‑end** — written once, then parameterized **over drivers** (local, Tinylicious,
  Routerlicious/AFR, ODSP) and **over version combinations**. See
  [`test-end-to-end-tests`](./packages/test/test-end-to-end-tests/README.md).
- **Cross‑version / compat** — `describeCompat(...)` from
  [`test-version-utils`](./packages/test/test-version-utils/README.md) generates a matrix of
  mixed‑version layer combinations (e.g. *new loader + old runtime*) and installs the legacy
  versions to do it. This is the testing counterpart to the
  [compatibility policy docs](./CONCEPTS.md#compatibility).
- **Snapshot compatibility** — [`snapshots`](./packages/test/snapshots/README.md) checks that
  current code loads a corpus of older snapshots.
- **Load / stress** — [`test-service-load`](./packages/test/test-service-load/README.md) simulates
  many clients and high throughput.

For the full directory listing and the shared utilities (drivers, `TestFluidObject`, Mocha setup),
see the [`packages/test` README](./packages/test/README.md).

## Running tests

See the [root README](./README.md#testing) for the canonical commands:

- `pnpm test` — all tests from the repo root, or a scoped set when run inside a package.
- `pnpm build-and-test <name-regex>` — incremental build + test.
- `ci:test` / `ci:test:coverage` — mirror the CI pipeline.
- Add `.only` / `.skip` to focus or exclude individual tests; some tests need the Git LFS
  submodule (`FluidFrameworkTestData`) fetched.

The public‑facing testing guide (Mocha, Jest, Puppeteer, Tinylicious, AFR automation) is at
[`docs/docs/testing/testing.mdx`](./docs/docs/testing/testing.mdx).
