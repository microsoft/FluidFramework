/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import nconf from "nconf";
import { getTestObjectProvider } from "./compatUtils";
import { ensurePackageInstalled } from "./testApi";

/*
 * Generate configuration combinations for a particular compat version
 */
const genConfig = (compatVersion: number) => [
    {
        name: `compat N${compatVersion} - old loader + new runtime`,
        compatVersion,
        loader: compatVersion,
    },
    {
        name: `compat N${compatVersion} - new loader + old runtime`,
        compatVersion,
        containerRuntime: compatVersion,
        dataRuntime: compatVersion,
    },
    {
        name: `compat N${compatVersion} - new container runtime + old data runtime`,
        compatVersion,
        dataRuntime: compatVersion,
    },
    {
        name: `compat N${compatVersion} - old container runtime + new data runtime`,
        compatVersion,
        loader: compatVersion,
        containerRuntime: compatVersion,
    },
];

/*
 * Currently we test N, N-1 and N-2
 */
export const compatConfigs: {
    name: string,
    compatVersion: number,
    loader?: string | number,
    containerRuntime?: string | number,
    dataRuntime?: string | number,
}[] = [{ name: "Non-Compat", compatVersion: 0 }, ...genConfig(-1), ...genConfig(-2)];

/*
 * Parse the command line argument to see if a particular compat is specified.
 */
nconf.argv({
    compat: {
        default: -1,
        description: "Compat Variant defined in the array in compatConfigs",
        requiresArg: true,
    },
});

const compatIndex = nconf.get("compat");
const compatConfig = compatConfigs[compatIndex];
if (compatIndex !== -1 && compatConfig === undefined) {
    throw new Error(`Invalid compat config index '${compatIndex}'`);
}

/*
 * Utils for test to generate the compat variants.
 */
const generateTestForConfig = (
    config: typeof compatConfig,
    tests: (provider: () => ReturnType<typeof getTestObjectProvider>) => void,
) => {
    tests(() => {
        return getTestObjectProvider(config?.loader, config?.containerRuntime, config?.dataRuntime);
    });
};

export const generateTest = (
    tests: (provider: () => ReturnType<typeof getTestObjectProvider>) => void,
) => {
    if (compatIndex !== -1) {
        generateTestForConfig(compatConfig, tests);
    } else {
        for (const config of compatConfigs) {
            describe(config.name, () => {
                generateTestForConfig(config, tests);
            });
        }
    }
};

/*
 * Mocha start up to ensure legacy versions are installed
 */
export async function mochaGlobalSetup() {
    const versions = compatConfig ? [compatConfig?.loader, compatConfig?.containerRuntime, compatConfig?.dataRuntime]
        .filter((value, index, self) =>
            value !== undefined && value !== 0 && self.indexOf(value) === index) as (string | number)[] :
        [-1, -2];

    if (versions.length === 0) { return; }

    // Make sure we wait for both before returning, even if one of them is rejected
    const installP = versions.map(async (value) => ensurePackageInstalled(value));

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
