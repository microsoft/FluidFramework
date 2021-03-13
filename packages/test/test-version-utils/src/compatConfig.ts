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
 * Parse the command line argument and environment variables.  Arguments take precedent.
 *   --compat <index> - choose a config to run (default: -1 for all)
 *   --reinstall      - force reinstallation of legacy versions
 *
 * Env:
 *   fluid__test__compat - same as --compat
 */
const transformArgvKey = (obj: { key: string, value: string }) => {
    if (obj.key === "compat") {
        obj.key = `fluid:test:${obj.key}`;
    }
    return obj;
};
nconf.argv({
    compat: {
        description: "Compat Variant defined in the array in compatConfigs",
        requiresArg: true,
    },
    reinstall: {
        default: false,
        description: "Force compat package to be installed",
        boolean: true,
    },
    transform: transformArgvKey,
}).env({
    separator: "__",
    whitelist: ["fluid__test__compat"],
}).defaults(
    {
        fluid: {
            test: {
                compat: -1,
            },
        },
    },
);

const compatIndex = nconf.get("fluid:test:compat");
const compatConfig = compatConfigs[compatIndex];
if (compatIndex !== -1 && compatConfig === undefined) {
    throw new Error(`Invalid compat config index '${compatIndex}'`);
}

// set it in the env for parallel workers
process.env.fluid__test__compat = compatIndex;

/*
 * Mocha Utils for test to generate the compat variants.
 */
export function describeWithCompat(
    name: string,
    tests: (provider: () => ReturnType<typeof getTestObjectProvider>) => void,
) {
    describe(name, () => {
        const configList = compatIndex === -1 ? compatConfigs : [compatConfig];

        for (const config of configList) {
            describe(config.name, () => {
                tests(() => {
                    return getTestObjectProvider(config?.loader, config?.containerRuntime, config?.dataRuntime);
                });
            });
        }
    });
}

/*
 * Mocha start up to ensure legacy versions are installed
 */
export async function mochaGlobalSetup() {
    const configList = compatIndex === -1 ? compatConfigs : [compatConfig];
    const versions = new Set(configList.map((value) => value.compatVersion).filter((value) => value !== 0));
    if (versions.size === 0) { return; }

    // Make sure we wait for all before returning, even if one of them has error.
    const installP = Array.from(versions.values()).map(
        async (value) => ensurePackageInstalled(value, nconf.get("reinstall")));

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
