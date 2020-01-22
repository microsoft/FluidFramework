/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient } from "@microsoft/fluid-protocol-definitions";
import { Request } from "express";
// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// tslint:disable-next-line:no-implicit-dependencies
import { Params } from "express-serve-static-core";
import * as _ from "lodash";

export interface ICachedPackage {
    entrypoint: string;
    scripts: { id: string, url: string }[];
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
        type: "browser", // back-compat: 0.11 clientType
        details: { capabilities: { interactive: true } },
        permission: [],
        scopes: [],
        user: { id: "" },
    };
    updatedConfig.client = client;
    updatedConfig.blobStorageUrl = updatedConfig.blobStorageUrl.replace("historian:3000", "localhost:3001");
    updatedConfig.historianApi = true;

    return JSON.stringify(updatedConfig);
}

export function getParam(params: Params, key: string) {
    return Array.isArray(params) ? undefined : params[key];
}

/**
 * Helper function to return a relative range (if local) or the specific chaincode package version
 */
export function getVersion() {
    const version = require("../package.json").version;
    return `${version.endsWith(".0") ? "^" : ""}${version}`;
}

function getUser(request: Request) {
    return request.user ? request.user : request.session.guest;
}

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

export function getUserDetails(request: Request): string {
    return JSON.stringify(getUser(request));
}
