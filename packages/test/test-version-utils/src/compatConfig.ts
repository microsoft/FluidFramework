/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestObjectProvider } from "@fluidframework/test-utils";
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
                let provider: ITestObjectProvider;
                let resetAfterEach: boolean;
                before(async () => {
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
                });
                tests((reset: boolean = true) => {
                    if (reset) {
                        provider.reset();
                        resetAfterEach = true;
                    }
                    return provider;
                });
                afterEach(() => {
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

    let error: Error | undefined;
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
