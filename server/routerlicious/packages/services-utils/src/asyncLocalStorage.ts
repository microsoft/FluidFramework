/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as uuid from "uuid";
import { Request, Response, NextFunction } from "express";

const asyncLocalStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(fallbackAsyncLocalStorage?: AsyncLocalStorage<string>): string | undefined {
    if (fallbackAsyncLocalStorage) {
        return fallbackAsyncLocalStorage.getStore();
    } else {
        return asyncLocalStorage.getStore();
    }
}

export const bindCorrelationId = (fallbackAsyncLocalStorage?: AsyncLocalStorage<string>, headerName: string = "x-correlation-id") =>
    ((req: Request, res: Response, next: NextFunction): void => {
        const id: string = req.header(headerName) || uuid.v4();
        res.setHeader(headerName, id);
        if (fallbackAsyncLocalStorage) {
            fallbackAsyncLocalStorage.run(id, () => next());
        } else {
            asyncLocalStorage.run(id, () => next());
        }
    });
