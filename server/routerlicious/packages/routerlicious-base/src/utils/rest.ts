/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import type { Response } from "express";

/**
 * Helper function to handle a promise that should be returned to the user
 */
 export function handleResponse<T>(
    resultP: Promise<T>,
    response: Response,
    errorStatus?: number,
    successStatus: number = 200,
    onSuccess: (value: T) => void = () => {},
) {
    resultP.then(
        (result) => {
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
