/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "path";
import { NetworkError } from "@fluidframework/server-services-client";
import type { RequestHandler, Response } from "express";

/**
 * Check a given path string for path traversal (e.g. "../" or "/").
 */
export function containsPathTraversal(path: string): boolean {
    const parsedPath = parse(path);
    return parsedPath.dir.includes("..") || parsedPath.dir.startsWith("/");
}

/**
 * Validate specific request parameters to prevent directory traversal.
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

/**
 * Helper function to handle a promise that should be returned to the user.
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
