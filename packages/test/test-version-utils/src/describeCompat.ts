/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getUnexpectedLogErrorException, ITestObjectProvider, TestObjectProvider } from "@fluidframework/test-utils";
import { configList } from "./compatConfig";
import { CompatKind, baseVersion, driver, r11sEndpointName, tenantIndex } from "./compatOptions";
import { getVersionedTestObjectProvider } from "./compatUtils";

/*
 * Mocha Utils for test to generate the compat variants.
 */
function createCompatSuite(
    tests: (this: Mocha.Suite, provider: () => ITestObjectProvider) => void,
    compatFilter?: CompatKind[],
) {
    return function(this: Mocha.Suite) {
        let configs = configList.value;
        if (compatFilter !== undefined) {
            configs = configs.filter((value) => compatFilter.includes(value.kind));
        }

        for (const config of configs) {
            describe(config.name, function() {
                let provider: TestObjectProvider;
                let resetAfterEach: boolean;
                before(async function() {
                    provider = await getVersionedTestObjectProvider(
                        baseVersion,
                        config.loader,
                        {
                            type: driver,
                            version: config.driver,
                            config: {
                                r11s: { r11sEndpointName },
                                odsp: { tenantIndex },
                            },
                        },
                        config.containerRuntime,
                        config.dataRuntime,
                    );
                    Object.defineProperty(this,"__fluidTestProvider",{get: ()=>provider});
                });
                tests.bind(this)((reset: boolean = true) => {
                    if (reset) {
                        resetAfterEach = true;
                    }
                    return provider;
                });
                // eslint-disable-next-line prefer-arrow-callback
                afterEach(function(done: Mocha.Done) {
                    done(getUnexpectedLogErrorException(provider.logger, "Use itExpects to specify expected errors. "));
                    if (resetAfterEach) {
                        provider.reset();
                    }
                });
            });
        }
    };
}

export type DescribeCompatSuite =
    (name: string,
    tests: (
        this: Mocha.Suite,
        provider: (resetAfterEach?: boolean) => ITestObjectProvider) => void
    ) => Mocha.Suite | void;

export type DescribeCompat = DescribeCompatSuite & Record<"skip" | "only" | "noCompat", DescribeCompatSuite>;

function createCompatDescribe(compatFilter?: CompatKind[]): DescribeCompat {
    const d: DescribeCompat =
        (name, tests) => describe(name, createCompatSuite(tests, compatFilter));
    d.skip = (name, tests) => describe.skip(name, createCompatSuite(tests, compatFilter));
    d.only = (name, tests) => describe.only(name, createCompatSuite(tests, compatFilter));
    d.noCompat = (name, tests) => describe(name, createCompatSuite(tests, [CompatKind.None]));
    return d;
}

export const describeNoCompat: DescribeCompat = createCompatDescribe([CompatKind.None]);

export const describeLoaderCompat: DescribeCompat = createCompatDescribe([CompatKind.None, CompatKind.Loader]);

export const describeFullCompat: DescribeCompat = createCompatDescribe();
