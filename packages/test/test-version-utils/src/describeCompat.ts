/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { ITestObjectProvider, getUnexpectedLogErrorException } from "@fluidframework/test-utils";
import { CompatKind, driver, r11sEndpointName, tenantIndex } from "../compatOptions.cjs";
import { testBaseVersion } from "./baseVersion.js";
import {
	CompatConfig,
	configList,
	isCompatVersionBelowMinVersion,
	mochaGlobalSetup,
} from "./compatConfig.js";
import {
	getCompatVersionedTestObjectProviderFromApis,
	getVersionedTestObjectProviderFromApis,
} from "./compatUtils.js";
import { pkgVersion } from "./packageVersion.js";
import {
	CompatApis,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	getLoaderApi,
} from "./testApi.js";

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
			describe(config.name, function () {
				let provider: ITestObjectProvider;
				let resetAfterEach: boolean;
				const apis: CompatApis = getVersionedApis(config);

				before(async function () {
					try {
						provider =
							config.kind === CompatKind.CrossVersion
								? await getCompatVersionedTestObjectProviderFromApis(apis, {
										type: driver,
										config: {
											r11s: { r11sEndpointName },
											odsp: { tenantIndex },
										},
								  })
								: await getVersionedTestObjectProviderFromApis(apis, {
										type: driver,
										config: {
											r11s: { r11sEndpointName },
											odsp: { tenantIndex },
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

					Object.defineProperty(this, "__fluidTestProvider", { get: () => provider });
				});

				tests.bind(this)((options?: ITestObjectProviderOptions) => {
					resetAfterEach = options?.resetAfterEach ?? true;
					if (options?.syncSummarizer === true) {
						provider.resetLoaderContainerTracker(true /* syncSummarizerClients */);
					}
					return provider;
				}, apis);

				afterEach(function (done: Mocha.Done) {
					const logErrors = getUnexpectedLogErrorException(provider.logger);
					// if the test failed for another reason
					// then we don't need to check errors
					// and fail the after each as well
					if (this.currentTest?.state === "passed") {
						done(logErrors);
					} else {
						done();
					}
					if (resetAfterEach) {
						provider.reset();
					}
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
			config.createWith !== undefined,
			"createWith must be defined for cross version tests",
		);
		assert(config.loadWith !== undefined, "loadWith must be defined for cross version tests");
		const dataRuntime = getDataRuntimeApi(
			config.createWith.base,
			config.createWith.delta,
			/** adjustMajorPublic */ true,
		);
		const dataRuntimeForLoading = getDataRuntimeApi(
			config.loadWith.base,
			config.loadWith.delta,
			/** adjustMajorPublic */ true,
		);
		return {
			containerRuntime: getContainerRuntimeApi(
				config.createWith.base,
				config.createWith.delta,
				/** adjustMajorPublic */ true,
			),
			containerRuntimeForLoading: getContainerRuntimeApi(
				config.loadWith.base,
				config.loadWith.delta,
				/** adjustMajorPublic */ true,
			),
			dataRuntime,
			dataRuntimeForLoading,
			dds: dataRuntime.dds,
			ddsForLoading: dataRuntimeForLoading.dds,
			driver: getDriverApi(
				config.createWith.base,
				config.createWith.delta,
				/** adjustMajorPublic */ true,
			),
			driverForLoading: getDriverApi(
				config.loadWith.base,
				config.loadWith.delta,
				/** adjustMajorPublic */ true,
			),
			loader: getLoaderApi(
				config.createWith.base,
				config.createWith.delta,
				/** adjustMajorPublic */ true,
			),
			loaderForLoading: getLoaderApi(
				config.loadWith.base,
				config.loadWith.delta,
				/** adjustMajorPublic */ true,
			),
		};
	}

	const dataRuntimeApi = getDataRuntimeApi(
		testBaseVersion(config.dataRuntime),
		config.dataRuntime,
	);
	return {
		containerRuntime: getContainerRuntimeApi(
			testBaseVersion(config.containerRuntime),
			config.containerRuntime,
		),
		dataRuntime: dataRuntimeApi,
		dds: dataRuntimeApi.dds,
		driver: getDriverApi(testBaseVersion(config.driver), config.driver),
		loader: getLoaderApi(testBaseVersion(config.loader), config.loader),
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
}

/**
 * @internal
 */
export type DescribeCompatSuite = (
	name: string,
	compatVersion: string,
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

function createCompatDescribe(): DescribeCompat {
	const createCompatSuiteWithDefault = (
		tests: (this: Mocha.Suite, provider: () => ITestObjectProvider, apis: CompatApis) => void,
		compatVersion: string,
	) => {
		switch (compatVersion) {
			case "FullCompat":
				return createCompatSuite(tests, undefined);
			case "LoaderCompat":
				return createCompatSuite(tests, [CompatKind.None, CompatKind.Loader]);
			case "NoCompat":
				return createCompatSuite(tests, [CompatKind.None]);
			default:
				return createCompatSuite(tests, undefined, compatVersion);
		}
	};
	const d: DescribeCompat = (name: string, compatVersion: string, tests) =>
		describe(name, createCompatSuiteWithDefault(tests, compatVersion));
	d.skip = (name, compatVersion, tests) =>
		describe.skip(name, createCompatSuiteWithDefault(tests, compatVersion));

	d.only = (name, compatVersion, tests) =>
		describe.only(name, createCompatSuiteWithDefault(tests, compatVersion));

	d.noCompat = (name, _, tests) =>
		describe(name, createCompatSuiteWithDefault(tests, pkgVersion));

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
