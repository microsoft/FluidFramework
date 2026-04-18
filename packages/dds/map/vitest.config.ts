/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — *coverage pilot* for packages/dds/map.
 *
 * Mocha remains the canonical test runner for this package (see .mocharc.cjs
 * and the `test:mocha*` scripts in package.json). Vitest is added here solely
 * to produce code-coverage reports via the v8 coverage provider, as a pilot
 * replacement for the c8-based `test:coverage` script whose performance
 * regressed on Node 22/24 and caused it to be disabled in CI (see
 * tools/pipelines/build-client.yml, testCoverage: false).
 *
 *   pnpm --filter @fluidframework/map run test:coverage:vitest
 *
 * Vitest runs directly on source TypeScript via its esbuild transform — no
 * prior build step required. (The `tree` pilot uniquely runs against `lib/**`
 * because OXC currently lacks lowering for the `@breakingClass`/`@breakingMethod`
 * decorators used there; see packages/dds/tree/vitest.config.ts.)
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
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

		pool: "forks",
		isolate: true,

		testTimeout: 60_000,
		hookTimeout: 60_000,

		include: ["src/test/**/*.{test,spec}.ts"],
		exclude: [
			"**/node_modules/**",
			"lib/**",
			"dist/**",
			// Perf/memory suites need FLUID_TEST_PERF_MODE and the benchmark
			// mocha reporter; not applicable under vitest.
			"src/test/memory/**",
			// Snapshot comparison infrastructure is mocha-specific.
			"src/test/snapshots/**",
			// `directory.snapshot.spec.ts` asserts that `_dirname` ends with
			// `(dist|lib)/test/mocha`, which fails when run against source.
			"src/test/**/*.snapshot.spec.ts",
			// directoryFuzzTests uses createDDSFuzzSuite (describe-scope this.timeout).
			"src/test/**/*FuzzTests.spec.ts",
			"src/test/**/*.fuzz.spec.ts",
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
				"src/**/index.ts",
			],
			all: true,
			clean: true,
		},
	},
});
