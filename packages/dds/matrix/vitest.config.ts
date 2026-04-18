/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — coverage pilot for packages/dds/matrix.
 * See packages/dds/tree/vitest.config.ts for the longer rationale.
 *
 *   pnpm --filter @fluidframework/matrix run test:coverage:vitest
 *
 * Vitest runs directly on source TypeScript via its esbuild transform — no
 * prior build step required.
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
			// Stress/fuzz/big suites use mocha-context APIs and/or
			// describeFuzz-style helpers that don't work under vitest.
			"src/test/**/*.stress.spec.ts",
			"src/test/**/*.fuzz.spec.ts",
			"src/test/**/*.big.spec.ts",
			"src/test/**/*.perf.spec.ts",
			"src/test/**/*.bench.ts",
			// Memory and time benchmarks use @fluid-tools/benchmark, which
			// needs mocha's test context.
			"src/test/memory/**",
			"src/test/time/**",
		],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "cobertura"],
			reportsDirectory: "nyc/report-vitest",
			reportOnFailure: true,
			include: ["src/**/*.ts"],
			exclude: ["src/test/**", "src/**/*.d.ts", "src/**/index.ts"],
			all: true,
			clean: true,
		},
	},
});
