/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getUnexpectedLogErrorException, ITestObjectProvider, TestObjectProvider } from "@fluidframework/test-utils";
import { driver, r11sEndpointName, tenantIndex } from "./compatOptions";
import { getVersionedTestObjectProvider } from "./compatUtils";
import { ITestObjectProviderOptions } from "./describeCompat";
import { pkgVersion } from "./packageVersion";
import { ensurePackageInstalled, IVersionInstall } from "./testApi";

export interface IRequiredVersions {
    versionsDelta?: number;
    specificVersions?: string[];
}

const installRequiredVersions = async (config: IRequiredVersions) => {
    const installPromises: Promise<IVersionInstall | undefined>[] = [];
    if (config.specificVersions !== undefined) {
        installPromises.push(
            ...config.specificVersions.map(async (version) => ensurePackageInstalled(version, 0, /* force */ false)));
    }

    if (config.versionsDelta !== undefined) {
        installPromises.push(ensurePackageInstalled(pkgVersion, config.versionsDelta, /* force */ false));
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

const defaultTimeoutMs = 20000;

function createTestSuiteWithInstalledVersion(
    tests: (this: Mocha.Suite, provider: () => ITestObjectProvider) => void,
    requiredVersions: IRequiredVersions = { versionsDelta: -2 },
    timeoutMs: number = defaultTimeoutMs,
) {
    return function(this: Mocha.Suite) {
        let defaultProvider: TestObjectProvider;
        let resetAfterEach: boolean;
        before(async function() {
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
                        odsp: { tenantIndex },
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

        afterEach(function(done: Mocha.Done) {
            const logErrors = getUnexpectedLogErrorException(defaultProvider.logger);
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

export type DescribeSuiteWithVersions =
    (name: string,
        tests: (
            this: Mocha.Suite,
            provider: (options?: ITestObjectProviderOptions) => ITestObjectProvider) => void
    ) => Mocha.Suite | void;

export type DescribeWithVersions =
    DescribeSuiteWithVersions & Record<"skip" | "only", DescribeSuiteWithVersions>;

export function describeWithVersions(
    requiredVersions?: IRequiredVersions,
    timeoutMs?: number,
): DescribeWithVersions {
    const d: DescribeWithVersions =
        (name, tests) => describe(name, createTestSuiteWithInstalledVersion(tests, requiredVersions, timeoutMs));
    d.skip =
        (name, tests) => describe.skip(name, createTestSuiteWithInstalledVersion(tests, requiredVersions, timeoutMs));
    d.only =
        (name, tests) => describe.only(name, createTestSuiteWithInstalledVersion(tests, requiredVersions, timeoutMs));
    return d;
}
