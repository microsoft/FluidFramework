/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — *coverage pilot* for packages/runtime/container-runtime.
 *
 * Mocha remains the canonical test runner for this package (see .mocharc.cjs
 * and the `test:mocha*` scripts in package.json). Vitest is added here solely
 * to produce code-coverage reports via the v8 coverage provider, as a pilot
 * replacement for the c8-based `test:coverage` script whose performance
 * regressed on Node 22/24 and caused it to be disabled in CI (see
 * tools/pipelines/build-client.yml, testCoverage: false).
 *
 * Run with:
 *   pnpm --filter @fluidframework/container-runtime run build   # required before each run
 *   pnpm --filter @fluidframework/container-runtime run test:coverage:vitest
 * Output lands in `nyc/report-vitest/` (the existing `clean` script rimrafs
 * the whole `nyc` directory, so no clean-script change is needed).
 *
 * We run the compiled `lib/**` output rather than `src/**` TypeScript for
 * consistency with the tree pilot (see packages/dds/tree/vitest.config.ts for
 * the longer rationale — OXC's TS→JS transform doesn't lower every modern TS
 * feature that tsc emits, and running the tsc output sidesteps a class of
 * loader errors). The v8 coverage provider follows source maps back to
 * `src/**` for line-accurate reporting.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	// FF test-only subpath exports (e.g. `./internal/test/containerRuntime`) are gated
	// behind the `allow-ff-test-exports` export condition. Mocha enables this via
	// `--conditions=allow-ff-test-exports` in @fluid-internal/mocha-test-setup's
	// node-options. Vite has its own resolver and does not honour Node's --conditions
	// flag; vitest runs in an SSR-style environment, so we declare the condition via
	// `ssr.resolve.conditions` and mirror it at top-level.
	resolve: {
		conditions: ["allow-ff-test-exports"],
	},
	ssr: {
		resolve: {
			conditions: ["allow-ff-test-exports"],
		},
	},
	test: {
		globals: true,
		// Shared mocha-compat shim — see file for details. Lives in build-common
		// because it's re-used across every FF coverage-pilot package.
		setupFiles: ["../../../common/build/build-common/vitest-test-setup.mjs"],

		// Fresh worker process per test file — mirrors tree's handling of leaky
		// test providers (mocharc sets --exit here for the same reason).
		pool: "forks",
		isolate: true,

		testTimeout: 60_000,
		hookTimeout: 60_000,

		include: ["lib/test/**/*.{test,spec}.js"],
		exclude: [
			"**/node_modules/**",
			"src/**",
			"dist/**",
			// Fuzz suites use describeFuzz/describeStress, whose createSuite wrapper
			// calls `this.timeout(...)` at suite (describe) scope. Under strict-ESM
			// vitest, describe callbacks run with `this === undefined`, so the call
			// throws at module load. Excluding wholesale.
			"lib/test/fuzz/**",
			"lib/test/**/*.fuzz.spec.js",
			"lib/test/**/*.bench.js",
			// Benchmark suites: @fluid-tools/benchmark needs mocha's test context
			// (`fullTitle`) to emit results — undefined under vitest.
			"lib/test/**/*.perf.spec.js",
		],

		coverage: {
			provider: "v8",
			reporter: ["text", "html", "cobertura"],
			reportsDirectory: "nyc/report-vitest",
			reportOnFailure: true,
			// v8 collects from the running JS in `lib/**` and follows source maps
			// back to `src/**/*.ts`. List both so the provider sees everything, then
			// exclude tests and declaration files from reporting.
			include: ["src/**/*.ts", "lib/**/*.js"],
			exclude: [
				"src/test/**",
				"lib/test/**",
				"src/**/*.d.ts",
				"lib/**/*.d.ts",
				"src/**/index.ts",
				"lib/**/index.js",
			],
			all: true,
			clean: true,
		},
	},
});
