/* eslint-disable @typescript-eslint/no-unsafe-return */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { getRandomName, IAlfredTenant } from "@fluidframework/server-services-client";
import { Request } from "express";
import _ from "lodash";
import uuid from "uuid";
import { KJUR as jsrsasign } from "jsrsasign";

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires
    const version = require("../package.json").version as string;
    return `${version.endsWith(".0") ? "^" : ""}${version}`;
}

export const getUser = (request: Request) => request.user ?? request.session?.guest;

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

// TODO: Remove this once the changes have been made in services-utils to use jrsassign instead of jwt,
// and the updated package is released
// Changes should be similar to the ones made here for local driver
// https://github.com/microsoft/FluidFramework/pull/3989/files
export function generateToken(
    tenantId: string,
    documentId: string,
    key: string,
    scopes: ScopeType[],
    user?: IUser,
    lifetime: number = 60 * 60,
    ver: string = "1.0"): string {
    // eslint-disable-next-line no-param-reassign
    user = (user) ? user : generateUser();
    if (user.id === "" || user.id === undefined) {
        // eslint-disable-next-line no-param-reassign
        user = generateUser();
    }

    // Current time in seconds
    const now = Math.round((new Date()).getTime() / 1000);

    const claims = {
        documentId,
        scopes,
        tenantId,
        user,
        iat: now,
        exp: now + lifetime,
        ver,
    };

    // eslint-disable-next-line no-null/no-null
    return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg:"HS256", typ: "JWT" }), claims, key);
}

export function getR11SToken(
    tenantId: string,
    documentId: string,
    appTenants: IAlfredTenant[],
    scopes: ScopeType[],
    user?: IUser,
): string {
    const tenantKey = appTenants.find((tenant) => tenant.id === tenantId)?.key;
    if (tenantKey === undefined) {
        throw Error(`Unable to find requested tenant ${tenantId}`);
    }
    return generateToken(tenantId, documentId, tenantKey, scopes, user);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: getRandomName(" ", true),
    };

    return randomUser;
}
