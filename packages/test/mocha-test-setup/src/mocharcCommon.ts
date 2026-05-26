/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-nodejs-modules
import { readFileSync } from "node:fs";
// eslint-disable-next-line import-x/no-nodejs-modules
import path from "node:path";
// eslint-disable-next-line import-x/no-nodejs-modules
import { fileURLToPath } from "node:url";

/**
 * Mocha configuration object returned by {@link getFluidTestMochaConfig}.
 */
export interface FluidTestMochaConfig {
	recursive: boolean;
	require: string[];
	"unhandled-rejections": string;
	"fail-zero": boolean;
	ignore: string[];
	"node-option": string[];
	spec: string;
	timeout?: number | string;
	fgrep?: string[];
	reporter?: string;
	reporterOptions?: string[];
	"reporter-options"?: string[];
	"forbid-only"?: boolean;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get the mocha configuration for running tests using the conventions followed in the Fluid Framework repository.
 *
 * @param packageDir - the directory of the package, typically set using `__dirname`
 * @param additionalRequiredModules - modules to require in addition to the standard set.
 * @param testReportPrefix - prefix for the test output report file names.
 * @remarks
 * Additional configuration can be provided via environment variables: see {@link file://./README.md}.
 *
 * Users desiring exact control over the `spec` from the CLI should delete or replace the spec from the returned config, since mocha's behavior is to extend it, not override it.
 */
export function getFluidTestMochaConfig(
	packageDir: string,
	additionalRequiredModules?: string[],
	testReportPrefix?: string,
): FluidTestMochaConfig {
	const requiredModules = [
		// General mocha setup e.g. suppresses console.log,
		// This has to be before others (except logger) so that registerMochaTestWrapperFuncs is available
		"@fluid-internal/mocha-test-setup",
		"source-map-support/register",
		...(additionalRequiredModules ?? []),
	];

	if (process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER !== undefined) {
		// Inject implementation of createTestLogger, put it first before mocha-test-setup
		requiredModules.unshift(process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER);
	}

	let reportPrefix = testReportPrefix;
	let defaultSpec = "lib/test";
	if (process.env.FLUID_TEST_MODULE_SYSTEM === "CJS") {
		defaultSpec = "dist/test";
		const testVariant = process.env.FLUID_TEST_VARIANT;
		process.env.FLUID_TEST_VARIANT = testVariant !== undefined ? `CJS,${testVariant}` : "CJS";
		reportPrefix = reportPrefix !== undefined ? `${reportPrefix}-CJS` : "CJS";
	}

	const config: FluidTestMochaConfig = {
		"recursive": true,
		"require": requiredModules,
		"unhandled-rejections": "strict",
		// Fail the test run if no tests are found/run. This catches cases where test files fail to
		// load silently (e.g. due to broken imports), which would otherwise produce a green "0 passing"
		// result with exit code 0.
		"fail-zero": true,
		ignore: [
			// Ignore "tools" which are scripts intended to be run, not part of the test suite.
			"**/*.tool.{js,cjs,mjs}",
		],
		"node-option": [
			// Allow test-only indexes to be imported. Search the FF repo for package.json files with this condition to see example usage.
			"conditions=allow-ff-test-exports",
			// Performance tests benefit from having access to GC, and memory tests require it.
			// Exposing it here avoids all packages which do perf testing from having to expose it.
			// Note that since "node-option" is explicitly set,
			// these must be provided here and not via mocha's --v8-expose-gc.
			"expose-gc",
		],
		spec: process.env.MOCHA_SPEC ?? defaultSpec,
	};

	// This approach to checking for this flag is consistent with some (but not all) others in this file,
	// but not with tools/benchmark/src/Configuration.ts.
	// For now, undefined, "1" and "true" should work consistently across all known use, and "1" is the main form we explicitly use.
	// All these should be made to match, see AB#69054.
	if (process.env.FLUID_TEST_PERF_MODE !== undefined) {
		if (process.env.SILENT_TEST_OUTPUT === undefined) {
			console.log(`Running performance tests...`);
		}

		// Some perf tests are often quite slow, and we don't want to lose the data by hitting a timeout.
		// This is 1000 seconds, so ~16 minutes.
		// This can be overridden by setting FLUID_TEST_TIMEOUT to a different value if desired.
		config.timeout = 1_000_000;

		// If there is no filter specified, limit to benchmarks.
		// If mocha allowed multiple filters to all be applied to further narrow results, we would do this unconditionally.
		if (!(process.argv.includes("--fgrep") || process.argv.includes("--grep"))) {
			config.fgrep = ["@Benchmark"];
		}

		config.reporter = "@fluid-tools/benchmark/dist/mocha/Reporter.js";
		if (!process.argv.includes("--reporterOptions")) {
			// If report options were not specified, default to:
			config.reporterOptions = ["reportFile=./benchmarkOutput.json"];
		}
	} else {
		const packageJsonPath = path.join(packageDir, "package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			name: string;
		};
		config.reporter = `mocha-multi-reporters`;
		// See https://www.npmjs.com/package/mocha-multi-reporters#cmroutput-option
		const outputFilePrefix = reportPrefix !== undefined ? `${reportPrefix}-` : "";
		if (process.env.SILENT_TEST_OUTPUT === undefined) {
			console.log(
				`Writing test results relative to package to nyc/${outputFilePrefix}junit-report.xml`,
			);
		}
		const suiteName =
			reportPrefix !== undefined
				? `${packageJson.name} - ${reportPrefix}`
				: packageJson.name;
		config["reporter-options"] = [
			`configFile=${path.join(
				currentDir,
				"..",
				"test-config.json",
			)},cmrOutput=xunit+output+${outputFilePrefix}:xunit+suiteName+${suiteName}`,
		];
	}

	if (process.env.FLUID_TEST_TIMEOUT !== undefined) {
		config.timeout = process.env.FLUID_TEST_TIMEOUT;
	}

	if (process.env.FLUID_TEST_FORBID_ONLY !== undefined) {
		config["forbid-only"] = true;
	}

	return config;
}
