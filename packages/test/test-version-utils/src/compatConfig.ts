/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import nconf from "nconf";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { getVersionedTestObjectProvider } from "./compatUtils";
import { ensurePackageInstalled } from "./testApi";

/**
 * Different kind of compat version config
 */
enum CompatKind {
    None = "None",
    Loader = "Loader",
    Driver = "Driver",
    ContainerRuntime = "ContainerRuntime",
    DataRuntime = "DataRuntime",
    LoaderAndContainerRuntime = "LoaderAndContainerRuntime",
}

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
// we are currently supporting 0.39 long-term
const LTSVersions = ["^0.39.0"];

function genConfig(compatVersion: number | string): CompatConfig[] {
    if (compatVersion === 0) {
        return [{
            name: `Non-Compat`,
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

    return [
        {
            name: `compat N${compatVersion} - old loader`,
            kind: CompatKind.Loader,
            compatVersion,
            loader: compatVersion,
        },
        {
            name: `compat N${compatVersion} - new loader`,
            kind: CompatKind.Loader,
            compatVersion,
            ...allOld,
            loader: undefined,
        },
        {
            name: `compat N${compatVersion} - old driver`,
            kind: CompatKind.Loader,
            compatVersion,
            driver: compatVersion,
        },
        {
            name: `compat N${compatVersion} - new driver`,
            kind: CompatKind.Loader,
            compatVersion,
            ...allOld,
            driver: undefined,
        },
        {
            name: `compat N${compatVersion} - old container runtime`,
            kind: CompatKind.ContainerRuntime,
            compatVersion,
            containerRuntime: compatVersion,
        },
        {
            name: `compat N${compatVersion} - new container runtime`,
            kind: CompatKind.ContainerRuntime,
            compatVersion,
            ...allOld,
            containerRuntime: undefined,
        },
        {
            name: `compat N${compatVersion} - old data runtime`,
            kind: CompatKind.DataRuntime,
            compatVersion,
            dataRuntime: compatVersion,
        },
        {
            name: `compat N${compatVersion} - new data runtime`,
            kind: CompatKind.LoaderAndContainerRuntime,
            compatVersion,
            ...allOld,
            dataRuntime: undefined,
        },
    ];
}

const genLTSConfig = (compatVersion: number | string): CompatConfig[]  => {
    return [
        {
            name: `compat LTS ${compatVersion} - old loader`,
            kind: CompatKind.Loader,
            compatVersion,
            loader: compatVersion,
        },
        {
            name: `compat LTS ${compatVersion} - old loader + old driver`,
            kind: CompatKind.Loader,
            compatVersion,
            driver: compatVersion,
            loader: compatVersion,
        },
    ];
};

/*
 * Parse the command line argument and environment variables.  Arguments take precedent.
 *   --compat <index> - choose a config to run (default: -1 for all)
 *   --reinstall      - force reinstallation of legacy versions
 *
 * Env:
 *   fluid__test__compat - same as --compat
 */
const options = {
    compatKind: {
        description: "Compat kind to run",
        choices: [
            CompatKind.None,
            CompatKind.Loader,
            CompatKind.ContainerRuntime,
            CompatKind.DataRuntime,
            CompatKind.LoaderAndContainerRuntime,
        ],
        requiresArg: true,
        array: true,
    },
    compatVersion: {
        description: "Compat version to run",
        requiresArg: true,
        array: true,
        type: "number",
    },
    reinstall: {
        default: false,
        description: "Force compat package to be installed",
        boolean: true,
    },
    driver: {
        choices: [
            "tinylicious",
            "routerlicious",
            "odsp",
            "local",
        ],
        requiresArg: true,
    },
};

nconf.argv({
    ...options,
    transform: (obj: { key: string, value: string }) => {
        if (options[obj.key] !== undefined) {
            obj.key = `fluid:test:${obj.key}`;
        }
        return obj;
    },
}).env({
    separator: "__",
    whitelist: ["fluid__test__compatKind", "fluid__test__compatVersion", "fluid__test__driver"],
    parseValues: true,
}).defaults(
    {
        fluid: {
            test: {
                compat: undefined,
                driver: "local",
            },
        },
    },
);

const compatKind = nconf.get("fluid:test:compatKind") as CompatKind[];
const compatVersions = nconf.get("fluid:test:compatVersion") as number[];
const driver = nconf.get("fluid:test:driver") as TestDriverTypes;

// set it in the env for parallel workers
process.env.fluid__test__compatKind = JSON.stringify(compatKind);
// Number arrays needs quote so that single element array can be interpret as array.
process.env.fluid__test__compatVersion = `"${JSON.stringify(compatVersions)}"`;
process.env.fluid__test__driver = driver;

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
        configList.push(...genConfig(value));
    });
}

if (compatKind !== undefined) {
    configList = configList.filter((value) => compatKind.includes(value.kind));
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
                        config.loader,
                        {
                            type: driver,
                            version: config.driver,
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
    const versions = new Set(configList.map((value) => value.compatVersion).filter((value) => value !== 0));
    if (versions.size === 0) { return; }

    // Make sure we wait for all before returning, even if one of them has error.
    const installP = Array.from(versions.values()).map(
        async (value) => ensurePackageInstalled(value, nconf.get("fluid:test:reinstall")));

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
