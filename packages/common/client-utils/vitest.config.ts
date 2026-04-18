/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — coverage pilot for packages/common/client-utils.
 * See packages/dds/tree/vitest.config.ts for the longer rationale.
 *
 *   pnpm --filter @fluid-internal/client-utils run test:coverage:vitest
 *
 * Vitest runs directly on source TypeScript via its esbuild transform — no
 * prior build step required.
 *
 * This package has a separate jest suite under `src/test/jest/**`; vitest
 * only covers the mocha suite under `src/test/mocha/**`. Jest coverage is
 * out of scope for this pilot.
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
		// Only the mocha suite; jest tests use their own harness.
		include: ["src/test/mocha/**/*.{test,spec}.ts"],
		exclude: [
			"**/node_modules/**",
			"lib/**",
			"dist/**",
			"src/test/jest/**",
			"src/test/**/*.fuzz.spec.ts",
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
				"src/**/index.ts",
			],
			all: true,
			clean: true,
		},
	},
});
