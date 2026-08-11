/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Lazy } from "@fluidframework/common-utils";
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
 * NOTE: Please update this packages README.md if the default versions and config combination changes
 */
interface CompatConfig {
    name: string;
    kind: CompatKind;
    compatVersion: number | string;
    loader?: string | number;
    driver?: string | number;
    containerRuntime?: string | number;
    dataRuntime?: string | number;
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

export const configList = new Lazy<readonly CompatConfig[]>(() => {
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

    let _configList: CompatConfig[] = [];
    if (!compatVersions || compatVersions.length === 0) {
        defaultVersions.forEach((value) => {
            _configList.push(...genConfig(value));
        });
        LTSVersions.forEach((value) => {
            _configList.push(...genLTSConfig(value));
        });
    } else {
        compatVersions.forEach((value) => {
            if (value === "LTS") {
                LTSVersions.forEach((lts) => {
                    _configList.push(...genLTSConfig(lts));
                });
            } else {
                const num = parseInt(value, 10);
                if (num.toString() === value) {
                    _configList.push(...genConfig(num));
                } else {
                    _configList.push(...genConfig(value));
                }
            }
        });
    }

    if (compatKind !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        _configList = _configList.filter((value) => compatKind!.includes(value.kind));
    }
    return _configList;
});

/*
 * Mocha start up to ensure legacy versions are installed
 */
export async function mochaGlobalSetup() {
    const versions = new Set(configList.value.map((value) => value.compatVersion));
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
