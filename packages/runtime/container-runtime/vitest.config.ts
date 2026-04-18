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
 *   pnpm --filter @fluidframework/container-runtime run test:coverage:vitest
 *
 * Vitest runs directly on source TypeScript via its esbuild transform — no
 * prior build step required. (The `tree` pilot uniquely runs against `lib/**`
 * because OXC currently lacks lowering for the `@breakingClass`/`@breakingMethod`
 * decorators used there; see packages/dds/tree/vitest.config.ts.)
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	// FF test-only subpath exports (e.g. `./internal/test/containerRuntime`) are
	// gated behind the `allow-ff-test-exports` export condition. Mocha enables
	// this via Node's --conditions flag; vite has its own resolver, so declare
	// the condition at both top level and under `ssr`.
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
		setupFiles: ["../../../common/build/build-common/vitest-test-setup.mjs"],

		// Fresh worker process per test file — tolerant of leaky test providers
		// (mocharc sets --exit for the same reason, AB#7856).
		pool: "forks",
		isolate: true,

		testTimeout: 60_000,
		hookTimeout: 60_000,

		include: ["src/test/**/*.{test,spec}.ts"],
		exclude: [
			"**/node_modules/**",
			"lib/**",
			"dist/**",
			// Fuzz/stress suites: describeFuzz/describeStress helpers call
			// `this.timeout(...)` at suite scope, which throws under strict-ESM
			// vitest (describe callbacks have `this === undefined`).
			"src/test/fuzz/**",
			"src/test/**/*.fuzz.spec.ts",
			// Benchmark suites: @fluid-tools/benchmark needs mocha's test context.
			"src/test/**/*.perf.spec.ts",
			"src/test/**/*.bench.ts",
		],

		coverage: {
			provider: "v8",
			reporter: ["text", "html", "cobertura"],
			reportsDirectory: "nyc/report-vitest",
			reportOnFailure: true,
			include: ["src/**/*.ts"],
			exclude: [
				"src/test/**",
				"src/**/*.d.ts",
				// Barrel files are noise in a coverage report.
				"src/**/index.ts",
			],
			all: true,
			clean: true,
		},
	},
});
