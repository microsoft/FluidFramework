/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger, ITestObjectProvider, TestObjectProvider } from "@fluidframework/test-utils";
import { getVersionedTestObjectProvider } from "./compatUtils";
import { ensurePackageInstalled } from "./testApi";
import { pkgVersion } from "./packageVersion";
import {
    CompatKind,
    compatKind,
    compatVersions,
    driver,
    r11sEndpointName,
    tenantIndex,
    baseVersion,
    reinstall,
} from "./compatOptions";
import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { Context } from "mocha";
import { strict as assert } from "assert";

/*
 * Generate configuration combinations for a particular compat version
 */
interface CompatConfig {
    name: string,
    kind: CompatKind,
    compatVersion: number | string,
    loader?: string | number,
    driver?: string | number,
    containerRuntime?: string | number,
    dataRuntime?: string | number,
}

// N, N - 1, and N - 2
const defaultVersions = [0, -1, -2];
// we are currently supporting 0.45 long-term
const LTSVersions = ["^0.45.0"];

function genConfig(compatVersion: number | string): CompatConfig[] {
    if (compatVersion === 0) {
        return [{
            // include the base version if it is not the same as the package version and it is not the test build
            name: `Non-Compat${baseVersion !== pkgVersion ? ` v${baseVersion}` : ""}`,
            kind: CompatKind.None,
            compatVersion: 0,
        }];
    }

    const allOld = {
        loader: compatVersion,
        driver: compatVersion,
        containerRuntime: compatVersion,
        dataRuntime: compatVersion,
    };

    const compatVersionStr = typeof compatVersion === "string" ? compatVersion : `N${compatVersion}`;
    return [
        {
            name: `compat ${compatVersionStr} - old loader`,
            kind: CompatKind.Loader,
            compatVersion,
            loader: compatVersion,
        },
        {
            name: `compat ${compatVersionStr} - new loader`,
            kind: CompatKind.NewLoader,
            compatVersion,
            ...allOld,
            loader: undefined,
        },
        {
            name: `compat ${compatVersionStr} - old driver`,
            kind: CompatKind.Driver,
            compatVersion,
            driver: compatVersion,
        },
        {
            name: `compat ${compatVersionStr} - new driver`,
            kind: CompatKind.NewDriver,
            compatVersion,
            ...allOld,
            driver: undefined,
        },
        {
            name: `compat ${compatVersionStr} - old container runtime`,
            kind: CompatKind.ContainerRuntime,
            compatVersion,
            containerRuntime: compatVersion,
        },
        {
            name: `compat ${compatVersionStr} - new container runtime`,
            kind: CompatKind.NewContainerRuntime,
            compatVersion,
            ...allOld,
            containerRuntime: undefined,
        },
        {
            name: `compat ${compatVersionStr} - old data runtime`,
            kind: CompatKind.DataRuntime,
            compatVersion,
            dataRuntime: compatVersion,
        },
        {
            name: `compat ${compatVersionStr} - new data runtime`,
            kind: CompatKind.NewDataRuntime,
            compatVersion,
            ...allOld,
            dataRuntime: undefined,
        },
    ];
}

const genLTSConfig = (compatVersion: number | string): CompatConfig[] => {
    return [
        {
            name: `compat LTS ${compatVersion} - old loader`,
            kind: CompatKind.Loader,
            compatVersion,
            loader: compatVersion,
        },
        {
            name: `compat LTS ${compatVersion} - old loader + old driver`,
            kind: CompatKind.LoaderDriver,
            compatVersion,
            driver: compatVersion,
            loader: compatVersion,
        },
    ];
};

// set it in the env for parallel workers
if (compatKind) {
    process.env.fluid__test__compatKind = JSON.stringify(compatKind);
}
if (compatVersions) {
    process.env.fluid__test__compatVersion = JSON.stringify(compatVersions);
}
process.env.fluid__test__driver = driver;
process.env.fluid__test__r11sEndpointName = r11sEndpointName;
process.env.fluid__test__tenantIndex = tenantIndex.toString();
process.env.fluid__test__baseVersion = baseVersion;

let configList: CompatConfig[] = [];
if (!compatVersions || compatVersions.length === 0) {
    defaultVersions.forEach((value) => {
        configList.push(...genConfig(value));
    });
    LTSVersions.forEach((value) => {
        configList.push(...genLTSConfig(value));
    });
} else {
    compatVersions.forEach((value) => {
        if (value === "LTS") {
            LTSVersions.forEach((lts) => {
                configList.push(...genLTSConfig(lts));
            });
        } else {
            const num = parseInt(value, 10);
            if (num.toString() === value) {
                configList.push(...genConfig(num));
            } else {
                configList.push(...genConfig(value));
            }
        }
    });
}

