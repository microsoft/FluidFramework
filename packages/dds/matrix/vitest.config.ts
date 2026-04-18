/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — coverage pilot for packages/dds/matrix.
 * See packages/dds/tree/vitest.config.ts for the longer rationale.
 *
 *   pnpm --filter @fluidframework/matrix run build           # required
 *   pnpm --filter @fluidframework/matrix run test:coverage:vitest
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
		include: ["lib/test/**/*.{test,spec}.js"],
		exclude: [
			"**/node_modules/**",
			"src/**",
			"dist/**",
			// Stress/fuzz/big suites use mocha-context APIs and/or
			// describeFuzz-style helpers that don't work under vitest.
			"lib/test/**/*.stress.spec.js",
			"lib/test/**/*.fuzz.spec.js",
			"lib/test/**/*.big.spec.js",
			"lib/test/**/*.perf.spec.js",
			"lib/test/**/*.bench.js",
			// Memory and time benchmarks use @fluid-tools/benchmark, which
			// needs mocha's test context.
			"lib/test/memory/**",
			"lib/test/time/**",
		],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "cobertura"],
			reportsDirectory: "nyc/report-vitest",
			reportOnFailure: true,
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
