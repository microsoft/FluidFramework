/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getUnexpectedLogErrorException, ITestObjectProvider, TestObjectProvider } from "@fluidframework/test-utils";
import { driver, r11sEndpointName, tenantIndex } from "./compatOptions";
import { getVersionedTestObjectProvider } from "./compatUtils";
import { ITestObjectProviderOptions } from "./describeCompat";
import { pkgVersion } from "./packageVersion";
import { ensurePackageInstalled, IInstalledVersion } from "./testApi";

export interface IRequiredVersions {
    lastVersions?: number;
    specificVersions?: string[];
}

const installRequiredVersions = async (config: IRequiredVersions) => {
    const installPromises: Promise<IInstalledVersion | undefined>[] = [];
    if (config.specificVersions !== undefined) {
        installPromises.push(
            ...config.specificVersions.map(async (version) => ensurePackageInstalled(version, 0, /* force */ false)));
    }

    if (config.lastVersions !== undefined) {
        installPromises.push(ensurePackageInstalled(pkgVersion, config.lastVersions, /* force */ false));
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

function createTestSuiteWithInstalledVersion(
    tests: (this: Mocha.Suite, provider: () => ITestObjectProvider) => void,
    requiredVersions: IRequiredVersions | undefined = { lastVersions: -2 },
) {
    return function(this: Mocha.Suite) {
        describe(this.fullTitle(), function() {
            let defaultProvider: TestObjectProvider;
            let resetAfterEach: boolean;
            before(async function() {
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

export function describeWithVersions(requiredVersions?: IRequiredVersions): DescribeWithVersions {
    const d: DescribeWithVersions =
        (name, tests) => describe(name, createTestSuiteWithInstalledVersion(tests, requiredVersions));
    d.skip = (name, tests) => describe.skip(name, createTestSuiteWithInstalledVersion(tests, requiredVersions));
    d.only = (name, tests) => describe.only(name, createTestSuiteWithInstalledVersion(tests, requiredVersions));
    return d;
}
