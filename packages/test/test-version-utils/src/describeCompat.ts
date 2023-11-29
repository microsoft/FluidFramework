/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createChildLogger } from "@fluidframework/telemetry-utils";
import {
	getUnexpectedLogErrorException,
	ITestObjectProvider,
	TestObjectProvider,
} from "@fluidframework/test-utils";
import { CompatKind, driver, r11sEndpointName, tenantIndex } from "../compatOptions.cjs";
import { configList, mochaGlobalSetup } from "./compatConfig.js";
import { getVersionedTestObjectProviderFromApis } from "./compatUtils.js";
import { testBaseVersion } from "./baseVersion.js";
import {
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getLoaderApi,
	CompatApis,
	getDriverApi,
} from "./testApi.js";
// See doc comment on mochaGlobalSetup.
await mochaGlobalSetup();

/**
 * @internal
 */
export type CompatVersionKind = "FullCompat" | "NoCompat" | "LoaderCompat";

/*
 * Mocha Utils for test to generate the compat variants.
 */
function createCompatSuite(
	tests: (this: Mocha.Suite, provider: () => ITestObjectProvider, apis: CompatApis) => void,
	compatFilter?: CompatKind[],
): (this: Mocha.Suite) => void {
	return function (this: Mocha.Suite) {
		let configs = configList.value;
		if (compatFilter !== undefined) {
			configs = configs.filter((value) => compatFilter.includes(value.kind));
		}

		for (const config of configs) {
			describe(config.name, function () {
				let provider: TestObjectProvider;
				let resetAfterEach: boolean;
				const dataRuntimeApi = getDataRuntimeApi(
					testBaseVersion(config.dataRuntime),
					config.dataRuntime,
				);
				const apis: CompatApis = {
					containerRuntime: getContainerRuntimeApi(
						testBaseVersion(config.containerRuntime),
						config.containerRuntime,
					),
					dataRuntime: dataRuntimeApi,
					dds: dataRuntimeApi.dds,
					driver: getDriverApi(testBaseVersion(config.driver), config.driver),
					loader: getLoaderApi(testBaseVersion(config.loader), config.loader),
				};

				before(async function () {
					try {
						provider = await getVersionedTestObjectProviderFromApis(apis, {
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
	compatVersionKind: CompatVersionKind,
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

function createCompatDescribe(): DescribeCompat {
	const createCompatSuiteWithDefault = (
		tests: (this: Mocha.Suite, provider: () => ITestObjectProvider, apis: CompatApis) => void,
		compatVersionKind: CompatVersionKind,
	) => {
		switch (compatVersionKind) {
			case "FullCompat":
				return createCompatSuite(tests, undefined);
			case "NoCompat":
				return createCompatSuite(tests, [CompatKind.None]);
			case "LoaderCompat":
				return createCompatSuite(tests, [CompatKind.None, CompatKind.Loader]);
			default:
				// TODO: support min version
				throw new Error("Option not supported");
		}
	};
	const d: DescribeCompat = (name: string, compatVersionKind: CompatVersionKind, tests) =>
		describe(name, createCompatSuiteWithDefault(tests, compatVersionKind));
	d.skip = (name, compatVersionKind, tests) =>
		describe.skip(name, createCompatSuiteWithDefault(tests, compatVersionKind));

	d.only = (name, compatVersionKind, tests) =>
		describe.only(name, createCompatSuiteWithDefault(tests, compatVersionKind));

	d.noCompat = (name, compatVersionKind, tests) =>
		describe(name, createCompatSuiteWithDefault(tests, "NoCompat"));

	return d;
}

/**
 * `describeCompat` expects 3 arguments (name: string, compatVersionKind: CompatVersionKind, tests).
 * There are three compatVersionKind options to generate different combinations, depending of the need of the tests:
 * `FullCompat`: generate test variants with compat combinations that varies the version for all layers.
 * `LoaderCompat`: generate test variants with compat combinations that only varies the loader version.
 * `NoCompat` - generate one test variant that doesn't varies version of any layers.
 * @internal
 */
export const describeCompat: DescribeCompat = createCompatDescribe();
