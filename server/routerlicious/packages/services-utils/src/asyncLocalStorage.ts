/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as uuid from "uuid";
import { Request, Response, NextFunction } from "express";

const defaultAsyncLocalStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(altAsyncLocalStorage?: AsyncLocalStorage<string>): string | undefined {
    if (altAsyncLocalStorage) {
        return altAsyncLocalStorage.getStore();
    } else {
        return defaultAsyncLocalStorage.getStore();
    }
}

export const bindCorrelationId =
    (altAsyncLocalStorage?: AsyncLocalStorage<string>, headerName: string = "x-correlation-id") =>
        ((req: Request, res: Response, next: NextFunction): void => {
            const id: string = req.header(headerName) || uuid.v4();
            res.setHeader(headerName, id);
            if (altAsyncLocalStorage) {
                altAsyncLocalStorage.run(id, () => next());
            } else {
                defaultAsyncLocalStorage.run(id, () => next());
            }
        });
