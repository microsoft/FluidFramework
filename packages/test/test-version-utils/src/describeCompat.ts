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

/**
 * Alias for `() => T` to make it clear that the return value may change over the course of test execution.
 */
type ReadonlyMutableState<T> = () => T;

export function createTestObjectProviderLifecycleHooks(
	providerFactory: () => Promise<ITestObjectProvider>,
	getResetAfterEach: ReadonlyMutableState<boolean>,
	initializeTimeout?: number,
): ReadonlyMutableState<ITestObjectProvider> {
	let currentProvider: ITestObjectProvider | undefined;
	const getProvider = () => {
		if (currentProvider === undefined) {
			throw new Error("Provider is only accessible during mocha hooks or test execution.");
		}
		return currentProvider;
	};

	before("Create TestObjectProvider", async function () {
		if (initializeTimeout !== undefined) {
			const timeout = this.timeout();
			// timeout 0 indicates no timeout and explicitly changing it can interrupt debugging flows.
			this.timeout(timeout === 0 ? 0 : initializeTimeout);
		}
		try {
			currentProvider = await providerFactory();
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
			get: () => currentProvider,
			configurable: true,
		});
	});

	afterEach("Verify container telemetry", function (done: Mocha.Done) {
		const provider = getProvider();
		const logErrors = getUnexpectedLogErrorException(provider.tracker);
		// if the test failed for another reason
		// then we don't need to check errors
		// and fail the after each as well.
		// This also avoids failing tests that are skipped from inside the test body, which is
		// a pattern we use to only run tests on certain drivers.
		if (this.currentTest?.state === "passed") {
			done(logErrors);
		} else {
			done();
		}
	});

	afterEach("Reset TestObjectProvider", () => {
		if (getResetAfterEach()) {
			const provider = getProvider();
			provider.reset();
		}
	});

	// Mocha contexts are long-lived, and leaking the testObjectProvider on them severely eats into
	// memory over the course of our e2e tests. This is especially bad for local server, where the
	// server ends up retaining direct references to containers. This hook resolves that issue by explicitly
	// removing retainers for the test object provider from the context.
	// A good way to test memory impact of changes here is by doing one of:
	// - Put an existing e2e test's `it` block in a loop to create many copies of it and run only this test
	// - Put a single test in a `describeCompat` block and put the `describeCompat` block in a loop
	// then taking heap snapshots over the course of various runs.
	// Because of things like the summarizer process, containers may not be GC'd as soon as tests are done executing,
	// but you should see the total number of retained containers as well as server objects stabilize over time rather than grow.
	// Heap snapshots for a large number of tests within a single suite help detect bugs with leaking objects while a suite executes,
	// which is problematic for suites that run a large number of test cases (usually combintorially generated).
	// Heap snapshots for a large number of suites help detect bugs with leaking objects across suites,
	// which is problematic for issues that tend to get hit "later in the overall test run".
	after("Cleanup TestObjectProvider", function () {
		const provider = getProvider();
		provider.driver.dispose?.();
		currentProvider = undefined;
		Object.defineProperty(this, "__fluidTestProvider", {
			get: () => {
				throw new Error("Attempted to use __fluidTestProvider after test suite disposed.");
			},
		});
	});

	return getProvider;
}

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
				const apis: CompatApis = getVersionedApis(config);
				const providerFactory = async (): Promise<ITestObjectProvider> =>
					config.kind === CompatKind.CrossClient
						? // Awaiting the return gives a clearer stack trace.
							// eslint-disable-next-line @typescript-eslint/return-await
							await getCompatVersionedTestObjectProviderFromApis(apis, {
								type: driver,
								config: {
									r11s: { r11sEndpointName },
									odsp: { tenantIndex, odspEndpointName },
								},
							})
						: // eslint-disable-next-line @typescript-eslint/return-await
							await getVersionedTestObjectProviderFromApis(apis, {
								type: driver,
								config: {
									r11s: { r11sEndpointName },
									odsp: { tenantIndex, odspEndpointName },
								},
							});

				let resetAfterEach: boolean = true;
				const getProvider = createTestObjectProviderLifecycleHooks(
					providerFactory,
					() => resetAfterEach,
				);

				tests.bind(this)((options?: ITestObjectProviderOptions) => {
					resetAfterEach = options?.resetAfterEach ?? true;
					const provider = getProvider();
					if (options?.syncSummarizer === true) {
						provider.resetLoaderContainerTracker(true /* syncSummarizerClients */);
					}
					if (options?.persistedCache !== undefined && provider.driver.type === "odsp") {
						(provider.driver as OdspTestDriver).setPersistedCache(options.persistedCache);
					}
					return provider;
				}, apis);
			});
		}
	};
}

/**
 * Get versioned APIs for the given config.
 */
function getVersionedApis(config: CompatConfig): CompatApis {
	// If this is cross-clients compat scenario, make sure we use the correct versions
	if (config.kind === CompatKind.CrossClient) {
		assert(
			config.createVersion !== undefined,
			"createVersion must be defined for cross-client tests",
		);
		assert(
			config.loadVersion !== undefined,
			"loadVersion must be defined for cross-client tests",
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
