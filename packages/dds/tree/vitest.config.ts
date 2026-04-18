/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — *coverage pilot* for packages/dds/tree.
 *
 * Mocha remains the canonical test runner for this package (see .mocharc.cjs
 * and the `test:mocha*` scripts in package.json). Vitest is added here solely
 * to produce code-coverage reports via the v8 coverage provider, as a pilot
 * replacement for the c8-based `test:coverage` script whose performance
 * regressed on Node 22/24 and caused it to be disabled in CI (see
 * tools/pipelines/build-client.yml, testCoverage: false).
 *
 * Run with:
 *   pnpm --filter @fluidframework/tree run build   # required before each run
 *   pnpm --filter @fluidframework/tree run test:coverage:vitest
 * Output lands in `nyc/report-vitest/` (the existing `clean` script rimrafs
 * the whole `nyc` directory, so no clean-script change is needed).
 *
 * Why we run the compiled `lib/**` output instead of `src/**` TypeScript:
 *   Vitest 4 uses OXC for TS→JS transforms, and OXC does not currently
 *   transpile standard-ES-decorator syntax into runtime helpers. Several files
 *   in this package (e.g. src/shared-tree-core/sharedTreeCore.ts) use the
 *   `@breakingClass`/`@breakingMethod` decorators from src/util/breakable.ts,
 *   which Node's VM cannot execute directly — you get `SyntaxError: Invalid
 *   or unexpected token` on load. tsc-compiled `lib/**` has already lowered
 *   decorators into runtime `__decorate` calls, so running that output
 *   sidesteps the issue entirely. The v8 coverage provider follows source
 *   maps back to `src/**` for line-accurate reporting.
 *
 *   Consequence: this config requires a build to have been run. The npm
 *   script `test:coverage:vitest` assumes tests have been compiled already.
 *
 * Caveats:
 * - Vitest runs a single ESM pass on the `lib/` build. Mocha in this package
 *   runs CJS, ESM, and --emulateProduction passes; that matters for coverage
 *   of module-loading behaviour, but not for line coverage — source lines
 *   execute the same way regardless of emitted module system.
 * - TestTreeProvider cleanup leaks (AB#7856) are handled here via
 *   `pool: 'forks'` with `isolate: true`, which tears down the worker process
 *   between test files. This avoids the `--exit` workaround mocha needs.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	// FF test-only subpath exports (e.g. `@fluidframework/id-compressor/internal/test-utils`)
	// are gated behind the `allow-ff-test-exports` export condition. Mocha enables this via
	// `--conditions=allow-ff-test-exports` in @fluid-internal/mocha-test-setup's node-options.
	// Vite has its own resolver and does not honour Node's --conditions flag; vitest runs in
	// an SSR-style environment, so we declare the condition via `ssr.resolve.conditions` (and
	// mirror it at top-level `resolve.conditions` for any client-side resolution that may occur).
	resolve: {
		conditions: ["allow-ff-test-exports"],
	},
	ssr: {
		resolve: {
			conditions: ["allow-ff-test-exports"],
		},
	},
	test: {
		// mocha-style describe/it/before/after globals. `before`/`after` alias
		// to vitest's `beforeAll`/`afterAll`, which matches mocha's suite-level
		// semantics.
		globals: true,
		// Shared mocha-compat shim — see file for details. Lives in build-common
		// because it's re-used across every FF coverage-pilot package.
		setupFiles: ["../../../common/build/build-common/vitest-test-setup.mjs"],

		// Fresh worker process per test file. Required to tolerate test files
		// that leak resources (AB#7856, TestTreeProvider) — the worker dies at
		// file boundary, so a leaking file can't stall the whole run.
		// vitest 4 moved `poolOptions` to top-level options; `isolate: true` is
		// the default, kept here for explicitness.
		pool: "forks",
		isolate: true,

		// Match the mocha default timeouts used by this package.
		testTimeout: 60_000,
		hookTimeout: 60_000,

		include: ["lib/test/**/*.{test,spec}.js"],
		exclude: [
			"**/node_modules/**",
			"src/**",
			"dist/**",
			// Perf suites require FLUID_TEST_PERF_MODE + the @fluid-tools/benchmark
			// mocha reporter, neither of which applies under vitest.
			"lib/test/memory/**",
			// Snapshot comparison infrastructure is mocha-specific.
			"lib/test/snapshots/**",
			"lib/test/**/*.bench.js",
			// Files below use describeFuzz/describeStress from @fluid-private/stochastic-test-utils
			// (directly or via wrappers). Those helpers call `this.timeout(...)` at *suite* scope
			// (mocha Suite context). Under strict-ESM vitest, describe callbacks run with
			// `this === undefined`, so the property access throws before vitest.setup.ts's
			// test-level shim can intervene. Porting these onto a vitest-compatible helper is out
			// of scope for the coverage pilot — accept the gap and revisit when it's expanded.
			"lib/test/shared-tree-core/edit-manager/editManagerCorrectness.test.js",
			"lib/test/feature-libraries/sequence-field/sequenceChangeRebaser.test.js",
			"lib/test/feature-libraries/sequence-field/sequenceField.spec.js",
			"lib/test/feature-libraries/optional-field/optionalChangeRebaser.test.js",
			"lib/test/feature-libraries/optional-field/optionalField.spec.js",
			"lib/test/shared-tree/fuzz/**",
			// Uses `it(...).timeout(15000)` — chains `.timeout()` on the return value of `it()`.
			// Vitest's `it()` doesn't return a chainable object, so this throws at module load.
			"lib/test/shared-tree/editing.spec.js",
		],

		coverage: {
			provider: "v8",
			reporter: ["text", "html", "cobertura"],
			reportsDirectory: "nyc/report-vitest",
			// Always emit the coverage report, even when some test files fail.
			// Useful while the pilot is still stabilising — we want to see what
			// _is_ covered even while iterating on fixes for the remaining
			// failures.
			reportOnFailure: true,
			// The v8 provider collects coverage from the running JS in `lib/**`
			// and follows its source maps back to `src/**/*.ts`. We list both
			// directories so the provider picks up the running files, then
			// exclude tests and tsc-emitted declaration files from reporting.
			include: ["src/**/*.ts", "lib/**/*.js"],
			exclude: [
				"src/test/**",
				"lib/test/**",
				"src/**/*.d.ts",
				"lib/**/*.d.ts",
				// Barrel files are noise in a coverage report.
				"src/**/index.ts",
				"lib/**/index.js",
			],
			all: true,
			clean: true,
		},
	},
});
