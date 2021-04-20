/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { Response } from "express";
import { NetworkError } from "@fluidframework/server-services-client";
import { ICache, ITenantService, RestGitService, ITenantCustomDataExternal } from "../services";

/**
 * Helper function to handle a promise that should be returned to the user
 */
export function handleResponse<T>(
    resultP: Promise<T>,
    response: Response,
    cache = true,
    status: number = 200,
    handler: (value: T) => void = (value) => value,
) {
    resultP.then(handler).then(
        (result) => {
            if (cache) {
                response.setHeader("Cache-Control", "public, max-age=31536000");
            }

            response.status(status).json(result);
        },
        (error) => {
            response.status(error?.code ?? 400).json(error?.message ?? error);
        });
}

export async function createGitService(
    tenantId: string,
    authorization: string,
    tenantService: ITenantService,
    cache: ICache,
    asyncLocalStorage?: AsyncLocalStorage<string>,
): Promise<RestGitService> {
    let token: string;
    if (authorization) {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const base64TokenMatch = authorization.match(/Basic (.+)/);
        if (!base64TokenMatch) {
            return Promise.reject(new NetworkError(403, "Malformed authorization token"));
        }
        const encoded = Buffer.from(base64TokenMatch[1], "base64").toString();

        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const tokenMatch = encoded.match(/(.+):(.+)/);
        if (!tokenMatch || tenantId !== tokenMatch[1]) {
            return Promise.reject(new NetworkError(403, "Malformed authorization token"));
        }

        token = tokenMatch[2];
    }

    const details = await tenantService.getTenant(tenantId, token);
    const customData: ITenantCustomDataExternal = details.customData;
    const writeToExternalStorage = !!customData.externalStorageData;
    const service = new RestGitService(details.storage, cache, writeToExternalStorage, asyncLocalStorage);

    return service;
}

/**
 * Helper function to convert Request's query param to a number.
 * @param value - The value to be converted to number.
 */
export function queryParamToNumber(value: any): number {
    if (typeof value !== "string") { return undefined; }
    const parsedValue = parseInt(value, 10);
    return isNaN(parsedValue) ? undefined : parsedValue;
}

/**
 * Helper function to convert Request's query param to a string.
 * @param value - The value to be converted to number.
 */
export function queryParamToString(value: any): string {
    if (typeof value !== "string") { return undefined; }
    return value;
}

export const Constants = Object.freeze({
    throttleIdSuffix: "HistorianRest",
});
