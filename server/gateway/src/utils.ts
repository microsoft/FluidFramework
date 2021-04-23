/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, ScopeType } from "@fluidframework/protocol-definitions";
import { IAlfredUser } from "@fluidframework/routerlicious-urlresolver";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { generateToken } from "@fluidframework/server-services-utils";
import { Request } from "express";
import _ from "lodash";

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
 * Helper function to generate r11s token for given tenants
 */
export function getR11sToken(
    tenantId: string,
    documentId: string,
    tenants: IAlfredTenant[],
    scopes: ScopeType[],
    user: IAlfredUser,
    lifetimeSec: number = 60 * 60): string {
    for (const tenant of tenants) {
        if (tenantId === tenant.id) {
            return generateToken(tenantId, documentId, tenant.key, scopes, user, lifetimeSec);
        }
    }

    throw new Error("Invalid tenant");
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires
    const version = require("../package.json").version as string;
    return `${version.endsWith(".0") ? "^" : ""}${version}`;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

/**
 * Helper function to convert Request's query param to a string
 * @param value - The value to be interpreted as a string
 * @returns The provided value as a string, otherwise empty string in any case of error
 */
export const queryParamAsString = (value: any): string => {
    return typeof value === "string" ? value : "";
};
