/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getUnexpectedLogErrorException,
	ITestObjectProvider,
	TestObjectProvider,
} from "@fluidframework/test-utils/internal";

import { driver, odspEndpointName, r11sEndpointName, tenantIndex } from "./compatOptions.js";
import { getVersionedTestObjectProvider } from "./compatUtils.js";
import { ITestObjectProviderOptions } from "./describeCompat.js";
import { pkgVersion } from "./packageVersion.js";
import { ensurePackageInstalled, InstalledPackage } from "./testApi.js";

/**
 * Interface to hold the requested versions which should be installed
 * prior to running the test suite. The properties are cumulative, as all
 * versions deduced from all properties will be installed.
 *
 * @internal
 */
export interface IRequestedFluidVersions {
	/**
	 * Delta of versions to be installed with the current
	 * package version as the baseline.
	 */
	requestRelativeVersions?: number;
	/**
	 * Array of specific versions to be installed
	 */
	requestAbsoluteVersions?: string[];
}

const installRequiredVersions = async (config: IRequestedFluidVersions) => {
	const installPromises: Promise<InstalledPackage | undefined>[] = [];
	if (config.requestAbsoluteVersions !== undefined) {
		installPromises.push(
			...config.requestAbsoluteVersions.map(async (version) =>
				ensurePackageInstalled(version, 0, /* force */ false),
			),
		);
	}

	if (config.requestRelativeVersions !== undefined) {
		installPromises.push(
			ensurePackageInstalled(pkgVersion, config.requestRelativeVersions, /* force */ false),
		);
	}

	let hadErrors = false;
	for (const promise of installPromises) {
		try {
			await promise;
		} catch (e) {
			console.error(e);
			hadErrors = true;
		}
	}

	if (hadErrors) {
		throw new Error("Exceptions while installing package versions. Check STDERR");
	}
};

const defaultTimeoutMs = 180000; // 3 minutes
const defaultRequestedVersions: IRequestedFluidVersions = { requestRelativeVersions: -2 };

function createTestSuiteWithInstalledVersion(
	tests: (this: Mocha.Suite, provider: () => ITestObjectProvider) => void,
	requiredVersions: IRequestedFluidVersions = defaultRequestedVersions,
	timeoutMs: number = defaultTimeoutMs,
) {
	return function (this: Mocha.Suite) {
		let defaultProvider: TestObjectProvider;
		let resetAfterEach: boolean;
		before(async function () {
			this.timeout(Math.max(defaultTimeoutMs, timeoutMs));

			await installRequiredVersions(requiredVersions);
			defaultProvider = await getVersionedTestObjectProvider(
				pkgVersion, // baseVersion
				pkgVersion, // loaderVersion
				{
					type: driver,
					version: pkgVersion,
					config: {
						r11s: { r11sEndpointName },
						odsp: { tenantIndex, odspEndpointName },
					},
				}, // driverConfig
				pkgVersion, // runtimeVersion
				pkgVersion, // dataRuntimeVersion
			);

			Object.defineProperty(this, "__fluidTestProvider", { get: () => defaultProvider });
		});

		tests.bind(this)((options?: ITestObjectProviderOptions) => {
			resetAfterEach = options?.resetAfterEach ?? true;
			if (options?.syncSummarizer === true) {
				defaultProvider.resetLoaderContainerTracker(true /* syncSummarizerClients */);
			}

			return defaultProvider;
		});

		afterEach(function (done: Mocha.Done) {
			const logErrors = getUnexpectedLogErrorException(defaultProvider.tracker);
			// if the test failed for another reason
			// then we don't need to check errors
			// and fail the after each as well
			if (this.currentTest?.state === "passed") {
				done(logErrors);
			} else {
				done();
			}

			if (resetAfterEach) {
				defaultProvider.reset();
			}
		});
	};
}

/**
 * @internal
 */
export type DescribeSuiteWithVersions = (
	name: string,
	tests: (
		this: Mocha.Suite,
		provider: (options?: ITestObjectProviderOptions) => ITestObjectProvider,
	) => void,
) => Mocha.Suite | void;

/**
 * @internal
 */
export type DescribeWithVersions = DescribeSuiteWithVersions &
	Record<"skip" | "only", DescribeSuiteWithVersions>;

/**
 * Creates a test suite which will priorly install a set of requested Fluid versions for the tests to use.
 * The packages are installed before any test code runs, so it is guaranteed that the package is present
 * when the test code is invoked, including the top level scope inside the `describeInstallVersions` block.
 *
 * If package installation fails for any of the requested versions, the test suite will not be created and
 * the test run will fail.
 *
 * @param requestedVersions - See {@link IRequestedFluidVersions}.
 * If unspecified, the test will install the last 2 versions.
 * @param timeoutMs - the timeout for the tests in milliseconds, as package installation is time consuming.
 * If unspecified, the timeout is 20000 ms.
 * @returns A mocha test suite
 *
 * @internal
 */
export function describeInstallVersions(
	requestedVersions?: IRequestedFluidVersions,
	timeoutMs?: number,
): DescribeWithVersions {
	const d: DescribeWithVersions = (name, tests) =>
		describe(name, createTestSuiteWithInstalledVersion(tests, requestedVersions, timeoutMs));
	d.skip = (name, tests) =>
		describe.skip(
			name,
			createTestSuiteWithInstalledVersion(tests, requestedVersions, timeoutMs),
		);
	d.only = (name, tests) =>
		describe.only(
			name,
			createTestSuiteWithInstalledVersion(tests, requestedVersions, timeoutMs),
		);
	return d;
}
