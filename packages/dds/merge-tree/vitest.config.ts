/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — coverage pilot for packages/dds/merge-tree.
 * See packages/dds/tree/vitest.config.ts for the longer rationale.
 *
 *   pnpm --filter @fluidframework/merge-tree run test:coverage:vitest
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
			// Perf suite: @fluid-tools/benchmark needs mocha's test context.
			"src/test/**/*.perf.spec.ts",
			// Farm suites chain `.timeout(...)` on `it()`, which vitest doesn't support.
			"src/test/**/*Farm.spec.ts",
			// Property-based test that uses mocha-context APIs.
			"src/test/beastTest.spec.ts",
			"src/test/**/*.fuzz.spec.ts",
			"src/test/**/*.bench.ts",
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
