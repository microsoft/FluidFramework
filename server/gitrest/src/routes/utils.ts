/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import { Response } from "express";
import winston from "winston";

export function handleResponse<T>(
    resultP: Promise<T>,
    response: Response,
    successStatus: number = 200,
    failureStatus: number = 400,
) {
    resultP
        .then((result) => {
            response.status(successStatus).json(result);
        })
        .catch((error) => {
            winston.error(JSON.stringify(error));
            if (error && error.code && error.code < 600 && error.code >= 400 && error.message !== undefined) {
                response.status((error as NetworkError).code).json((error as NetworkError).message);
            } else {
                response.status(failureStatus).json(error);
            }
        });
}
