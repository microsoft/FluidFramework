# @fluid-internal/version-compat-tests

Private scaffold for in-process distributed data structure (DDS) version-compatibility fuzz tests.
It currently contains only a pending placeholder and provides no compatibility coverage.
It is not a reusable utility library or a service end-to-end test runner.

## Commands

Install workspace dependencies from the repository root, then run these commands from this directory:

| Command | Purpose |
| --- | --- |
| `pnpm build` | Compile tests and dependencies, lint, and check formatting. |
| `pnpm test` | Run compiled tests with the shared Mocha setup; build first. |
| `pnpm lint` | Run lint checks. |
| `pnpm format` | Format files. |
| `pnpm run clean` | Remove output, caches, and reports. |

## Adding compatibility suites

Add `.spec.ts` files under `src/test` and remove `scaffold.spec.ts` with the first real suite.
Tests compile to `lib/test`; the standard client CI discovers them through `test:mocha`.

Add only the DDS, fuzz, and version-management packages the suites use, as `devDependencies`.
Imports of generated test-only exports also require the corresponding build-task dependencies.
