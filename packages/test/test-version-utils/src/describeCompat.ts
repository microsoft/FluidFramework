/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createChildLogger } from "@fluidframework/telemetry-utils";
import { getUnexpectedLogErrorException, ITestObjectProvider } from "@fluidframework/test-utils";
import { assert } from "@fluidframework/core-utils";
import { CompatKind, driver, r11sEndpointName, tenantIndex } from "../compatOptions.cjs";
import { CompatConfig, configList, mochaGlobalSetup } from "./compatConfig.js";
import {
	getVersionedTestObjectProviderFromApis,
	getCompatVersionedTestObjectProviderFromApis,
} from "./compatUtils.js";
import { baseVersion, testBaseVersion } from "./baseVersion.js";
import {
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getLoaderApi,
	CompatApis,
	getDriverApi,
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
) {
	return function (this: Mocha.Suite) {
		let configs = configList.value;
		if (compatFilter !== undefined) {
			configs = configs.filter((value) => compatFilter.includes(value.kind));
		}

		for (const config of configs) {
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
			baseVersion,
			config.createWith.base,
			/** adjustMajorPublic */ true,
		);
		const dataRuntimeForLoading = getDataRuntimeApi(
			baseVersion,
			config.loadWith.base,
			/** adjustMajorPublic */ true,
		);
		return {
			containerRuntime: getContainerRuntimeApi(
				baseVersion,
				config.createWith.base,
				/** adjustMajorPublic */ true,
			),
			containerRuntimeForLoading: getContainerRuntimeApi(
				baseVersion,
				config.loadWith.base,
				/** adjustMajorPublic */ true,
			),
			dataRuntime,
			dataRuntimeForLoading,
			dds: dataRuntime.dds,
			ddsForLoading: dataRuntimeForLoading.dds,
			driver: getDriverApi(
				baseVersion,
				config.createWith.base,
				/** adjustMajorPublic */ true,
			),
			driverForLoading: getDriverApi(
				baseVersion,
				config.loadWith.base,
				/** adjustMajorPublic */ true,
			),
			loader: getLoaderApi(
				baseVersion,
				config.createWith.base,
				/** adjustMajorPublic */ true,
			),
			loaderForLoading: getLoaderApi(
				baseVersion,
				config.loadWith.base,
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
	tests: (
		this: Mocha.Suite,
		provider: (options?: ITestObjectProviderOptions) => ITestObjectProvider,
		apis: CompatApis,
	) => void,
) => Mocha.Suite | void;

/**
 * @internal
 */
export type DescribeCompat = DescribeCompatSuite &
	Record<"skip" | "only" | "noCompat", DescribeCompatSuite>;

function createCompatDescribe(compatFilter?: CompatKind[]): DescribeCompat {
	const d: DescribeCompat = (name, tests) =>
		describe(name, createCompatSuite(tests, compatFilter));
	d.skip = (name, tests) => describe.skip(name, createCompatSuite(tests, compatFilter));
	d.only = (name, tests) => describe.only(name, createCompatSuite(tests, compatFilter));
	d.noCompat = (name, tests) => describe(name, createCompatSuite(tests, [CompatKind.None]));
	return d;
}

/**
 * @internal
 */
export const describeNoCompat: DescribeCompat = createCompatDescribe([CompatKind.None]);

/**
 * @internal
 */
export const describeLoaderCompat: DescribeCompat = createCompatDescribe([
	CompatKind.None,
	CompatKind.Loader,
]);

/**
 * @internal
 */
export const describeFullCompat: DescribeCompat = createCompatDescribe();
