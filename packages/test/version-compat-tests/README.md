# @fluid-internal/version-compat-tests

This private test-runner package is a scaffold for in-process distributed data structure (DDS) version-compatibility fuzz tests.
It contains no compatibility suites yet and provides no fuzz coverage.
The single pending test keeps the compiler and test runner usable without claiming a passing compatibility test.

This package is not a reusable test utility library or a service end-to-end test runner.
It has no public entry points, is not published, and does not start services or download previous package versions.

## Commands

After installing workspace dependencies from the repository root, run these commands from this directory:

| Command | Purpose |
| --- | --- |
| `pnpm build` | Build the package and required workspace dependencies, and run lint and formatting checks. |
| `pnpm build:compile` | Compile tests and required workspace dependencies. |
| `pnpm build:test:esm` | Compile only this package's tests when dependencies are already built. |
| `pnpm lint` | Run the repository's lint tasks for this package. |
| `pnpm check:format` | Check formatting. |
| `pnpm format` | Apply formatting. |
| `pnpm test` | Run compiled ECMAScript module (ESM) tests with the shared Mocha setup. |
| `pnpm run clean` | Remove generated output, build caches, and test reports. |

Build before running tests.
The scaffold test is reported as pending, not passing.
Mocha retains the shared fail-on-zero-tests setting.
The shared setup also enables the `allow-ff-test-exports` condition and writes test reports under `nyc`.

## Adding compatibility suites

Add TypeScript tests under `src/test` with filenames ending in `.spec.ts`.
Replace `scaffold.spec.ts` when you add the first real suite so the placeholder cannot mask missing test discovery.
Tests compile to `lib/test` and run through the standard `test:mocha` and `test:mocha:esm` scripts.
The workspace and client CI discover this package without a separate feed or pipeline registration.

Add only the DDS factories, fuzz utilities, and version-management dependencies that the new suites use, as `devDependencies`.
If a suite imports generated test-only exports from another package, add the required build-task dependency with that suite.
Mixed-version loading, version selection, and DDS-specific helpers belong with that later implementation, not this scaffold.