if (compatKind !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    configList = configList.filter((value) => compatKind!.includes(value.kind));
}

function getUnexpectedLogErrorException(logger: EventAndErrorTrackingLogger){
    const results = logger.reportAndClearTrackedEvents();
    if(results.unexpectedErrors.length > 0){
        return new Error(
            `Unexpected Errors in Logs. Use itExpects to specify expected errors:\n` +
            +`${ JSON.stringify(results.unexpectedErrors, undefined, 2)}`);
    }
    if(results.expectedNotFound.length > 0){
        return new Error(
            `Expected Events not found:\n${ JSON.stringify(results.expectedNotFound, undefined, 2)}`);
    }
}

function createExpectsTest(orderedExpectedEvents: ITelemetryGenericEvent[], test: Mocha.AsyncFunc){
    return async function (this:Context){
        const provider: TestObjectProvider | undefined = this.__fluidTestProvider;
        assert(provider !== undefined, "Expected __fluidTestProvider on this");
        try{
            provider.logger.registerExpectedEvent(... orderedExpectedEvents);
            await test.bind(this)();
        }catch(error){
            // only use TestException if the event is provided.
            // it must be last, as the events are ordered, so all other events must come first
            if(orderedExpectedEvents[orderedExpectedEvents.length -1]?.eventName === "TestException"){
                provider.logger.sendErrorEvent({eventName:"TestException"},error)
            }else{
                throw error;
            }
        }
        const err = getUnexpectedLogErrorException(provider.logger);
        if(err !== undefined){
            throw err;
        }
    };
}

export type ExpectsTest =
    (name: string, orderedExpectedEvents: ITelemetryGenericEvent[], test: Mocha.AsyncFunc) => Mocha.Test

/**
 * Similar to mocha's it function, but allow specifying expected events.
 * That must occur during the execution of the test.
 */
export const itExpects: ExpectsTest & Record<"only" |"skip", ExpectsTest> =
    (name: string, orderedExpectedEvents: ITelemetryGenericEvent[], test: Mocha.AsyncFunc): Mocha.Test =>
        it(name, createExpectsTest(orderedExpectedEvents, test));

itExpects.only =
    (name: string, orderedExpectedEvents: ITelemetryGenericEvent[], test: Mocha.AsyncFunc) =>
        it.only(name, createExpectsTest(orderedExpectedEvents, test));

itExpects.skip =
    (name: string, orderedExpectedEvents: ITelemetryGenericEvent[], test: Mocha.AsyncFunc) =>
        it.skip(name, createExpectsTest(orderedExpectedEvents, test));


/*
 * Mocha Utils for test to generate the compat variants.
 */
function describeCompat(
    name: string,
    tests: (provider: () => ITestObjectProvider) => void,
    compatFilter?: CompatKind[],
) {
    let configs = configList;
    if (compatFilter !== undefined) {
        configs = configs.filter((value) => compatFilter.includes(value.kind));
    }

    describe(name, () => {
        for (const config of configs) {
            describe(config.name, () => {
                let provider: TestObjectProvider;
                let resetAfterEach: boolean;
                before(async function () {
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
                tests((reset: boolean = true) => {
                    if (reset) {
                        resetAfterEach = true;
                    }
                    return provider;
                });
                afterEach(function (done:Mocha.Done) {
                    done(getUnexpectedLogErrorException(provider.logger));
                    if (resetAfterEach) {
                        provider.reset();
                    }
                });
            });
        }
    });
}

export function describeNoCompat(
    name: string,
    tests: (provider: (resetAfterEach?: boolean) => ITestObjectProvider) => void,
) {
    describeCompat(name, tests, [CompatKind.None]);
}

export function describeLoaderCompat(
    name: string,
    tests: (provider: (resetAfterEach?: boolean) => ITestObjectProvider) => void,
) {
    describeCompat(name, tests, [CompatKind.None, CompatKind.Loader]);
}

export function describeFullCompat(
    name: string,
    tests: (provider: (resetAfterEach?: boolean) => ITestObjectProvider) => void,
) {
    describeCompat(name, tests);
}

/*
 * Mocha start up to ensure legacy versions are installed
 */
export async function mochaGlobalSetup() {
    const versions = new Set(configList.map((value) => value.compatVersion));
    if (versions.size === 0) { return; }

    // Make sure we wait for all before returning, even if one of them has error.
    const installP = Array.from(versions.values()).map(
        async (value) => ensurePackageInstalled(baseVersion, value, reinstall));

    let error: unknown | undefined;
    for (const p of installP) {
        try {
            await p;
        } catch (e) {
            error = e;
        }
    }
    if (error) {
        throw error;
    }
}
