/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — coverage pilot for packages/runtime/runtime-utils.
 * See packages/dds/tree/vitest.config.ts for the longer rationale.
 *
 *   pnpm --filter @fluidframework/runtime-utils run build           # required
 *   pnpm --filter @fluidframework/runtime-utils run test:coverage:vitest
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
			"lib/test/**/*.fuzz.spec.js",
			"lib/test/**/*.perf.spec.js",
			"lib/test/**/*.bench.js",
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
