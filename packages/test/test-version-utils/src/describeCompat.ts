/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OdspTestDriver } from "@fluid-private/test-drivers";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IPersistedCache } from "@fluidframework/odsp-driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	getUnexpectedLogErrorException,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

import { testBaseVersion } from "./baseVersion.js";
import {
	CompatConfig,
	configList,
	isCompatVersionBelowMinVersion,
	mochaGlobalSetup,
	isOdspCompatCompliant,
} from "./compatConfig.js";
import {
	CompatKind,
	driver,
	odspEndpointName,
	r11sEndpointName,
	tenantIndex,
} from "./compatOptions.js";
import {
	getVersionedTestObjectProviderFromApis,
	getCompatVersionedTestObjectProviderFromApis,
} from "./compatUtils.js";
import {
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getLoaderApi,
	CompatApis,
	getDriverApi,
} from "./testApi.js";
import { getRequestedVersion } from "./versionUtils.js";

// See doc comment on mochaGlobalSetup.
await mochaGlobalSetup();

/*
 * Mocha Utils for test to generate the compat variants.
 */
function createCompatSuite(
	tests: (
		this: Mocha.Suite,
		provider: (options?: ITestObjectProviderOptions) => ITestObjectProvider,
		apis: CompatApis,
	) => void,
	compatFilter?: CompatKind[],
	minVersion?: string,
): (this: Mocha.Suite) => void {
	return function (this: Mocha.Suite) {
		let configs = configList.value;
		if (compatFilter !== undefined) {
			configs = configs.filter((value) => compatFilter.includes(value.kind));
		}

		for (const config of configs) {
			if (minVersion && isCompatVersionBelowMinVersion(minVersion, config)) {
				// skip current config if compat version is below min version supported for test suite
				continue;
			}
			if (driver === "odsp" && !isOdspCompatCompliant(config)) {
				continue;
			}
			describe(config.name, function () {
				let provider: ITestObjectProvider | undefined;
				let resetAfterEach: boolean;
				const apis: CompatApis = getVersionedApis(config);

				before("Create TestObjectProvider", async function () {
					try {
						provider =
							config.kind === CompatKind.CrossVersion
								? await getCompatVersionedTestObjectProviderFromApis(apis, {
										type: driver,
										config: {
											r11s: { r11sEndpointName },
											odsp: { tenantIndex, odspEndpointName },
										},
									})
								: await getVersionedTestObjectProviderFromApis(apis, {
										type: driver,
										config: {
											r11s: { r11sEndpointName },
											odsp: { tenantIndex, odspEndpointName },
										},
									});
					} catch (error) {
						const logger = createChildLogger({
							logger: getTestLogger?.(),
							namespace: "DescribeCompatSetup",
						});
						logger.sendErrorEvent(
							{
								eventName: "TestObjectProviderLoadFailed",
								driverType: driver,
							},
							error,
						);
						throw error;
					}

					Object.defineProperty(this, "__fluidTestProvider", {
						get: () => provider,
						configurable: true,
					});
				});

				tests.bind(this)((options?: ITestObjectProviderOptions) => {
					resetAfterEach = options?.resetAfterEach ?? true;
					if (provider === undefined) {
						throw new Error("Expected provider to be set up by before hook");
					}
					if (options?.syncSummarizer === true) {
						provider.resetLoaderContainerTracker(true /* syncSummarizerClients */);
					}
					if (options?.persistedCache !== undefined && provider.driver.type === "odsp") {
						(provider.driver as OdspTestDriver).setPersistedCache(options.persistedCache);
					}
					return provider;
				}, apis);

				afterEach("Reset TestObjectProvider", () => {
					if (provider === undefined) {
						throw new Error("Expected provider to be set up by before hook");
					}
					if (resetAfterEach) {
						provider.reset();
					}
				});

				afterEach("Verify container telemetry", function (done: Mocha.Done) {
					if (provider === undefined) {
						throw new Error("Expected provider to be set up by before hook");
					}
					const logErrors = getUnexpectedLogErrorException(provider.tracker);
					// if the test failed for another reason
					// then we don't need to check errors
					// and fail the after each as well
					if (this.currentTest?.state === "passed") {
						done(logErrors);
					} else {
						done();
					}
				});

				// Mocha contexts are long-lived, and leaking the testObjectProvider on them severely eats into
				// memory over the course of our e2e tests. This is especially the case for local server, where the
				// server ends up retaining direct references to containers. This hook resolves that issue by explicitly
				// removing retainers for the test object provider from the context.
				// A good way to test memory impact of changes here is by doing one of:
				// - Put an existing e2e test's `it` block in a loop to create many copies of it and run only this test
				// - Put a single test in a `describeCompat` block and put the `describeCompat` block in a loop
				// then taking heap snapshots over the course of various runs.
				// Because of things like the summarizer process, container cleanup as soon as tests are done executing is not reasonable,
				// but you should see the total number of retained containers as well as server objects stabilize over time rather than grow.
				// Snapshots for a large number of tests within a single suite help detect bugs with leaking objects while a suite executes,
				// which is problematic for suites that run a large number of test cases (usually combintorially generated).
				// Snapshots for a large number of suites help detect bugs with leaking objects across suites,
				// which is problematic for issues that tend to get hit "later in the overall test run".
				after("Cleanup TestObjectProvider", function () {
					if (provider === undefined) {
						throw new Error("Expected provider to be set up by before hook");
					}
					provider.driver.dispose?.();
					provider = undefined;
					Object.defineProperty(this, "__fluidTestProvider", {
						get: () => {
							throw new Error(
								"Attempted to use __fluidTestProvider after test suite disposed.",
							);
						},
					});
				});
			});
		}
	};
}

