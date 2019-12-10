/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Response } from "express";
import * as nconf from "nconf";
import * as path from "path";

/**
 * Helper function to handle a promise that should be returned to the user
 */
export function handleResponse<T>(
    resultP: Promise<T>,
    response: Response,
    cache = true,
    status: number = 200,
    handler: (value: T) => void = (value) => value) {

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

export function getGitDir(store: nconf.Provider) {
    return path.join(__dirname, "../../../storage");
}