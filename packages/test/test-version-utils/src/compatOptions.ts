/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import nconf from "nconf";
import { RouterliciousEndpoint, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { resolveVersion } from "./versionUtils";
import { pkgVersion } from "./packageVersion";

/**
 * Different kind of compat version config
 */
export enum CompatKind {
    None = "None",
    Loader = "Loader",
    NewLoader = "NewLoader",
    Driver = "Driver",
    NewDriver = "NewDriver",
    ContainerRuntime = "ContainerRuntime",
    NewContainerRuntime = "NewContainerRuntime",
    DataRuntime = "DataRuntime",
    NewDataRuntime = "NewDataRuntime",
    LoaderDriver = "LoaderDriver",
}

/*
 * Parse the command line argument and environment variables.  Arguments take precedent over environment variable
 * NOTE: Please update this packages README.md if the default versions and config combination changes
 */
const options = {
    compatKind: {
        description: "Compat kind to run",
        choices: [
            CompatKind.None,
            CompatKind.Loader,
            CompatKind.NewLoader,
            CompatKind.Driver,
            CompatKind.NewDriver,
            CompatKind.ContainerRuntime,
            CompatKind.NewContainerRuntime,
            CompatKind.DataRuntime,
            CompatKind.NewDataRuntime,
            CompatKind.LoaderDriver,
        ],
        requiresArg: true,
        array: true,
    },
    compatVersion: {
        description: "Compat version to run",
        requiresArg: true,
        array: true,
        type: "string",
    },
    reinstall: {
        default: false,
        description: "Force compat package to be installed",
        boolean: true,
    },
    driver: {
        choices: [
            "tinylicious",
            "t9s",
            "routerlicious",
            "r11s",
            "odsp",
            "local",
        ],
        requiresArg: true,
    },
    r11sEndpointName: {
        type: "string",
    },
    tenantIndex: {
        type: "number",
    },
    baseVersion: {
        type: "string",
    },
};

nconf.argv({
    ...options,
    transform: (obj: { key: string; value: string; }) => {
        if (options[obj.key] !== undefined) {
            obj.key = `fluid:test:${obj.key}`;
        }
        return obj;
    },
}).env({
    separator: "__",
    whitelist: [
        "fluid__test__compatKind",
        "fluid__test__compatVersion",
        "fluid__test__driver",
        "fluid__test__r11sEndpointName",
        "fluid__test__baseVersion",
    ],
    transform: (obj: { key: string; value: string; }) => {
        if (!obj.key.startsWith("fluid__test__")) {
            return obj;
        }
        const key = obj.key.substring("fluid__test__".length);
        if (options[key]?.array) {
            try {
                obj.value = JSON.parse(obj.value);
            } catch {
                // ignore
            }
        }
        return obj;
    },
}).defaults(
    {
        fluid: {
            test: {
                driver: "local",
                baseVersion: pkgVersion,
                r11sEndpointName: "r11s",
                tenantIndex: 0,
            },
        },
    },
);

export const compatKind = nconf.get("fluid:test:compatKind") as CompatKind[] | undefined;
export const compatVersions = nconf.get("fluid:test:compatVersion") as string[] | undefined;
export const driver = nconf.get("fluid:test:driver") as TestDriverTypes;
export const r11sEndpointName = nconf.get("fluid:test:r11sEndpointName") as RouterliciousEndpoint;
export const baseVersion = resolveVersion(nconf.get("fluid:test:baseVersion") as string, false);
export const reinstall = nconf.get("fluid:test:reinstall");
export const tenantIndex = nconf.get("fluid:test:tenantIndex") as number;