/**
 * Get versioned APIs for the given config.
 */
function getVersionedApis(config: CompatConfig): CompatApis {
	// If this is cross version compat scenario, make sure we use the correct versions
	if (config.kind === CompatKind.CrossVersion) {
		assert(
			config.createVersion !== undefined,
			"createVersion must be defined for cross version tests",
		);
		assert(
			config.loadVersion !== undefined,
			"loadVersion must be defined for cross version tests",
		);

		const dataRuntime = getDataRuntimeApi(config.createVersion);
		const dataRuntimeForLoading = getDataRuntimeApi(config.loadVersion);
		return {
			containerRuntime: getContainerRuntimeApi(config.createVersion),
			containerRuntimeForLoading: getContainerRuntimeApi(config.loadVersion),
			dataRuntime,
			dataRuntimeForLoading,
			dds: dataRuntime.dds,
			ddsForLoading: dataRuntimeForLoading.dds,
			driver: getDriverApi(config.createVersion),
			driverForLoading: getDriverApi(config.loadVersion),
			loader: getLoaderApi(config.createVersion),
			loaderForLoading: getLoaderApi(config.loadVersion),
		};
	}

	const dataRuntimeApi = getDataRuntimeApi(
		getRequestedVersion(testBaseVersion(config.dataRuntime), config.dataRuntime),
	);
	return {
		containerRuntime: getContainerRuntimeApi(
			getRequestedVersion(testBaseVersion(config.containerRuntime), config.containerRuntime),
		),
		dataRuntime: dataRuntimeApi,
		dds: dataRuntimeApi.dds,
		driver: getDriverApi(getRequestedVersion(testBaseVersion(config.driver), config.driver)),
		loader: getLoaderApi(getRequestedVersion(testBaseVersion(config.loader), config.loader)),
	};
}

/**
 * @internal
 */
export interface ITestObjectProviderOptions {
	/** If true, resets all state after each test completes. */
	resetAfterEach?: boolean;
	/** If true, synchronizes summarizer client as well when ensureSynchronized() is called. */
	syncSummarizer?: boolean;
	/** Persisted Cache provided by ODSP */
	persistedCache?: IPersistedCache;
}

/**
 * @internal
 */
export type DescribeCompatSuite = (
	name: string,
	compatVersion: CompatType,
	tests: (
		this: Mocha.Suite,
		provider: (options?: ITestObjectProviderOptions) => ITestObjectProvider,
		apis: CompatApis,
	) => void,
) => Mocha.Suite | void;

/**
 * @internal
 */
export type DescribeCompat = DescribeCompatSuite & {
	/**
	 * Like Mocha's `describe.skip`, but for compat tests.
	 */
	skip: DescribeCompatSuite;

	/**
	 * Like Mocha's `describe.only`, but for compat tests.
	 */
	only: DescribeCompatSuite;

	/**
	 * Run the test suite ignoring the compatibility matrix. In other words, all Fluid layers will
	 * reference the current code version.
	 *
	 * This is meant as a debug utility for e2e tests: do not check in tests that use it as they won't have any
	 * compat coverage (attempting to do so will fail the PR gate anyway).
	 */
	noCompat: DescribeCompatSuite;
};

/** @internal */
export type CompatType = "FullCompat" | "LoaderCompat" | "NoCompat";

function createCompatDescribe(): DescribeCompat {
	const createCompatSuiteWithDefault = (
		tests: (this: Mocha.Suite, provider: () => ITestObjectProvider, apis: CompatApis) => void,
		compatVersion: CompatType,
	) => {
		switch (compatVersion) {
			case "FullCompat":
				return createCompatSuite(tests, undefined);
			case "LoaderCompat":
				return createCompatSuite(tests, [CompatKind.None, CompatKind.Loader]);
			case "NoCompat":
				return createCompatSuite(tests, [CompatKind.None]);
			default:
				unreachableCase(compatVersion, "unknown compat version");
		}
	};
	const d: DescribeCompat = (name: string, compatVersion: CompatType, tests) =>
		describe(name, createCompatSuiteWithDefault(tests, compatVersion));
	d.skip = (name, compatVersion: CompatType, tests) =>
		describe.skip(name, createCompatSuiteWithDefault(tests, compatVersion));

	d.only = (name, compatVersion: CompatType, tests) =>
		describe.only(name, createCompatSuiteWithDefault(tests, compatVersion));

	d.noCompat = (name, _, tests) =>
		describe(name, createCompatSuiteWithDefault(tests, "NoCompat"));

	return d;
}

/**
 * `describeCompat` expects 3 arguments (name: string, compatVersion: string, tests).
 * There are three compatVersion options to generate different combinations, depending of the need of the tests:
 * `FullCompat`: generate test variants with compat combinations that varies the version for all layers.
 * `LoaderCompat`: generate test variants with compat combinations that only varies the loader version.
 * Specific version (String) : specify a minimum compat version (e.g. "2.0.0-rc.1.0.0") which will be the minimum version a
 * test suite will test against. This should be equal to the value of pkgVersion at the time you're writing the new test suite.
 *
 * @internal
 */
export const describeCompat: DescribeCompat = createCompatDescribe();
