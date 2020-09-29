/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Response } from "express";
import { ICache, ITenantService, RestGitService } from "../services";

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
            response.status(400).json(error);
        });
}

export async function createGitService(
    tenantId: string,
    authorization: string,
    tenantService: ITenantService,
    cache: ICache,
): Promise<RestGitService> {
    // eslint-disable-next-line no-null/no-null
    let token: string = null;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (authorization) {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const base64TokenMatch = authorization.match(/Basic (.+)/);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!base64TokenMatch) {
            return Promise.reject("Malformed authorization token");
        }
        const encoded = Buffer.from(base64TokenMatch[1], "base64").toString();

        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const tokenMatch = encoded.match(/(.+):(.+)/);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!tokenMatch || tenantId !== tokenMatch[1]) {
            return Promise.reject("Malformed authorization token");
        }

        token = tokenMatch[2];
    }

    const details = await tenantService.getTenant(tenantId, token);
    const service = new RestGitService(details.storage, cache);

    return service;
}
