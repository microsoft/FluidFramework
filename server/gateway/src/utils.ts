/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient } from "@microsoft/fluid-protocol-definitions";
import { Request } from "express";
import * as _ from "lodash";

export interface ICachedPackage {
    entrypoint: string;
    scripts: { id: string; url: string }[];
}

export interface IJWTClaims {
    user: {
        displayName: string;
        id: string;
        name: string;
    };
}

/**
 * Helper function to return tenant specific configuration
 */
export function getConfig(
    config: any,
    tenantId: string,
    trackError: boolean,
): string {
    // Make a copy of the config to avoid destructive modifications to the original
    const updatedConfig = _.cloneDeep(config);
    updatedConfig.tenantId = tenantId;
    updatedConfig.trackError = trackError;
    const client: IClient = {
        details: { capabilities: { interactive: true } },
        mode: "write",
        permission: [],
        scopes: [],
        user: { id: "" },
    };
    updatedConfig.client = client;
    updatedConfig.blobStorageUrl = updatedConfig.blobStorageUrl.replace("historian:3000", "localhost:3001");
    updatedConfig.historianApi = true;

    return JSON.stringify(updatedConfig);
}

/**
 * Helper function to return a relative range (if local) or the specific chaincode package version
 */
export function getVersion() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const version = require("../package.json").version as string;
    return `${version.endsWith(".0") ? "^" : ""}${version}`;
}

const getUser = (request: Request) => request.user ?? request.session?.guest;

export function getJWTClaims(request: Request): IJWTClaims {
    const user = getUser(request);

    return {
        user: {
            displayName: user.name,
            id: user.sub,
            name: user.name,
        },
    };
}

export const getUserDetails = (request: Request) => JSON.stringify(getUser(request));
