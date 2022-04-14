/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { RequestHandler, Response } from "express";
import * as jwt from "jsonwebtoken";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { NetworkError } from "@fluidframework/server-services-client";
import { ICache, ITenantService, RestGitService, ITenantCustomDataExternal } from "../services";
import { containsPathTraversal, parseToken } from "../utils";

/**
 * Helper function to handle a promise that should be returned to the user.
 * TODO: Replace with handleResponse from services-shared.
 * @param resultP Promise whose resolved value or rejected error will send with appropriate status codes.
 * @param response Express Response used for writing response body, headers, and status.
 * @param allowClientCache sends Cache-Control header with maximum age set to 1 yr if true or no store if false.
 * @param errorStatus Overrides any error status code; leave undefined for pass-through error codes or 400 default.
 * @param successStatus Status to send when result is successful. Default: 200
 * @param onSuccess Additional callback fired when response is successful before sending response.
 */
 export function handleResponse<T>(
    resultP: Promise<T>,
    response: Response,
    allowClientCache?: boolean,
    errorStatus?: number,
    successStatus: number = 200,
    onSuccess: (value: T) => void = () => {},
) {
    resultP.then(
        (result) => {
            if (allowClientCache === true) {
                response.setHeader("Cache-Control", "public, max-age=31536000");
            } else if (allowClientCache === false) {
                response.setHeader("Cache-Control", "no-store, max-age=0");
            }

            onSuccess(result);
            response.status(successStatus).json(result);
        },
        (error) => {
            if (error instanceof Error && error?.name === "NetworkError") {
                const networkError = error as NetworkError;
                response
                    .status(errorStatus ?? networkError.code ?? 400)
                    .json(networkError.details ?? error);
            } else {
                response.status(errorStatus ?? 400).json(error?.message ?? error);
            }
        });
}

export async function createGitService(
    tenantId: string,
    authorization: string,
    tenantService: ITenantService,
    cache?: ICache,
    asyncLocalStorage?: AsyncLocalStorage<string>,
    allowDisabledTenant = false,
): Promise<RestGitService> {
    const token = parseToken(tenantId, authorization);
    const details = await tenantService.getTenant(tenantId, token, allowDisabledTenant);
    const customData: ITenantCustomDataExternal = details.customData;
    const writeToExternalStorage = !!customData?.externalStorageData;
    const storageName = customData?.storageName;
    const decoded = jwt.decode(token) as ITokenClaims;
    if (containsPathTraversal(decoded.documentId)) {
        // Prevent attempted directory traversal.
        throw new NetworkError(400, `Invalid document id: ${decoded.documentId}`);
    }
     const service = new RestGitService(
         details.storage,
         writeToExternalStorage,
         tenantId,
         decoded.documentId,
         cache,
         asyncLocalStorage,
         storageName);

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

/**
 * Validate specific request parameters to prevent directory traversal.
 * TODO: replace with validateRequestParams from service-shared.
 */
 export function validateRequestParams(...paramNames: (string | number)[]): RequestHandler {
    return (req, res, next) => {
        for (const paramName of paramNames) {
            const param = req.params[paramName];
            if (!param) {
                continue;
            }
            if (containsPathTraversal(param)) {
                return handleResponse(
                    Promise.reject(new NetworkError(400, `Invalid ${paramName}: ${param}`)),
                    res,
                );
            }
        }
        next();
    };
}
