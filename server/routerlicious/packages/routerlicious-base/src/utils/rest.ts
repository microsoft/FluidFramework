/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
            response.status(errorStatus ?? error?.code ?? 400).json(error?.message ?? error);
        });
}
