/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Vitest configuration — *coverage pilot* for packages/loader/container-loader.
 *
 * Mocha remains the canonical test runner for this package (see .mocharc.cjs
 * and the `test:mocha*` scripts in package.json). Vitest is added here solely
 * to produce code-coverage reports via the v8 coverage provider, as a pilot
 * replacement for the c8-based `test:coverage` script whose performance
 * regressed on Node 22/24 and caused it to be disabled in CI (see
 * tools/pipelines/build-client.yml, testCoverage: false).
 *
 * Run with:
 *   pnpm --filter @fluidframework/container-loader run build   # required
 *   pnpm --filter @fluidframework/container-loader run test:coverage:vitest
 *
 * Output lands in `nyc/report-vitest/` (the existing `clean` script rimrafs
 * the whole `nyc` directory, so no clean-script change is needed).
 *
 * We run the compiled `lib/**` output rather than `src/**` TypeScript for
 * consistency with the other FF coverage-pilot packages (see
 * packages/dds/tree/vitest.config.ts for the longer rationale). The v8
 * coverage provider follows source maps back to `src/**` for line-accurate
 * reporting.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	// FF test-only subpath exports (e.g. `./internal/test/container`) are gated
	// behind the `allow-ff-test-exports` export condition. Mocha enables this
	// via Node's --conditions flag; vite has its own resolver, so declare the
	// condition explicitly here and under `ssr`.
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

		// Fresh worker process per test file — consistent with other pilots and
		// tolerant of leaky test providers (mocharc sets --exit for the same
		// reason, AB#7856).
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
